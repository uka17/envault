import { expect } from "chai";
import request from "supertest";
import express from "express";

import config from "api/src/config/config.js";
import { parseTrustProxy } from "#common/runtimeConfig.js";
import { CODES } from "#common/constants.js";
import publicStashRoutes from "api/src/route/publicStash.js";

/**
 * Creates an app with a fresh public stash limiter and a probe route returning `req.ip`.
 * Supertest connects over loopback, so `loopback` plays the role of the nginx address.
 * @param trustProxy TRUST_PROXY value, `undefined` means the variable is not set
 * @returns App under test
 */
function createApp(trustProxy: string | undefined) {
  const app = express();
  app.set("trust proxy", parseTrustProxy(trustProxy));
  app.get("/ip", (req, res) => {
    res.json({ ip: req.ip });
  });
  publicStashRoutes(app);
  return app;
}

/**
 * Requests the public stash route with an invalid token, which is rejected after the limiter.
 * @param app App under test
 * @param forwardedFor X-Forwarded-For value as nginx would forward it
 * @returns Response status
 */
async function readStash(app: express.Express, forwardedFor: string): Promise<number> {
  const response = await request(app).get("/api/public/stashes/short").set("X-Forwarded-For", forwardedFor);
  return response.status;
}

describe("Client IP behind trusted proxy", () => {
  const { max } = config.publicStashRateLimit;

  it("should use the address appended by the trusted proxy, not the one sent by the client", async() => {
    const response = await request(createApp("loopback")).get("/ip")
      .set("X-Forwarded-For", "1.2.3.4, 203.0.113.7");

    expect(response.body.ip).to.equal("203.0.113.7");
  });

  it("should ignore X-Forwarded-For when TRUST_PROXY is not set", async() => {
    const response = await request(createApp(undefined)).get("/ip").set("X-Forwarded-For", "203.0.113.7");

    expect(response.body.ip).to.not.equal("203.0.113.7");
  });

  it("should ignore X-Forwarded-For sent by a peer which is not a trusted proxy", async() => {
    const response = await request(createApp("172.20.0.4")).get("/ip").set("X-Forwarded-For", "203.0.113.7");

    expect(response.body.ip).to.not.equal("203.0.113.7");
  });

  it("should not let a client bypass an IP limit by rotating a spoofed X-Forwarded-For", async() => {
    const app = createApp("loopback");
    for (let i = 0; i < max; i++) {
      expect(await readStash(app, `10.0.0.${i}, 203.0.113.7`)).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
    }

    expect(await readStash(app, "10.0.1.1, 203.0.113.7")).to.equal(CODES.API_TOO_MANY_REQUESTS);
  });

  it("should count different clients behind the proxy separately", async() => {
    const app = createApp("loopback");
    for (let i = 0; i < max; i++) {
      await readStash(app, "203.0.113.7");
    }

    expect(await readStash(app, "203.0.113.7")).to.equal(CODES.API_TOO_MANY_REQUESTS);
    expect(await readStash(app, "203.0.113.8")).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
  });
});

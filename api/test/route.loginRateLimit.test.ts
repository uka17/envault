import { expect } from "chai";
import request from "supertest";
import sinon from "sinon";
import express from "express";
import cookieParser from "cookie-parser";
import { randomBytes } from "crypto";

import config from "api/src/config/config.js";
import { CODES } from "#common/constants.js";
import RateLimitCounter from "#model/RateLimitCounter.js";
import userRoutes from "api/src/route/user.js";
import createErrorHandler from "api/src/route/error.js";
import { registerAndVerifyUser } from "./helpers.js";

const loginPath = "/api/v1/users/login";
const { loginPerIp, loginPerAccount } = config.rateLimits;

/**
 * Creates an app with the real login budgets and fresh in-memory counters. Supertest connects
 * over loopback, which plays the role of nginx, so X-Forwarded-For selects the client IP.
 * @returns App under test
 */
function createApp() {
  const app = express();
  app.set("trust proxy", ["loopback"]);
  app.use(express.json());
  app.use(cookieParser());
  userRoutes(app);
  app.use(createErrorHandler());
  return app;
}

/**
 * Sends a login attempt from the given client IP.
 * @param app App under test
 * @param ip Client IP forwarded by the proxy
 * @param email Login email
 * @param password Login password
 * @returns Response of the login endpoint
 */
function login(app: express.Express, ip: string, email: string, password = "WrongPassword1") {
  return request(app).post(loginPath).set("X-Forwarded-For", ip).send({ email, password });
}

/**
 * Generates a unique address, so account budgets of different tests never overlap.
 * @returns Email address
 */
function uniqueEmail() {
  return `login-limit-${randomBytes(6).toString("hex")}@test.com`;
}

describe("Login rate limits", () => {
  let app: express.Express;

  beforeEach(async() => {
    await globalThis.appDataSource.getRepository(RateLimitCounter).clear();
    app = createApp();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should limit attempts per IP across different accounts, keeping other IPs independent", async() => {
    for (let i = 0; i < loginPerIp.max; i++) {
      expect((await login(app, "203.0.113.1", uniqueEmail())).status).to.equal(CODES.API_UNAUTHORIZED);
    }

    const limited = await login(app, "203.0.113.1", uniqueEmail());

    expect(limited.status).to.equal(CODES.API_TOO_MANY_REQUESTS);
    expect(limited.body.code).to.equal("rate_limited");
    expect(Number(limited.headers["retry-after"])).to.be.greaterThan(0);
    expect((await login(app, "203.0.113.2", uniqueEmail())).status).to.equal(CODES.API_UNAUTHORIZED);
  });

  it("should count malformed attempts against the IP budget", async() => {
    for (let i = 0; i < loginPerIp.max; i++) {
      await request(app).post(loginPath).set("X-Forwarded-For", "203.0.113.1").send({});
    }

    expect((await login(app, "203.0.113.1", uniqueEmail())).status).to.equal(CODES.API_TOO_MANY_REQUESTS);
  });

  it("should limit attempts per account from many IPs, ignoring case and whitespace", async() => {
    const email = uniqueEmail();
    for (let i = 0; i < loginPerAccount.max; i++) {
      expect((await login(app, `198.51.100.${i}`, email)).status).to.equal(CODES.API_UNAUTHORIZED);
    }

    const limited = await login(app, "198.51.100.200", ` ${email.toUpperCase()} `);

    expect(limited.status).to.equal(CODES.API_TOO_MANY_REQUESTS);
    expect(limited.body.code).to.equal("rate_limited");
    expect(Number(limited.headers["retry-after"])).to.equal(loginPerAccount.windowMs / 1000);
    expect((await login(app, "198.51.100.201", uniqueEmail())).status).to.equal(CODES.API_UNAUTHORIZED);
  });

  it("should answer existing and unknown accounts alike, even with the right password", async() => {
    const credentials = { email: uniqueEmail(), password: "Password123", name: "Limited" };
    await registerAndVerifyUser(credentials, app);
    const unknown = uniqueEmail();
    for (let i = 0; i < loginPerAccount.max; i++) {
      await login(app, `198.51.100.${i}`, credentials.email);
      await login(app, `198.51.100.${i}`, unknown);
    }

    const existing = await login(app, "198.51.100.200", credentials.email, credentials.password);
    const missing = await login(app, "198.51.100.200", unknown);

    expect(existing.status).to.equal(CODES.API_TOO_MANY_REQUESTS);
    expect(missing.status).to.equal(existing.status);
    expect(missing.body).to.deep.equal(existing.body);
    expect(missing.headers["retry-after"]).to.equal(existing.headers["retry-after"]);
  });

  it("should restore the account budget after the window", async() => {
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    const email = uniqueEmail();
    for (let i = 0; i <= loginPerAccount.max; i++) {
      await login(app, `198.51.100.${i}`, email);
    }

    clock.tick(loginPerAccount.windowMs);

    expect((await login(app, "198.51.100.200", email)).status).to.equal(CODES.API_UNAUTHORIZED);
  });
});

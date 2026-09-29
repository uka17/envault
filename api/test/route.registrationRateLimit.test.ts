import { expect } from "chai";
import request from "supertest";
import sinon from "sinon";
import express from "express";
import cookieParser from "cookie-parser";
import { randomBytes } from "crypto";
import { container } from "tsyringe";

import config from "api/src/config/config.js";
import { CODES } from "#common/constants.js";
import { TOKENS } from "#di/tokens.js";
import EmailService from "#service/EmailService.js";
import userRoutes from "api/src/route/user.js";
import createErrorHandler from "api/src/route/error.js";

const registerPath = "/api/v1/users";
const { max } = config.rateLimits.registrationPerIp;

/**
 * Creates an app with the real registration budget and a fresh in-memory counter. Supertest
 * connects over loopback, which plays the role of nginx, so X-Forwarded-For selects the client IP.
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
 * Builds a valid registration payload with a unique address.
 * @returns Registration payload
 */
function newUser() {
  return { email: `register-limit-${randomBytes(6).toString("hex")}@test.com`, password: "Password123", name: "Limit" };
}

/**
 * Sends a registration from the given client IP.
 * @param app App under test
 * @param ip Client IP forwarded by the proxy
 * @param payload Registration payload
 * @returns Response of the registration endpoint
 */
function register(app: express.Express, ip: string, payload: object) {
  return request(app).post(registerPath).set("X-Forwarded-For", ip).send(payload);
}

describe("Registration rate limit", () => {
  let app: express.Express;

  beforeEach(() => {
    const emailService = container.resolve<EmailService>(TOKENS.EmailService);
    sinon.stub(emailService, "send").resolves("test-message-id");
    app = createApp();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should allow the budget per IP, then answer 429 rate_limited, keeping other IPs independent", async() => {
    for (let i = 0; i < max; i++) {
      expect((await register(app, "203.0.113.1", newUser())).status).to.equal(CODES.API_CREATED);
    }

    const limited = await register(app, "203.0.113.1", newUser());

    expect(limited.status).to.equal(CODES.API_TOO_MANY_REQUESTS);
    expect(limited.body.code).to.equal("rate_limited");
    expect(Number(limited.headers["retry-after"])).to.be.within(1, config.rateLimits.registrationPerIp.windowMs / 1000);
    expect((await register(app, "203.0.113.2", newUser())).status).to.equal(CODES.API_CREATED);
  });

  it("should count rejected attempts, so taken addresses cannot be probed without limit", async() => {
    const taken = newUser();
    await register(app, "203.0.113.9", taken);
    for (let i = 0; i < max; i++) {
      expect((await register(app, "203.0.113.1", taken)).status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
    }

    expect((await register(app, "203.0.113.1", taken)).status).to.equal(CODES.API_TOO_MANY_REQUESTS);
  });
});

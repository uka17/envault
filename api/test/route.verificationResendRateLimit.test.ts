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
import RateLimitCounter from "#model/RateLimitCounter.js";
import userRoutes from "api/src/route/user.js";
import createErrorHandler from "api/src/route/error.js";

const resendPath = "/api/v1/users/verify-email/resend";
const { max, windowMs } = config.rateLimits.verificationResendPerAddress;

/**
 * Creates an app with the real resend budgets and fresh in-memory counters.
 * @returns App under test
 */
function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  userRoutes(app);
  app.use(createErrorHandler());
  return app;
}

/**
 * Generates a unique address, so budgets of different tests never overlap.
 * @returns Email address
 */
function uniqueEmail() {
  return `resend-limit-${randomBytes(6).toString("hex")}@test.com`;
}

describe("Verification resend rate limit", () => {
  let app: express.Express;
  let send: sinon.SinonStub;

  /**
   * Requests a new verification email.
   * @param email Address to resend the code to
   * @returns Response of the resend endpoint
   */
  function resend(email: string) {
    return request(app).post(resendPath).send({ email });
  }

  beforeEach(async() => {
    await globalThis.appDataSource.getRepository(RateLimitCounter).clear();
    send = sinon.stub(container.resolve<EmailService>(TOKENS.EmailService), "send").resolves("test-message-id");
    app = createApp();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should stop sending to an unverified address after the budget, ignoring case and whitespace", async() => {
    const email = uniqueEmail();
    const registered = await request(app).post("/api/v1/users")
      .send({ email, password: "Password123", name: "Resend" });
    expect(registered.status).to.equal(CODES.API_CREATED);
    send.resetHistory();
    for (let i = 0; i < max; i++) {
      expect((await resend(email)).status).to.equal(CODES.API_OK);
    }

    const limited = await resend(` ${email.toUpperCase()} `);

    expect(limited.status).to.equal(CODES.API_TOO_MANY_REQUESTS);
    expect(limited.body.code).to.equal("rate_limited");
    expect(Number(limited.headers["retry-after"])).to.equal(windowMs / 1000);
    expect(send.callCount).to.equal(max);
    expect((await resend(uniqueEmail())).status).to.equal(CODES.API_OK);
  });

  it("should limit unknown addresses the same way, so the response does not reveal the account", async() => {
    const email = uniqueEmail();
    for (let i = 0; i < max; i++) {
      expect((await resend(email)).status).to.equal(CODES.API_OK);
    }

    expect((await resend(email)).status).to.equal(CODES.API_TOO_MANY_REQUESTS);
    expect(send.called).to.be.false;
  });

  it("should restore the address budget after the window", async() => {
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    const email = uniqueEmail();
    for (let i = 0; i <= max; i++) {
      await resend(email);
    }

    clock.tick(windowMs);

    expect((await resend(email)).status).to.equal(CODES.API_OK);
  });
});

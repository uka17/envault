import { expect } from "chai";
import request from "supertest";
import sinon from "sinon";
import express from "express";
import { container } from "tsyringe";

import { TOKENS } from "#di/tokens.js";
import { CODES } from "#common/constants.js";
import { API_ERROR_MESSAGES } from "#common/errorCodes.js";
import RateLimitService from "#service/RateLimitService.js";
import RateLimitCounter from "#model/RateLimitCounter.js";
import createErrorHandler from "api/src/route/error.js";
import { ipRateLimit, persistentRateLimit } from "api/src/route/rateLimit.js";

const limit = { windowMs: 15 * 60 * 1000, max: 2 };

/**
 * Creates an app with a single limited route.
 * @param limiter Middleware under test
 * @returns App answering 200 when the limiter lets the request through
 */
function createApp(limiter: express.RequestHandler) {
  const app = express();
  app.get("/limited", limiter, (req, res) => {
    res.json({});
  });
  app.use(createErrorHandler());
  return app;
}

describe("Rate limit middleware", () => {
  beforeEach(async() => {
    await globalThis.appDataSource.getRepository(RateLimitCounter).clear();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("persistentRateLimit", () => {
    it("should answer 429 rate_limited with Retry-After after the budget is used", async() => {
      const app = createApp(persistentRateLimit("test", limit, (req) => String(req.query.user)));
      for (let i = 0; i < limit.max; i++) {
        expect((await request(app).get("/limited?user=1")).status).to.equal(CODES.API_OK);
      }

      const response = await request(app).get("/limited?user=1");

      expect(response.status).to.equal(CODES.API_TOO_MANY_REQUESTS);
      expect(response.body.code).to.equal("rate_limited");
      expect(response.body.message).to.equal(API_ERROR_MESSAGES.rate_limited);
      expect(Number(response.headers["retry-after"])).to.equal(limit.windowMs / 1000);
      expect((await request(app).get("/limited?user=2")).status).to.equal(CODES.API_OK);
    });

    it("should skip the limit when the request has no key", async() => {
      const app = createApp(persistentRateLimit("test", { ...limit, max: 0 }, () => undefined));

      expect((await request(app).get("/limited")).status).to.equal(CODES.API_OK);
    });

    it("should fail closed with a safe 500 when the counter cannot be updated", async() => {
      const rateLimitService = container.resolve<RateLimitService>(TOKENS.RateLimitService);
      sinon.stub(rateLimitService, "consume").rejects(new Error("connection to postgres://user:secret lost"));
      const app = createApp(persistentRateLimit("test", limit, () => "1"));

      const response = await request(app).get("/limited");

      expect(response.status).to.equal(CODES.SERVER_ERROR);
      expect(response.body.code).to.equal("error_500");
    });
  });

  describe("ipRateLimit", () => {
    it("should answer 429 with the same rate_limited code and Retry-After", async() => {
      const app = createApp(ipRateLimit(limit));
      for (let i = 0; i < limit.max; i++) {
        await request(app).get("/limited");
      }

      const response = await request(app).get("/limited");

      expect(response.status).to.equal(CODES.API_TOO_MANY_REQUESTS);
      expect(response.body).to.deep.equal({ code: "rate_limited", message: API_ERROR_MESSAGES.rate_limited });
      expect(Number(response.headers["retry-after"])).to.be.greaterThan(0);
    });
  });
});

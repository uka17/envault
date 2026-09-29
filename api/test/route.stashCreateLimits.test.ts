import { expect } from "chai";
import request from "supertest";
import sinon from "sinon";
import express from "express";
import { randomBytes } from "crypto";

import config from "api/src/config/config.js";
import { CODES } from "#common/constants.js";
import Stash from "#model/Stash.js";
import User from "#model/User.js";
import RateLimitCounter from "#model/RateLimitCounter.js";
import stashRoutes from "api/src/route/stash.js";
import userRoutes from "api/src/route/user.js";
import createErrorHandler from "api/src/route/error.js";
import { registerAndVerifyUser, unlimitedRateLimits } from "./helpers.js";

const stashesPath = "/api/v1/stashes";
const { max, windowMs } = config.rateLimits.stashCreatePerUser;

/**
 * Creates an app with the production JSON limit, the real stash quota and the real error handler.
 * @returns App under test
 */
function createApp() {
  const app = express();
  app.use(express.json({ limit: config.jsonBodyLimit }));
  stashRoutes(app);
  app.use(createErrorHandler());
  return app;
}

// Own app for accounts, so these tests do not use the per-IP budgets of the shared test app.
// Built in `before`, once the DI container is initialized.
let usersApp: express.Express;
const password = "Password123";

/**
 * Logs in and returns a fresh access token.
 * @param email Account email
 * @returns Access token
 */
async function login(email: string): Promise<string> {
  const response = await request(usersApp).post("/api/v1/users/login").send({ email, password });
  return response.body.token;
}

/**
 * Registers a verified user and logs in.
 * @returns Access token, user ID and email
 */
async function createUser(): Promise<{ token: string; id: number; email: string }> {
  const email = `stash-limit-${randomBytes(6).toString("hex")}@test.com`;
  await registerAndVerifyUser({ email, password, name: "Quota" }, usersApp);
  const user = await globalThis.appDataSource.getRepository(User).findOneByOrFail({ email });
  return { token: await login(email), id: user.id, email };
}

/**
 * Builds a valid stash payload scheduled far enough ahead to stay in the future under a fake clock.
 * @param body Encrypted body to send
 * @returns Stash creation payload
 */
function stashPayload(body: unknown = "v1.c2FsdA==.aXY=.Y2lwaGVy") {
  return { body, to: "recipient@test.com", scheduledAt: new Date(Date.now() + 30 * 86400000).toISOString() };
}

describe("Stash creation limits", () => {
  let app: express.Express;
  let owner: { token: string; id: number; email: string };

  /**
   * Creates a stash as the given user.
   * @param token Access token
   * @param payload Request body
   * @returns Response of the create endpoint
   */
  function create(token: string, payload: object = stashPayload()) {
    return request(app).post(stashesPath).set("Authorization", `Bearer ${token}`).send(payload);
  }

  /**
   * Counts stashes stored for a user.
   * @param userId User ID
   * @returns Number of stashes
   */
  function stashCount(userId: number) {
    return globalThis.appDataSource.getRepository(Stash).countBy({ user: { id: userId } });
  }

  before(async() => {
    usersApp = express();
    usersApp.use(express.json());
    userRoutes(usersApp, unlimitedRateLimits());
    owner = await createUser();
  });

  beforeEach(async() => {
    await globalThis.appDataSource.getRepository(RateLimitCounter).clear();
    app = createApp();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("Daily quota", () => {
    it("should allow the quota per account, then answer 429, keeping other accounts independent", async() => {
      const { token, id } = await createUser();
      for (let i = 0; i < max; i++) {
        expect((await create(token)).status).to.equal(CODES.API_CREATED);
      }

      const limited = await create(token);

      expect(limited.status).to.equal(CODES.API_TOO_MANY_REQUESTS);
      expect(limited.body.code).to.equal("rate_limited");
      expect(Number(limited.headers["retry-after"])).to.equal(windowMs / 1000);
      expect(await stashCount(id)).to.equal(max);
      expect((await create(owner.token)).status).to.equal(CODES.API_CREATED);
    });

    it("should never exceed the quota under concurrent requests", async() => {
      const { token, id } = await createUser();

      const responses = await Promise.all(Array.from({ length: max + 5 }, () => create(token)));

      expect(responses.filter((r) => r.status === CODES.API_CREATED)).to.have.length(max);
      expect(responses.filter((r) => r.status === CODES.API_TOO_MANY_REQUESTS)).to.have.length(5);
      expect(await stashCount(id)).to.equal(max);
    });

    it("should not count invalid requests against the quota", async() => {
      const { token } = await createUser();
      for (let i = 0; i < max; i++) {
        await create(token, stashPayload(""));
      }

      expect((await create(token)).status).to.equal(CODES.API_CREATED);
    });

    it("should restore the quota after the window", async() => {
      const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
      const { token, email } = await createUser();
      for (let i = 0; i <= max; i++) {
        await create(token);
      }

      clock.tick(windowMs);

      // The access token expired during the window, so the user logs in again.
      expect((await create(await login(email))).status).to.equal(CODES.API_CREATED);
    });
  });

  describe("Encrypted body", () => {
    it("should accept a body of the maximum length, which fits into the JSON body limit", async() => {
      const response = await create(owner.token, stashPayload("a".repeat(config.stashMaxBodyLength)));

      expect(response.status).to.equal(CODES.API_CREATED);
    });

    it("should reject a body longer than the maximum with stash_body_too_long", async() => {
      const response = await create(owner.token, stashPayload("a".repeat(config.stashMaxBodyLength + 1)));

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors[0]).to.include({ field: "body", code: "stash_body_too_long" });
    });

    for (const value of [12345, { ciphertext: "x" }, ["v1.a.b.c"], true]) {
      it(`should reject a non-string body (${JSON.stringify(value)}) with should_be_string`, async() => {
        const response = await create(owner.token, stashPayload(value));

        expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
        expect(response.body.errors[0]).to.include({ field: "body", code: "should_be_string" });
      });
    }

    it("should answer 413 payload_too_large, not 500, when the request exceeds the JSON body limit", async() => {
      const response = await create(owner.token, stashPayload("a".repeat(300 * 1024)));

      expect(response.status).to.equal(CODES.API_PAYLOAD_TOO_LARGE);
      expect(response.body).to.deep.equal({ code: "payload_too_large", message: "Request body is too large" });
    });

    it("should not use the quota for rejected bodies", async() => {
      const { token } = await createUser();
      for (let i = 0; i < max; i++) {
        await create(token, stashPayload(12345));
      }

      expect((await create(token)).status).to.equal(CODES.API_CREATED);
    });
  });
});

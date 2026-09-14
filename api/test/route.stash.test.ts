import request from "supertest";
import { expect } from "chai";
import { customAlphabet } from "nanoid";
import sinon from "sinon";
import { container } from "tsyringe";
import { CODES } from "#common/constants.js";
import { API_ERROR_MESSAGES } from "#common/errorCodes.js";
import { TOKENS } from "#di/tokens.js";
import Stash from "#model/Stash.js";
import StashService from "#service/StashService.js";
import { registerAndVerifyUser } from "./helpers.js";

let token: string;
let stash: Stash;
//Use random email and password to create s user for testing
const userId = customAlphabet("1234567890abcdef", 10);
const userName = customAlphabet("abcdefghijklmnopqrstuvwxyz", 10);
const userCredentials = {
  email: `${userId()}@test.com`,
  password: `Password${userId()}`,
  name: `user${userName()}`,
};
let testStash = {
  body: "test_body",
  secret: "test_secret",
  to: "test@testmail.com",
  scheduledAt: new Date(Date.now() + 86400000).toISOString(),
};

describe("Stash Routes", () => {
  before(async() => {
    //Create and verify user
    await registerAndVerifyUser(userCredentials);
    //get token
    const loginResponse = await request(globalThis.app).post("/api/v1/users/login")
      .send({
        email: userCredentials.email,
        password: userCredentials.password,
      });

    token = loginResponse.body.token;

    //create stash for testing
    const response = await request(globalThis.app)
      .post("/api/v1/stashes")
      .set("Authorization", `Bearer ${token}`)
      .send(testStash);

    stash = response.body;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("POST /api/v1/stashes", () => {
    it("should return a safe 500 when saving the stash fails", async() => {
      sinon.stub(globalThis.appDataSource.manager, "save")
        .rejects(new Error("SQL connection failed with secret ciphertext"));

      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStash);

      expect(response.status).to.equal(CODES.SERVER_ERROR);
      expect(response.body).to.deep.equal({
        code: "error_500",
        message: API_ERROR_MESSAGES.error_500,
      });
    });

    it("should return error body_required", async() => {
      const testStashNoBody = { ...testStash };
      delete testStashNoBody.body;
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStashNoBody);

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.code).to.equal("is_required");
      expect(response.body.errors?.[0]?.field).to.equal("body");
    });

    it("should return error to_required", async() => {
      const testStashNoTo = { ...testStash };
      delete testStashNoTo.to;
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStashNoTo);

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.code).to.equal("is_required");
      expect(response.body.errors?.[0]?.field).to.equal("to");
    });

    it("should return error scheduled_at_required", async() => {
      const testStashNoScheduledAt = { ...testStash };
      delete testStashNoScheduledAt.scheduledAt;
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStashNoScheduledAt);

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.code).to.equal("is_required");
      expect(response.body.errors?.[0]?.field).to.equal("scheduledAt");
    });

    it("should return error date_format_incorrect", async() => {
      const testStashWrongScheduledAt = { ...testStash };
      testStashWrongScheduledAt.scheduledAt = "wrong_date_time_format";
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStashWrongScheduledAt);

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.code).to.equal("date_format_incorrect");
      expect(response.body.errors?.[0]?.field).to.equal("scheduledAt");
    });

    it("should return error email_format_incorrect", async() => {
      const testStashWrongTo = { ...testStash };
      testStashWrongTo.to = "wrong_email_format";
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStashWrongTo);

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.code).to.equal("email_format_incorrect");
      expect(response.body.errors?.[0]?.field).to.equal("to");
    });

    it("should create stash", async() => {
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStash);

      expect(response.status).to.equal(CODES.API_CREATED);
      expect(response.body.key).to.be.undefined;
    });
  });
  describe("GET /api/v1/stashes", () => {
    it("should return 401 when userId is falsy", async() => {
      sinon
        .stub(globalThis.appDataSource.manager, "findOneBy")
        .resolves({ id: 0 } as any);

      const response = await request(globalThis.app)
        .get("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_UNAUTHORIZED);
    });

    it("should return a safe 500 when listing stashes fails", async() => {
      sinon.stub(globalThis.appDataSource.manager, "find")
        .rejects(new Error("SELECT ciphertext FROM stash"));

      const response = await request(globalThis.app)
        .get("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.SERVER_ERROR);
      expect(response.body).to.deep.equal({
        code: "error_500",
        message: API_ERROR_MESSAGES.error_500,
      });
    });

    it("should return an empty array when the user has no stashes", async() => {
      const stashService = container.resolve<StashService>(TOKENS.StashService);
      sinon.stub(stashService, "getUserStashes").resolves([]);

      const response = await request(globalThis.app)
        .get("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body).to.deep.equal([]);
    });

    it("should return stashes", async() => {
      const response = await request(globalThis.app)
        .get("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.error).to.be.undefined;
      expect(response.body[0].key).to.be.undefined;
    });
  });
  describe("GET /api/v1/stashes/:id", () => {
    it("should return a safe 500 when loading the stash fails", async() => {
      sinon.stub(globalThis.appDataSource.manager, "findOne")
        .rejects(new Error("postgres://user:password@database"));

      const response = await request(globalThis.app)
        .get(`/api/v1/stashes/${stash.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.SERVER_ERROR);
      expect(response.body).to.deep.equal({
        code: "error_500",
        message: API_ERROR_MESSAGES.error_500,
      });
    });

    it("should return error id_format_incorrect", async() => {
      const response = await request(globalThis.app)
        .get("/api/v1/stashes/wrong_id")
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.code).to.equal("stash_id_invalid");
      expect(response.body.errors?.[0]?.field).to.equal("id");
    });
    it("should return stash", async() => {
      const response = await request(globalThis.app)
        .get(`/api/v1/stashes/${stash.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.key).to.be.undefined;
    });
    it("should return stash not found", async() => {
      const response = await request(globalThis.app)
        .get(`/api/v1/stashes/${99999999}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_NOT_FOUND);
      expect(response.body.message).to.equal("Stash not found");
    });
  });

  describe("POST /api/v1/stashes/:id/snooze/:hours", () => {
    it("should return a safe 500 when the snooze update fails", async() => {
      sinon.stub(globalThis.appDataSource.manager, "transaction")
        .rejects(new Error("UPDATE stash SET body = ciphertext"));

      const response = await request(globalThis.app)
        .post(`/api/v1/stashes/${stash.id}/snooze/1`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.SERVER_ERROR);
      expect(response.body).to.deep.equal({
        code: "error_500",
        message: API_ERROR_MESSAGES.error_500,
      });
    });

    it("should return error id_should_be_numeric", async() => {
      const id = "wrong_id";
      const hours = 100;
      const response = await request(globalThis.app)
        .post(`/api/v1/stashes/${id}/snooze/${hours}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.code).to.equal("stash_id_invalid");
      expect(response.body.errors?.[0]?.field).to.equal("id");
    });
    it("should return error hours_should_be_numeric", async() => {
      const id = 1;
      const hours = "wrong_hours";
      const response = await request(globalThis.app)
        .post(`/api/v1/stashes/${id}/snooze/${hours}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.code).to.equal("snooze_hours_invalid");
      expect(response.body.errors?.[0]?.field).to.equal("hours");
    });
    it("should return 404 when stash not found for snooze", async() => {
      const response = await request(globalThis.app)
        .post("/api/v1/stashes/99999999/snooze/1")
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_NOT_FOUND);
      expect(response.body.code).to.equal("stash_not_found");
    });

    it("should snooze stash successfully", async() => {
      const id = stash.id;
      const hours = 100;
      const response = await request(globalThis.app)
        .post(`/api/v1/stashes/${id}/snooze/${hours}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.id).to.equal(stash.id);
      expect(response.body.publicAccessToken).to.be.undefined;
      expect(response.body.modifiedBy).to.be.undefined;
      const expected = new Date(stash.scheduledAt);
      expected.setHours(expected.getHours() + hours);
      expect(new Date(response.body.scheduledAt).getTime()).to.equal(expected.getTime());
    });
  });

  describe("DELETE /api/v1/stashes/:id", () => {
    it("should return a safe 500 when deleting the stash fails", async() => {
      sinon.stub(globalThis.appDataSource.manager, "transaction")
        .rejects(new Error("DELETE failed for database password"));

      const response = await request(globalThis.app)
        .delete(`/api/v1/stashes/${stash.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.SERVER_ERROR);
      expect(response.body).to.deep.equal({
        code: "error_500",
        message: API_ERROR_MESSAGES.error_500,
      });
    });

    it("should return error id_should_be_numeric", async() => {
      const id = "wrong_id";
      const response = await request(globalThis.app)
        .delete(`/api/v1/stashes/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.code).to.equal("stash_id_invalid");
      expect(response.body.errors?.[0]?.field).to.equal("id");
    });

    it("should create and delete stash successfully", async() => {
      //create stash for testing
      const createResponse = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStash);

      let id = createResponse.body.id;

      const response = await request(globalThis.app)
        .delete(`/api/v1/stashes/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.affected).to.equal(1);
    });

    it("should return 404 when the stash to delete is not found", async() => {
      const response = await request(globalThis.app)
        .delete("/api/v1/stashes/99999999")
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_NOT_FOUND);
      expect(response.body.code).to.equal("stash_not_found");
    });
  });
});

// user.test.ts
import request from "supertest";
import { expect } from "chai";
import { customAlphabet } from "nanoid";
import sinon from "sinon";
import { CODES } from "lib/constants";
import Stash from "model/Stash";

let token: string;
let stash: Stash;
//Use random email and password to create s user for testing
const userId = customAlphabet("1234567890abcdef", 10);
const userCredentials = {
  email: `${userId()}@test.com`,
  password: `Password${userId()}`,
  name: `user${userId()}`,
};
let testStash = {
  body: "test_body",
  secret: "test_secret",
  to: "test@testmail.com",
  sendAt: "2023-04-27T20:04:30.446+0200",
};

describe("Stash Routes", () => {
  before(async() => {
    //Create user
    await request(globalThis.app).post("/api/v1/users")
      .send(userCredentials);
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
    it("should return error body_required", async() => {
      const testStashNoBody = { ...testStash };
      delete testStashNoBody.body;
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStashNoBody);

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("is_required");
      expect(response.body.errors?.[0]?.path).to.equal("body");
    });

    it("should return error to_required", async() => {
      const testStashNoTo = { ...testStash };
      delete testStashNoTo.to;
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStashNoTo);

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("is_required");
      expect(response.body.errors?.[0]?.path).to.equal("to");
    });

    it("should return error send_at_required", async() => {
      const testStashNoSendAt = { ...testStash };
      delete testStashNoSendAt.sendAt;
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStashNoSendAt);

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("is_required");
      expect(response.body.errors?.[0]?.path).to.equal("sendAt");
    });

    it("should return error date_format_incorrect", async() => {
      const testStashWrongSendAt = { ...testStash };
      testStashWrongSendAt.sendAt = "wrong_date_time_format";
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStashWrongSendAt);

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("date_format_incorrect");
      expect(response.body.errors?.[0]?.path).to.equal("sendAt");
    });

    it("should return error email_format_incorrect", async() => {
      const testStashWrongTo = { ...testStash };
      testStashWrongTo.to = "wrong_email_format";
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStashWrongTo);

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("email_format_incorrect");
      expect(response.body.errors?.[0]?.path).to.equal("to");
    });

    it("should create stash", async() => {
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStash);

      expect(response.status).to.equal(CODES.API_CREATED);
      expect(response.body.key).to.not.be.undefined;
    });
  });
  describe("GET /api/v1/stashes", () => {
    it("should return stashes", async() => {
      const response = await request(globalThis.app)
        .get("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.error).to.be.undefined;
      expect(response.body[0].key).to.not.be.undefined;
    });
  });
  describe("GET /api/v1/stashes/:id", () => {
    it("should return error id_format_incorrect", async() => {
      const response = await request(globalThis.app)
        .get("/api/v1/stashes/wrong_id")
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("should_be_numeric");
      expect(response.body.errors?.[0]?.path).to.equal("id");
    });
    it("should return stash", async() => {
      const response = await request(globalThis.app)
        .get(`/api/v1/stashes/${stash.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.key).to.not.be.undefined;
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
    it("should return error id_should_be_numeric", async() => {
      const id = "wrong_id";
      const hours = 100;
      const response = await request(globalThis.app)
        .post(`/api/v1/stashes/${id}/snooze/${hours}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("should_be_numeric");
      expect(response.body.errors?.[0]?.path).to.equal("id");
    });
    it("should return error hours_should_be_numeric", async() => {
      const id = 1;
      const hours = "wrong_hours";
      const response = await request(globalThis.app)
        .post(`/api/v1/stashes/${id}/snooze/${hours}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("should_be_numeric");
      expect(response.body.errors?.[0]?.path).to.equal("hours");
    });
    it("should snooze stash successfully", async() => {
      const id = 1;
      const hours = 100;
      const response = await request(globalThis.app)
        .post(`/api/v1/stashes/${id}/snooze/${hours}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_OK);
    });
  });

  describe("DELETE /api/v1/stashes/:id", () => {
    it("should return error id_should_be_numeric", async() => {
      const id = "wrong_id";
      const response = await request(globalThis.app)
        .delete(`/api/v1/stashes/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("should_be_numeric");
      expect(response.body.errors?.[0]?.path).to.equal("id");
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
  });
});

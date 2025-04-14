// user.test.ts
import request from "supertest";
import { expect } from "chai";
import { customAlphabet } from "nanoid";
import sinon from "sinon";
import { CODES } from "lib/constants";

let user: object;
let token: string;
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
  before(async () => {
    //Create user
    user = await request(globalThis.app)
      .post("/api/v1/users")
      .send(userCredentials);

    //get token
    const loginResponse = await request(globalThis.app)
      .post("/api/v1/users/login")
      .send({
        email: userCredentials.email,
        password: userCredentials.password,
      });

    token = loginResponse.body.token;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("POST /api/v1/stashes", () => {
    it("should return error body_required", async () => {
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

    it("should return error to_required", async () => {
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

    it("should return error send_at_required", async () => {
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

    it("should return error date_format_incorrect", async () => {
      const testStashWrongSendAt = { ...testStash };
      testStashWrongSendAt.sendAt = "wrong_date_time_format";
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStashWrongSendAt);

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal(
        "date_format_incorrect"
      );
      expect(response.body.errors?.[0]?.path).to.equal("sendAt");
    });

    it("should return error email_format_incorrect", async () => {
      const testStashWrongTo = { ...testStash };
      testStashWrongTo.to = "wrong_email_format";
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStashWrongTo);

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal(
        "email_format_incorrect"
      );
      expect(response.body.errors?.[0]?.path).to.equal("to");
    });

    it("should create stash", async () => {
      const response = await request(globalThis.app)
        .post("/api/v1/stashes")
        .set("Authorization", `Bearer ${token}`)
        .send(testStash);

      expect(response.status).to.equal(CODES.API_CREATED);
      expect(response.body.key).to.exist;
    });
  });
});

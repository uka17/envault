import request from "supertest";
import { expect } from "chai";
import { customAlphabet } from "nanoid";

import { CODES } from "#common/constants.js";
import Stash from "#model/Stash.js";

let token: string;
let stashId: number;
let publicAccessToken: string;

const userId = customAlphabet("1234567890abcdef", 10);
const userName = customAlphabet("abcdefghijklmnopqrstuvwxyz", 10);
const userCredentials = {
  email: `${userId()}@test.com`,
  password: `Password${userId()}`,
  name: `user${userName()}`,
};

const testStash = {
  body: "public_stash_test_body",
  to: "public-test@testmail.com",
  sendAt: "2023-04-27T20:04:30.446+0200",
};

describe("Public Stash Routes", () => {
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
    const createResponse = await request(globalThis.app)
      .post("/api/v1/stashes")
      .set("Authorization", `Bearer ${token}`)
      .send(testStash);

    stashId = createResponse.body.id;

    //publicAccessToken is @Exclude()'d from the API response, so read it
    //directly from the database for test purposes
    const persistedStash = await globalThis.appDataSource
      .getRepository(Stash)
      .findOne({ where: { id: stashId } });
    publicAccessToken = persistedStash!.publicAccessToken;
  });

  describe("GET /api/public/stashes/:token", () => {
    it("should return 422 for an invalid token format", async() => {
      const response = await request(globalThis.app).get("/api/public/stashes/short");

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
    });

    it("should return a neutral 404 for an unknown token", async() => {
      const response = await request(globalThis.app)
        .get(`/api/public/stashes/${"z".repeat(20)}`);

      expect(response.status).to.equal(CODES.API_NOT_FOUND);
      expect(response.body.message).to.equal("Invalid link or key");
    });

    it("should return only the information required for the unlock form", async() => {
      const response = await request(globalThis.app)
        .get(`/api/public/stashes/${publicAccessToken}`);

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.sendAt).to.exist;
      expect(response.body.key).to.be.undefined;
      expect(response.body.body).to.be.undefined;
      expect(response.body.publicAccessToken).to.be.undefined;
      expect(response.body.to).to.be.undefined;
    });
  });

  describe("POST /api/public/stashes/:token/unlock", () => {
    it("should return 422 when key is missing", async() => {
      const response = await request(globalThis.app)
        .post(`/api/public/stashes/${publicAccessToken}/unlock`)
        .send({});

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
    });

    it("should return a neutral 404 for an unknown token", async() => {
      const response = await request(globalThis.app)
        .post(`/api/public/stashes/${"z".repeat(20)}/unlock`)
        .send({ key: "secret" });

      expect(response.status).to.equal(CODES.API_NOT_FOUND);
      expect(response.body.message).to.equal("Invalid link or key");
    });

    it("should return the same neutral 404 for a wrong key", async() => {
      const response = await request(globalThis.app)
        .post(`/api/public/stashes/${publicAccessToken}/unlock`)
        .send({ key: "wrong-key" });

      expect(response.status).to.equal(CODES.API_NOT_FOUND);
      expect(response.body.message).to.equal("Invalid link or key");
    });

    it("should unlock the stash and return its decrypted content for the correct key", async() => {
      const response = await request(globalThis.app)
        .post(`/api/public/stashes/${publicAccessToken}/unlock`)
        .send({ key: "secret" });

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.body).to.equal(testStash.body);
      expect(response.body.key).to.be.undefined;
      expect(response.body.publicAccessToken).to.be.undefined;
    });
  });

  describe("Rate limiting", () => {
    it("should return 429 after exceeding the unlock rate limit", async() => {
      let lastStatus = 0;
      for (let i = 0; i < 15; i++) {
        const response = await request(globalThis.app)
          .post(`/api/public/stashes/${publicAccessToken}/unlock`)
          .send({ key: "wrong-key" });
        lastStatus = response.status;
      }

      expect(lastStatus).to.equal(CODES.API_TOO_MANY_REQUESTS);
    });
  });
});

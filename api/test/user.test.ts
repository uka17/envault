// user.test.ts
import request from "supertest";
import { expect } from "chai";
import userRoutes from "../src/route/user";
import { User } from "../../model/User";
import { customAlphabet } from "nanoid";
import sinon from "sinon";
const userId = customAlphabet("1234567890abcdef", 10);

describe("User Routes", () => {
  before(async () => {
    userRoutes(
      globalThis.app,
      globalThis.mockLogger,
      globalThis.translations,
      globalThis.appDataSource
    );
  });

  beforeEach(() => {});

  afterEach(() => {
    sinon.restore();
  });

  describe("POST /api/v1/users", () => {
    it("should handle unexpected error correctly", async () => {
      const newUser = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userId()}`,
      };

      sinon
        .stub(globalThis.appDataSource.manager, "save")
        .throws(new Error("Unexpected error"));

      const response = await request(globalThis.app)
        .post("/api/v1/users")
        .send(newUser);

      expect(response.status).to.equal(500);
      expect(response.body.error.textCode).to.equal("error_500");
    });

    it("should return error user_already_exists", async () => {
      const newUser = {
        password: `Password${userId()}`,
        name: `user${userId()}`,
        email: `${userId()}@test.com`,
      };

      const createResponse = await request(globalThis.app)
        .post("/api/v1/users")
        .send(newUser);
      expect(createResponse.status).to.equal(201);
      expect(createResponse.body.error).to.not.exist;
      expect(createResponse.body.name).to.exist;
      expect(createResponse.status).to.equal(201);

      const failedCreateResponse = await request(globalThis.app)
        .post("/api/v1/users")
        .send(newUser);
      expect(failedCreateResponse.body.errors?.[0]?.msg?.textCode).to.equal(
        "user_already_exists"
      );
      expect(failedCreateResponse.status).to.equal(422);
    });

    it("should return error email_required", async () => {
      const newUser = {
        password: `Password${userId()}`,
        name: `user${userId()}`,
      };

      const response = await request(globalThis.app)
        .post("/api/v1/users")
        .send(newUser);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal(
        "email_required"
      );
      expect(response.status).to.equal(422);
    });

    it("should return error name_required", async () => {
      const newUser = {
        password: `Password${userId()}`,
        email: `${userId()}@test.com`,
      };

      const response = await request(globalThis.app)
        .post("/api/v1/users")
        .send(newUser);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal(
        "name_required"
      );
      expect(response.status).to.equal(422);
    });

    it("should return error name_alphanumeric", async () => {
      const newUser = {
        password: `Password${userId()}`,
        email: `${userId()}@test.com`,
        name: "*",
      };

      const response = await request(globalThis.app)
        .post("/api/v1/users")
        .send(newUser);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal(
        "name_alphanumeric"
      );
      expect(response.status).to.equal(422);
    });

    it("should return error email_format_incorrect", async () => {
      const newUser = {
        password: `Password${userId()}`,
        email: "test",
        name: `user${userId()}`,
      };

      const response = await request(globalThis.app)
        .post("/api/v1/users")
        .send(newUser);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal(
        "email_format_incorrect"
      );
      expect(response.status).to.equal(422);
    });

    it("should return error password_required", async () => {
      const newUser = {
        email: `${userId()}@test.com`,
        name: `user${userId()}`,
      };

      const response = await request(globalThis.app)
        .post("/api/v1/users")
        .send(newUser);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal(
        "password_required"
      );
      expect(response.status).to.equal(422);
    });

    it("should return error password_format_incorrect", async () => {
      const newUser = {
        email: `${userId()}@test.com`,
        password: "password",
        name: `user${userId()}`,
      };

      const response = await request(globalThis.app)
        .post("/api/v1/users")
        .send(newUser);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal(
        "password_format_incorrect"
      );
      expect(response.status).to.equal(422);
    });
  });

  describe("POST /api/v1/users/login", () => {
    it("should fail to login with empty email", async () => {
      const response = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send({
          email: "",
          password: "123",
        });

      expect(response.body.errors?.[0]?.msg?.textCode).to.equal(
        "email_required"
      );
      expect(response.status).to.equal(422);
    });

    it("should fail to login with incorrect email", async () => {
      const response = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send({
          email: "123",
          password: "123",
        });

      expect(response.body.errors?.[0]?.msg?.textCode).to.equal(
        "email_format_incorrect"
      );
      expect(response.status).to.equal(422);
    });

    it("should fail to login with empty password", async () => {
      const response = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send({
          email: "mail@test.com",
          password: "",
        });

      expect(response.body.errors?.[0]?.msg?.textCode).to.equal(
        "password_required"
      );
      expect(response.status).to.equal(422);
    });

    it("should create new user and login an existing user with correct credentials", async () => {
      //Use random email and password
      const userCredentials = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userId()}`,
      };

      //Create user
      const createResponse = await request(globalThis.app)
        .post("/api/v1/users")
        .send({
          ...userCredentials,
          name: `user${userId()}`,
        });

      expect(createResponse.body.error).to.not.exist;
      expect(createResponse.body.name).to.exist;
      expect(createResponse.status).to.equal(201);

      //Login user
      const loginResponse = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send(userCredentials);

      expect(loginResponse.body.error).to.not.exist;
      expect(loginResponse.body.token).to.exist;
      expect(loginResponse.status).to.equal(200);
    });

    it("should fail to login with incorrect credentials", async () => {
      const response = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send({
          email: "wrong@test.com",
          password: "wrongPassword",
        });

      expect(response.body.error?.textCode).to.equal(
        "incorrect_password_or_email"
      );
      expect(response.status).to.equal(401);
    });
  });

  describe("GET /api/v1/users/whoami", () => {
    let token;

    beforeEach(async () => {
      const newUser = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userId()}`,
      };

      await request(globalThis.app).post("/api/v1/users").send(newUser);

      const loginResponse = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send({
          email: newUser.email,
          password: newUser.password,
        });

      token = loginResponse.body.token;
    });

    it("should fetch the current user with valid token", async () => {
      const response = await request(globalThis.app)
        .get("/api/v1/users/whoami")
        .set("Authorization", `Bearer ${token}`);

      expect(response.body.error).to.not.exist;
      expect(response.body.email).to.exist;
      expect(response.status).to.equal(200);
    });

    it("should not fetch user with invalid token", async () => {
      const response = await request(globalThis.app)
        .get("/api/v1/users/whoami")
        .set("Authorization", "Bearer invalidToken");

      //This error is handled by passport config in api/src/route/health.ts.
      //We can not check textCode, so just checking Unauthorized is there
      expect(response.text).to.equal("Unauthorized");
      expect(response.status).to.equal(401);
    });
  });
});

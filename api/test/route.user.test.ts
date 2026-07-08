import request from "supertest";
import { expect } from "chai";
import { customAlphabet } from "nanoid";
import sinon from "sinon";
import { container } from "tsyringe";
import passport from "passport";
import bcrypt from "bcryptjs";
import { CODES, MESSAGES } from "#common/constants.js";
import { TOKENS } from "#di/tokens.js";
import UserService from "#service/UserService.js";
import config from "api/src/config/config.js";

const userId = customAlphabet(
  "1234567890abcdef",
  10,
);
const userName = customAlphabet(
  "abcdefghijklmnopqrstuvwxyz",
  10,
);

describe("User Routes", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("POST /api/v1/users", () => {
    it("should return 500 when createUser returns null", async() => {
      const userService = container.resolve<UserService>(TOKENS.UserService);
      sinon.stub(userService, "createUser").resolves(null);

      const response = await request(globalThis.app)
        .post("/api/v1/users")
        .send({
          email: `${userId()}@test.com`,
          password: `Password${userId()}`,
          name: `user${userName()}`,
        });

      expect(response.status).to.equal(CODES.SERVER_ERROR);
      expect(response.body.message?.textCode).to.equal("error_500");
    });

    it("should handle unexpected error correctly", async() => {
      const newUser = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userName()}`,
      };

      sinon
        .stub(
          globalThis.appDataSource.manager,
          "save",
        ).throws(new Error("Unexpected error"));

      const response = await request(
        globalThis.app,
      )
        .post("/api/v1/users")
        .send(newUser);

      expect(response.status).to.equal(500);
      expect(
        response.body.message?.textCode,
      ).to.equal("error_500");
    });

    it("should return error user_already_exists", async() => {
      const newUser = {
        password: `Password${userId()}`,
        name: `user${userName()}`,
        email: `${userId()}@test.com`,
      };

      const createResponse = await request(
        globalThis.app,
      )
        .post("/api/v1/users")
        .send(newUser);
      expect(createResponse.status).to.equal(201);
      expect(createResponse.body.error).to.be
        .undefined;
      expect(createResponse.body.name).to.not.be
        .undefined;
      expect(createResponse.body.password).to.be.undefined;
      expect(createResponse.body.refreshToken).to.be.undefined;
      expect(createResponse.status).to.equal(201);

      const failedCreateResponse = await request(
        globalThis.app,
      )
        .post("/api/v1/users")
        .send(newUser);
      expect(
        failedCreateResponse.body.errors?.[0]?.msg
          ?.textCode,
      ).to.equal("user_already_exists");
      expect(
        failedCreateResponse.status,
      ).to.equal(422);
    });

    it("should return error email_required", async() => {
      const newUser = {
        password: `Password${userId()}`,
        name: `user${userName()}`,
      };

      const response = await request(
        globalThis.app,
      )
        .post("/api/v1/users")
        .send(newUser);
      expect(
        response.body.errors?.[0]?.msg?.textCode,
      ).to.equal("email_required");
      expect(response.status).to.equal(422);
    });

    it("should return error name_required", async() => {
      const newUser = {
        password: `Password${userId()}`,
        email: `${userId()}@test.com`,
      };

      const response = await request(
        globalThis.app,
      )
        .post("/api/v1/users")
        .send(newUser);
      expect(
        response.body.errors?.[0]?.msg?.textCode,
      ).to.equal("name_required");
      expect(response.status).to.equal(422);
    });

    it("should return error name_alphanumeric", async() => {
      const newUser = {
        password: `Password${userId()}`,
        email: `${userId()}@test.com`,
        name: "*",
      };

      const response = await request(
        globalThis.app,
      )
        .post("/api/v1/users")
        .send(newUser);
      expect(
        response.body.errors?.[0]?.msg?.textCode,
      ).to.equal("name_alphanumeric");
      expect(response.status).to.equal(422);
    });

    it("should return error email_format_incorrect", async() => {
      const newUser = {
        password: `Password${userId()}`,
        email: "test",
        name: `user${userName()}`,
      };

      const response = await request(
        globalThis.app,
      )
        .post("/api/v1/users")
        .send(newUser);
      expect(
        response.body.errors?.[0]?.msg?.textCode,
      ).to.equal("email_format_incorrect");
      expect(response.status).to.equal(422);
    });

    it("should return error password_required", async() => {
      const newUser = {
        email: `${userId()}@test.com`,
        name: `user${userName()}`,
      };

      const response = await request(
        globalThis.app,
      )
        .post("/api/v1/users")
        .send(newUser);
      expect(
        response.body.errors?.[0]?.msg?.textCode,
      ).to.equal("password_required");
      expect(response.status).to.equal(422);
    });

    it("should return error password_format_incorrect", async() => {
      const newUser = {
        email: `${userId()}@test.com`,
        password: "password",
        name: `user${userName()}`,
      };

      const response = await request(
        globalThis.app,
      )
        .post("/api/v1/users")
        .send(newUser);
      expect(
        response.body.errors?.[0]?.msg?.textCode,
      ).to.equal("password_format_incorrect");
      expect(response.status).to.equal(422);
    });
  });

  describe("POST /api/v1/users/login", () => {
    it("should fail to login with empty email", async() => {
      const response = await request(
        globalThis.app,
      )
        .post("/api/v1/users/login")
        .send({
          email: "",
          password: "123",
        });

      expect(
        response.body.errors?.[0]?.msg?.textCode,
      ).to.equal("email_required");
      expect(response.status).to.equal(422);
    });

    it("should fail to login with incorrect email", async() => {
      const response = await request(
        globalThis.app,
      )
        .post("/api/v1/users/login")
        .send({
          email: "123",
          password: "123",
        });

      expect(
        response.body.errors?.[0]?.msg?.textCode,
      ).to.equal("email_format_incorrect");
      expect(response.status).to.equal(422);
    });

    it("should fail to login with empty password", async() => {
      const response = await request(
        globalThis.app,
      )
        .post("/api/v1/users/login")
        .send({
          email: "mail@test.com",
          password: "",
        });

      expect(
        response.body.errors?.[0]?.msg?.textCode,
      ).to.equal("password_required");
      expect(response.status).to.equal(422);
    });

    it("should create new user and login an existing user with correct credentials", async() => {
      //Use random email and password
      const userCredentials = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userName()}`,
      };

      //Create user
      const createResponse = await request(
        globalThis.app,
      )
        .post("/api/v1/users")
        .send(userCredentials);

      expect(createResponse.body.error).to.be
        .undefined;
      expect(createResponse.body.name).to.not.be
        .undefined;
      expect(createResponse.status).to.equal(201);

      //Login user
      const loginResponse = await request(
        globalThis.app,
      )
        .post("/api/v1/users/login")
        .send(userCredentials);

      expect(loginResponse.body.error).to.be
        .undefined;
      expect(loginResponse.body.token).to.not.be
        .undefined;
      expect(loginResponse.status).to.equal(200);

      // Login must set HttpOnly refresh token cookie
      const setCookie: string[] = loginResponse.headers["set-cookie"] ?? [];
      const refreshCookie = setCookie.find((c: string) => c.startsWith(`${config.refreshCookieName}=`));
      expect(refreshCookie).to.not.be.undefined;
      expect(refreshCookie).to.include("HttpOnly");
    });

    it("should return 500 when bcrypt.compare errors", async() => {
      const creds = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userName()}`,
      };
      await request(globalThis.app).post("/api/v1/users").send(creds);

      sinon.stub(bcrypt, "compare").callsFake((_data: any, _encrypted: any, cb: any) => {
        cb(new Error("bcrypt error"), false);
      });

      const response = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send({ email: creds.email, password: creds.password });

      expect(response.status).to.equal(CODES.SERVER_ERROR);
    });

    it("should return 500 when passport.authenticate throws", async() => {
      sinon.stub(passport, "authenticate").throws(new Error("passport error"));

      const response = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send({ email: "test@test.com", password: "Password123" });

      expect(response.status).to.equal(CODES.SERVER_ERROR);
    });

    it("should fail to login with incorrect credentials", async() => {
      const response = await request(
        globalThis.app,
      )
        .post("/api/v1/users/login")
        .send({
          email: "wrong@test.com",
          password: "wrongPassword",
        });

      expect(
        response.body.error?.textCode,
      ).to.equal("incorrect_password_or_email");
      expect(response.status).to.equal(401);
    });
  });

  describe("GET /api/v1/users/whoami", () => {
    let token;

    beforeEach(async() => {
      const newUser = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userName()}`,
      };

      await request(globalThis.app)
        .post("/api/v1/users")
        .send(newUser);

      const loginResponse = await request(
        globalThis.app,
      )
        .post("/api/v1/users/login")
        .send({
          email: newUser.email,
          password: newUser.password,
        });

      token = loginResponse.body.token;
    });

    it("should return 401 when getUserById returns null", async() => {
      const userService = container.resolve<UserService>(TOKENS.UserService);
      sinon.stub(userService, "getUserById").resolves(null);

      const response = await request(globalThis.app)
        .get("/api/v1/users/whoami")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).to.equal(CODES.API_UNAUTHORIZED);
    });

    it("should fetch the current user with valid token", async() => {
      const response = await request(
        globalThis.app,
      )
        .get("/api/v1/users/whoami")
        .set("Authorization", `Bearer ${token}`);

      expect(response.body.error).to.be.undefined;
      expect(response.body.email).to.not.be
        .undefined;
      expect(response.body.password).to.be.undefined;
      expect(response.body.refreshToken).to.be.undefined;
      expect(response.status).to.equal(200);
    });

    it("should not fetch user with invalid token", async() => {
      const response = await request(
        globalThis.app,
      )
        .get("/api/v1/users/whoami")
        .set(
          "Authorization",
          "Bearer invalidToken",
        );

      //This error is handled by passport config in api/src/route/health.ts.
      //We can not check textCode, so just checking Unauthorized is there
      expect(response.text).to.equal(
        "Unauthorized",
      );
      expect(response.status).to.equal(401);
    });
  });

  describe("POST /api/v1/token/refresh", () => {
    let refreshCookie: string;
    let userCredentials: { email: string; password: string; name: string };

    beforeEach(async() => {
      userCredentials = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userName()}`,
      };

      await request(globalThis.app).post("/api/v1/users").send(userCredentials);

      const loginResponse = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send({ email: userCredentials.email, password: userCredentials.password });

      const setCookie: string[] = loginResponse.headers["set-cookie"] ?? [];
      refreshCookie = setCookie.find((c: string) => c.startsWith(`${config.refreshCookieName}=`)) ?? "";
    });

    it("should return 401 when no refresh cookie is present", async() => {
      const response = await request(globalThis.app).post("/api/v1/token/refresh");
      expect(response.status).to.equal(CODES.API_UNAUTHORIZED);
      expect(response.body.error?.textCode).to.equal("incorrect_token");
    });

    it("should return 401 and clear cookie for an invalid refresh token", async() => {
      const response = await request(globalThis.app)
        .post("/api/v1/token/refresh")
        .set("Cookie", `${config.refreshCookieName}=invalidtoken`);

      expect(response.status).to.equal(CODES.API_UNAUTHORIZED);
      expect(response.body.error?.textCode).to.equal("incorrect_token");

      const setCookie: string[] = response.headers["set-cookie"] ?? [];
      const cleared = setCookie.find((c: string) => c.startsWith(`${config.refreshCookieName}=`));
      expect(cleared).to.not.be.undefined;
      expect(cleared).to.include("Expires=Thu, 01 Jan 1970");
    });

    it("should return a new access token and rotate refresh cookie for a valid token", async() => {
      const response = await request(globalThis.app)
        .post("/api/v1/token/refresh")
        .set("Cookie", refreshCookie);

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.token).to.not.be.undefined;

      const setCookie: string[] = response.headers["set-cookie"] ?? [];
      const newRefreshCookie = setCookie.find((c: string) => c.startsWith(`${config.refreshCookieName}=`));
      expect(newRefreshCookie).to.not.be.undefined;
      expect(newRefreshCookie).to.include("HttpOnly");
      expect(newRefreshCookie).to.not.equal(refreshCookie);
    });

    it("should still accept the previous refresh token within the grace period (race protection)", async() => {
      // Consume the token once
      await request(globalThis.app)
        .post("/api/v1/token/refresh")
        .set("Cookie", refreshCookie);

      // A concurrent request using the just-replaced token must still succeed
      const response = await request(globalThis.app)
        .post("/api/v1/token/refresh")
        .set("Cookie", refreshCookie);

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.token).to.not.be.undefined;
    });

    it("should return 401 for the previous refresh token once grace has expired (replay protection)", async() => {
      const originalGrace = config.JWTRefreshGraceMinutes;

      // Consume the token once, with the grace deadline already in the past
      config.JWTRefreshGraceMinutes = -1;
      await request(globalThis.app)
        .post("/api/v1/token/refresh")
        .set("Cookie", refreshCookie);
      config.JWTRefreshGraceMinutes = originalGrace;

      // Attempt to reuse the original token — must be rejected
      const response = await request(globalThis.app)
        .post("/api/v1/token/refresh")
        .set("Cookie", refreshCookie);

      expect(response.status).to.equal(CODES.API_UNAUTHORIZED);
    });

    it("should return 401 when verifyRefreshToken returns null", async() => {
      const userService = container.resolve<UserService>(TOKENS.UserService);
      sinon.stub(userService, "verifyRefreshToken").resolves(null);

      const response = await request(globalThis.app)
        .post("/api/v1/token/refresh")
        .set("Cookie", refreshCookie);

      expect(response.status).to.equal(CODES.API_UNAUTHORIZED);
    });
  });

  describe("POST /api/v1/users/logout", () => {
    let token: string;
    let refreshCookie: string;

    beforeEach(async() => {
      const newUser = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userName()}`,
      };

      await request(globalThis.app).post("/api/v1/users").send(newUser);

      const loginResponse = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send({ email: newUser.email, password: newUser.password });

      token = loginResponse.body.token;
      const setCookie: string[] = loginResponse.headers["set-cookie"] ?? [];
      refreshCookie = setCookie.find((c: string) => c.startsWith(`${config.refreshCookieName}=`)) ?? "";
    });

    it("should return 401 without a valid access token", async() => {
      const response = await request(globalThis.app).post("/api/v1/users/logout");
      expect(response.status).to.equal(CODES.API_UNAUTHORIZED);
    });

    it("should return 200 and clear the refresh cookie on successful logout", async() => {
      const response = await request(globalThis.app)
        .post("/api/v1/users/logout")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).to.equal(CODES.API_OK);

      const setCookie: string[] = response.headers["set-cookie"] ?? [];
      const cleared = setCookie.find((c: string) => c.startsWith(`${config.refreshCookieName}=`));
      expect(cleared).to.not.be.undefined;
      expect(cleared).to.include("Expires=Thu, 01 Jan 1970");
    });

    it("should invalidate the refresh token after logout", async() => {
      await request(globalThis.app)
        .post("/api/v1/users/logout")
        .set("Authorization", `Bearer ${token}`);

      const refreshResponse = await request(globalThis.app)
        .post("/api/v1/token/refresh")
        .set("Cookie", refreshCookie);

      expect(refreshResponse.status).to.equal(CODES.API_UNAUTHORIZED);
    });
  });

  describe("PATCH /api/v1/users/me", () => {
    let token: string;
    let userCredentials: { email: string; password: string; name: string };

    beforeEach(async() => {
      userCredentials = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userName()}`,
      };

      await request(globalThis.app).post("/api/v1/users").send(userCredentials);

      const loginResponse = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send({ email: userCredentials.email, password: userCredentials.password });

      token = loginResponse.body.token;
    });

    it("should return 401 without a valid access token", async() => {
      const response = await request(globalThis.app)
        .patch("/api/v1/users/me")
        .send({ name: "newname" });

      expect(response.status).to.equal(CODES.API_UNAUTHORIZED);
    });

    it("should update name successfully", async() => {
      const newName = `user${userName()}`;

      const response = await request(globalThis.app)
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: newName });

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.name).to.equal(newName);
      expect(response.body.password).to.be.undefined;
    });

    it("should update email successfully", async() => {
      const newEmail = `${userId()}@test.com`;

      const response = await request(globalThis.app)
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ email: newEmail });

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.email).to.equal(newEmail);
    });

    it("should return 422 for invalid email format", async() => {
      const response = await request(globalThis.app)
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ email: "notanemail" });

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("email_format_incorrect");
    });

    it("should return 422 for invalid name format", async() => {
      const response = await request(globalThis.app)
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "invalid name!" });

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("name_alphanumeric");
    });

    it("should return 422 when updating to an already taken email", async() => {
      const otherUser = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userName()}`,
      };
      await request(globalThis.app).post("/api/v1/users").send(otherUser);

      const response = await request(globalThis.app)
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ email: otherUser.email });

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("user_already_exists");
    });
  });

  describe("PATCH /api/v1/users/me/password", () => {
    let token: string;
    let userCredentials: { email: string; password: string; name: string };

    beforeEach(async() => {
      userCredentials = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userName()}`,
      };

      await request(globalThis.app).post("/api/v1/users").send(userCredentials);

      const loginResponse = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send({ email: userCredentials.email, password: userCredentials.password });

      token = loginResponse.body.token;
    });

    it("should return 401 without a valid access token", async() => {
      const response = await request(globalThis.app)
        .patch("/api/v1/users/me/password")
        .send({ currentPassword: userCredentials.password, newPassword: `NewPass${userId()}` });

      expect(response.status).to.equal(CODES.API_UNAUTHORIZED);
    });

    it("should change password successfully", async() => {
      const newPassword = `NewPass${userId()}`;

      const response = await request(globalThis.app)
        .patch("/api/v1/users/me/password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: userCredentials.password, newPassword });

      expect(response.status).to.equal(CODES.API_OK);

      // Verify new password works for login
      const loginResponse = await request(globalThis.app)
        .post("/api/v1/users/login")
        .send({ email: userCredentials.email, password: newPassword });

      expect(loginResponse.status).to.equal(CODES.API_OK);
      expect(loginResponse.body.token).to.not.be.undefined;
    });

    it("should return 422 for incorrect current password", async() => {
      const response = await request(globalThis.app)
        .patch("/api/v1/users/me/password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: "WrongPassword1", newPassword: `NewPass${userId()}` });

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.error?.textCode).to.equal("incorrect_current_password");
    });

    it("should return 422 for missing currentPassword", async() => {
      const response = await request(globalThis.app)
        .patch("/api/v1/users/me/password")
        .set("Authorization", `Bearer ${token}`)
        .send({ newPassword: `NewPass${userId()}` });

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("current_password_required");
    });

    it("should return 422 for missing newPassword", async() => {
      const response = await request(globalThis.app)
        .patch("/api/v1/users/me/password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: userCredentials.password });

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("new_password_required");
    });

    it("should return 422 when newPassword does not meet format requirements", async() => {
      const response = await request(globalThis.app)
        .patch("/api/v1/users/me/password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: userCredentials.password, newPassword: "weak" });

      expect(response.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);
      expect(response.body.errors?.[0]?.msg?.textCode).to.equal("password_format_incorrect");
    });
  });
});

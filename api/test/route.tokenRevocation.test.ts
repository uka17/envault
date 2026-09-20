import request from "supertest";
import { expect } from "chai";
import { customAlphabet } from "nanoid";
import sinon from "sinon";
import jwt from "jsonwebtoken";
import { CODES } from "#common/constants.js";
import Session from "#model/Session.js";
import config from "api/src/config/config.js";
import { registerAndVerifyUser } from "./helpers.js";

const userId = customAlphabet(
  "1234567890abcdef",
  10,
);
const userName = customAlphabet(
  "abcdefghijklmnopqrstuvwxyz",
  10,
);

type Credentials = { email: string; password: string; name: string };

/**
 * Registers and verifies a new user with unique credentials
 * @returns Credentials of the created user
 */
async function createUser(): Promise<Credentials> {
  const credentials = {
    email: `${userId()}@test.com`,
    password: `Password${userId()}`,
    name: `user${userName()}`,
  };
  await registerAndVerifyUser(credentials);
  return credentials;
}

/**
 * Logs the user in, which creates a new session
 * @param credentials User credentials
 * @returns Access token and the raw Set-Cookie header of the refresh token
 */
async function login(credentials: Credentials) {
  const response = await request(globalThis.app)
    .post("/api/v1/users/login")
    .send({ email: credentials.email, password: credentials.password });
  const setCookie: string[] = response.headers["set-cookie"] ?? [];
  const refreshCookie = setCookie.find((c: string) => c.startsWith(`${config.refreshCookieName}=`)) ?? "";
  return { token: response.body.token as string, refreshCookie, response };
}

/**
 * Calls a protected endpoint with the given access token
 * @param token Access token
 * @returns Response of `GET /api/v1/users/whoami`
 */
function whoami(token: string) {
  return request(globalThis.app).get("/api/v1/users/whoami").set("Authorization", `Bearer ${token}`);
}

/**
 * Decodes an access token without verifying it
 * @param token Access token
 * @returns Claims issued by `UserService.createToken`
 */
function decode(token: string) {
  return jwt.decode(token) as unknown as { sub: number; sid: number; exp: number };
}

/**
 * Reads the id of the session the token belongs to
 * @param token Access token
 * @returns Session id from the `sid` claim
 */
function sidOf(token: string): number {
  return decode(token).sid;
}

describe("Access token revocation", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("access token lifetime", () => {
    it("should issue access tokens that expire in 15 minutes", async() => {
      const { token } = await login(await createUser());
      const { exp } = decode(token);
      const minutesLeft = (exp * 1000 - Date.now()) / 60000;

      expect(config.JWTAccessMaxAgeMinutes).to.equal(15);
      expect(minutesLeft).to.be.within(14, 15);
    });

    it("should reject a JWT whose exp is in the past", async() => {
      const credentials = await createUser();
      const { token } = await login(credentials);
      const { sub, sid } = decode(token);
      const expired = jwt.sign(
        { sub, sid, exp: Math.floor(Date.now() / 1000) - 60 },
        process.env.API_JWT_SECRET,
      );

      expect((await whoami(expired)).status).to.equal(CODES.API_UNAUTHORIZED);
    });
  });

  describe("session validation", () => {
    it("should accept a token of an active session, also for parallel requests", async() => {
      const { token } = await login(await createUser());
      const responses = await Promise.all([whoami(token), whoami(token), whoami(token)]);

      responses.forEach((response) => expect(response.status).to.equal(CODES.API_OK));
    });

    it("should reject a JWT without sid", async() => {
      const credentials = await createUser();
      const { token } = await login(credentials);
      const { sub } = decode(token);
      const withoutSid = jwt.sign(
        { sub, exp: Math.floor(Date.now() / 1000) + 600 },
        process.env.API_JWT_SECRET,
      );

      expect((await whoami(withoutSid)).status).to.equal(CODES.API_UNAUTHORIZED);
    });

    it("should reject a JWT pointing to a non-existent session", async() => {
      const { token } = await login(await createUser());
      const { sub } = decode(token);
      const forged = jwt.sign(
        { sub, sid: 2147483647, exp: Math.floor(Date.now() / 1000) + 600 },
        process.env.API_JWT_SECRET,
      );

      expect((await whoami(forged)).status).to.equal(CODES.API_UNAUTHORIZED);
    });

    it("should reject a session that belongs to another user", async() => {
      const { token: tokenA } = await login(await createUser());
      const { token: tokenB } = await login(await createUser());
      const { sub: userA } = decode(tokenA);
      const mixed = jwt.sign(
        { sub: userA, sid: sidOf(tokenB), exp: Math.floor(Date.now() / 1000) + 600 },
        process.env.API_JWT_SECRET,
      );

      expect((await whoami(mixed)).status).to.equal(CODES.API_UNAUTHORIZED);
      expect((await whoami(tokenB)).status).to.equal(CODES.API_OK);
    });

    it("should reject a token of an expired session", async() => {
      const { token } = await login(await createUser());
      await globalThis.appDataSource
        .getRepository(Session)
        .update(sidOf(token), { expiresAt: new Date(Date.now() - 1000) });

      expect((await whoami(token)).status).to.equal(CODES.API_UNAUTHORIZED);
    });
  });

  describe("database failure during authentication", () => {
    it("should respond with a safe 500 instead of hanging when the session lookup fails", async() => {
      const { token } = await login(await createUser());
      sinon.stub(globalThis.appDataSource.manager, "findOne")
        .rejects(new Error("postgres://user:password@database"));

      const response = await whoami(token);

      expect(response.status).to.equal(CODES.SERVER_ERROR);
      expect(JSON.stringify(response.body)).to.not.include("postgres://");
    });
  });

  describe("revocation takes effect immediately", () => {
    it("should reject access and refresh tokens after logout", async() => {
      const { token, refreshCookie } = await login(await createUser());

      const logout = await request(globalThis.app)
        .post("/api/v1/users/logout")
        .set("Authorization", `Bearer ${token}`);
      expect(logout.status).to.equal(CODES.API_OK);

      expect((await whoami(token)).status).to.equal(CODES.API_UNAUTHORIZED);
      const refresh = await request(globalThis.app).post("/api/v1/token/refresh").set("Cookie", refreshCookie);
      expect(refresh.status).to.equal(CODES.API_UNAUTHORIZED);
    });

    it("should reject tokens of a revoked session and keep other sessions working", async() => {
      const credentials = await createUser();
      const first = await login(credentials);
      const second = await login(credentials);

      const revoke = await request(globalThis.app)
        .delete(`/api/v1/users/sessions/${sidOf(second.token)}`)
        .set("Authorization", `Bearer ${first.token}`);
      expect(revoke.status).to.equal(CODES.API_OK);

      expect((await whoami(second.token)).status).to.equal(CODES.API_UNAUTHORIZED);
      const refresh = await request(globalThis.app)
        .post("/api/v1/token/refresh")
        .set("Cookie", second.refreshCookie);
      expect(refresh.status).to.equal(CODES.API_UNAUTHORIZED);
      expect((await whoami(first.token)).status).to.equal(CODES.API_OK);
    });

    it("should reject tokens of other sessions after revokeOtherSessions and keep the current one", async() => {
      const credentials = await createUser();
      const first = await login(credentials);
      const second = await login(credentials);
      const third = await login(credentials);

      const revoke = await request(globalThis.app)
        .delete("/api/v1/users/sessions")
        .set("Authorization", `Bearer ${first.token}`);
      expect(revoke.status).to.equal(CODES.API_OK);

      for (const other of [second, third]) {
        expect((await whoami(other.token)).status).to.equal(CODES.API_UNAUTHORIZED);
        const refresh = await request(globalThis.app)
          .post("/api/v1/token/refresh")
          .set("Cookie", other.refreshCookie);
        expect(refresh.status).to.equal(CODES.API_UNAUTHORIZED);
      }
      expect((await whoami(first.token)).status).to.equal(CODES.API_OK);
    });

    it("should revoke all sessions, including the current one, after password change", async() => {
      const credentials = await createUser();
      const first = await login(credentials);
      const second = await login(credentials);
      const newPassword = `NewPass${userId()}`;

      const change = await request(globalThis.app)
        .patch("/api/v1/users/me/password")
        .set("Authorization", `Bearer ${first.token}`)
        .send({ currentPassword: credentials.password, newPassword });
      expect(change.status).to.equal(CODES.API_OK);

      for (const session of [first, second]) {
        expect((await whoami(session.token)).status).to.equal(CODES.API_UNAUTHORIZED);
        const refresh = await request(globalThis.app)
          .post("/api/v1/token/refresh")
          .set("Cookie", session.refreshCookie);
        expect(refresh.status).to.equal(CODES.API_UNAUTHORIZED);
      }

      const relogin = await login({ ...credentials, password: newPassword });
      expect(relogin.response.status).to.equal(CODES.API_OK);
      expect((await whoami(relogin.token)).status).to.equal(CODES.API_OK);
    });

    it("should keep sessions alive when the current password is incorrect", async() => {
      const { token } = await login(await createUser());

      const change = await request(globalThis.app)
        .patch("/api/v1/users/me/password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: "WrongPassword1", newPassword: `NewPass${userId()}` });
      expect(change.status).to.equal(CODES.API_REQUEST_VALIDATION_ERROR);

      expect((await whoami(token)).status).to.equal(CODES.API_OK);
    });

    it("should issue a working access token on refresh of an active session", async() => {
      const { refreshCookie } = await login(await createUser());

      const refresh = await request(globalThis.app).post("/api/v1/token/refresh").set("Cookie", refreshCookie);

      expect(refresh.status).to.equal(CODES.API_OK);
      expect((await whoami(refresh.body.token)).status).to.equal(CODES.API_OK);
    });
  });

  describe("refresh cookie flags", () => {
    it("should set Secure, HttpOnly and SameSite when ENV is PROD", async() => {
      const credentials = await createUser();
      sinon.stub(config, "environment").value("PROD");

      const { refreshCookie } = await login(credentials);

      expect(refreshCookie).to.include("HttpOnly");
      expect(refreshCookie).to.include("Secure");
      expect(refreshCookie).to.include("SameSite=Strict");
    });

    it("should not set Secure when ENV is not PROD, so local HTTP keeps working", async() => {
      const credentials = await createUser();
      sinon.stub(config, "environment").value("DEV");

      const { refreshCookie } = await login(credentials);

      expect(refreshCookie).to.include("HttpOnly");
      expect(refreshCookie).to.include("SameSite=Strict");
      expect(refreshCookie).to.not.include("Secure");
    });
  });
});

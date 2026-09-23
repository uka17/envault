import { expect } from "chai";
import request from "supertest";
import sinon from "sinon";
import express from "express";
import cookieParser from "cookie-parser";
import { randomBytes, createHash } from "crypto";
import { container } from "tsyringe";
import { instanceToPlain } from "class-transformer";
import User from "#model/User.js";
import Session from "#model/Session.js";
import Stash from "#model/Stash.js";
import EmailVerification from "#model/EmailVerification.js";
import EmailVerificationService from "#service/EmailVerificationService.js";
import PasswordResetLimit from "#model/PasswordResetLimit.js";
import UserService from "#service/UserService.js";
import EmailChangeService from "#service/EmailChangeService.js";
import EmailService from "#service/EmailService.js";
import { TOKENS } from "#di/tokens.js";
import config from "api/src/config/config.js";
import userRoutes from "api/src/route/user.js";
import createErrorHandler from "api/src/route/error.js";

const password = "OriginalPassword1";
const newPassword = "ReplacementPassword2";
const requestPath = "/api/v1/users/password-reset/request";
const confirmPath = "/api/v1/users/password-reset/confirm";
let app: express.Express;
let service: UserService;
let send: sinon.SinonStub;
const users = globalThis.appDataSource.getRepository(User);
const limits = globalThis.appDataSource.getRepository(PasswordResetLimit);

/**
 * Creates an isolated HTTP app with fresh IP budgets.
 * @returns App using the real user routes, DI services and error handler
 */
function createApp(): express.Express {
  const result = express();
  result.use(express.json());
  result.use(cookieParser());
  userRoutes(result);
  result.use(createErrorHandler());
  return result;
}

/**
 * Persists a user without registration mail or shared verification rate limits.
 * @param verified Whether this user has verified their email
 * @returns The stored user with its original password hash
 */
async function createUser(verified = true): Promise<User> {
  return users.save(users.create({
    email: `reset-${randomBytes(10).toString("hex")}@example.com`,
    password: service.getPasswordHash(password),
    name: "Reset User",
    emailVerifiedAt: verified ? new Date() : null,
  }));
}

/**
 * Confirms an email change through the real service, bypassing the confirmation email.
 * @param userId ID of the user whose address changes
 * @param email New email address
 * @returns Nothing when the change is committed
 */
async function changeEmail(userId: number, email: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await users.update(userId, {
    pendingEmail: email,
    emailChangeTokenHash: createHash("sha256").update(token).digest("hex"),
    emailChangeExpiresAt: new Date(Date.now() + 60000),
  });
  await container.resolve<EmailChangeService>(TOKENS.EmailChangeService).confirm(token);
}

/**
 * Reads a captured outgoing link rather than accessing a raw token in the database.
 * @param index Index of the stubbed mail call
 * @returns Raw reset token sent to the user
 */
function tokenAt(index = send.callCount - 1): string {
  return send.getCall(index).args[0].text.match(/token=([a-f0-9]{64})/)[1];
}

/**
 * Requests a reset and asserts its neutral response.
 * @param user Verified user to receive the reset email
 * @returns Raw token captured from the message
 */
async function issueToken(user: User): Promise<string> {
  const response = await request(app).post(requestPath).send({ email: user.email });
  expect(response.status).to.equal(200);
  expect(response.body).to.deep.equal({});
  return tokenAt();
}

/**
 * Submits a password reset token.
 * @param token Token to consume
 * @param replacement New password
 * @returns HTTP test request
 */
function confirm(token: unknown, replacement = newPassword) {
  return request(app).post(confirmPath).send({ token, newPassword: replacement });
}

/**
 * Logs in with an account password.
 * @param user User whose email to submit
 * @param candidate Password to submit
 * @returns Login response
 */
function login(user: User, candidate = password) {
  return request(app).post("/api/v1/users/login").send({ email: user.email, password: candidate });
}

describe("Password reset API", () => {
  beforeEach(() => {
    service = container.resolve<UserService>(TOKENS.UserService);
    send = sinon.stub(container.resolve<EmailService>(TOKENS.EmailService), "send").resolves("test-message-id");
    app = createApp();
  });

  afterEach(() => sinon.restore());

  it("returns identical success for verified, unknown and unverified addresses; mails only verified users", async() => {
    const user = await createUser();
    const unverified = await createUser(false);
    for (const email of [user.email, unverified.email, `unknown-${user.email}`]) {
      const result = await request(app).post(requestPath).send({ email });
      expect(result.status).to.equal(200);
      expect(result.body).to.deep.equal({});
    }
    expect(send.calledOnce).to.be.true;
    expect(send.firstCall.args[0].to).to.equal(user.email);
    expect((await users.findOneByOrFail({ id: unverified.id })).passwordResetTokenHash).to.be.null;
  });

  it("stores only a hash with a 30-minute TTL, hides fields and preserves password until confirmation", async() => {
    const user = await createUser();
    const token = await issueToken(user);
    const stored = await users.findOneByOrFail({ id: user.id });
    expect(stored.passwordResetTokenHash).to.equal(createHash("sha256").update(token).digest("hex"));
    expect(stored.passwordResetExpiresAt!.getTime() - Date.now()).to.be.closeTo(30 * 60000, 3000);
    expect(stored.passwordResetEmail).to.equal(user.email);
    expect(stored.password).to.equal(user.password);
    const serialized = instanceToPlain(stored);
    for (const field of ["passwordResetTokenHash", "passwordResetExpiresAt", "passwordResetEmail", "password"]) {
      expect(serialized).not.to.have.property(field);
    }
    expect(send.firstCall.args[0].text).to.include(`${config.baseUrl}/reset-password?token=${token}`);
  });

  it("replaces the previous token and does not permit a replay", async() => {
    const user = await createUser();
    const previous = await issueToken(user);
    const current = await issueToken(user);
    expect(current).not.to.equal(previous);
    expect((await confirm(previous)).body.code).to.equal("password_reset_invalid");
    expect((await confirm(current)).status).to.equal(200);
    expect((await confirm(current)).status).to.equal(400);
    const stored = await users.findOneByOrFail({ id: user.id });
    expect(stored.passwordResetTokenHash).to.be.null;
    expect(stored.passwordResetExpiresAt).to.be.null;
    expect(stored.passwordResetEmail).to.be.null;
  });

  it("changes the password, clears cookies, revokes all access/refresh tokens including grace tokens, preserves stash",
    async() => {
      const user = await createUser();
      const other = await createUser();
      const first = await login(user);
      const second = await login(user);
      const unrelated = await login(other);
      const firstCookie = first.headers["set-cookie"][0];
      const rotated = await request(app).post("/api/v1/token/refresh").set("Cookie", firstCookie);
      expect(rotated.status).to.equal(200);
      const stashes = globalThis.appDataSource.getRepository(Stash);
      const stash = await stashes.save(stashes.create({
        user, to: "recipient@example.com", body: "opaque encrypted body",
        scheduledAt: new Date("2035-01-01"), publicAccessToken: randomBytes(10).toString("hex"),
      }));
      const before = await stashes.findOneByOrFail({ id: stash.id });
      const response = await confirm(await issueToken(user));
      expect(response.status).to.equal(200);
      expect(response.body).to.deep.equal({});
      expect(response.headers["set-cookie"][0]).to.include(`${config.refreshCookieName}=;`);
      for (const session of [first, second, rotated]) {
        expect((await request(app).get("/api/v1/users/whoami")
          .set("Authorization", `Bearer ${session.body.token}`)).status).to.equal(401);
        expect((await request(app).post("/api/v1/token/refresh")
          .set("Cookie", session.headers["set-cookie"][0])).status).to.equal(401);
      }
      expect((await request(app).get("/api/v1/users/whoami")
        .set("Authorization", `Bearer ${unrelated.body.token}`)).status).to.equal(200);
      expect((await login(user)).status).to.equal(401);
      expect((await login(user, newPassword)).status).to.equal(200);
      expect(await stashes.findOneByOrFail({ id: stash.id })).to.deep.equal(before);
    });

  for (const token of [undefined, null, 123, {}, [], "", "bad-token", "a".repeat(64)]) {
    it(`rejects missing/malformed/unknown token ${JSON.stringify(token)} with neutral 400`, async() => {
      const response = await confirm(token);
      expect(response.status).to.equal(400);
      expect(response.body.code).to.equal("password_reset_invalid");
    });
  }

  for (const replacement of [undefined, null, 123, [], "", "short", "nouppercase1"]) {
    it(`validates password ${JSON.stringify(replacement)} without consuming the token`, async() => {
      const user = await createUser();
      const token = await issueToken(user);
      const response = await request(app).post(confirmPath).send({ token, newPassword: replacement });
      expect(response.status).to.equal(422);
      expect(response.body.code).to.equal("validation_error");
      expect(JSON.stringify(response.body)).not.to.include(token);
      expect((await confirm(token)).status).to.equal(200);
    });
  }

  for (const email of [undefined, null, 123, [], "", "invalid", `${"a".repeat(255)}@example.com`]) {
    it(`rejects invalid request email ${JSON.stringify(email)}`, async() => {
      const response = await request(app).post(requestPath).send({ email });
      expect(response.status).to.equal(422);
      expect(send.called).to.be.false;
    });
  }

  it("rejects expired tokens, including the exact expiry boundary", async() => {
    const user = await createUser();
    const token = await issueToken(user);
    const expiry = new Date();
    await users.update(user.id, { passwordResetExpiresAt: expiry });
    sinon.useFakeTimers({ now: expiry, toFake: ["Date"] });
    expect((await confirm(token)).status).to.equal(400);
    expect((await users.findOneByOrFail({ id: user.id })).password).to.equal(user.password);
  });

  it("rejects a token if the current email or verification status has changed", async() => {
    const user = await createUser();
    const token = await issueToken(user);
    await users.update(user.id, { email: `changed-${user.email}` });
    expect((await confirm(token)).status).to.equal(400);
    await users.update(user.id, { email: user.email, emailVerifiedAt: null });
    expect((await confirm(token)).status).to.equal(400);
  });

  it("invalidates reset links on a normal password change and on an email update", async() => {
    const user = await createUser();
    const token = await issueToken(user);
    expect(await service.updatePassword(user.id, password, "ChangedPassword3")).to.be.true;
    expect((await confirm(token)).status).to.equal(400);
    const next = await issueToken(user);
    await changeEmail(user.id, `new-${user.email}`);
    await changeEmail(user.id, user.email);
    expect((await confirm(next)).status).to.equal(400);
  });

  it("allows exactly one concurrent confirmation", async() => {
    const token = await issueToken(await createUser());
    const responses = await Promise.all([confirm(token, "FirstPassword1"), confirm(token, "SecondPassword2")]);
    expect(responses.map((r) => r.status).sort()).to.deep.equal([200, 400]);
  });

  it("serializes concurrent requests so only the last committed token can be used", async() => {
    const user = await createUser();
    const responses = await Promise.all([1, 2, 3].map(() =>
      request(app).post(requestPath).send({ email: user.email })));
    expect(responses.map((r) => r.status)).to.deep.equal([200, 200, 200]);
    const confirmations = await Promise.all([0, 1, 2].map((i) => confirm(tokenAt(i))));
    expect(confirmations.map((r) => r.status).sort()).to.deep.equal([200, 400, 400]);
  });

  it("serializes replacement against confirmation without reviving the old token", async() => {
    const user = await createUser();
    const old = await issueToken(user);
    const [replacement, consumption] = await Promise.all([
      request(app).post(requestPath).send({ email: user.email }), confirm(old),
    ]);
    expect(replacement.status).to.equal(200);
    expect([200, 400]).to.include(consumption.status);
    expect((await confirm(old)).status).to.equal(400);
    expect((await confirm(tokenAt())).status).to.equal(200);
  });

  it("rolls back password and token consumption when session revocation fails", async() => {
    const user = await createUser();
    const session = await service.createRefreshToken(user);
    const token = await issueToken(user);
    const revoke = sinon.stub(service, "revokeAllSessions").rejects(new Error("database failed"));
    expect((await confirm(token)).status).to.equal(500);
    const stored = await users.findOneByOrFail({ id: user.id });
    expect(stored.password).to.equal(user.password);
    expect(stored.passwordResetTokenHash).not.to.be.null;
    expect((await globalThis.appDataSource.getRepository(Session)
      .findOneByOrFail({ id: session.sessionId })).revokedAt).to.be.null;
    revoke.restore();
    expect((await confirm(token)).status).to.equal(200);
  });

  it("rejects a login that verified the old password just before reset, without hanging", async() => {
    const user = await createUser();
    const token = await issueToken(user);
    const original = service.createRefreshToken.bind(service);
    sinon.stub(service, "createRefreshToken").callsFake(async(snapshot, meta) => {
      expect(await service.confirmPasswordReset(token, newPassword)).to.be.true;
      return original(snapshot, meta);
    });
    expect((await login(user)).status).to.equal(401);
    expect(await globalThis.appDataSource.getRepository(Session).countBy({ user: { id: user.id } })).to.equal(0);
  });

  it("rejects stale sessions for deleted accounts and changed email snapshots", async() => {
    const user = await createUser();
    await users.update(user.id, { email: `changed-${user.email}` });
    for (const snapshot of [user, { ...user, id: 2147483647 } as User]) {
      let error: any;
      try {
        await service.createRefreshToken(snapshot);
      } catch (caught) {
        error = caught;
      }
      expect(error?.code).to.equal("incorrect_password_or_email");
    }
  });

  it("rejects reset records with no expiry", async() => {
    const user = await createUser();
    const token = await issueToken(user);
    await users.update(user.id, { passwordResetExpiresAt: null });
    expect((await confirm(token)).status).to.equal(400);
  });

  it("does not restore an old password or consumed token from a stale email-verification snapshot", async() => {
    const user = await createUser();
    const verification = container.resolve<EmailVerificationService>(TOKENS.EmailVerificationService);
    await verification.createAndSend(user);
    const code = send.lastCall.args[0].text.match(/verification page: (\S+)/)[1];
    const token = await issueToken(user);
    const repository = globalThis.appDataSource.getRepository(EmailVerification);
    const original = repository.findOne.bind(repository);
    sinon.stub(repository, "findOne").callsFake(async(options) => {
      const stale = await original(options);
      expect(await service.confirmPasswordReset(token, newPassword)).to.be.true;
      return stale;
    });
    expect((await verification.verify(code))?.id).to.equal(user.id);
    expect((await confirm(token)).status).to.equal(400);
    expect((await login(user)).status).to.equal(401);
    expect((await login(user, newPassword)).status).to.equal(200);
  });

  it("returns neutral success even when delivery returns null or throws; failures count toward budget", async() => {
    const user = await createUser();
    send.onFirstCall().resolves(null);
    send.onSecondCall().rejects(new Error("mail error containing raw token"));
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post(requestPath).send({ email: user.email })).status).to.equal(200);
    }
    expect((await request(app).post(requestPath).send({ email: user.email })).status).to.equal(429);
    expect(send.callCount).to.equal(3);
  });

  it("returns a safe 500 for a request database failure", async() => {
    sinon.stub(service, "requestPasswordReset").rejects(new Error("sensitive database details"));
    const response = await request(app).post(requestPath).send({ email: "somebody@example.com" });
    expect(response.status).to.equal(500);
    expect(response.body.code).to.equal("error_500");
    expect(JSON.stringify(response.body)).not.to.include("sensitive");
  });

  for (const kind of ["verified", "unverified", "unknown"]) {
    it(`enforces the same durable address budget for ${kind} accounts, with independent addresses`, async() => {
      const user = await createUser(kind === "verified");
      const email = kind === "unknown" ? `unknown-${user.email}` : user.email;
      for (let i = 0; i < 3; i++) {
        expect((await request(app).post(requestPath).send({ email })).status).to.equal(200);
      }
      // Fresh app and service instances must not reset the persistent address budget.
      app = createApp();
      const response = await request(app).post(requestPath).send({ email: ` ${email.toUpperCase()} ` });
      expect(response.status).to.equal(429);
      expect(response.body.code).to.equal("password_reset_rate_limited");
      expect(Number(response.headers["retry-after"])).to.be.within(1, 900);
      expect((await request(app).post(requestPath).send({ email: `different-${email}` })).status).to.equal(200);
      const restarted = new UserService(users, globalThis.appDataSource.getRepository(Session),
        globalThis.mockLogService, container.resolve<EmailService>(TOKENS.EmailService));
      expect(await restarted.requestPasswordReset(email)).to.be.greaterThan(0);
    });
  }

  it("does not exceed the address budget under concurrent requests", async() => {
    const user = await createUser();
    const responses = await Promise.all(Array.from({ length: 6 }, () =>
      request(app).post(requestPath).send({ email: user.email })));
    expect(responses.map((r) => r.status).sort()).to.deep.equal([200, 200, 200, 429, 429, 429]);
    expect(send.callCount).to.equal(3);
  });

  it("restores the address budget when the window expires and cleans up inactive entries", async() => {
    const email = `unknown-${randomBytes(10).toString("hex")}@example.com`;
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    for (let i = 0; i < 3; i++) {
      expect(await service.requestPasswordReset(email)).to.equal(0);
    }
    expect(await service.requestPasswordReset(email)).to.equal(900);
    clock.tick(config.passwordReset.windowMs);
    expect(await service.requestPasswordReset(email)).to.equal(0);
    const obsolete = createHash("sha256").update(`obsolete-${email}`).digest("hex");
    await limits.save({ emailHash: obsolete, requestCount: 3,
      windowStartedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
    expect(await service.requestPasswordReset(email)).to.equal(0);
    expect(await limits.findOneBy({ emailHash: obsolete })).to.be.null;
  });

  it("limits request attempts by socket IP even when the address changes", async() => {
    sinon.stub(config.passwordReset, "maxRequestsPerIp").value(2);
    app = createApp();
    for (let i = 0; i < 2; i++) {
      expect((await request(app).post(requestPath).send({ email: `ip-${i}@example.com` })).status).to.equal(200);
    }
    const response = await request(app).post(requestPath).send({ email: "ip-third@example.com" });
    expect(response.status).to.equal(429);
    expect(response.body.code).to.equal("password_reset_rate_limited");
    expect(Number(response.headers["retry-after"])).to.be.within(1, 900);
  });

  it("limits confirmation attempts separately from requests", async() => {
    sinon.stub(config.passwordReset, "maxConfirmationsPerIp").value(2);
    app = createApp();
    expect((await confirm("bad")).status).to.equal(400);
    expect((await confirm("bad")).status).to.equal(400);
    const response = await confirm("bad");
    expect(response.status).to.equal(429);
    expect(response.body.code).to.equal("password_reset_rate_limited");
    expect(response.headers).to.have.property("retry-after");
    expect((await request(app).post(requestPath).send({ email: "separate-budget@example.com" })).status).to.equal(200);
  });
});

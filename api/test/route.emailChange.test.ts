import { createHash, randomBytes } from "crypto";
import { expect } from "chai";
import sinon from "sinon";
import request from "supertest";
import { container } from "tsyringe";
import User from "#model/User.js";
import Session from "#model/Session.js";
import EmailVerification from "#model/EmailVerification.js";
import EmailService from "#service/EmailService.js";
import UserService from "#service/UserService.js";
import EmailChangeService from "#service/EmailChangeService.js";
import EmailVerificationService from "#service/EmailVerificationService.js";
import { TOKENS } from "#di/tokens.js";
import config from "api/src/config/config.js";

const prefix = "/api/v1/users";
const users = globalThis.appDataSource.getRepository(User);
const sessions = globalThis.appDataSource.getRepository(Session);
const patch = (token: string, body: object) => request(globalThis.app)
  .patch(`${prefix}/me`).set("Authorization", `Bearer ${token}`).send(body);
const confirm = (token: string) => request(globalThis.app).post(`${prefix}/email-change/confirm`).send({ token });
const resend = (token: string) => request(globalThis.app)
  .post(`${prefix}/email-change/resend`).set("Authorization", `Bearer ${token}`);
const address = () => `${randomBytes(12).toString("hex")}@test.com`;

describe("Email change API", () => {
  let user: User;
  let access: string;
  let raw: string;
  let send: sinon.SinonStub;
  let clock: sinon.SinonFakeTimers;
  let userService: UserService;
  let changes: EmailChangeService;
  const password = "OriginalPass123";
  const mailToken = () => send.lastCall.args[0].text.match(/token=([0-9a-f]{64})/)[1];

  beforeEach(async() => {
    clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    userService = container.resolve<UserService>(TOKENS.UserService);
    changes = container.resolve<EmailChangeService>(TOKENS.EmailChangeService);
    user = await users.save(users.create({
      email: address(), name: "Email User", password: userService.getPasswordHash(password),
      emailVerifiedAt: new Date(),
    }));
    const session = await userService.createRefreshToken(user);
    raw = session.raw;
    access = userService.createToken(user, session.sessionId);
    send = sinon.stub(container.resolve<EmailService>(TOKENS.EmailService), "send").resolves("mock-id");
  });

  afterEach(() => sinon.restore());

  it("keeps the old login and verification until confirmation, then revokes access and refresh tokens", async() => {
    const nextEmail = address();
    const extraSession = await userService.createRefreshToken(user);
    const extraAccess = userService.createToken(user, extraSession.sessionId);
    const result = await patch(access, { email: nextEmail, name: "New Name" });
    expect(result.status).to.equal(200);
    expect(result.body).to.include({ email: user.email, pendingEmail: nextEmail, name: "New Name" });
    expect(result.body.emailVerifiedAt).to.equal(user.emailVerifiedAt!.toISOString());
    for (const field of ["password", "emailChangeTokenHash", "emailChangeExpiresAt", "emailChangeLastSentAt",
      "emailChangeWindowStartedAt", "emailChangeSendCount"]) {
      expect(result.body).not.to.have.property(field);
    }
    expect(send.lastCall.args[0].to).to.equal(nextEmail);
    expect(send.lastCall.args[0].text).to.include(`${config.baseUrl}/confirm-email-change?token=`);
    const token = mailToken();
    const stored = await users.findOneByOrFail({ id: user.id });
    expect(stored.emailChangeTokenHash).to.equal(createHash("sha256").update(token).digest("hex"));
    expect(stored.emailChangeExpiresAt!.getTime()).to.equal(Date.now() + 30 * 60 * 1000);
    const oldLogin = await request(globalThis.app).post(`${prefix}/login`).send({ email: user.email, password });
    expect(oldLogin.status).to.equal(200);
    expect((await request(globalThis.app).post(`${prefix}/login`).send({ email: nextEmail, password })).status)
      .to.equal(401);
    const done = await confirm(token);
    expect(done.status).to.equal(200);
    expect(done.body).to.deep.equal({});
    expect(done.headers["set-cookie"][0]).to.include("Expires=Thu, 01 Jan 1970");
    for (const jwt of [access, extraAccess, oldLogin.body.token]) {
      expect((await request(globalThis.app).get(`${prefix}/whoami`)
        .set("Authorization", `Bearer ${jwt}`)).status).to.equal(401);
    }
    for (const refresh of [raw, extraSession.raw]) {
      expect((await request(globalThis.app).post("/api/v1/token/refresh")
        .set("Cookie", `${config.refreshCookieName}=${refresh}`)).status).to.equal(401);
    }
    expect((await request(globalThis.app).post(`${prefix}/login`).send({ email: user.email, password })).status)
      .to.equal(401);
    expect((await request(globalThis.app).post(`${prefix}/login`).send({ email: nextEmail, password })).status)
      .to.equal(200);
    expect((await users.findOneByOrFail({ id: user.id })).pendingEmail).to.be.null;
    expect((await confirm(token)).status).to.equal(401);
  });

  it("does not send again for repeated PATCH and keeps name editing independent", async() => {
    const email = address();
    expect((await patch(access, { email })).status).to.equal(200);
    const first = mailToken();
    const results = await Promise.all(Array.from({ length: 5 }, () => patch(access, { email })));
    expect(results.every((r) => r.status === 200)).to.be.true;
    expect(send.callCount).to.equal(1);
    const named = await patch(access, { name: "Renamed" });
    expect(named.body).to.include({ name: "Renamed", pendingEmail: email });
    expect(named.body.emailVerifiedAt).to.equal(user.emailVerifiedAt!.toISOString());
    expect((await confirm(first)).status).to.equal(200);
  });

  it("issues a fresh token when the same address is resubmitted after the old one expired", async() => {
    // Without this the user is stuck: PATCH answers 200, no email is sent and the dead token stays.
    const email = address();
    expect((await patch(access, { email })).status).to.equal(200);
    const expired = mailToken();
    clock.tick(config.emailChange.ttlMs + 1000);
    // The access token outlives neither the tick nor the TTL, so re-authenticate before resubmitting.
    const renewed = await userService.createRefreshToken(user);
    expect((await patch(userService.createToken(user, renewed.sessionId), { email })).status).to.equal(200);
    expect(send.callCount).to.equal(2);
    const fresh = mailToken();
    expect(fresh).not.to.equal(expired);
    expect((await confirm(expired)).status).to.equal(401);
    expect((await confirm(fresh)).status).to.equal(200);
    expect((await users.findOneByOrFail({ id: user.id })).email).to.equal(email);
  });

  it("enforces cooldown and a persistent per-user budget across address replacements and cancellations", async() => {
    expect((await patch(access, { email: address() })).status).to.equal(200);
    const limited = await resend(access);
    expect(limited.status).to.equal(429);
    expect(limited.body.code).to.equal("email_change_rate_limited");
    expect(limited.headers["retry-after"]).to.equal("60");
    clock.tick(60_000);
    const oldToken = mailToken();
    expect((await resend(access)).status).to.equal(200);
    expect((await confirm(oldToken)).status).to.equal(401);
    clock.tick(60_000);
    expect((await patch(access, { email: address() })).status).to.equal(200);
    expect((await patch(access, { email: user.email })).body.pendingEmail).to.be.null;
    clock.tick(60_000);
    const budget = await patch(access, { email: address() });
    expect(budget.status).to.equal(429);
    expect(Number(budget.headers["retry-after"])).to.equal(720);
    // A fresh service instance uses the same persisted budget.
    const fresh = new EmailChangeService(users, userService,
      container.resolve(TOKENS.EmailService), container.resolve(TOKENS.LogService));
    let error: any;
    try {
      await fresh.request(user.id, { email: address() }); 
    } catch (e) {
      error = e; 
    }
    expect(error.statusCode).to.equal(429);
    clock.tick(720_000);
    await fresh.request(user.id, { email: address() });
    expect(send.callCount).to.equal(4);
  });

  it("serializes concurrent replacement and resend requests without exceeding the send budget", async() => {
    const results = await Promise.all([patch(access, { email: address() }), patch(access, { email: address() })]);
    expect(results.map((r) => r.status).sort()).to.deep.equal([200, 429]);
    expect(send.callCount).to.equal(1);
    clock.tick(60_000);
    const retries = await Promise.all([resend(access), resend(access)]);
    expect(retries.map((r) => r.status).sort()).to.deep.equal([200, 429]);
    expect(send.callCount).to.equal(2);
  });

  it("rejects unknown, expired, cancelled and replaced tokens", async() => {
    expect((await confirm("0".repeat(64))).status).to.equal(401);
    await patch(access, { email: address() });
    const replaced = mailToken();
    clock.tick(60_000);
    await patch(access, { email: address() });
    expect((await confirm(replaced)).status).to.equal(401);
    const cancelled = mailToken();
    await patch(access, { email: user.email });
    expect((await confirm(cancelled)).status).to.equal(401);
    clock.tick(60_000);
    await patch(access, { email: address() });
    const expired = mailToken();
    clock.tick(30 * 60_000);
    expect((await confirm(expired)).status).to.equal(401);
    expect((await users.findOneByOrFail({ id: user.id })).email).to.equal(user.email);
    // Resend works after token expiry (fresh authentication after the access TTL).
    const session = await userService.createRefreshToken(user);
    access = userService.createToken(user, session.sessionId);
    expect((await resend(access)).status).to.equal(200);
    expect((await confirm(mailToken())).status).to.equal(200);
  });

  it("consumes a token only once under parallel confirmation", async() => {
    await patch(access, { email: address() });
    const token = mailToken();
    const results = await Promise.all([confirm(token), confirm(token)]);
    expect(results.map((r) => r.status).sort()).to.deep.equal([200, 401]);
  });

  it("rolls back token consumption and revocation if the target email was claimed", async() => {
    const email = address();
    await patch(access, { email });
    const token = mailToken();
    await users.save(users.create({ email, name: "Other User", password: "hash" }));
    const result = await confirm(token);
    expect(result.status).to.equal(409);
    expect(result.body.code).to.equal("user_already_exists");
    const stored = await users.findOneByOrFail({ id: user.id });
    expect(stored.email).to.equal(user.email);
    expect(stored.pendingEmail).to.equal(email);
    expect(stored.emailChangeTokenHash).not.to.be.null;
    expect(await userService.verifyRefreshToken(raw)).not.to.be.null;
  });

  it("allows only one account to confirm the same new address concurrently", async() => {
    const email = address();
    const other = await users.save(users.create({ email: address(), name: "Other", password: "hash" }));
    await changes.request(user.id, { email });
    const first = mailToken();
    await changes.request(other.id, { email });
    const second = mailToken();
    const results = await Promise.all([confirm(first), confirm(second)]);
    expect(results.map((r) => r.status).sort()).to.deep.equal([200, 409]);
    expect(await users.countBy({ email })).to.equal(1);
    const loser = results[0].status === 409 ? user : other;
    expect((await users.findOneByOrFail({ id: loser.id })).email).to.equal(loser.email);
  });

  it("rolls back the address and token if session revocation fails", async() => {
    await patch(access, { email: address() });
    const token = mailToken();
    const revoke = sinon.stub(userService, "revokeAllSessions").rejects(new Error("database unavailable"));
    expect((await confirm(token)).status).to.equal(500);
    revoke.restore();
    expect((await users.findOneByOrFail({ id: user.id })).email).to.equal(user.email);
    expect((await sessions.findOneByOrFail({ user: { id: user.id } })).revokedAt).to.be.null;
    expect((await confirm(token)).status).to.equal(200);
  });

  for (const throws of [false, true]) {
    it(`retains the old login and supports limited resend after delivery ${throws ? "throws" : "fails"}`, async() => {
      if (throws) {
        send.rejects(new Error("SES unavailable")); 
      } else {
        send.resolves(null); 
      }
      const email = address();
      const result = await patch(access, { email });
      expect(result.status).to.equal(503);
      expect(result.body.code).to.equal("email_change_delivery_failed");
      expect((await users.findOneByOrFail({ id: user.id }))).to.include({ email: user.email, pendingEmail: email });
      expect((await patch(access, { email })).status).to.equal(200);
      expect(send.callCount).to.equal(1);
      expect((await resend(access)).status).to.equal(429);
      clock.tick(60_000);
      send.resolves("retry-id");
      expect((await resend(access)).status).to.equal(200);
      expect((await confirm(mailToken())).status).to.equal(200);
    });
  }

  it("uses the token owner, not the authenticated browser, and never accepts registration codes", async() => {
    const other = await users.save(users.create({ email: address(), name: "Other", password: "hash" }));
    const otherSession = await userService.createRefreshToken(other);
    await patch(access, { email: address() });
    const token = mailToken();
    const verification = container.resolve<EmailVerificationService>(TOKENS.EmailVerificationService);
    await verification.createAndSend(user);
    const registration = await globalThis.appDataSource.getRepository(EmailVerification)
      .findOneByOrFail({ user: { id: user.id } });
    expect((await confirm(registration.codeHash)).status).to.equal(401);
    const result = await request(globalThis.app).post(`${prefix}/email-change/confirm`)
      .set("Authorization", `Bearer ${userService.createToken(other, otherSession.sessionId)}`).send({ token });
    expect(result.status).to.equal(200);
    expect((await users.findOneByOrFail({ id: other.id })).email).to.equal(other.email);
    expect(await userService.verifyRefreshToken(otherSession.raw)).not.to.be.null;
    expect((await globalThis.appDataSource.getRepository(EmailVerification)
      .findOneByOrFail({ id: registration.id })).consumedAt).not.to.be.null;
  });

  it("prevents stale registration verification from overwriting a confirmed email", async() => {
    const verification = container.resolve<EmailVerificationService>(TOKENS.EmailVerificationService);
    await verification.createAndSend(user);
    const code = send.lastCall.args[0].text.match(/verification page: (\S+)/)[1];
    const email = address();
    await patch(access, { email });
    const token = mailToken();
    const repo = globalThis.appDataSource.getRepository(EmailVerification);
    const original = repo.findOne.bind(repo);
    sinon.stub(repo, "findOne").callsFake(async(options) => {
      const snapshot = await original(options);
      await changes.confirm(token);
      return snapshot;
    });
    expect(await verification.verify(code)).to.be.null;
    expect((await users.findOneByOrFail({ id: user.id })).email).to.equal(email);
  });

  it("rejects a login snapshot captured before email confirmation", async() => {
    await patch(access, { email: address() });
    await confirm(mailToken());
    let error: any;
    try {
      await userService.createRefreshToken(user); 
    } catch (e) {
      error = e; 
    }
    expect(error.statusCode).to.equal(401);
    expect((await sessions.findBy({ user: { id: user.id } })).every((s) => s.revokedAt !== null)).to.be.true;
  });

  it("validates input and requires authentication for resend", async() => {
    // Every rejected value must carry a machine-readable code; the frontend drops code-less errors.
    // The array case matters: `matches` coerces `["<hex>"]` to a valid-looking string, and the
    // service would then hash an array and answer 500 instead of 422.
    for (const token of [undefined, 123, {}, "bad", [`${"a".repeat(64)}`]]) {
      const result = await request(globalThis.app).post(`${prefix}/email-change/confirm`).send({ token });
      expect(result.status).to.equal(422);
      expect(result.body.errors).to.have.lengthOf(1);
      expect(result.body.errors[0]).to.include({ field: "token", code: "email_change_token_invalid" });
      expect(result.body.errors[0].message).to.be.a("string").and.not.empty;
    }
    expect((await request(globalThis.app).post(`${prefix}/email-change/resend`)).status).to.equal(401);
    expect((await resend(access)).status).to.equal(409);
    for (const [email, code] of [[123, "should_be_string"], [{}, "should_be_string"],
      [`${"a".repeat(250)}@test.com`, "email_format_incorrect"], ["not-an-email", "email_format_incorrect"]]) {
      const result = await patch(access, { email });
      expect(result.status).to.equal(422);
      expect(result.body.errors[0]).to.include({ field: "email", code });
      expect(result.body.errors[0].message).to.be.a("string").and.not.empty;
    }
  });
});

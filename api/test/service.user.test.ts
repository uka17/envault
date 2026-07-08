import { expect } from "chai";
import sinon from "sinon";
import bcrypt from "bcryptjs";

import UserService from "#service/UserService.js";
import User from "#model/User.js";
import Session from "#model/Session.js";
import config from "api/src/config/config.js";

const NON_EXISTENT_ID = 2147483647;

let userService: UserService;
let userRepositoryStub = globalThis.appDataSource.getRepository(User);
let sessionRepositoryStub = globalThis.appDataSource.getRepository(Session);
let loggerStub: { error: sinon.SinonStub };

describe("User service", () => {
  describe("Errors", () => {
    beforeEach(() => {
      userService = new UserService(userRepositoryStub, sessionRepositoryStub, globalThis.mockLogService);

      loggerStub = { error: sinon.stub() };
      (userService as any).logger = loggerStub;
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should error on getUserById", async() => {
      sinon
        .stub(globalThis.appDataSource.manager, "findOne")
        .throws(new Error("Unexpected error"));

      let result = await userService.getUserById(Number.MAX_SAFE_INTEGER);

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on getUserByEmail", async() => {
      sinon
        .stub(globalThis.appDataSource.manager, "findOne")
        .throws(new Error("Unexpected error"));

      let result = await userService.getUserByEmail("test@test.com");

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
    });
  });

  describe("Refresh token", () => {
    let testUser: User;

    before(async() => {
      userService = new UserService(userRepositoryStub, sessionRepositoryStub, globalThis.mockLogService);

      const u = new User();
      u.email = `refresh_svc_${Date.now()}@test.com`;
      u.password = "hashed";
      u.name = "RefreshSvcUser";
      testUser = await userRepositoryStub.save(u);
    });

    it("createRefreshToken should return a non-empty hex string and a session id", async() => {
      const { raw, sessionId } = await userService.createRefreshToken(testUser);
      expect(raw).to.be.a("string").and.to.have.length.greaterThan(0);
      expect(raw).to.match(/^[0-9a-f]+$/);
      expect(sessionId).to.be.a("number");
    });

    it("createRefreshToken should create a separate session per call (multi-device login)", async() => {
      const first = await userService.createRefreshToken(testUser);
      const second = await userService.createRefreshToken(testUser);
      expect(first.sessionId).to.not.equal(second.sessionId);

      const foundFirst = await userService.verifyRefreshToken(first.raw);
      const foundSecond = await userService.verifyRefreshToken(second.raw);
      expect(foundFirst).to.not.be.null;
      expect(foundSecond).to.not.be.null;
    });

    it("verifyRefreshToken should return the user and session when token matches", async() => {
      const { raw, sessionId } = await userService.createRefreshToken(testUser);
      const found = await userService.verifyRefreshToken(raw);
      expect(found).to.not.be.null;
      expect(found!.user.id).to.equal(testUser.id);
      expect(found!.session.id).to.equal(sessionId);
    });

    it("verifyRefreshToken should return null for an unknown token", async() => {
      const found = await userService.verifyRefreshToken("deadbeef");
      expect(found).to.be.null;
    });

    it("revokeRefreshToken should invalidate the session immediately", async() => {
      const { raw, sessionId } = await userService.createRefreshToken(testUser);
      await userService.revokeRefreshToken(sessionId);
      const found = await userService.verifyRefreshToken(raw);
      expect(found).to.be.null;
    });

    it("revokeAllSessions should invalidate every session of a user", async() => {
      const a = await userService.createRefreshToken(testUser);
      const b = await userService.createRefreshToken(testUser);
      await userService.revokeAllSessions(testUser.id);
      expect(await userService.verifyRefreshToken(a.raw)).to.be.null;
      expect(await userService.verifyRefreshToken(b.raw)).to.be.null;
    });

    it("verifyRefreshToken should accept the previous token within the grace period", async() => {
      const { raw } = await userService.createRefreshToken(testUser);
      const rotated = await userService.verifyRefreshToken(raw);
      expect(rotated).to.not.be.null;

      // The just-replaced token must still work while its grace window is open
      const reused = await userService.verifyRefreshToken(raw);
      expect(reused).to.not.be.null;
      expect(reused!.user.id).to.equal(testUser.id);
    });

    it("verifyRefreshToken should reject the previous token once the grace period has expired", async() => {
      const originalGrace = config.JWTRefreshGraceMinutes;
      const { raw } = await userService.createRefreshToken(testUser);

      config.JWTRefreshGraceMinutes = -1; // rotation grace deadline is already in the past
      const rotated = await userService.verifyRefreshToken(raw);
      expect(rotated).to.not.be.null;
      config.JWTRefreshGraceMinutes = originalGrace;

      const reused = await userService.verifyRefreshToken(raw);
      expect(reused).to.be.null;
    });

    it("revokeRefreshToken should take effect even during the grace period of a prior token", async() => {
      const { raw, sessionId } = await userService.createRefreshToken(testUser);
      const rotated = await userService.verifyRefreshToken(raw);
      expect(rotated).to.not.be.null;

      await userService.revokeRefreshToken(sessionId);

      expect(await userService.verifyRefreshToken(raw)).to.be.null;
      expect(await userService.verifyRefreshToken(rotated!.raw)).to.be.null;
    });
  });

  describe("updateProfile", () => {
    let profileUser: User;

    before(async() => {
      userService = new UserService(userRepositoryStub, sessionRepositoryStub, globalThis.mockLogService);

      const u = new User();
      u.email = `profile_svc_${Date.now()}@test.com`;
      u.password = "hashed";
      u.name = "ProfileSvcUser";
      profileUser = await userRepositoryStub.save(u);
    });

    // Password/refreshToken stripping is done at the response-serialization boundary
    // (class-transformer's @Exclude()), not by the service — see UserController.
    it("should update name", async() => {
      const result = await userService.updateProfile(profileUser.id, { name: "UpdatedName" });
      expect(result).to.not.be.null;
      expect(result!.name).to.equal("UpdatedName");
    });

    it("should update email", async() => {
      const newEmail = `updated_${Date.now()}@test.com`;
      const result = await userService.updateProfile(profileUser.id, { email: newEmail });
      expect(result).to.not.be.null;
      expect(result!.email).to.equal(newEmail);
    });

    it("should return null for a non-existent user id", async() => {
      const result = await userService.updateProfile(NON_EXISTENT_ID, { name: "Ghost" });
      expect(result).to.be.null;
    });
  });

  describe("updatePassword", () => {
    let passwordUser: User;
    const originalPassword = "OriginalPass1";

    before(async() => {
      userService = new UserService(userRepositoryStub, sessionRepositoryStub, globalThis.mockLogService);

      const u = new User();
      u.email = `password_svc_${Date.now()}@test.com`;
      u.password = userService.getPasswordHash(originalPassword);
      u.name = "PasswordSvcUser";
      passwordUser = await userRepositoryStub.save(u);
    });

    it("should return false for a non-existent user id", async() => {
      const result = await userService.updatePassword(
        NON_EXISTENT_ID,
        originalPassword,
        "NewPass1",
      );
      expect(result).to.be.false;
    });

    it("should return false when current password is wrong", async() => {
      const result = await userService.updatePassword(
        passwordUser.id,
        "WrongPassword1",
        "NewPass1",
      );
      expect(result).to.be.false;
    });

    it("should return true and update the password when current password is correct", async() => {
      const newPassword = "NewPass1";
      const result = await userService.updatePassword(passwordUser.id, originalPassword, newPassword);
      expect(result).to.be.true;

      // Verify new password is stored
      const updated = await userRepositoryStub.findOne({ where: { id: passwordUser.id } });
      expect(bcrypt.compareSync(newPassword, updated!.password)).to.be.true;
    });
  });
});

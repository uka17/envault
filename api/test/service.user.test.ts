import { expect } from "chai";
import sinon from "sinon";
import bcrypt from "bcryptjs";

import UserService from "#service/UserService.js";
import User from "#model/User.js";

const NON_EXISTENT_ID = 2147483647;

let userService: UserService;
let userRepositoryStub = globalThis.appDataSource.getRepository(User);
let loggerStub: { error: sinon.SinonStub };

describe("User service", () => {
  describe("Errors", () => {
    beforeEach(() => {
      userService = new UserService(userRepositoryStub, globalThis.mockLogService);

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
      userService = new UserService(userRepositoryStub, globalThis.mockLogService);

      const u = new User();
      u.email = `refresh_svc_${Date.now()}@test.com`;
      u.password = "hashed";
      u.name = "RefreshSvcUser";
      testUser = await userRepositoryStub.save(u);
    });

    /**
     * @returns raw refresh token
     */
    it("createRefreshToken should return a non-empty hex string", async() => {
      const raw = await userService.createRefreshToken(testUser);
      expect(raw).to.be.a("string").and.to.have.length.greaterThan(0);
      expect(raw).to.match(/^[0-9a-f]+$/);
    });

    it("verifyRefreshToken should return the user when token matches", async() => {
      const raw = await userService.createRefreshToken(testUser);
      const found = await userService.verifyRefreshToken(raw);
      expect(found).to.not.be.null;
      expect(found!.id).to.equal(testUser.id);
    });

    it("verifyRefreshToken should return null for an unknown token", async() => {
      const found = await userService.verifyRefreshToken("deadbeef");
      expect(found).to.be.null;
    });

    it("revokeRefreshToken should invalidate the stored token", async() => {
      const raw = await userService.createRefreshToken(testUser);
      await userService.revokeRefreshToken(testUser.id);
      const found = await userService.verifyRefreshToken(raw);
      expect(found).to.be.null;
    });
  });

  describe("updateProfile", () => {
    let profileUser: User;

    before(async() => {
      userService = new UserService(userRepositoryStub, globalThis.mockLogService);

      const u = new User();
      u.email = `profile_svc_${Date.now()}@test.com`;
      u.password = "hashed";
      u.name = "ProfileSvcUser";
      profileUser = await userRepositoryStub.save(u);
    });

    it("should update name and return user without password", async() => {
      const result = await userService.updateProfile(profileUser.id, { name: "UpdatedName" });
      expect(result).to.not.be.null;
      expect(result!.name).to.equal("UpdatedName");
      expect((result as any).password).to.be.undefined;
    });

    it("should update email and return user without password", async() => {
      const newEmail = `updated_${Date.now()}@test.com`;
      const result = await userService.updateProfile(profileUser.id, { email: newEmail });
      expect(result).to.not.be.null;
      expect(result!.email).to.equal(newEmail);
      expect((result as any).password).to.be.undefined;
    });

    it("should return object without id for a non-existent user id", async() => {
      const result = await userService.updateProfile(NON_EXISTENT_ID, { name: "Ghost" });
      expect(result).to.not.have.property("id");
    });
  });

  describe("updatePassword", () => {
    let passwordUser: User;
    const originalPassword = "OriginalPass1";

    before(async() => {
      userService = new UserService(userRepositoryStub, globalThis.mockLogService);

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

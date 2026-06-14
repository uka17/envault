import { expect } from "chai";
import sinon from "sinon";

import UserService from "#service/UserService.js";
import User from "#model/User.js";

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
});

// config.test.ts
import { expect } from "chai";
import sinon from "sinon";

import UserService from "service/UserService";

let userService: UserService;
let loggerStub: { error: sinon.SinonStub };

describe("User service", () => {
  describe("Errors", () => {
    beforeEach(() => {
      userService = new UserService(
        globalThis.appDataSource,
        globalThis.mockLogger
      );

      loggerStub = { error: sinon.stub() };
      (userService as any).logger = loggerStub;
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should error on getUserById", async () => {
      sinon
        .stub(globalThis.appDataSource.manager, "findOne")
        .throws(new Error("Unexpected error"));

      let result = await userService.getUserById(Number.MAX_SAFE_INTEGER);

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
    });
  });
});

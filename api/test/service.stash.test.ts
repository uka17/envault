import { expect } from "chai";
import sinon from "sinon";

import StashService from "service/StashService";
import Stash from "model/Stash";
import SendLog from "model/SendLog";

let stashService: StashService;
let stashRepositoryStub = globalThis.appDataSource.getRepository(Stash);
let sendLogRepository = globalThis.appDataSource.getRepository(SendLog);
let loggerStub: { error: sinon.SinonStub };

describe("Stash service", () => {
  describe("Regular logic", () => {
    afterEach(() => {
      sinon.restore();
    });

    it("should fail to snooze stash as it doesn't exist", async() => {
      let stashService: StashService = new StashService(
        stashRepositoryStub,
        sendLogRepository,
        globalThis.mockLogService,
      );

      let result = await stashService.snoozeStash(99999, 1, {} as any);

      expect(result).to.be.null;
    });
  });

  describe("Errors", () => {
    beforeEach(() => {
      stashService = new StashService(
        stashRepositoryStub,
        sendLogRepository,
        globalThis.mockLogService,
      );

      loggerStub = { error: sinon.stub() };
      (stashService as any).logger = loggerStub;
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should error on log", async() => {
      sinon.stub(globalThis.appDataSource.manager, "save").throws(new Error("Unexpected error"));

      let result = await stashService.log(1, {} as any, "msg-1");

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on createStash", async() => {
      sinon.stub(globalThis.appDataSource.manager, "save").throws(new Error("Unexpected error"));

      let result = await stashService.createStash({} as any);

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on getUserStashes", async() => {
      sinon.stub(globalThis.appDataSource.manager, "find").throws(new Error("Unexpected error"));

      let result = await stashService.getUserStashes(Number.MAX_SAFE_INTEGER);

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on getStash", async() => {
      sinon.stub(globalThis.appDataSource.manager, "findOne").throws(new Error("Unexpected error"));

      let result = await stashService.getStash(Number.MAX_SAFE_INTEGER);

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on deleteStash", async() => {
      sinon.stub(globalThis.appDataSource.manager, "delete").throws(new Error("Unexpected error"));

      let result = await stashService.deleteStash(Number.MAX_SAFE_INTEGER);

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on snoozeStash", async() => {
      sinon.stub(globalThis.appDataSource.manager, "findOne").returns({});

      let result = await stashService.snoozeStash(1, 1, {} as never);

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
    });
  });
});

import { expect } from "chai";
import sinon from "sinon";

import StashService from "#service/StashService.js";
import Stash from "#model/Stash.js";
import SendLog from "#model/SendLog.js";

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

    it("should generate a public access token of the correct length using only allowed characters", () => {
      let stashService: StashService = new StashService(
        stashRepositoryStub,
        sendLogRepository,
        globalThis.mockLogService,
      );

      const publicAccessToken = stashService.generatePublicAccessToken();

      expect(publicAccessToken).to.have.lengthOf(20);
      expect(publicAccessToken).to.match(/^[23456789abcdefghjkmnpqrstuvwxyz]{20}$/);
    });

    it("should persist a generated public access token when creating a stash", async() => {
      let stashService: StashService = new StashService(
        stashRepositoryStub,
        sendLogRepository,
        globalThis.mockLogService,
      );
      sinon.stub(globalThis.appDataSource.manager, "save").callsFake(async(entity: any) => entity);

      const result = await stashService.createStash({} as any);

      expect(result?.publicAccessToken).to.have.lengthOf(20);
      expect(result?.publicAccessToken).to.match(/^[23456789abcdefghjkmnpqrstuvwxyz]{20}$/);
    });

    it("should retry with a new token on a token-specific unique violation and succeed", async() => {
      let stashService: StashService = new StashService(
        stashRepositoryStub,
        sendLogRepository,
        globalThis.mockLogService,
      );
      const conflictError: any = new Error("duplicate key value violates unique constraint");
      conflictError.code = "23505";
      conflictError.detail = "Key (public_access_token)=(abc) already exists.";

      const saveStub = sinon.stub(globalThis.appDataSource.manager, "save");
      saveStub.onFirstCall().rejects(conflictError);
      saveStub.onSecondCall().callsFake(async(entity: any) => entity);

      const newStash: any = {};
      const result = await stashService.createStash(newStash);

      expect(saveStub.calledTwice).to.be.true;
      expect(result).to.not.be.null;
      expect(result?.publicAccessToken).to.have.lengthOf(20);
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

    it("should give up and log after repeated token conflicts", async() => {
      const conflictError: any = new Error("duplicate key value violates unique constraint");
      conflictError.code = "23505";
      conflictError.detail = "Key (public_access_token)=(abc) already exists.";

      const saveStub = sinon.stub(globalThis.appDataSource.manager, "save").rejects(conflictError);

      let result = await stashService.createStash({} as any);

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
      expect(saveStub.callCount).to.equal(5);
    });

    it("should error on getStashByPublicAccessToken", async() => {
      sinon.stub(globalThis.appDataSource.manager, "findOne").throws(new Error("Unexpected error"));

      let result = await stashService.getStashByPublicAccessToken("some-token");

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

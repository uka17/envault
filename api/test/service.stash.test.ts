import { expect } from "chai";
import sinon from "sinon";
import { In } from "typeorm";

import StashService from "#service/StashService.js";
import Stash from "#model/Stash.js";
import SendLog from "#model/SendLog.js";
import User from "#model/User.js";

let stashService: StashService;
let stashRepositoryStub = globalThis.appDataSource.getRepository(Stash);
let sendLogRepository = globalThis.appDataSource.getRepository(SendLog);
let loggerStub: { error: sinon.SinonStub };

async function expectRejectedWith(promise: Promise<unknown>, expectedError: Error) {
  try {
    await promise;
    expect.fail("Expected promise to reject");
  } catch (error) {
    expect(error).to.equal(expectedError);
  }
}

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

  describe("Owner-scoped snooze mutations", () => {
    let owner: User;
    let other: User;
    let stash: Stash;

    before(async() => {
      const users = globalThis.appDataSource.getRepository(User);
      owner = await users.save({ name: "Owner", email: "snooze-owner@example.com", password: "test-only" });
      other = await users.save({ name: "Other", email: "snooze-other@example.com", password: "test-only" });
    });

    beforeEach(async() => {
      stashService = new StashService(stashRepositoryStub, sendLogRepository, globalThis.mockLogService);
      stash = await stashRepositoryStub.save({
        user: owner, to: "recipient@example.com", body: "ciphertext", scheduledAt: new Date("2030-01-01T12:00:00Z"),
      });
    });

    afterEach(async() => {
      sinon.restore();
      await stashRepositoryStub.delete(stash.id);
    });

    after(async() => {
      await globalThis.appDataSource.getRepository(User).delete([owner.id, other.id]);
    });

    it("should not update a stash whose owner changed after the initial read", async() => {
      const originalDate = stash.scheduledAt.getTime();
      sinon.stub(stashService, "getStash").callsFake(async() => {
        await stashRepositoryStub.update(stash.id, { user: other });
        return stash;
      });

      const result = await stashService.snoozeStash(stash.id, 24, owner);

      expect(result).to.be.null;
      const persisted = await stashRepositoryStub.findOneOrFail({
        where: { id: stash.id }, relations: { user: true },
      });
      expect(persisted.user.id).to.equal(other.id);
      expect(persisted.scheduledAt.getTime()).to.equal(originalDate);
    });

    it("should not recreate a stash deleted after the initial read", async() => {
      sinon.stub(stashService, "getStash").callsFake(async() => {
        await stashRepositoryStub.delete(stash.id);
        return stash;
      });

      const result = await stashService.snoozeStash(stash.id, 24, owner);

      expect(result).to.be.null;
      expect(await stashRepositoryStub.findOneBy({ id: stash.id })).to.be.null;
    });
  });

  describe("Claiming due stashes", () => {
    let stashService: StashService;
    let createdStashIds: number[];

    /**
     * Persists a stash directly to the test database with sensible defaults,
     * tracking its ID so it gets cleaned up in `afterEach`. `scheduledAt` defaults
     * to the Unix epoch (long before any pre-existing fixture data in the
     * shared test database), so these tests stay deterministic under
     * `ORDER BY scheduled_at ASC` regardless of other leftover "due" stashes.
     * @param overrides Fields to override on the created stash
     * @returns The persisted stash, including its generated ID
     */
    async function createTestStash(overrides: Partial<Stash> = {}): Promise<Stash> {
      const stash = await stashRepositoryStub.save({
        to: "recipient@example.com",
        body: "encrypted-body",
        scheduledAt: new Date(0),
        ...overrides,
      });
      createdStashIds.push(stash.id);
      return stash;
    }

    beforeEach(() => {
      stashService = new StashService(
        stashRepositoryStub,
        sendLogRepository,
        globalThis.mockLogService,
      );
      createdStashIds = [];
    });

    afterEach(async() => {
      if (createdStashIds.length > 0) {
        await stashRepositoryStub.delete({ id: In(createdStashIds) });
      }
      sinon.restore();
    });

    it("should claim a due, unsent, unlocked stash and ignore one that isn't due yet", async() => {
      const dueStash = await createTestStash();
      await createTestStash({ scheduledAt: new Date(Date.now() + 60 * 60 * 1000) });

      // batchSize=1: dueStash.scheduledAt (epoch) sorts before any other row in
      // the (possibly non-empty, shared) test database, so it is
      // deterministically the one claimed.
      const claimed = await stashService.claimDueStashes(1, 5 * 60 * 1000);

      expect(claimed).to.not.be.null;
      expect(claimed?.map((s) => s.id)).to.deep.equal([dueStash.id]);
      expect(claimed?.[0].lockedAt).to.not.be.null;
    });

    it("should exclude a stash that is already locked by another in-flight claim", async() => {
      const lockedStash = await createTestStash({ lockedAt: new Date() });

      const claimed = await stashService.claimDueStashes(1, 5 * 60 * 1000);

      expect(claimed?.map((s) => s.id)).to.not.include(lockedStash.id);
    });

    it("should reclaim a stash whose lock has gone stale", async() => {
      const staleStash = await createTestStash({
        lockedAt: new Date(Date.now() - 10 * 60 * 1000),
      });

      const claimed = await stashService.claimDueStashes(1, 5 * 60 * 1000);

      expect(claimed?.map((s) => s.id)).to.deep.equal([staleStash.id]);
    });

    it("should exclude a stash that has already been sent", async() => {
      const sentStash = await createTestStash({ isSent: true });

      const claimed = await stashService.claimDueStashes(1, 5 * 60 * 1000);

      expect(claimed?.map((s) => s.id)).to.not.include(sentStash.id);
    });

    it("should respect batchSize when more stashes are due than requested", async() => {
      const first = await createTestStash({ scheduledAt: new Date(1) });
      const second = await createTestStash({ scheduledAt: new Date(2) });
      await createTestStash({ scheduledAt: new Date(3) });

      const claimed = await stashService.claimDueStashes(2, 5 * 60 * 1000);

      expect(claimed).to.have.lengthOf(2);
      expect(claimed?.map((s) => s.id)).to.deep.equal([first.id, second.id]);
    });

    it("should let only one of two concurrent claims win the same due stash", async() => {
      const dueStash = await createTestStash();

      // batchSize=1 and an epoch scheduledAt guarantee both concurrent calls
      // compete for this exact row first. Whichever call loses the race for
      // it may still claim some other unrelated due stash (there can be
      // other eligible rows in the shared test database) instead of
      // returning nothing, so what we actually assert is that `dueStash`
      // itself is claimed exactly once across both calls, never twice.
      const [first, second] = await Promise.all([
        stashService.claimDueStashes(1, 5 * 60 * 1000),
        stashService.claimDueStashes(1, 5 * 60 * 1000),
      ]);

      const claimedIds = [...(first || []), ...(second || [])].map((s) => s.id);
      const occurrences = claimedIds.filter((id) => id === dueStash.id).length;
      expect(occurrences).to.equal(1);
    });

    it("should mark a claimed stash as sent, record sentAt and release its lock", async() => {
      const stash = await createTestStash({
        scheduledAt: new Date(Date.now() - 1000),
        lockedAt: new Date(),
      });

      const beforeMark = Date.now();
      const result = await stashService.markStashSent(stash.id);
      expect(result?.affected).to.equal(1);

      const updated = await stashRepositoryStub.findOne({ where: { id: stash.id } });
      expect(updated?.isSent).to.be.true;
      expect(updated?.lockedAt).to.be.null;
      expect(updated?.sentAt).to.not.be.null;
      expect(updated!.sentAt!.getTime()).to.be.at.least(beforeMark);
    });

    it("should release a stash's lock without marking it as sent", async() => {
      const stash = await createTestStash({
        scheduledAt: new Date(Date.now() - 1000),
        lockedAt: new Date(),
      });

      const result = await stashService.releaseStashLock(stash.id);
      expect(result?.affected).to.equal(1);

      const updated = await stashRepositoryStub.findOne({ where: { id: stash.id } });
      expect(updated?.lockedAt).to.be.null;
      expect(updated?.isSent).to.not.be.true;
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
      const error = new Error("Unexpected error");
      sinon.stub(globalThis.appDataSource.manager, "save").rejects(error);

      await expectRejectedWith(stashService.createStash({} as any), error);
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should give up and log after repeated token conflicts", async() => {
      const conflictError: any = new Error("duplicate key value violates unique constraint");
      conflictError.code = "23505";
      conflictError.detail = "Key (public_access_token)=(abc) already exists.";

      const saveStub = sinon.stub(globalThis.appDataSource.manager, "save").rejects(conflictError);

      await expectRejectedWith(stashService.createStash({} as any), conflictError);
      expect(loggerStub.error.calledOnce).to.be.true;
      expect(saveStub.callCount).to.equal(5);
    });

    it("should error on getStashByPublicAccessToken", async() => {
      const error = new Error("Unexpected error");
      sinon.stub(globalThis.appDataSource.manager, "findOne").rejects(error);

      await expectRejectedWith(stashService.getStashByPublicAccessToken("some-token"), error);
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on getUserStashes", async() => {
      const error = new Error("Unexpected error");
      sinon.stub(globalThis.appDataSource.manager, "find").rejects(error);

      await expectRejectedWith(stashService.getUserStashes(Number.MAX_SAFE_INTEGER), error);
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on getStash", async() => {
      const error = new Error("Unexpected error");
      sinon.stub(globalThis.appDataSource.manager, "findOne").rejects(error);

      await expectRejectedWith(stashService.getStash(Number.MAX_SAFE_INTEGER, 1), error);
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on deleteStash", async() => {
      const error = new Error("Unexpected error");
      sinon.stub(globalThis.appDataSource.manager, "delete").rejects(error);

      await expectRejectedWith(stashService.deleteStash(Number.MAX_SAFE_INTEGER, 1), error);
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on snoozeStash", async() => {
      const error = new Error("Update failed");
      sinon.stub(stashService, "getStash").resolves({ scheduledAt: new Date() } as Stash);
      sinon.stub(stashRepositoryStub, "update").rejects(error);

      try {
        await stashService.snoozeStash(1, 1, { id: 1 } as any);
        expect.fail("Expected the update failure to propagate");
      } catch (caught) {
        expect(caught).to.equal(error);
      }
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on claimDueStashes", async() => {
      sinon.stub(globalThis.appDataSource.manager, "query").throws(new Error("Unexpected error"));

      let result = await stashService.claimDueStashes(10, 5 * 60 * 1000);

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on markStashSent", async() => {
      sinon.stub(globalThis.appDataSource.manager, "update").throws(new Error("Unexpected error"));

      let result = await stashService.markStashSent(1);

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
    });

    it("should error on releaseStashLock", async() => {
      sinon.stub(globalThis.appDataSource.manager, "update").throws(new Error("Unexpected error"));

      let result = await stashService.releaseStashLock(1);

      expect(result).to.be.null;
      expect(loggerStub.error.calledOnce).to.be.true;
    });
  });
});

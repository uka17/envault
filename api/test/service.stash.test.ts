import { expect } from "chai";
import sinon from "sinon";
import { SelectQueryBuilder } from "typeorm";

import StashService from "#service/StashService.js";
import Stash from "#model/Stash.js";
import User from "#model/User.js";

let stashService: StashService;
let stashRepositoryStub = globalThis.appDataSource.getRepository(Stash);

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
      );

      let result = await stashService.snoozeStash(99999, 1, {} as any);

      expect(result).to.be.null;
    });

    it("should generate a public access token of the correct length using only allowed characters", () => {
      let stashService: StashService = new StashService(
        stashRepositoryStub,
      );

      const publicAccessToken = stashService.generatePublicAccessToken();

      expect(publicAccessToken).to.have.lengthOf(20);
      expect(publicAccessToken).to.match(/^[23456789abcdefghjkmnpqrstuvwxyz]{20}$/);
    });

    it("should persist a generated public access token when creating a stash", async() => {
      let stashService: StashService = new StashService(
        stashRepositoryStub,
      );
      sinon.stub(globalThis.appDataSource.manager, "save").callsFake(async(entity: any) => entity);

      const result = await stashService.createStash({} as any);

      expect(result?.publicAccessToken).to.have.lengthOf(20);
      expect(result?.publicAccessToken).to.match(/^[23456789abcdefghjkmnpqrstuvwxyz]{20}$/);
    });

    it("should retry with a new token on a token-specific unique violation and succeed", async() => {
      let stashService: StashService = new StashService(
        stashRepositoryStub,
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
      stashService = new StashService(stashRepositoryStub);
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

    it("should not update a stash whose owner changed before the mutation", async() => {
      const originalDate = stash.scheduledAt.getTime();
      await stashRepositoryStub.update(stash.id, { user: other });

      const result = await stashService.snoozeStash(stash.id, 24, owner);

      expect(result).to.be.null;
      const persisted = await stashRepositoryStub.findOneOrFail({
        where: { id: stash.id }, relations: { user: true },
      });
      expect(persisted.user.id).to.equal(other.id);
      expect(persisted.scheduledAt.getTime()).to.equal(originalDate);
    });

    it("should not recreate a stash deleted before the mutation", async() => {
      await stashRepositoryStub.delete(stash.id);

      const result = await stashService.snoozeStash(stash.id, 24, owner);

      expect(result).to.be.null;
      expect(await stashRepositoryStub.findOneBy({ id: stash.id })).to.be.null;
    });
  });

  describe("Errors", () => {
    beforeEach(() => {
      stashService = new StashService(
        stashRepositoryStub,
      );

    });

    afterEach(() => {
      sinon.restore();
    });

    it("should error on createStash", async() => {
      const error = new Error("Unexpected error");
      sinon.stub(globalThis.appDataSource.manager, "save").rejects(error);

      await expectRejectedWith(stashService.createStash({} as any), error);
    });

    it("should give up after repeated token conflicts", async() => {
      const conflictError: any = new Error("duplicate key value violates unique constraint");
      conflictError.code = "23505";
      conflictError.detail = "Key (public_access_token)=(abc) already exists.";

      const saveStub = sinon.stub(globalThis.appDataSource.manager, "save").rejects(conflictError);

      await expectRejectedWith(stashService.createStash({} as any), conflictError);
      expect(saveStub.callCount).to.equal(5);
    });

    it("should error on getStashByPublicAccessToken", async() => {
      const error = new Error("Unexpected error");
      sinon.stub(globalThis.appDataSource.manager, "findOne").rejects(error);

      await expectRejectedWith(stashService.getStashByPublicAccessToken("some-token"), error);
    });

    it("should error on getUserStashes", async() => {
      const error = new Error("Unexpected error");
      sinon.stub(globalThis.appDataSource.manager, "find").rejects(error);

      await expectRejectedWith(stashService.getUserStashes(Number.MAX_SAFE_INTEGER), error);
    });

    it("should error on getStash", async() => {
      const error = new Error("Unexpected error");
      sinon.stub(globalThis.appDataSource.manager, "findOne").rejects(error);

      await expectRejectedWith(stashService.getStash(Number.MAX_SAFE_INTEGER, 1), error);
    });

    it("should error on deleteStash", async() => {
      const error = new Error("Unexpected error");
      sinon.stub(globalThis.appDataSource.manager, "transaction").rejects(error);

      await expectRejectedWith(stashService.deleteStash(Number.MAX_SAFE_INTEGER, 1), error);
    });

    it("should propagate an unexpected row-lock query failure", /**
     * Ensures database failures are not mistaken for delivery conflicts or missing rows.
     * @returns Nothing
     */ async() => {
        const error = new Error("Row lookup failed");
        sinon.stub(SelectQueryBuilder.prototype, "getOne").rejects(error);
        await expectRejectedWith(stashService.deleteStash(1, 1), error);
        await expectRejectedWith(stashService.snoozeStash(1, 1, { id: 1 } as User), error);
      });

    it("should error on snoozeStash", async() => {
      const error = new Error("Update failed");
      sinon.stub(globalThis.appDataSource.manager, "transaction").rejects(error);

      try {
        await stashService.snoozeStash(1, 1, { id: 1 } as any);
        expect.fail("Expected the update failure to propagate");
      } catch (caught) {
        expect(caught).to.equal(error);
      }
    });

  });
});

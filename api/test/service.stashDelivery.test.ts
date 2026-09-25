import { expect } from "chai";
import sinon from "sinon";
import { instanceToPlain } from "class-transformer";
import { randomUUID } from "node:crypto";
import Stash from "#model/Stash.js";
import User from "#model/User.js";
import SendLog from "#model/SendLog.js";
import StashService from "#service/StashService.js";
import StashSenderService from "#service/StashSenderService.js";
import EmailService from "#service/EmailService.js";
import ApiError from "api/src/error/ApiError.js";
import config from "worker/src/config/config.js";

/**
 * Creates an explicit barrier for deterministic concurrent delivery tests.
 * @returns Promise and its release function
 */
function barrier(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>(/** @param resolve Releases the barrier. @returns Nothing */ (resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/**
 * Tests cancellation, postponement and concurrent workers against real PostgreSQL row locks.
 * @returns Nothing
 */
function deliverySuite() {
  const repo = globalThis.appDataSource.getRepository(Stash);
  const logs = globalThis.appDataSource.getRepository(SendLog);
  let owner: User;
  let stash: Stash;
  let service: StashService;
  let sender: StashSenderService;
  let email: sinon.SinonStubbedInstance<EmailService>;

  before(/** @returns Nothing */ async() => {
    owner = await globalThis.appDataSource.getRepository(User).save({
      name: "Delivery Owner", email: `${randomUUID()}@example.com`, password: "test-only",
    });
  });
  beforeEach(/** @returns Nothing */ async() => {
    service = new StashService(repo);
    email = sinon.createStubInstance(EmailService);
    email.sendWithResult.resolves({ messageId: "test-message-id", to: "recipient@example.com" });
    sender = new StashSenderService(repo, email, globalThis.mockLogService);
    stash = await repo.save({ user: owner, to: `${randomUUID()}@example.com`, body: "ciphertext",
      scheduledAt: new Date(0), publicAccessToken: service.generatePublicAccessToken() });
  });
  afterEach(/** @returns Nothing */ async() => {
    sinon.restore();
    await logs.delete({ stash: { id: stash.id } });
    await repo.delete(stash.id);
  });
  after(/** @returns Nothing */ async() => {
    await globalThis.appDataSource.getRepository(User).delete(owner.id);
  });

  for (const operation of ["delete", "snooze"] as const) {
    it(`${operation} wins before delivery, so no email is submitted`, /** @returns Nothing */ async() => {
      await repo.update(stash.id, { scheduledAt: new Date(Date.now() - 1000) });
      if (operation === "delete") {
        await service.deleteStash(stash.id, owner.id);
      } else {
        await service.snoozeStash(stash.id, 24, owner);
      }
      await sender.processDueStashes();
      expect(email.sendWithResult.called).to.equal(false);
    });

    it(`delivery wins before ${operation}, so the mutation returns a conflict`, /** @returns Nothing */ async() => {
      const entered = barrier();
      const finish = barrier();
      email.sendWithResult.callsFake(/** @returns Accepted message ID */ async() => {
        entered.release();
        await finish.promise;
        return { messageId: "test-message-id", to: "recipient@example.com" };
      });
      const running = sender.processDueStashes();
      try {
        await entered.promise;
        try {
          if (operation === "delete") {
            await service.deleteStash(stash.id, owner.id);
          } else {
            await service.snoozeStash(stash.id, 24, owner);
          }
          expect.fail("Expected conflict while the sender holds the row lock");
        } catch (error) {
          expect(error).to.be.instanceOf(ApiError);
          expect((error as ApiError).code).to.equal("stash_delivery_in_progress");
        }
        expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(false);
      } finally {
        finish.release();
        await running;
      }
      expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(true);
    });
  }

  it("skips overlapping ticks and rows locked by another worker", /** @returns Nothing */ async() => {
    const entered = barrier();
    const finish = barrier();
    const second = await repo.save({ user: owner, to: "second@example.com", body: "ciphertext",
      scheduledAt: new Date(1) });
    const otherEmail = sinon.createStubInstance(EmailService);
    otherEmail.sendWithResult.resolves({ messageId: "other-message-id", to: "second@example.com" });
    const otherWorker = new StashSenderService(repo, otherEmail, globalThis.mockLogService);
    email.sendWithResult.callsFake(/** @returns Accepted message ID */ async() => {
      entered.release();
      await finish.promise;
      return { messageId: "first-message-id", to: "recipient@example.com" };
    });
    const running = sender.processDueStashes();
    try {
      await entered.promise;
      await sender.processDueStashes();
      expect(email.sendWithResult.calledOnce).to.equal(true);
      expect((await repo.findOneByOrFail({ id: second.id })).isSent).to.equal(false);
      await otherWorker.processDueStashes();
      expect(otherEmail.sendWithResult.calledOnce).to.equal(true);
      expect((await repo.findOneByOrFail({ id: second.id })).isSent).to.equal(true);
      expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(false);
    } finally {
      finish.release();
      await running;
      await logs.delete({ stash: { id: second.id } });
      await repo.delete(second.id);
    }
    expect(email.sendWithResult.calledOnce).to.equal(true);
    expect(await logs.countBy({ stash: { id: stash.id } })).to.equal(1);
  });

  it("releases a transaction lock on rollback so a worker can immediately select the row", /** @returns Nothing */
    async() => {
      const runner = globalThis.appDataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query("SELECT id FROM stash WHERE id = $1 FOR UPDATE", [stash.id]);
        await sender.processDueStashes();
        expect(email.sendWithResult.called).to.equal(false);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
      await sender.processDueStashes();
      expect(email.sendWithResult.calledOnce).to.equal(true);
    });

  it("deletes sent content and SendLog together, revoking its public token", /** @returns Nothing */ async() => {
    await sender.processDueStashes();
    expect(email.sendWithResult.calledOnce).to.equal(true);
    expect(await logs.countBy({ stash: { id: stash.id } })).to.equal(1);
    try {
      await service.snoozeStash(stash.id, 1, owner);
      expect.fail("Expected sent-state conflict");
    } catch (error) {
      expect((error as ApiError).code).to.equal("stash_already_sent");
    }
    expect((await service.deleteStash(stash.id, owner.id)).affected).to.equal(1);
    expect(await logs.countBy({ stash: { id: stash.id } })).to.equal(0);
    expect(await service.getStashByPublicAccessToken(stash.publicAccessToken)).to.equal(null);
  });

  it("releases the row lock after a failed attempt, so snooze and delete work at once", /** @returns Nothing */
    async() => {
      email.sendWithResult.resolves({ error: "send_failed" });
      await sender.processDueStashes();
      expect((await repo.findOneByOrFail({ id: stash.id })).deliveryAttempts).to.equal(1);
      expect(await service.snoozeStash(stash.id, 1, owner)).not.to.equal(null);
      expect((await service.deleteStash(stash.id, owner.id)).affected).to.equal(1);
    });

  it("a failing delivery still holds the lock, so a concurrent mutation returns a conflict", /** @returns Nothing */
    async() => {
      const entered = barrier();
      const finish = barrier();
      email.sendWithResult.callsFake(/** @returns Failure category */ async() => {
        entered.release();
        await finish.promise;
        return { error: "timeout" as const };
      });
      const running = sender.processDueStashes();
      try {
        await entered.promise;
        try {
          await service.snoozeStash(stash.id, 24, owner);
          expect.fail("Expected conflict while the sender holds the row lock");
        } catch (error) {
          expect((error as ApiError).code).to.equal("stash_delivery_in_progress");
        }
      } finally {
        finish.release();
        await running;
      }
      expect((await repo.findOneByOrFail({ id: stash.id })).deliveryAttempts).to.equal(1);
    });

  it("snooze of an exhausted stash starts a new delivery cycle at the new time", /** @returns Nothing */ async() => {
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    const scheduledAt = new Date(Date.now() - 30 * 60000);
    await repo.update(stash.id, { scheduledAt, deliveryAttempts: config.delivery.maxAttempts,
      lastDeliveryError: "send_failed" });
    await sender.processDueStashes();
    expect(email.sendWithResult.calledWithMatch({ to: stash.to })).to.equal(false);

    const snoozed = await service.snoozeStash(stash.id, 1, owner);
    expect(snoozed!.scheduledAt.getTime()).to.equal(scheduledAt.getTime() + 3600000);
    const reset = await repo.findOneByOrFail({ id: stash.id });
    expect(reset.deliveryAttempts).to.equal(0);
    expect(reset.nextAttemptAt).to.equal(null);
    expect(reset.lastDeliveryError).to.equal(null);
    // Retry fields stay internal and are not part of the API response.
    expect(instanceToPlain(snoozed)).not.to.have.any.keys("deliveryAttempts", "nextAttemptAt", "lastDeliveryError");

    await sender.processDueStashes();
    expect(email.sendWithResult.calledWithMatch({ to: stash.to }), "not before the snoozed time").to.equal(false);
    clock.tick(30 * 60000);
    await sender.processDueStashes();
    expect(email.sendWithResult.calledWithMatch({ to: stash.to })).to.equal(true);
    expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(true);
  });

  it("snooze during a retry delay clears the delay and the attempt count", /** @returns Nothing */ async() => {
    email.sendWithResult.onFirstCall().resolves({ error: "send_failed" });
    await sender.processDueStashes();
    expect((await repo.findOneByOrFail({ id: stash.id })).nextAttemptAt).not.to.equal(null);
    await service.snoozeStash(stash.id, 1, owner);
    const reset = await repo.findOneByOrFail({ id: stash.id });
    expect(reset.deliveryAttempts).to.equal(0);
    expect(reset.nextAttemptAt).to.equal(null);
  });

  it("deletes a stash that exhausted its attempts", /** @returns Nothing */ async() => {
    await repo.update(stash.id, { deliveryAttempts: config.delivery.maxAttempts, lastDeliveryError: "timeout" });
    expect((await service.deleteStash(stash.id, owner.id)).affected).to.equal(1);
    expect(await repo.findOneBy({ id: stash.id })).to.equal(null);
  });

  it("preserves exactly 24 hours across both Berlin DST transitions", /** @returns Nothing */ async() => {
    const original = process.env.TZ;
    process.env.TZ = "Europe/Berlin";
    try {
      for (const date of ["2030-03-30T12:00:00Z", "2030-10-26T12:00:00Z"]) {
        await repo.update(stash.id, { scheduledAt: new Date(date) });
        const updated = await service.snoozeStash(stash.id, 24, owner);
        expect(updated!.scheduledAt.getTime() - new Date(date).getTime()).to.equal(86400000);
      }
    } finally {
      if (original === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = original;
      }
    }
  });
}
describe("Stash delivery contract", deliverySuite);

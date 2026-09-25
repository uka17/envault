import { expect } from "chai";
import sinon from "sinon";
import { randomUUID } from "node:crypto";
import { EntityManager } from "typeorm";
import { PostgresQueryRunner } from "typeorm/driver/postgres/PostgresQueryRunner.js";
import StashSenderService from "#service/StashSenderService.js";
import EmailService from "#service/EmailService.js";
import LogService from "#service/LogService.js";
import Stash from "#model/Stash.js";
import User from "#model/User.js";
import SendLog from "#model/SendLog.js";
import config from "worker/src/config/config.js";

/**
 * Tests the sequential sender with real PostgreSQL transactions and a stubbed mail transport.
 * @returns Nothing
 */
function senderSuite() {
  const repo = globalThis.appDataSource.getRepository(Stash);
  const logs = globalThis.appDataSource.getRepository(SendLog);
  let owner: User;
  let stash: Stash;
  let sender: StashSenderService;
  let email: sinon.SinonStubbedInstance<EmailService>;
  let logger: sinon.SinonStubbedInstance<LogService>;
  const createdIds: number[] = [];

  /**
   * Creates a due message and records it for cleanup.
   * @param overrides Optional field overrides
   * @returns Persisted message
   */
  async function createStash(overrides: Partial<Stash> = {}): Promise<Stash> {
    const created = await repo.save({
      user: owner, to: `${randomUUID()}@example.com`, body: "ciphertext", scheduledAt: new Date(0),
      publicAccessToken: randomUUID().replaceAll("-", "").slice(0, 20), ...overrides,
    });
    createdIds.push(created.id);
    return created;
  }

  /**
   * Counts send calls for one message. Fake-clock tests can make unrelated rows left in the
   * shared test database due, so global call counts are not reliable there.
   * @param target Message whose sends are counted
   * @returns Number of send calls addressed to the message recipient
   */
  function sendsTo(target: Stash): number {
    return email.sendWithResult.getCalls().filter((call) => call.args[0].to === target.to).length;
  }

  before(/** @returns Nothing */ async() => {
    owner = await globalThis.appDataSource.getRepository(User).save({
      name: "Jordan Smith", email: `${randomUUID()}@example.com`, password: "test-only",
    });
  });
  beforeEach(/** @returns Nothing */ async() => {
    email = sinon.createStubInstance(EmailService);
    email.sendWithResult.resolves({ messageId: "test-message-id" });
    logger = sinon.createStubInstance(LogService);
    sender = new StashSenderService(repo, email, logger);
    stash = await createStash();
  });
  afterEach(/** @returns Nothing */ async() => {
    sinon.restore();
    for (const id of createdIds.splice(0)) {
      await logs.delete({ stash: { id } });
      await repo.delete(id);
    }
  });
  after(/** @returns Nothing */ async() => {
    await globalThis.appDataSource.getRepository(User).delete(owner.id);
  });

  it("passes the stash's real recipient to EmailService.send", /** @returns Nothing */ async() => {
    // The non-PROD test-recipient redirect is EmailService's own responsibility (see
    // service.email.test.ts); this stub bypasses it entirely, so the real address must come through.
    await sender.processDueStashes();
    expect(email.sendWithResult.calledOnce).to.equal(true);
    expect(email.sendWithResult.firstCall.args[0].to).to.equal(stash.to);
    expect(logger.info.calledOnceWith(
      `Sent stash ${stash.id} to ${stash.to} (messageId=test-message-id).`,
    )).to.equal(true);
  });

  it("records the log and sent state, and does not send the message again", /** @returns Nothing */ async() => {
    const before = Date.now();
    await sender.processDueStashes();
    const persisted = await repo.findOneByOrFail({ id: stash.id });
    expect(persisted.isSent).to.equal(true);
    expect(persisted.sentAt.getTime()).to.be.at.least(before);
    expect((await logs.findOneByOrFail({ stash: { id: stash.id } })).messageId).to.equal("test-message-id");
    expect(logger.info.calledOnceWith(
      `Sent stash ${stash.id} to ${email.sendWithResult.firstCall.args[0].to} (messageId=test-message-id).`,
    )).to.equal(true);
    await sender.processDueStashes();
    expect(email.sendWithResult.calledOnce).to.equal(true);
  });

  it("does not select a future message", /** @returns Nothing */ async() => {
    await repo.update(stash.id, { scheduledAt: new Date(Date.now() + 86400000) });
    await sender.processDueStashes();
    expect(email.sendWithResult.called).to.equal(false);
  });

  it("processes legacy null isSent values", /** @returns Nothing */ async() => {
    await repo.update(stash.id, { isSent: null });
    await sender.processDueStashes();
    expect(email.sendWithResult.calledOnce).to.equal(true);
    expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(true);
  });

  it("commits each message before sending the next", /** @returns Nothing */ async() => {
    const second = await createStash({ scheduledAt: new Date(1) });
    email.sendWithResult.onSecondCall().callsFake(/** @returns Transport message ID */ async() => {
      expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(true);
      expect(await logs.countBy({ stash: { id: stash.id } })).to.equal(1);
      return { messageId: "second-message-id" };
    });
    await sender.processDueStashes();
    expect(email.sendWithResult.calledTwice).to.equal(true);
    expect((await repo.findOneByOrFail({ id: second.id })).isSent).to.equal(true);
  });

  for (const failure of ["send_failed", "timeout", "rejected"] as const) {
    it(`records a failed attempt and still sends the next due message in the same pass (${failure})`,
      /** @returns Nothing */ async() => {
        // A permanently failing message is selected first (oldest scheduled_at); it must not block the queue.
        const second = await createStash({ scheduledAt: new Date(1) });
        if (failure === "rejected") {
          email.sendWithResult.onFirstCall().rejects(new Error("Unexpected transport failure"));
        } else {
          email.sendWithResult.onFirstCall().resolves({ error: failure });
        }
        const before = Date.now();
        await sender.processDueStashes();
        expect(email.sendWithResult.calledTwice).to.equal(true);
        expect((await repo.findOneByOrFail({ id: second.id })).isSent).to.equal(true);
        const failed = await repo.findOneByOrFail({ id: stash.id });
        expect(failed.isSent).to.equal(false);
        expect(failed.deliveryAttempts).to.equal(1);
        expect(failed.lastDeliveryError).to.equal(failure === "timeout" ? "timeout" : "send_failed");
        expect(failed.nextAttemptAt!.getTime()).to.be.at.least(before + config.delivery.baseDelayMs);
        expect(await logs.countBy({ stash: { id: stash.id } })).to.equal(0);
        expect(logger.warn.calledOnceWith(`Stash ${stash.id} delivery failed (${failed.lastDeliveryError}), ` +
          `attempt 1/${config.delivery.maxAttempts}, next attempt at ${failed.nextAttemptAt!.toISOString()}.`))
          .to.equal(true);
        expect(logger.error.called).to.equal(false);
      });
  }

  it("retries with a doubling, capped delay and stops after the attempt limit", /** @returns Nothing */ async() => {
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    email.sendWithResult.resolves({ error: "send_failed" });
    const { maxAttempts, baseDelayMs, maxDelayMs } = config.delivery;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // A fresh instance per pass: the schedule must come from the database, surviving a worker restart.
      const worker = new StashSenderService(repo, email, logger);
      await worker.processDueStashes();
      expect(sendsTo(stash)).to.equal(attempt);
      const persisted = await repo.findOneByOrFail({ id: stash.id });
      expect(persisted.deliveryAttempts).to.equal(attempt);
      if (attempt === maxAttempts) {
        expect(persisted.nextAttemptAt).to.equal(null);
        break;
      }
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      expect(persisted.nextAttemptAt!.getTime() - Date.now()).to.equal(delay);
      clock.tick(delay - 1);
      await worker.processDueStashes();
      expect(sendsTo(stash), "no send before the next attempt time").to.equal(attempt);
      clock.tick(1);
    }
    expect(maxDelayMs).to.be.below(baseDelayMs * 2 ** (maxAttempts - 2), "the cap must be exercised");
    expect(logger.error.calledWith(`Stash ${stash.id} delivery attempts exhausted ` +
      `(${maxAttempts}/${maxAttempts}), last error: send_failed. Automatic sending stopped.`)).to.equal(true);
    clock.tick(2 * maxDelayMs);
    await sender.processDueStashes();
    expect(sendsTo(stash), "no automatic sends after the limit").to.equal(maxAttempts);
    expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(false);
  });

  it("sends after the retry delay and keeps the attempt history", /** @returns Nothing */ async() => {
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    email.sendWithResult.onFirstCall().resolves({ error: "timeout" });
    await sender.processDueStashes();
    clock.tick(config.delivery.baseDelayMs);
    await sender.processDueStashes();
    expect(sendsTo(stash)).to.equal(2);
    const persisted = await repo.findOneByOrFail({ id: stash.id });
    expect(persisted.isSent).to.equal(true);
    expect(persisted.deliveryAttempts).to.equal(1);
    expect(await logs.countBy({ stash: { id: stash.id } })).to.equal(1);
  });

  it("ends the pass without sending again when a failed attempt cannot be recorded", /** @returns Nothing */
    async() => {
      await createStash({ scheduledAt: new Date(1) });
      email.sendWithResult.resolves({ error: "send_failed" });
      const update = sinon.stub(EntityManager.prototype, "update").rejects(new Error("Database unavailable"));
      await sender.processDueStashes();
      expect(email.sendWithResult.calledOnce, "no hot retry loop inside the pass").to.equal(true);
      expect(logger.error.calledOnce).to.equal(true);
      update.restore();
      expect((await repo.findOneByOrFail({ id: stash.id })).deliveryAttempts).to.equal(0);
    });

  for (const failure of ["log", "update", "missing update", "commit"] as const) {
    it(`rolls back delivery state and warns about a duplicate when ${failure} fails`, /** @returns Nothing */
      async() => {
        let write: sinon.SinonStub;
        if (failure === "log") {
          write = sinon.stub(EntityManager.prototype, "insert").rejects(new Error("Log insert failed"));
        } else if (failure === "commit") {
          write = sinon.stub(PostgresQueryRunner.prototype, "commitTransaction").rejects(new Error("Commit failed"));
        } else {
          const update = sinon.stub(EntityManager.prototype, "update");
          write = update;
          if (failure === "update") {
            update.rejects(new Error("Sent update failed"));
          } else {
            update.resolves({ affected: 0, raw: [], generatedMaps: [] });
          }
        }
        await sender.processDueStashes();
        expect(email.sendWithResult.calledOnce).to.equal(true);
        expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(false);
        expect((await repo.findOneByOrFail({ id: stash.id })).sentAt).to.equal(null);
        expect(await logs.countBy({ stash: { id: stash.id } })).to.equal(0);
        // The provider accepted the email, so the operator must see the duplicate risk, never a success.
        expect(logger.error.calledTwice).to.equal(true);
        expect(logger.error.firstCall.args[0]).to.equal(`Stash ${stash.id} was accepted by the email provider ` +
        "(messageId=test-message-id) but the delivery was not recorded; it will be sent again, " +
        "a duplicate notification is possible.");
        expect(logger.info.called).to.equal(false);
        write.restore();
        await sender.processDueStashes();
        expect(email.sendWithResult.calledTwice).to.equal(true);
        expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(true);
      });
  }

  it("logs a selection failure and allows a later pass", /** @returns Nothing */ async() => {
    const transaction = sinon.stub(repo.manager, "transaction").rejects(new Error("Database unavailable"));
    await sender.processDueStashes();
    expect(email.sendWithResult.called).to.equal(false);
    expect(logger.error.calledOnce).to.equal(true);
    transaction.restore();
    await sender.processDueStashes();
    expect(email.sendWithResult.calledOnce).to.equal(true);
  });

  it("renders the sender name and unlock link", /** @returns Nothing */ async() => {
    await sender.processDueStashes();
    const options = email.sendWithResult.firstCall.args[0];
    expect(options.subject).to.equal("A message from Jordan Smith is ready for you");
    expect(options.html).to.include("Jordan Smith");
    expect(options.html).to.include(`${config.readMessageUrl}/${stash.publicAccessToken}`);
    expect(options.html).to.include(config.faqUrl);
    expect(options.text).to.include(`${config.readMessageUrl}/${stash.publicAccessToken}`);
  });

  it("escapes HTML in the sender name", /** @returns Nothing */ async() => {
    await globalThis.appDataSource.getRepository(User).update(owner.id, { name: "<img src=x onerror=alert(1)>" });
    try {
      await sender.processDueStashes();
      const html = email.sendWithResult.firstCall.args[0].html;
      expect(html).not.to.include("<img src=x onerror=alert(1)>");
      expect(html).to.include("&lt;img src=x onerror=alert(1)&gt;");
    } finally {
      await globalThis.appDataSource.getRepository(User).update(owner.id, { name: owner.name });
    }
  });
}
describe("Sequential stash sender", senderSuite);

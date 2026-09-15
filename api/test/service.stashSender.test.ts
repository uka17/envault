import { expect } from "chai";
import sinon from "sinon";
import { randomUUID } from "node:crypto";
import { EntityManager } from "typeorm";
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
      user: owner, to: "recipient@example.com", body: "ciphertext", scheduledAt: new Date(0),
      publicAccessToken: randomUUID().replaceAll("-", "").slice(0, 20), ...overrides,
    });
    createdIds.push(created.id);
    return created;
  }

  before(/** @returns Nothing */ async() => {
    owner = await globalThis.appDataSource.getRepository(User).save({
      name: "Jordan Smith", email: `${randomUUID()}@example.com`, password: "test-only",
    });
  });
  beforeEach(/** @returns Nothing */ async() => {
    email = sinon.createStubInstance(EmailService);
    email.send.resolves("test-message-id");
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

  for (const environment of ["PROD", "DEV", "prod", "production", " PROD ", "", undefined]) {
    it(`routes recipient correctly for ENV=${JSON.stringify(environment)}`, /** @returns Nothing */ async() => {
      sinon.stub(config, "environment").value(environment);
      await sender.processDueStashes();
      expect(email.send.calledOnce).to.equal(true);
      expect(email.send.firstCall.args[0].to)
        .to.equal(environment === "PROD" ? stash.to : "ukaoneseven@gmail.com");
    });
  }

  it("records the log and sent state, and does not send the message again", /** @returns Nothing */ async() => {
    const before = Date.now();
    await sender.processDueStashes();
    const persisted = await repo.findOneByOrFail({ id: stash.id });
    expect(persisted.isSent).to.equal(true);
    expect(persisted.sentAt.getTime()).to.be.at.least(before);
    expect((await logs.findOneByOrFail({ stash: { id: stash.id } })).messageId).to.equal("test-message-id");
    expect(logger.info.calledOnceWith(`Sent stash ${stash.id}.`)).to.equal(true);
    await sender.processDueStashes();
    expect(email.send.calledOnce).to.equal(true);
  });

  it("does not select a future message", /** @returns Nothing */ async() => {
    await repo.update(stash.id, { scheduledAt: new Date(Date.now() + 86400000) });
    await sender.processDueStashes();
    expect(email.send.called).to.equal(false);
  });

  it("processes legacy null isSent values", /** @returns Nothing */ async() => {
    await repo.update(stash.id, { isSent: null });
    await sender.processDueStashes();
    expect(email.send.calledOnce).to.equal(true);
    expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(true);
  });

  it("commits each message before sending the next", /** @returns Nothing */ async() => {
    const second = await createStash({ scheduledAt: new Date(1) });
    email.send.onSecondCall().callsFake(/** @returns Transport message ID */ async() => {
      expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(true);
      expect(await logs.countBy({ stash: { id: stash.id } })).to.equal(1);
      return "second-message-id";
    });
    await sender.processDueStashes();
    expect(email.send.calledTwice).to.equal(true);
    expect((await repo.findOneByOrFail({ id: second.id })).isSent).to.equal(true);
  });

  for (const throws of [false, true]) {
    it(`rolls back a transport failure and retries on the next pass (throws=${throws})`,
      /** @returns Nothing */ async() => {
        const second = await createStash({ scheduledAt: new Date(1) });
        if (throws) {
          email.send.onFirstCall().rejects(new Error("Transport failure"));
        } else {
          email.send.onFirstCall().resolves(null);
        }
        await sender.processDueStashes();
        expect(email.send.calledOnce).to.equal(true);
        expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(false);
        expect((await repo.findOneByOrFail({ id: second.id })).isSent).to.equal(false);
        expect(await logs.countBy({ stash: { id: stash.id } })).to.equal(0);
        expect(logger.error.calledOnce).to.equal(true);
        await sender.processDueStashes();
        expect(email.send.callCount).to.equal(3);
        expect((await repo.findOneByOrFail({ id: second.id })).isSent).to.equal(true);
      });
  }

  for (const failure of ["log", "update", "missing update"] as const) {
    it(`rolls back delivery state when ${failure} fails`, /** @returns Nothing */ async() => {
      let write: sinon.SinonStub;
      if (failure === "log") {
        write = sinon.stub(EntityManager.prototype, "insert").rejects(new Error("Log insert failed"));
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
      expect(email.send.calledOnce).to.equal(true);
      expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(false);
      expect((await repo.findOneByOrFail({ id: stash.id })).sentAt).to.equal(null);
      expect(await logs.countBy({ stash: { id: stash.id } })).to.equal(0);
      expect(logger.error.calledOnce).to.equal(true);
      expect(logger.info.called).to.equal(false);
      write.restore();
      await sender.processDueStashes();
      expect(email.send.calledTwice).to.equal(true);
      expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(true);
    });
  }

  it("logs a selection failure and allows a later pass", /** @returns Nothing */ async() => {
    const transaction = sinon.stub(repo.manager, "transaction").rejects(new Error("Database unavailable"));
    await sender.processDueStashes();
    expect(email.send.called).to.equal(false);
    expect(logger.error.calledOnce).to.equal(true);
    transaction.restore();
    await sender.processDueStashes();
    expect(email.send.calledOnce).to.equal(true);
  });

  it("renders the sender name and unlock link", /** @returns Nothing */ async() => {
    await sender.processDueStashes();
    const options = email.send.firstCall.args[0];
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
      const html = email.send.firstCall.args[0].html;
      expect(html).not.to.include("<img src=x onerror=alert(1)>");
      expect(html).to.include("&lt;img src=x onerror=alert(1)&gt;");
    } finally {
      await globalThis.appDataSource.getRepository(User).update(owner.id, { name: owner.name });
    }
  });
}
describe("Sequential stash sender", senderSuite);

import { expect } from "chai";
import sinon from "sinon";

import StashSenderService from "#service/StashSenderService.js";
import StashService from "#service/StashService.js";
import EmailService from "#service/EmailService.js";
import Stash from "#model/Stash.js";

/**
 * Builds a minimal, valid `Stash` object for use in these tests.
 * @param overrides Fields to override on the built stash
 * @returns A `Stash`-shaped object
 */
function buildStash(overrides: Partial<Stash> = {}): Stash {
  return {
    id: 1,
    to: "recipient@example.com",
    body: "encrypted-body",
    isSent: false,
    lockedAt: new Date(),
    publicAccessToken: "token1234567890abcd",
    sendAt: new Date(Date.now() - 1000),
    ...overrides,
  } as Stash;
}

describe("Stash sender service", () => {
  let stashServiceStub: sinon.SinonStubbedInstance<StashService>;
  let emailServiceStub: sinon.SinonStubbedInstance<EmailService>;
  let stashSenderService: StashSenderService;

  beforeEach(() => {
    stashServiceStub = sinon.createStubInstance(StashService);
    emailServiceStub = sinon.createStubInstance(EmailService);
    stashSenderService = new StashSenderService(
      stashServiceStub as unknown as StashService,
      emailServiceStub as unknown as EmailService,
      globalThis.mockLogService,
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("processDueStashes", () => {
    it("should do nothing when there are no due stashes", async() => {
      stashServiceStub.claimDueStashes.resolves([]);

      await stashSenderService.processDueStashes(25, 5 * 60 * 1000);

      expect(emailServiceStub.send.called).to.be.false;
    });

    it("should do nothing when claiming fails", async() => {
      stashServiceStub.claimDueStashes.resolves(null);

      await stashSenderService.processDueStashes(25, 5 * 60 * 1000);

      expect(emailServiceStub.send.called).to.be.false;
    });

    it("should send, log and mark sent on a successful claim", async() => {
      const stash = buildStash();
      stashServiceStub.claimDueStashes.resolves([stash]);
      emailServiceStub.send.resolves("message-id-1");

      await stashSenderService.processDueStashes(25, 5 * 60 * 1000);

      expect(emailServiceStub.send.calledOnce).to.be.true;
      expect(stashServiceStub.log.calledOnceWith(stash.id, sinon.match.object, "message-id-1")).to.be.true;
      expect(stashServiceStub.markStashSent.calledOnceWith(stash.id)).to.be.true;
      expect(stashServiceStub.releaseStashLock.called).to.be.false;
    });

    it("should release the lock without marking sent when the send fails", async() => {
      const stash = buildStash();
      stashServiceStub.claimDueStashes.resolves([stash]);
      emailServiceStub.send.resolves(null);

      await stashSenderService.processDueStashes(25, 5 * 60 * 1000);

      expect(stashServiceStub.releaseStashLock.calledOnceWith(stash.id)).to.be.true;
      expect(stashServiceStub.log.called).to.be.false;
      expect(stashServiceStub.markStashSent.called).to.be.false;
    });

    it("should release the lock when sending throws unexpectedly", async() => {
      const stash = buildStash();
      stashServiceStub.claimDueStashes.resolves([stash]);
      emailServiceStub.send.rejects(new Error("SES error"));

      await stashSenderService.processDueStashes(25, 5 * 60 * 1000);

      expect(stashServiceStub.releaseStashLock.calledOnceWith(stash.id)).to.be.true;
      expect(stashServiceStub.markStashSent.called).to.be.false;
    });

    it("should isolate failures so one bad stash does not stop the rest of the batch", async() => {
      const failingStash = buildStash({ id: 1 });
      const succeedingStash = buildStash({ id: 2 });
      stashServiceStub.claimDueStashes.resolves([failingStash, succeedingStash]);
      emailServiceStub.send.onFirstCall().rejects(new Error("SES error"));
      emailServiceStub.send.onSecondCall().resolves("message-id-2");

      await stashSenderService.processDueStashes(25, 5 * 60 * 1000);

      expect(stashServiceStub.releaseStashLock.calledOnceWith(failingStash.id)).to.be.true;
      expect(stashServiceStub.markStashSent.calledOnceWith(succeedingStash.id)).to.be.true;
    });
  });
});

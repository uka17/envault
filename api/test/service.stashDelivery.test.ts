import { expect } from "chai";
import sinon from "sinon";
import { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import Stash from "#model/Stash.js";
import User from "#model/User.js";
import SendLog from "#model/SendLog.js";
import StashService from "#service/StashService.js";
import StashSenderService from "#service/StashSenderService.js";
import EmailService from "#service/EmailService.js";
import ApiError from "api/src/error/ApiError.js";
import { StashClaimToken1789420000000 } from "#common/migrations/1789420000000-StashClaimToken.js";

/**
 * Defines deterministic PostgreSQL delivery and mutation interleavings.
 * @returns Nothing
 */
function deliverySuite() {
  let owner: User;
  let stash: Stash;
  let service: StashService;
  let sender: StashSenderService;
  let email: sinon.SinonStubbedInstance<EmailService>;
  const repo = globalThis.appDataSource.getRepository(Stash);
  const logs = globalThis.appDataSource.getRepository(SendLog);

  before(/**
   * Creates a test owner.
   * @returns Nothing
   */ async() => {
      owner = await globalThis.appDataSource.getRepository(User).save({
        name: "Delivery Owner", email: `${randomUUID()}@example.com`, password: "test-only",
      });
    });
  beforeEach(/**
   * Creates an isolated due message and a sender with no real email transport.
   * @returns Nothing
   */ async() => {
      service = new StashService(repo, logs, globalThis.mockLogService);
      email = sinon.createStubInstance(EmailService);
      email.send.resolves("test-message-id");
      sender = new StashSenderService(service, email, globalThis.mockLogService);
      stash = await repo.save({ user: owner, to: "recipient@example.com", body: "ciphertext",
        scheduledAt: new Date(0), publicAccessToken: service.generatePublicAccessToken() });
    });
  afterEach(/**
   * Cleans up delivery fixtures.
   * @returns Nothing
   */ async() => {
      sinon.restore();
      await logs.delete({ stash: { id: stash.id } });
      await repo.delete(stash.id);
    });
  after(/**
   * Deletes the fixture owner.
   * @returns Nothing
   */ async() => {
      await globalThis.appDataSource.getRepository(User).delete(owner.id);
    });

  for (const operation of ["delete", "snooze"] as const) {
    it(`${operation} wins before claim, so no email is submitted`, /**
     * Mutates first, then runs the real claim and sender path.
     * @returns Nothing
     */ async() => {
        await repo.update(stash.id, { scheduledAt: new Date(Date.now() - 1000) });
        if (operation === "delete") {
          await service.deleteStash(stash.id, owner.id);
        } else {
          await service.snoozeStash(stash.id, 24, owner);
        }
        await sender.processDueStashes(1, 300000);
        expect(email.send.called).to.equal(false);
      });
    it(`claim wins before ${operation}, including stale claims`, /**
     * Confirms both fresh and stale claims reject mutation.
     * @returns Nothing
     */ async() => {
        await service.claimDueStashes(1, 300000);
        for (const lockedAt of [new Date(), new Date(0)]) {
          await repo.update(stash.id, { lockedAt });
          try {
            if (operation === "delete") {
              await service.deleteStash(stash.id, owner.id);
            } else {
              await service.snoozeStash(stash.id, 24, owner);
            }
            expect.fail("Expected delivery conflict");
          } catch (error) {
            expect(error).to.be.instanceOf(ApiError);
            expect((error as ApiError).code).to.equal("stash_delivery_in_progress");
          }
        }
        expect(await repo.findOneBy({ id: stash.id })).not.to.equal(null);
      });
  }

  it("fences stale snapshots from sending, completing or releasing a new claim", /**
   * Reclaims a stale row and tries all old-owner paths.
   * @returns Nothing
   */ async() => {
      const [old] = (await service.claimDueStashes(1, 300000))!;
      await repo.update(stash.id, { lockedAt: new Date(0) });
      const [current] = (await service.claimDueStashes(1, 300000))!;
      expect(current.claimToken).not.to.equal(old.claimToken);
      expect((await service.markStashSent(stash.id, old.claimToken))?.affected).to.equal(0);
      expect((await service.releaseStashLock(stash.id, old.claimToken))?.affected).to.equal(0);
      const deliver = sinon.stub().resolves();
      expect(await service.withClaim(old, deliver)).to.equal(false);
      expect(deliver.called).to.equal(false);
      expect((await repo.findOneByOrFail({ id: stash.id })).claimToken).to.equal(current.claimToken);
      expect((await service.markStashSent(stash.id, current.claimToken))?.affected).to.equal(1);
    });

  for (const claimToken of [null, undefined, ""]) {
    it(`rejects delivery and state writes without a claim token (${String(claimToken)})`, /**
     * Verifies missing tokens cannot bypass claim ownership or clear an active claim.
     * @returns Nothing
     */ async() => {
        const [claimed] = (await service.claimDueStashes(1, 300000))!;
        const deliver = sinon.stub().resolves();
        expect(await service.withClaim(repo.create({ ...claimed, claimToken }), deliver)).to.equal(false);
        expect(deliver.called).to.equal(false);
        expect((await service.markStashSent(stash.id, claimToken))?.affected).to.equal(0);
        expect((await service.releaseStashLock(stash.id, claimToken))?.affected).to.equal(0);
        const persisted = await repo.findOneByOrFail({ id: stash.id });
        expect(persisted.claimToken).to.equal(claimed.claimToken);
        expect(persisted.lockedAt.getTime()).to.equal(claimed.lockedAt.getTime());
        expect(persisted.isSent).to.equal(false);
        expect(persisted.sentAt).to.equal(null);
      });
  }

  it("retains the claim and rolls back the delivery log when recording sent state fails", /**
   * Simulates database failure after transport acceptance to prevent premature cancellation or retry.
   * @returns Nothing
   */ async() => {
      const failure = new Error("Test delivery state write failed");
      const update = sinon.stub(EntityManager.prototype, "update").callThrough();
      update.withArgs(Stash, sinon.match.any, sinon.match.has("isSent", true)).rejects(failure);

      await sender.processDueStashes(1, 300000);

      expect(email.send.calledOnce).to.equal(true);
      expect(update.calledOnce).to.equal(true);
      const persisted = await repo.findOneByOrFail({ id: stash.id });
      expect(persisted.claimToken).to.be.a("string");
      expect(persisted.lockedAt).to.be.instanceOf(Date);
      expect(persisted.isSent).to.equal(false);
      expect(persisted.sentAt).to.equal(null);
      expect(await logs.countBy({ stash: { id: stash.id } })).to.equal(0);
      try {
        await service.deleteStash(stash.id, owner.id);
        expect.fail("Expected ambiguous delivery to retain its cancellation guard");
      } catch (error) {
        expect((error as ApiError).code).to.equal("stash_delivery_in_progress");
      }
      await sender.processDueStashes(1, 300000);
      expect(email.send.calledOnce).to.equal(true);
    });

  it("does not reclaim a live sender even when its timestamp is stale", /**
   * Pauses inside delivery with an explicit promise barrier, without timing sleeps.
   * @returns Nothing
   */ async() => {
      const [claimed] = (await service.claimDueStashes(1, 300000))!;
      await repo.update(stash.id, { lockedAt: new Date(0) });
      let entered!: () => void;
      let finish!: () => void;
      const started = new Promise<void>(/** @param resolve Signals entry. @returns Nothing */
        (resolve) => {
          entered = resolve;
        });
      const pending = new Promise<void>(/** @param resolve Releases delivery. @returns Nothing */
        (resolve) => {
          finish = resolve;
        });
      const running = service.withClaim(claimed, /**
     * Holds the row lock while another worker and the API compete for it.
     * @returns Nothing
     */ async() => {
          entered(); await pending;
        });
      try {
        await started;
        const next = await service.claimDueStashes(1, 300000);
        expect(next?.some(/** @param row Claimed row. @returns Whether it is the fixture. */
          (row) => row.id === stash.id)).to.equal(false);
        try {
          await service.deleteStash(stash.id, owner.id);
          expect.fail("Expected conflict during delivery");
        } catch (error) {
          expect((error as ApiError).code).to.equal("stash_delivery_in_progress");
        }
      } finally {
        finish(); await running;
      }
    });

  it("deletes sent content and SendLog together, revoking its public token", /**
   * Sends through the real service and verifies the resulting FK deletion behavior.
   * @returns Nothing
   */ async() => {
      await sender.processDueStashes(1, 300000);
      expect(email.send.calledOnce).to.equal(true);
      expect(await logs.countBy({ stash: { id: stash.id } })).to.equal(1);
      expect((await repo.findOneByOrFail({ id: stash.id })).isSent).to.equal(true);
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

  it("preserves exactly 24 hours across both Berlin DST transitions", /**
   * Exercises calendar boundaries in a DST-observing local timezone.
   * @returns Nothing
   */ async() => {
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

  it("migrates existing rows without losing stash data", /**
   * Runs downgrade and upgrade inside a rolled-back transaction on the test database.
   * @returns Nothing
   */ async() => {
      const runner = globalThis.appDataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        const migration = new StashClaimToken1789420000000();
        await migration.down(runner);
        await migration.up(runner);
        const [row] = await runner.query("SELECT body, claim_token FROM stash WHERE id = $1", [stash.id]);
        expect(row).to.deep.equal({ body: "ciphertext", claim_token: null });
      } finally {
        await runner.rollbackTransaction(); await runner.release();
      }
    });
}
describe("Stash delivery contract", deliverySuite);

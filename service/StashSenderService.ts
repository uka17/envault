import nodemailer from "nodemailer";
import { injectable, inject } from "tsyringe";
import { EntityManager, Repository } from "typeorm";

import Stash from "#model/Stash.js";
import { TOKENS } from "#di/tokens.js";

import SendLog from "#model/SendLog.js";
import EmailService, { EmailErrorCategory, EmailSendResult } from "#service/EmailService.js";
import LogService from "#service/LogService.js";
import config from "worker/src/config/config.js";
import { renderStashReadyEmail } from "worker/src/templates/stashReady.js";

/** Result of processing one stash, logged only after its transaction commits. */
type DeliveryOutcome =
  | { status: "sent"; id: number; to: string; messageId: string }
  | { status: "failed"; id: number; attempts: number; nextAttemptAt: Date | null; error: EmailErrorCategory };

@injectable()
export default class StashSenderService {
  private processing = false;

  /**
   * Creates instance of `StashSenderService`
   * @param stashRepository Repository used for transactional selection and delivery state
   * @param emailService Email service, used to actually deliver the stash notification email
   * @param logger Logger service
   * @returns Stash sender service
   */
  constructor(
    @inject(TOKENS.StashRepository) private stashRepository: Repository<Stash>,
    @inject(TOKENS.EmailService) private emailService: EmailService,
    @inject(TOKENS.LogService) private logger: LogService,
  ) {}

  /**
   * Sends due messages sequentially, committing each one before selecting the next.
   * Overlapping ticks are skipped. A failed send is recorded and the pass continues with
   * the next message; a database failure ends the pass and is retried on a later tick.
   * @returns Nothing; failures are logged
   */
  public async processDueStashes(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;
    try {
      while (await this.sendNextStash()) {
        // Each completed transaction releases its lock before the next selection.
      }
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Selects, sends and records one due message under a single PostgreSQL row lock.
   * A failed send is committed as a failed attempt, so it survives a restart and the row
   * is skipped until its next attempt time. Database errors roll back and release the lock.
   * @returns Whether a message was processed (sent or recorded as a failed attempt)
   */
  private async sendNextStash(): Promise<boolean> {
    let accepted: { id: number; messageId: string } | null = null;
    let outcome: DeliveryOutcome | null;
    try {
      outcome = await this.stashRepository.manager.transaction(/**
       * Keeps the selected row locked through email submission and database writes.
       * @param manager Transaction manager
       * @returns Delivery outcome or null when no unlocked message is due
       */ async(manager) => {
          const now = new Date();
          const stash = await manager.getRepository(Stash).createQueryBuilder("stash")
            .leftJoinAndSelect("stash.user", "user")
            .where("stash.scheduled_at <= :now AND stash.is_sent IS NOT TRUE", { now })
            .andWhere("stash.delivery_attempts < :maxAttempts", { maxAttempts: config.delivery.maxAttempts })
            .andWhere("(stash.next_attempt_at IS NULL OR stash.next_attempt_at <= :now)", { now })
            .orderBy("stash.scheduled_at", "ASC").addOrderBy("stash.id", "ASC")
            .limit(1).setLock("pessimistic_write", undefined, ["stash"])
            .setOnLocked("skip_locked").getOne();
          if (!stash) {
            return null;
          }
          const mailOptions = this.buildMailOptions(stash);
          const result = await this.emailService.sendWithResult(mailOptions)
            .catch((): EmailSendResult => ({ error: "send_failed" }));
          if ("error" in result) {
            return this.recordFailedAttempt(manager, stash, result.error);
          }
          accepted = { id: stash.id, messageId: result.messageId };
          await manager.insert(SendLog, { stash, messageId: result.messageId });
          const update = await manager.update(Stash, stash.id, { isSent: true, sentAt: new Date() });
          if (update.affected !== 1) {
            throw new Error(`Failed to record delivery for stash ${stash.id}`);
          }
          return { status: "sent", id: stash.id, to: mailOptions.to as string, messageId: result.messageId };
        });
    } catch (error) {
      const unrecorded = accepted as { id: number; messageId: string } | null;
      if (unrecorded) {
        this.logger.error(`Stash ${unrecorded.id} was accepted by the email provider ` +
          `(messageId=${unrecorded.messageId}) but the delivery was not recorded; ` +
          "it will be sent again, a duplicate notification is possible.");
      }
      throw error;
    }
    if (outcome === null) {
      return false;
    }
    this.logOutcome(outcome);
    return true;
  }

  /**
   * Records a failed send attempt on the locked row, scheduling the next attempt or
   * stopping automatic delivery once the attempt limit is reached.
   * @param manager Transaction manager holding the row lock
   * @param stash Locked stash whose send failed
   * @param error Safe failure category
   * @returns Failed attempt outcome to log after commit
   * @throws Error when the attempt cannot be recorded
   */
  private async recordFailedAttempt(
    manager: EntityManager,
    stash: Stash,
    error: EmailErrorCategory,
  ): Promise<DeliveryOutcome> {
    const attempts = stash.deliveryAttempts + 1;
    const exhausted = attempts >= config.delivery.maxAttempts;
    const nextAttemptAt = exhausted ? null : new Date(Date.now() + this.getRetryDelayMs(attempts));
    const update = await manager.update(Stash, stash.id, {
      deliveryAttempts: attempts, nextAttemptAt, lastDeliveryError: error,
    });
    if (update.affected !== 1) {
      throw new Error(`Failed to record delivery attempt for stash ${stash.id}`);
    }
    return { status: "failed", id: stash.id, attempts, nextAttemptAt, error };
  }

  /**
   * Calculates the delay before the next attempt: doubles from the base delay, capped.
   * @param attempts Number of failed attempts so far, starting from 1
   * @returns Delay in milliseconds
   */
  private getRetryDelayMs(attempts: number): number {
    const { baseDelayMs, maxDelayMs } = config.delivery;
    return Math.min(baseDelayMs * 2 ** (attempts - 1), maxDelayMs);
  }

  /**
   * Logs a committed delivery outcome.
   * @param outcome Outcome returned by the committed transaction
   * @returns Nothing
   */
  private logOutcome(outcome: DeliveryOutcome): void {
    if (outcome.status === "sent") {
      this.logger.info(`Sent stash ${outcome.id} to ${outcome.to} (messageId=${outcome.messageId}).`);
      return;
    }
    const { maxAttempts } = config.delivery;
    if (outcome.nextAttemptAt) {
      this.logger.warn(`Stash ${outcome.id} delivery failed (${outcome.error}), attempt ` +
        `${outcome.attempts}/${maxAttempts}, next attempt at ${outcome.nextAttemptAt.toISOString()}.`);
    } else {
      this.logger.error(`Stash ${outcome.id} delivery attempts exhausted (${outcome.attempts}/${maxAttempts}), ` +
        `last error: ${outcome.error}. Automatic sending stopped.`);
    }
  }

  /**
   * Builds the nodemailer-shaped mail options for a due stash notification
   * email, rendering the subject and body from the stash-ready MJML template.
   * @param stash Stash entity that is due to be sent, with its `user` relation loaded
   * @returns Mail options object suitable for `EmailService.send`
   */
  private buildMailOptions(stash: Stash): nodemailer.SendMailOptions {
    const unlockUrl = `${config.readMessageUrl}/${stash.publicAccessToken}`;
    const { subject, html, text } = renderStashReadyEmail({
      senderName: stash.user.name,
      unlockUrl,
      faqUrl: config.faqUrl,
    });
    return {
      to: stash.to,
      from: `${config.sendFrom.name} <${config.sendFrom.email}>`,
      subject,
      html,
      text,
    };
  }
}

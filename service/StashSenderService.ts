import nodemailer from "nodemailer";
import { injectable, inject } from "tsyringe";
import { Repository } from "typeorm";

import Stash from "#model/Stash.js";
import { TOKENS } from "#di/tokens.js";

import SendLog from "#model/SendLog.js";
import EmailService from "#service/EmailService.js";
import LogService from "#service/LogService.js";
import config from "worker/src/config/config.js";
import { renderStashReadyEmail } from "worker/src/templates/stashReady.js";

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
   * Overlapping ticks are skipped. A failure ends the pass and is retried on a later tick.
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
   * Errors roll back state and release the lock automatically.
   * @returns Whether a message was sent
   */
  private async sendNextStash(): Promise<boolean> {
    const sentId = await this.stashRepository.manager.transaction(/**
     * Keeps the selected row locked through email submission and database writes.
     * @param manager Transaction manager
     * @returns Sent stash ID or null when no unlocked message is due
     */ async(manager) => {
        const stash = await manager.getRepository(Stash).createQueryBuilder("stash")
          .leftJoinAndSelect("stash.user", "user")
          .where("stash.scheduled_at <= :now AND stash.is_sent IS NOT TRUE", { now: new Date() })
          .orderBy("stash.scheduled_at", "ASC").addOrderBy("stash.id", "ASC")
          .limit(1).setLock("pessimistic_write", undefined, ["stash"])
          .setOnLocked("skip_locked").getOne();
        if (!stash) {
          return null;
        }
        const messageId = await this.emailService.send(this.buildMailOptions(stash));
        if (!messageId) {
          throw new Error(`Failed to send stash ${stash.id}`);
        }
        await manager.insert(SendLog, { stash, messageId });
        const result = await manager.update(Stash, stash.id, { isSent: true, sentAt: new Date() });
        if (result.affected !== 1) {
          throw new Error(`Failed to record delivery for stash ${stash.id}`);
        }
        return stash.id;
      });
    if (sentId === null) {
      return false;
    }
    this.logger.info(`Sent stash ${sentId}.`);
    return true;
  }

  /**
   * Builds the nodemailer-shaped mail options for a due stash notification
   * email, rendering the subject and body from the stash-ready MJML template.
   * Uses the real recipient only when ENV is exactly PROD; all other values
   * redirect notifications to the fixed test recipient.
   * @param stash Stash entity that is due to be sent, with its `user` relation loaded
   * @returns Mail options object suitable for `EmailService.send`
   */
  private buildMailOptions(stash: Stash): nodemailer.SendMailOptions {
    const unlockUrl = `${config.readMessageUrl}/${stash.publicAccessToken}`;
    const testRecipient = ["ukaoneseven", "gmail.com"].join("@");
    const { subject, html, text } = renderStashReadyEmail({
      senderName: stash.user.name,
      unlockUrl,
      faqUrl: config.faqUrl,
    });
    if(config.environment !== "PROD") {
      this.logger.warn(`Non-PROD env, replacing ${stash.to} with testRecipient email`);
    }
    return {
      to: config.environment === "PROD" ? stash.to : testRecipient,
      from: `${config.sendFrom.name} <${config.sendFrom.email}>`,
      subject,
      html,
      text,
    };
  }
}

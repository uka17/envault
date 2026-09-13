import nodemailer from "nodemailer";
import { injectable, inject } from "tsyringe";

import Stash from "#model/Stash.js";
import { TOKENS } from "#di/tokens.js";

import StashService from "#service/StashService.js";
import EmailService from "#service/EmailService.js";
import LogService from "#service/LogService.js";
import config from "worker/src/config/config.js";
import { renderStashReadyEmail } from "worker/src/templates/stashReady.js";

@injectable()
export default class StashSenderService {
  /**
   * Creates instance of `StashSenderService`
   * @param stashService Stash service, used to claim due stashes and record their delivery state
   * @param emailService Email service, used to actually deliver the stash notification email
   * @param logger Logger service
   */
  constructor(
    @inject(TOKENS.StashService) private stashService: StashService,
    @inject(TOKENS.EmailService) private emailService: EmailService,
    @inject(TOKENS.LogService) private logger: LogService,
  ) {}

  /**
   * Claims and sends all currently due, unsent stashes in one batch. Each
   * stash is processed in isolation so that a single failure cannot abort
   * the rest of the batch.
   * @param batchSize Maximum number of stashes to claim in one pass
   * @param staleLockThresholdMs Age in milliseconds after which a stuck claim is considered abandoned and reclaimable
   * @returns Nothing; failures are logged internally and never thrown
   */
  public async processDueStashes(
    batchSize: number,
    staleLockThresholdMs: number,
  ): Promise<void> {
    const claimed = await this.stashService.claimDueStashes(batchSize, staleLockThresholdMs);

    if (!claimed || claimed.length === 0) {
      return;
    }

    this.logger.info(`Claimed ${claimed.length} due stash(es) for sending.`);

    await Promise.allSettled(
      claimed.map((stash) => this.sendClaimedStash(stash)),
    );
  }

  /**
   * Sends a single previously-claimed stash and updates its state
   * accordingly. Never throws; failures are logged and the stash's claim
   * is released so it can be retried on a later tick.
   * @param stash Claimed stash to send
   * @returns Nothing
   */
  private async sendClaimedStash(stash: Stash): Promise<void> {
    try {
      const mailOptions = this.buildMailOptions(stash);
      const messageId = await this.emailService.send(mailOptions);

      if (!messageId) {
        this.logger.error(`Failed to send stash ${stash.id}; releasing lock for retry.`);
        await this.stashService.releaseStashLock(stash.id);
        return;
      }

      await this.stashService.log(stash.id, mailOptions, messageId);
      await this.stashService.markStashSent(stash.id);
      this.logger.info(`Sent stash ${stash.id} to ${mailOptions.to} (messageId=${messageId}).`);
    } catch (error) {
      this.logger.error(error);
      await this.stashService.releaseStashLock(stash.id);
    }
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

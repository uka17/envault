import { DeleteResult, In, Repository, UpdateResult } from "typeorm";
import nodemailer from "nodemailer";
import { customAlphabet } from "nanoid";
import { injectable, inject } from "tsyringe";

import Stash from "#model/Stash.js";
import SendLog from "#model/SendLog.js";
import User from "#model/User.js";
import { TOKENS } from "#di/tokens.js";

import LogService from "#service/LogService.js";
import config from "api/src/config/config.js";

@injectable()
export default class StashService {
  /**
   * Creates instance of `StashService`
   * @param stashRepository Stash repository
   * @param sendLogRepository SendLog repository
   * @param logger Logger service
   */
  constructor(
    @inject(TOKENS.StashRepository) private stashRepository: Repository<Stash>,
    @inject(TOKENS.SendLogRepository) private sendLogRepository: Repository<SendLog>,
    @inject(TOKENS.LogService) private logger: LogService,
  ) {}

  /**
   * Logs the email message ID to the database
   * @param stashId ID of the stash
   * @param mailOptions Mail options object which contains to, from, subject, html and text fields
   * @param messageId Message ID of the email received from AWS SES
   * @returns Created `SendLog` object or `null` if error
   */
  public async log(
    stashId: number,
    mailOptions: nodemailer.SendMailOptions,
    messageId: string,
  ) {
    try {
      const stash = await this.stashRepository.findOne({
        where: {
          id: stashId,
        },
      });
      const sendLog = new SendLog();
      sendLog.stash = stash;
      sendLog.messageId = messageId;
      //TODO: add mailOptions to sendLog
      return await this.sendLogRepository.manager.save(sendLog);
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Creates a new stash. Generates a unique public access token and retries
   * with a freshly generated token if (and only if) the token collided with
   * an existing one.
   * @param newStash Stash object
   * @returns Created stash object or null if error
   */
  public async createStash(newStash: Stash): Promise<Stash | null> {
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      newStash.publicAccessToken = this.generatePublicAccessToken();
      try {
        return await this.stashRepository.manager.save(newStash);
      } catch (error) {
        if (this.isPublicAccessTokenConflict(error) && attempt < maxAttempts) {
          continue;
        }
        this.logger.error(error);
        return null;
      }
    }
    /* istanbul ignore next */
    return null;
  }

  /**
   * Checks whether a database error represents a unique constraint violation
   * on the `public_access_token` column specifically.
   * @param error Error thrown by the database driver/ORM
   * @returns `true` if the error is a token-specific unique violation
   */
  private isPublicAccessTokenConflict(error: unknown): boolean {
    const dbError = error as { code?: string; detail?: string };
    return dbError?.code === "23505" && !!dbError.detail?.includes("public_access_token");
  }

  /**
   * Searches for all stash objects for a user
   * @param userId User ID
   * @returns Stash object or empty array if not found or null if error
   */
  public async getUserStashes(userId: number): Promise<Stash[] | null> {
    try {
      return await this.stashRepository.find({
        where: {
          user: {
            id: userId,
          },
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Searches for stash object by ID
   * @param stashId Stash ID
   * @returns Stash object or `null` if not found or error
   */
  public async getStash(stashId: number): Promise<Stash | null> {
    try {
      return await this.stashRepository.findOne({
        where: {
          id: stashId,
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Searches for a stash object by its public access token
   * @param publicAccessToken Public access token
   * @returns Stash object or `null` if not found or error
   */
  public async getStashByPublicAccessToken(publicAccessToken: string): Promise<Stash | null> {
    try {
      return await this.stashRepository.findOne({
        where: {
          publicAccessToken,
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Deletes stash object by ID
   * @param stashId Stash ID
   * @returns `DeleteResult` or `null` if error
   */
  public async deleteStash(stashId: number): Promise<DeleteResult | null> {
    try {
      return await this.stashRepository.delete({ id: stashId });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Snoozes the stash by changing the sendAt date
   * @param stashId Stash ID
   * @param hours Number of hours to snooze
   * @param modifiedBy User who modified the stash
   * @returns  Updated stash object or null if error or not found
   */
  public async snoozeStash(
    stashId: number,
    hours: number,
    modifiedBy: User,
  ): Promise<Stash | null> {
    try {
      const stash = await this.getStash(stashId);
      if (!stash) {
        return null;
      }
      stash.sendAt.setHours(stash.sendAt.getHours() + hours);
      stash.modifiedBy = modifiedBy;
      stash.modifiedOn = new Date(Date.now());
      return await this.stashRepository.manager.save(stash);
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Atomically claims up to `batchSize` stashes that are due to be sent
   * (`sendAt` in the past), not yet sent, and not currently claimed by
   * another worker (or whose claim has gone stale). Claiming is done via a
   * single `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`
   * statement so that concurrent callers (overlapping ticks, or multiple
   * worker processes) can never claim the same stash twice.
   * @param batchSize Maximum number of stashes to claim in one call
   * @param staleLockThresholdMs Age in milliseconds after which an existing
   * claim is considered abandoned and can be reclaimed
   * @returns Array of claimed stashes (empty if none are due), or `null` if error
   */
  public async claimDueStashes(
    batchSize: number,
    staleLockThresholdMs: number,
  ): Promise<Stash[] | null> {
    try {
      const now = new Date();
      const staleCutoff = new Date(now.getTime() - staleLockThresholdMs);

      // For UPDATE/DELETE statements, TypeORM's Postgres driver returns a
      // `[rows, rowCount]` tuple rather than the rows array directly.
      const [claimedRows]: [{ id: number }[], number] = await this.stashRepository.manager.query(
        `
          UPDATE stash
          SET locked_at = $1
          WHERE id IN (
            SELECT id FROM stash
            WHERE send_at <= $1
              AND is_sent IS NOT TRUE
              AND (locked_at IS NULL OR locked_at < $2)
            ORDER BY send_at ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
          )
          AND is_sent IS NOT TRUE
          AND (locked_at IS NULL OR locked_at < $2)
          RETURNING id
        `,
        [now, staleCutoff, batchSize],
      );

      if (claimedRows.length === 0) {
        return [];
      }

      const claimedIds = claimedRows.map((row) => row.id);
      return await this.stashRepository.find({ where: { id: In(claimedIds) } });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Marks a stash as successfully sent and releases its claim.
   * @param stashId ID of the stash
   * @returns `UpdateResult` or `null` if error
   */
  public async markStashSent(stashId: number): Promise<UpdateResult | null> {
    try {
      return await this.stashRepository.manager.update(
        Stash,
        { id: stashId },
        { isSent: true, lockedAt: null },
      );
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Releases a stash's claim without marking it as sent, so it becomes
   * eligible to be claimed and retried on a later tick. Used when a send
   * attempt fails.
   * @param stashId ID of the stash
   * @returns `UpdateResult` or `null` if error
   */
  public async releaseStashLock(stashId: number): Promise<UpdateResult | null> {
    try {
      return await this.stashRepository.manager.update(
        Stash,
        { id: stashId },
        { lockedAt: null },
      );
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Generates a random public access token used to identify a stash
   * in a public unlock link, without revealing its content
   * @returns Random public access token
   */
  public generatePublicAccessToken(): string {
    const nanoid = customAlphabet(
      config.stashPublicAccessToken.alphabet,
      config.stashPublicAccessToken.length,
    );
    return nanoid();
  }
}

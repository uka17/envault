import { DeleteResult, EntityManager, In, Repository, UpdateResult } from "typeorm";
import { randomUUID } from "node:crypto";
import ApiError from "api/src/error/ApiError.js";
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
   * @returns Created stash object
   * @throws Error when the stash cannot be persisted
   */
  public async createStash(newStash: Stash): Promise<Stash> {
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      newStash.publicAccessToken = this.generatePublicAccessToken();
      try {
        return await this.stashRepository.manager.save(newStash);
      } catch (error) {
        if (this.isPublicAccessTokenConflict(error) && attempt < maxAttempts) {
          continue;
        }
        throw error;
      }
    }
    /* istanbul ignore next */
    throw new Error("Failed to generate a unique public access token");
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
   * @returns Stash objects or an empty array if none exist
   * @throws Error when the stashes cannot be loaded
   */
  public async getUserStashes(userId: number): Promise<Stash[]> {
    return await this.stashRepository.find({
      where: {
        user: {
          id: userId,
        },
      },
    });
  }

  /**
   * Searches for a stash belonging to the specified user.
   * @param stashId Stash ID
   * @param userId Authenticated owner's user ID
   * @returns Stash object or `null` if not found
   * @throws Error when the stash lookup fails
   */
  public async getStash(stashId: number, userId: number): Promise<Stash | null> {
    return await this.stashRepository.findOne({
      where: {
        id: stashId,
        user: { id: userId },
      },
    });
  }

  /**
   * Searches for a stash object by its public access token
   * @param publicAccessToken Public access token
   * @returns Stash object or `null` if not found
   * @throws Error when the stash lookup fails
   */
  public async getStashByPublicAccessToken(publicAccessToken: string): Promise<Stash | null> {
    return await this.stashRepository.findOne({
      where: {
        publicAccessToken,
      },
    });
  }

  /**
   * Deletes a stash only if it belongs to the authenticated user.
   * @param stashId Stash ID
   * @param userId Authenticated owner's user ID
   * @returns Delete result, whose affected count is zero when the stash was not found
   * @throws Error when the deletion fails
   */
  public async deleteStash(stashId: number, userId: number): Promise<DeleteResult> {
    return this.stashRepository.manager.transaction(/**
     * Deletes the message and its delivery logs under the same row lock.
     * @param manager Transaction manager
     * @returns Owner-scoped deletion result
     */ async(manager) => {
        const stash = await this.lockOwnedStash(manager, stashId, userId);
        if (!stash) {
          return { affected: 0, raw: [] };
        }
        await manager.delete(SendLog, { stash: { id: stashId } });
        return manager.delete(Stash, { id: stashId, user: { id: userId } });
      });
  }

  /**
   * Locks an owner's row and rejects all outstanding claims, including stale ones.
   * @param manager Transaction manager
   * @param stashId Stash ID
   * @param userId Authenticated owner ID
   * @returns Locked stash or null for a missing or foreign stash
   */
  private async lockOwnedStash(manager: EntityManager, stashId: number, userId: number): Promise<Stash | null> {
    try {
      const stash = await manager.getRepository(Stash).createQueryBuilder("stash")
        .where("stash.id = :stashId AND stash.user_id = :userId", { stashId, userId })
        .setLock("pessimistic_write").setOnLocked("nowait").getOne();
      if (stash && !stash.isSent && stash.lockedAt) {
        throw ApiError.fromCode(409, "stash_delivery_in_progress");
      }
      return stash;
    } catch (error) {
      if ((error as { code?: string }).code === "55P03") {
        throw ApiError.fromCode(409, "stash_delivery_in_progress");
      }
      throw error;
    }
  }

  /**
   * Snoozes a stash with an owner-scoped update that cannot recreate a deleted row.
   * @param stashId Stash ID
   * @param hours Number of hours to snooze
   * @param modifiedBy Authenticated user who must own the stash
   * @returns Updated stash or null if it no longer belongs to the user or does not exist
   * @throws Error when the database update fails
   */
  public async snoozeStash(
    stashId: number,
    hours: number,
    modifiedBy: User,
  ): Promise<Stash | null> {
    return this.stashRepository.manager.transaction(/**
     * Applies a duration while holding the row lock used by the sender.
     * @param manager Transaction manager
     * @returns Updated stash or null
     */ async(manager) => {
        const stash = await this.lockOwnedStash(manager, stashId, modifiedBy.id);
        if (!stash) {
          return null;
        }
        if (stash.isSent) {
          throw ApiError.fromCode(409, "stash_already_sent");
        }
        stash.scheduledAt = new Date(stash.scheduledAt.getTime() + hours * 3_600_000);
        stash.modifiedBy = modifiedBy;
        stash.modifiedOn = new Date();
        await manager.update(Stash, { id: stashId, user: { id: modifiedBy.id } }, {
          scheduledAt: stash.scheduledAt, modifiedBy, modifiedOn: stash.modifiedOn,
        });
        return stash;
      });
  }

  /**
   * Atomically claims up to `batchSize` stashes that are due to be sent
   * (`scheduledAt` in the past), not yet sent, and not currently claimed by
   * another worker (or whose claim has gone stale). Claiming is done via a
   * single materialized selection with `FOR UPDATE SKIP LOCKED` and `UPDATE`
   * statement. Active senders hold a row lock; abandoned claims can be reclaimed
   * with a new token that fences out the previous owner.
   * @param batchSize Maximum number of stashes to claim in one call
   * @param staleLockThresholdMs Age in milliseconds after which an existing
   * claim is considered abandoned and can be reclaimed
   * @returns Array of claimed stashes with their `user` relation loaded
   * (empty if none are due), or `null` if error
   */
  public async claimDueStashes(
    batchSize: number,
    staleLockThresholdMs: number,
  ): Promise<Stash[] | null> {
    try {
      return await this.stashRepository.manager.transaction(/**
       * Claims and loads rows before releasing their database locks.
       * @param manager Transaction manager
       * @returns Claimed snapshots with their own unique claim tokens
       */ async(manager) => {
          const now = new Date();
          const staleCutoff = new Date(now.getTime() - staleLockThresholdMs);

          // For UPDATE/DELETE statements, TypeORM's Postgres driver returns a
          // `[rows, rowCount]` tuple rather than the rows array directly.
          const [claimedRows]: [{ id: number }[], number] = await manager.query(
            `
          WITH due AS MATERIALIZED (
            SELECT id FROM stash
            WHERE scheduled_at <= $1
              AND is_sent IS NOT TRUE
              AND (locked_at IS NULL OR locked_at < $2)
            ORDER BY scheduled_at ASC, id ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
          )
          UPDATE stash
          SET locked_at = $1, claim_token = $4
          FROM due
          WHERE stash.id = due.id
            AND stash.scheduled_at <= $1
            AND stash.is_sent IS NOT TRUE
            AND (stash.locked_at IS NULL OR stash.locked_at < $2)
          RETURNING stash.id
        `,
            [now, staleCutoff, batchSize, randomUUID()],
          );

          if (claimedRows.length === 0) {
            return [];
          }

          const claimedIds = claimedRows.map(/**
       * Extracts a claimed row ID.
       * @param row Claimed row
       * @returns Stash ID
       */ (row) => row.id);
          return await manager.getRepository(Stash).find({
            where: { id: In(claimedIds) },
            relations: { user: true },
            order: { scheduledAt: "ASC" },
          });
        });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Fences delivery and holds the row lock through email submission and state writes.
   * A reclaimed snapshot cannot send, and a live sender cannot be reclaimed.
   * @param stash Snapshot returned by claimDueStashes
   * @param deliver Delivery callback using the transaction-scoped service
   * @returns Whether this claim still owned the stash and ran the callback
   */
  public async withClaim(stash: Stash, deliver: (service: StashService) => Promise<void>): Promise<boolean> {
    if (!stash.claimToken) {
      return false;
    }
    return this.stashRepository.manager.transaction(/**
     * Verifies ownership and keeps the claim locked until delivery completes.
     * @param manager Transaction manager
     * @returns Whether delivery ran
     */ async(manager) => {
        const current = await manager.getRepository(Stash).createQueryBuilder("stash")
          .where("stash.id = :id AND stash.claim_token = :claimToken AND stash.is_sent IS NOT TRUE", {
            id: stash.id, claimToken: stash.claimToken,
          }).setLock("pessimistic_write").setOnLocked("skip_locked").getOne();
        if (!current) {
          return false;
        }
        await deliver(new StashService(manager.getRepository(Stash), manager.getRepository(SendLog), this.logger));
        return true;
      });
  }

  /**
   * Marks a stash as successfully sent and releases its claim.
   * @param claimToken Unique token from the original claim
   * @param stashId ID of the stash
   * @returns `UpdateResult` or `null` if error
   */
  public async markStashSent(stashId: number, claimToken: string): Promise<UpdateResult | null> {
    if (!claimToken) {
      return { affected: 0, raw: [], generatedMaps: [] };
    }
    try {
      return await this.stashRepository.manager.update(
        Stash,
        { id: stashId, claimToken },
        { isSent: true, lockedAt: null, claimToken: null, sentAt: new Date() },
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
   * @param claimToken Unique token from the original claim
   * @param stashId ID of the stash
   * @returns `UpdateResult` or `null` if error
   */
  public async releaseStashLock(stashId: number, claimToken: string): Promise<UpdateResult | null> {
    if (!claimToken) {
      return { affected: 0, raw: [], generatedMaps: [] };
    }
    try {
      return await this.stashRepository.manager.update(
        Stash,
        { id: stashId, claimToken },
        { lockedAt: null, claimToken: null },
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

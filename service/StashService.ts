import { DeleteResult, EntityManager, Repository } from "typeorm";
import ApiError from "api/src/error/ApiError.js";
import { customAlphabet } from "nanoid";
import { injectable, inject } from "tsyringe";

import Stash from "#model/Stash.js";
import SendLog from "#model/SendLog.js";
import User from "#model/User.js";
import { TOKENS } from "#di/tokens.js";

import config from "api/src/config/config.js";

@injectable()
export default class StashService {
  /**
   * Creates instance of `StashService`
   * @param stashRepository Stash repository
   * @returns Stash service
   */
  constructor(
    @inject(TOKENS.StashRepository) private stashRepository: Repository<Stash>,
  ) {}

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
   * Locks an owner's row, rejecting concurrent delivery or mutation.
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
   * Snoozing starts a new delivery cycle: failed attempts and the retry delay are reset,
   * so a stash that exhausted its attempts is sent again at the new time.
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
        stash.deliveryAttempts = 0;
        stash.nextAttemptAt = null;
        stash.lastDeliveryError = null;
        await manager.update(Stash, { id: stashId, user: { id: modifiedBy.id } }, {
          scheduledAt: stash.scheduledAt, modifiedBy, modifiedOn: stash.modifiedOn,
          deliveryAttempts: 0, nextAttemptAt: null, lastDeliveryError: null,
        });
        return stash;
      });
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

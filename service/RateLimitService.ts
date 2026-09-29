import { createHash } from "crypto";
import { LessThanOrEqual, Repository } from "typeorm";
import { injectable, inject } from "tsyringe";

import RateLimitCounter from "#model/RateLimitCounter.js";
import { TOKENS } from "#di/tokens.js";

/** Budget of a fixed-window limit. */
export interface RateLimit {
  windowMs: number;
  max: number;
}

@injectable()
export default class RateLimitService {
  /**
   * Creates instance of `RateLimitService`
   * @param counterRepository Rate limit counter repository
   * @returns Rate limit service
   */
  constructor(
    @inject(TOKENS.RateLimitCounterRepository) private counterRepository: Repository<RateLimitCounter>,
  ) {}

  /**
   * Counts one request against a fixed-window budget. The counter lives in PostgreSQL and is
   * updated by a single upsert, so concurrent requests, restarts and several API processes
   * never exceed the budget. Rejected requests are counted too.
   * @param bucket Name of the limit, e.g. `stash_create`
   * @param key Subject of the limit within the bucket, e.g. a user ID or an address hash
   * @param limit Window and budget of the limit
   * @returns Retry-After in seconds when the budget is exhausted, or zero when allowed
   */
  public async consume(bucket: string, key: string, limit: RateLimit): Promise<number> {
    const now = new Date();
    const expiredBefore = new Date(now.getTime() - limit.windowMs);
    // Expired windows carry no state, so they are dropped to keep the table small.
    await this.counterRepository.delete({ bucket, windowStartedAt: LessThanOrEqual(expiredBefore) });

    const table = this.counterRepository.metadata.tableName;
    const [row] = await this.counterRepository.query(
      `INSERT INTO ${table} (bucket, key, window_started_at, count) VALUES ($1, $2, $3, 1)
       ON CONFLICT (bucket, key) DO UPDATE SET
         window_started_at = CASE WHEN ${table}.window_started_at <= $4 THEN $3 ELSE ${table}.window_started_at END,
         count = CASE WHEN ${table}.window_started_at <= $4 THEN 1 ELSE ${table}.count + 1 END
       RETURNING window_started_at, count`,
      [bucket, key, now, expiredBefore],
    ) as { window_started_at: Date; count: number }[];

    if (row.count <= limit.max) {
      return 0;
    }
    const windowEndsAt = new Date(row.window_started_at).getTime() + limit.windowMs;
    return Math.max(1, Math.ceil((windowEndsAt - now.getTime()) / 1000));
  }

  /**
   * Builds a limit key for an email address without storing the address itself. The address is
   * trimmed and lower-cased, so case variants share one budget.
   * @param email Email address as submitted by the client
   * @returns SHA-256 hex digest of the normalized address
   */
  public static emailKey(email: string): string {
    return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  }
}

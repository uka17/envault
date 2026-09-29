import { Request, Response, NextFunction, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { container } from "tsyringe";

import { TOKENS } from "#di/tokens.js";
import { CODES } from "#common/constants.js";
import { apiErrorPayload } from "#common/errorCodes.js";
import ApiError from "api/src/error/ApiError.js";
import RateLimitService, { RateLimit } from "#service/RateLimitService.js";

/**
 * Creates a per-IP limit kept in process memory. `req.ip` honours only TRUST_PROXY, and the
 * counters are valid only while a single API replica runs (see docs/rate-limits.md).
 * A rejected request gets 429 `rate_limited` with Retry-After in seconds.
 * @param limit Window and budget of the limit
 * @returns Express middleware enforcing the limit
 */
export function ipRateLimit(limit: RateLimit): RequestHandler {
  return rateLimit({
    windowMs: limit.windowMs,
    max: limit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: apiErrorPayload("rate_limited"),
  });
}

/**
 * Creates a limit stored in PostgreSQL through `RateLimitService`, for budgets which must survive
 * restarts and concurrent requests. A rejected request gets 429 `rate_limited` with Retry-After.
 * @param bucket Name of the limit, unique across the API
 * @param limit Window and budget of the limit
 * @param getKey Returns the subject of the limit for a request, or `undefined` to skip the limit
 * @returns Express middleware enforcing the limit
 */
export function persistentRateLimit(
  bucket: string,
  limit: RateLimit,
  getKey: (req: Request) => string | undefined,
): RequestHandler {
  const rateLimitService = container.resolve<RateLimitService>(TOKENS.RateLimitService);
  return async(req: Request, res: Response, next: NextFunction) => {
    try {
      const key = getKey(req);
      const retryAfter = key === undefined ? 0 : await rateLimitService.consume(bucket, key, limit);
      if (retryAfter === 0) {
        return next();
      }
      const error = ApiError.fromCode(CODES.API_TOO_MANY_REQUESTS, "rate_limited");
      error.retryAfter = retryAfter;
      return next(error);
    } catch (error) {
      return next(error);
    }
  };
}

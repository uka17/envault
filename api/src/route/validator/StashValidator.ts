import { body, param } from "express-validator";
import { injectable } from "tsyringe";

import config from "api/src/config/config.js";
import { apiErrorPayload } from "#common/errorCodes.js";

@injectable()
export default class StashValidator {
  /**
   * Builds validation rules for stash requests.
   * @returns Validation chains by operation
   */
  public getRules() {
    return {
      create: [
        body("body").notEmpty().withMessage(apiErrorPayload("is_required")),
        body("to").notEmpty().withMessage(apiErrorPayload("is_required")),
        body("to")
          .matches(config.emailRegExp)
          .withMessage(apiErrorPayload("email_format_incorrect")),
        body("scheduledAt").notEmpty().withMessage(apiErrorPayload("is_required")),
        body("scheduledAt")
          .optional()
          .isISO8601({ strict: true })
          .withMessage(apiErrorPayload("date_format_incorrect")).bail()
          .custom(/**
           * Requires an instant strictly later than request validation time.
           * @param value ISO date string
           * @returns Whether the date is in the future
           */ (value: string) => new Date(value).getTime() > Date.now())
          .withMessage(apiErrorPayload("scheduled_at_must_be_future")),
      ],
      find: [
        param("id").isInt({ min: 1, max: 2147483647 }).withMessage(apiErrorPayload("stash_id_invalid")),
      ],
      delete: [
        param("id").notEmpty().withMessage(apiErrorPayload("id_required")),
        param("id").isInt({ min: 1, max: 2147483647 }).withMessage(apiErrorPayload("stash_id_invalid")),
      ],
      snooze: [
        param("id").isInt({ min: 1, max: 2147483647 }).withMessage(apiErrorPayload("stash_id_invalid")),
        param("hours")
          .isInt({ min: 1, max: 8760 })
          .withMessage(apiErrorPayload("snooze_hours_invalid")),
      ],
    };
  }
}

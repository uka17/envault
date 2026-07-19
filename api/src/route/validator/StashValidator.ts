import { body, param } from "express-validator";
import { injectable } from "tsyringe";

import config from "api/src/config/config.js";
import { apiErrorPayload } from "#common/errorCodes.js";

@injectable()
export default class StashValidator {
  public getRules() {
    return {
      create: [
        body("body").notEmpty().withMessage(apiErrorPayload("is_required")),
        body("to").notEmpty().withMessage(apiErrorPayload("is_required")),
        body("to")
          .matches(config.emailRegExp)
          .withMessage(apiErrorPayload("email_format_incorrect")),
        body("sendAt").notEmpty().withMessage(apiErrorPayload("is_required")),
        body("sendAt")
          .optional()
          .isISO8601()
          .withMessage(apiErrorPayload("date_format_incorrect")),
      ],
      find: [
        param("id").isNumeric().withMessage(apiErrorPayload("should_be_numeric")),
      ],
      delete: [
        param("id").notEmpty().withMessage(apiErrorPayload("id_required")),
        param("id").isNumeric().withMessage(apiErrorPayload("should_be_numeric")),
      ],
      snooze: [
        param("id").isNumeric().withMessage(apiErrorPayload("should_be_numeric")),
        param("hours")
          .isNumeric()
          .withMessage(apiErrorPayload("should_be_numeric")),
      ],
    };
  }
}

import { body, param } from "express-validator";
import { injectable, inject } from "tsyringe";

import config from "api/src/config/config";
import { TOKENS } from "di/tokens";

import TranslationService from "service/TranslationService";

@injectable()
export default class StashValidator {
  constructor(@inject(TOKENS.TranslationService) private translationService: TranslationService) {}

  public getRules() {
    return {
      create: [
        body("body").notEmpty().withMessage(this.translationService.getText("is_required")),
        body("to").notEmpty().withMessage(this.translationService.getText("is_required")),
        body("to")
          .matches(config.emailRegExp)
          .withMessage(this.translationService.getText("email_format_incorrect")),
        body("sendAt").notEmpty().withMessage(this.translationService.getText("is_required")),
        body("sendAt")
          .optional()
          .isISO8601()
          .withMessage(this.translationService.getText("date_format_incorrect")),
      ],
      find: [
        param("id").isNumeric().withMessage(this.translationService.getText("should_be_numeric")),
      ],
      delete: [
        param("id").notEmpty().withMessage(this.translationService.getText("id_required")),
        param("id").isNumeric().withMessage(this.translationService.getText("should_be_numeric")),
      ],
      decrypt: [
        param("id").isNumeric().withMessage(this.translationService.getText("should_be_numeric")),
        param("key").notEmpty().withMessage(this.translationService.getText("is_required")),
      ],
      snooze: [
        param("id").isNumeric().withMessage(this.translationService.getText("should_be_numeric")),
        param("hours")
          .isNumeric()
          .withMessage(this.translationService.getText("should_be_numeric")),
      ],
    };
  }
}

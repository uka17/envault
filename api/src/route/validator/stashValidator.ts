import { body, param } from "express-validator";
import config from "api/src/config/config";
import TranslationService from "service/TranslationService";

/**
 * Generates validation rules for stash with proper translationService
 * @param translationService translationService instance
 * @returns Object with validation rules for stash
 */
export const stashValidationRules = function (
  translationService: TranslationService
) {
  return {
    create: [
      body("body")
        .notEmpty()
        .withMessage(translationService.getText("is_required")),
      body("to")
        .notEmpty()
        .withMessage(translationService.getText("is_required")),
      body("to")
        .matches(config.emailRegExp)
        .withMessage(translationService.getText("email_format_incorrect")),
      body("sendAt")
        .notEmpty()
        .withMessage(translationService.getText("is_required")),
      body("sendAt")
        .optional()
        .isISO8601()
        .withMessage(translationService.getText("date_format_incorrect")),
    ],
    find: [
      param("id")
        .isNumeric()
        .withMessage(translationService.getText("should_be_numeric")),
    ],
    delete: [
      param("id")
        .notEmpty()
        .withMessage(translationService.getText("id_required")),
      param("id")
        .isNumeric()
        .withMessage(translationService.getText("should_be_numeric")),
    ],
    decrypt: [
      param("id")
        .isNumeric()
        .withMessage(translationService.getText("should_be_numeric")),
      param("key")
        .notEmpty()
        .withMessage(translationService.getText("is_required")),
    ],
    snooze: [
      param("id")
        .isNumeric()
        .withMessage(translationService.getText("should_be_numeric")),
      param("hours")
        .isNumeric()
        .withMessage(translationService.getText("should_be_numeric")),
    ],
  };
};

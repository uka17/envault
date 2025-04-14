import { body, param } from "express-validator";
import config from "../../config/config";
import Translations from "../../../../lib/Translations";

/**
 * Generates validation rules for stash with proper translations
 * @param translations Translations instance
 * @returns Object with validation rules for stash
 */
export const stashValidationRules = function (translations: Translations) {
  return {
    create: [
      body("body").notEmpty().withMessage(translations.getText("is_required")),
      body("to").notEmpty().withMessage(translations.getText("is_required")),
      body("to")
        .matches(config.emailRegExp)
        .withMessage(translations.getText("email_format_incorrect")),
      body("sendAt")
        .notEmpty()
        .withMessage(translations.getText("is_required")),
      body("sendAt")
        .optional()
        .isISO8601()
        .withMessage(translations.getText("date_format_incorrect")),
    ],
    find: [
      param("id").notEmpty().withMessage(translations.getText("is_required")),
      param("id")
        .isNumeric()
        .withMessage(translations.getText("should_be_numeric")),
    ],
    delete: [
      param("id").notEmpty().withMessage(translations.getText("id_required")),
      param("id")
        .isNumeric()
        .withMessage(translations.getText("should_be_numeric")),
    ],
    decrypt: [
      param("id").notEmpty().withMessage(translations.getText("is_required")),
      param("id")
        .isNumeric()
        .withMessage(translations.getText("should_be_numeric")),
      param("key").notEmpty().withMessage(translations.getText("is_required")),
    ],
    snooze: [
      param("id").notEmpty().withMessage(translations.getText("is_required")),
      param("id")
        .isNumeric()
        .withMessage(translations.getText("should_be_numeric")),
      param("days").notEmpty().withMessage(translations.getText("is_required")),
      param("days")
        .isNumeric()
        .withMessage(translations.getText("should_be_numeric")),
    ],
  };
};

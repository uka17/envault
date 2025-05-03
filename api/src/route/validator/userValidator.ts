import { body, param } from "express-validator";
import config from "api/src/config/config";
import TranslationService from "service/TranslationService";
import UserService from "service/UserService";

/**
 * Generates validation rules for user with proper translationService
 * @param translationService Translations instance
 * @returns Object with validation rules for user
 */
export const userValidationRules = function (
  translationService: TranslationService,
  userService: UserService
) {
  return {
    create: [
      body("email")
        .notEmpty()
        .withMessage(translationService.getText("email_required"))
        .matches(config.emailRegExp)
        .withMessage(translationService.getText("email_format_incorrect"))
        .custom(async (email) => {
          const user = await userService.getUserByEmail(email);
          if (user) {
            return Promise.reject(
              translationService.getText("user_already_exists")
            );
          }
        }),
      body("name")
        .notEmpty()
        .withMessage(translationService.getText("name_required"))
        .matches(config.nameRegExp)
        .withMessage(translationService.getText("name_alphanumeric")),
      body("password")
        .notEmpty()
        .withMessage(translationService.getText("password_required"))
        .matches(config.passwordRegExp)
        .withMessage(translationService.getText("password_format_incorrect")),
    ],
    login: [
      body("email")
        .notEmpty()
        .withMessage(translationService.getText("email_required"))
        .matches(config.emailRegExp)
        .withMessage(translationService.getText("email_format_incorrect")),
      body("password")
        .notEmpty()
        .withMessage(translationService.getText("password_required")),
    ],
  };
};

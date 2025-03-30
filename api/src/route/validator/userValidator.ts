import { body, param } from "express-validator";
import config from "../../config/config";
import Translations from "../../../../lib/Translations";
import { Repository } from "typeorm";
import { User } from "../../../../model/User";

/**
 * Generates validation rules for user with proper translations
 * @param translations Translations instance
 * @returns Object with validation rules for user
 */
export const userValidationRules = function (
  translations: Translations,
  userRepository: Repository<User>
) {
  return {
    create: [
      body("email")
        .notEmpty()
        .withMessage(translations.getText("email_required"))
        .matches(config.emailRegExp)
        .withMessage(translations.getText("email_format_incorrect"))
        .custom(async (email) => {
          const user = await userRepository.findOneBy({
            email: email,
          });
          if (user) {
            return Promise.reject(translations.getText("user_already_exists"));
          }
        }),
      body("name")
        .notEmpty()
        .withMessage(translations.getText("name_required"))
        .matches(config.nameRegExp)
        .withMessage(translations.getText("name_alphanumeric")),
      body("password")
        .notEmpty()
        .withMessage(translations.getText("password_required"))
        .matches(config.passwordRegExp)
        .withMessage(translations.getText("password_format_incorrect")),
    ],
    login: [
      body("email")
        .notEmpty()
        .withMessage(translations.getText("email_required"))
        .matches(config.emailRegExp)
        .withMessage(translations.getText("email_format_incorrect")),
      body("password")
        .notEmpty()
        .withMessage(translations.getText("password_required")),
    ],
  };
};

import { body } from "express-validator";
import { injectable, inject } from "tsyringe";

import config from "api/src/config/config.js";
import { TOKENS } from "#di/tokens.js";

import TranslationService from "#service/TranslationService.js";
import UserService from "#service/UserService.js";
import User from "#model/User.js";

@injectable()
export default class UserValidator {
  constructor(
    @inject(TOKENS.TranslationService) private translationService: TranslationService,
    @inject(TOKENS.UserService) private userService: UserService,
  ) {}

  public getRules() {
    return {
      create: [
        body("email")
          .notEmpty()
          .withMessage(this.translationService.getText("email_required"))
          .matches(config.emailRegExp)
          .withMessage(this.translationService.getText("email_format_incorrect"))
          .custom(async(email) => {
            const user = await this.userService.getUserByEmail(email);
            if (user) {
              return Promise.reject(this.translationService.getText("user_already_exists"));
            }
          }),
        body("name")
          .notEmpty()
          .withMessage(this.translationService.getText("name_required"))
          .matches(config.nameRegExp)
          .withMessage(this.translationService.getText("name_alphanumeric")),
        body("password")
          .notEmpty()
          .withMessage(this.translationService.getText("password_required"))
          .matches(config.passwordRegExp)
          .withMessage(this.translationService.getText("password_format_incorrect")),
      ],
      login: [
        body("email")
          .notEmpty()
          .withMessage(this.translationService.getText("email_required"))
          .matches(config.emailRegExp)
          .withMessage(this.translationService.getText("email_format_incorrect")),
        body("password")
          .notEmpty()
          .withMessage(this.translationService.getText("password_required")),
      ],
      updateProfile: [
        body("name")
          .optional()
          .matches(config.nameRegExp)
          .withMessage(this.translationService.getText("name_alphanumeric")),
        body("email")
          .optional()
          .matches(config.emailRegExp)
          .withMessage(this.translationService.getText("email_format_incorrect"))
          .custom(async(email, { req }) => {
            const existing = await this.userService.getUserByEmail(email);
            if (existing && existing.id !== (req.user as User).id) {
              return Promise.reject(this.translationService.getText("user_already_exists"));
            }
          }),
      ],
      updatePassword: [
        body("currentPassword")
          .notEmpty()
          .withMessage(this.translationService.getText("current_password_required")),
        body("newPassword")
          .notEmpty()
          .withMessage(this.translationService.getText("new_password_required"))
          .matches(config.passwordRegExp)
          .withMessage(this.translationService.getText("password_format_incorrect")),
      ],
    };
  }
}

import { body } from "express-validator";
import { injectable, inject } from "tsyringe";

import config from "api/src/config/config";
import { TOKENS } from "di/tokens";

import TranslationService from "service/TranslationService";
import UserService from "service/UserService";

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
    };
  }
}

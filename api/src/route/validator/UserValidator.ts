import { body, param } from "express-validator";
import { injectable, inject } from "tsyringe";

import config from "api/src/config/config.js";
import { TOKENS } from "#di/tokens.js";
import { apiErrorPayload } from "#common/errorCodes.js";

import UserService from "#service/UserService.js";
import User from "#model/User.js";

@injectable()
export default class UserValidator {
  constructor(
    @inject(TOKENS.UserService) private userService: UserService,
  ) {}

  public getRules() {
    return {
      create: [
        body("email")
          .notEmpty()
          .withMessage(apiErrorPayload("email_required"))
          .matches(config.emailRegExp)
          .withMessage(apiErrorPayload("email_format_incorrect"))
          .custom(async(email) => {
            const user = await this.userService.getUserByEmail(email);
            if (user) {
              return Promise.reject(apiErrorPayload("user_already_exists"));
            }
          }),
        body("name")
          .notEmpty()
          .withMessage(apiErrorPayload("name_required"))
          .matches(config.nameRegExp)
          .withMessage(apiErrorPayload("name_alphanumeric")),
        body("password")
          .notEmpty()
          .withMessage(apiErrorPayload("password_required"))
          .matches(config.passwordRegExp)
          .withMessage(apiErrorPayload("password_format_incorrect")),
      ],
      login: [
        body("email")
          .notEmpty()
          .withMessage(apiErrorPayload("email_required"))
          .matches(config.emailRegExp)
          .withMessage(apiErrorPayload("email_format_incorrect")),
        body("password")
          .notEmpty()
          .withMessage(apiErrorPayload("password_required")),
      ],
      updateProfile: [
        body("name")
          .optional()
          .matches(config.nameRegExp)
          .withMessage(apiErrorPayload("name_alphanumeric")),
        body("email")
          .optional()
          .matches(config.emailRegExp)
          .withMessage(apiErrorPayload("email_format_incorrect"))
          .custom(async(email, { req }) => {
            const existing = await this.userService.getUserByEmail(email);
            if (existing && existing.id !== (req.user as User).id) {
              return Promise.reject(apiErrorPayload("user_already_exists"));
            }
          }),
      ],
      sessionId: [
        param("id").isNumeric().withMessage(apiErrorPayload("should_be_numeric")),
      ],
      updatePassword: [
        body("currentPassword")
          .notEmpty()
          .withMessage(apiErrorPayload("current_password_required")),
        body("newPassword")
          .notEmpty()
          .withMessage(apiErrorPayload("new_password_required"))
          .matches(config.passwordRegExp)
          .withMessage(apiErrorPayload("password_format_incorrect")),
      ],
    };
  }
}

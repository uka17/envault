import { body, param } from "express-validator";
import { injectable, inject } from "tsyringe";

import config from "api/src/config/config.js";
import { TOKENS } from "#di/tokens.js";
import { apiErrorPayload } from "#common/errorCodes.js";

import UserService from "#service/UserService.js";

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
      updateName: [
        body("name")
          .notEmpty()
          .withMessage(apiErrorPayload("name_required"))
          .matches(config.nameRegExp)
          .withMessage(apiErrorPayload("name_alphanumeric")),
      ],
      requestEmailChange: [
        body("email")
          .notEmpty()
          .withMessage(apiErrorPayload("email_required")).bail()
          .isString()
          .withMessage(apiErrorPayload("should_be_string")).bail()
          .isLength({ max: 254 })
          .withMessage(apiErrorPayload("email_format_incorrect")).bail()
          .isEmail().withMessage(apiErrorPayload("email_format_incorrect")).bail()
          .matches(config.emailRegExp)
          .withMessage(apiErrorPayload("email_format_incorrect")),
      ],
      confirmEmailChange: [
        body("token")
          .isString()
          .withMessage(apiErrorPayload("email_change_token_invalid")).bail()
          .matches(/^[0-9a-f]{64}$/)
          .withMessage(apiErrorPayload("email_change_token_invalid")),
      ],
      sessionId: [
        param("id").isNumeric().withMessage(apiErrorPayload("should_be_numeric")),
      ],
      verifyEmail: [
        body("code")
          .notEmpty()
          .withMessage(apiErrorPayload("verification_code_required")),
      ],
      resendVerification: [
        body("email")
          .notEmpty()
          .withMessage(apiErrorPayload("email_required"))
          .matches(config.emailRegExp)
          .withMessage(apiErrorPayload("email_format_incorrect")),
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

import { param } from "express-validator";
import { injectable } from "tsyringe";

import { apiErrorPayload } from "#common/errorCodes.js";

@injectable()
export default class PublicStashValidator {
  public getRules() {
    return {
      getByToken: [
        param("token")
          .notEmpty()
          .withMessage(apiErrorPayload("is_required")),
        param("token")
          .isLength({ min: 20, max: 20 })
          .withMessage(apiErrorPayload("stash_unlock_failed")),
      ],
    };
  }
}

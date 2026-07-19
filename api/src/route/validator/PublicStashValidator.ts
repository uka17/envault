import { param } from "express-validator";
import { injectable, inject } from "tsyringe";

import { TOKENS } from "#di/tokens.js";

import TranslationService from "#service/TranslationService.js";

@injectable()
export default class PublicStashValidator {
  constructor(@inject(TOKENS.TranslationService) private translationService: TranslationService) {}

  public getRules() {
    return {
      getByToken: [
        param("token")
          .notEmpty()
          .withMessage(this.translationService.getText("is_required")),
        param("token")
          .isLength({ min: 20, max: 20 })
          .withMessage(this.translationService.getText("stash_unlock_failed")),
      ],
    };
  }
}

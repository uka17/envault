import { injectable, inject } from "tsyringe";
import { Request, Response, NextFunction } from "express";

import { TOKENS } from "#di/tokens.js";
import { CODES } from "#common/constants.js";

import TranslationService from "#service/TranslationService.js";
import StashService from "#service/StashService.js";
import ApiError from "api/src/error/ApiError.js";

@injectable()
export default class PublicStashController {
  constructor(
    @inject(TOKENS.StashService) private stashService: StashService,
    @inject(TOKENS.TranslationService) private translationService: TranslationService,
  ) {}

  /**
   * Builds the neutral "invalid link or key" error shared by both public
   * endpoints, so a caller cannot distinguish an unknown token from a
   * wrong decryption key.
   * @returns ApiError with a 404 status and a neutral message
   */
  private unlockFailedError(): ApiError {
    return new ApiError(
      CODES.API_NOT_FOUND,
      this.translationService.getText("stash_unlock_failed").translation,
      [this.translationService.getText("stash_unlock_failed")],
    );
  }

  /**
   * Checks whether a stash is available for unlock and returns only the
   * information required to display the key input form.
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async getByToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const stash = await this.stashService.getStashByPublicAccessToken(token);

      if (!stash) {
        throw this.unlockFailedError();
      }

      return res.status(CODES.API_OK).json({
        subject: stash.subject,
        sendAt: stash.sendAt,
      });
    } catch (e: unknown) {
      next(e);
    }
  }

  /**
   * Validates the token and decryption key, and returns the decrypted
   * stash content on success.
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async unlock(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const { key } = req.body;
      const stash = await this.stashService.getStashByPublicAccessToken(token);
      const decryptedBody = stash ? this.stashService.decryptBody(stash.body, key) : null;

      if (!stash || decryptedBody === null) {
        throw this.unlockFailedError();
      }

      return res.status(CODES.API_OK).json({
        subject: stash.subject,
        sendAt: stash.sendAt,
        body: decryptedBody,
      });
    } catch (e: unknown) {
      next(e);
    }
  }
}

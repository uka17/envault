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
   * Builds the neutral "invalid link" error returned when the public
   * access token does not match any stash.
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
   * Returns the public stash content by its access token. The body is
   * returned exactly as stored (encrypted client-side by the sender);
   * decryption happens entirely in the recipient's browser using the key
   * shared with them out-of-band.
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
        sendAt: stash.sendAt,
        body: stash.body,
      });
    } catch (e: unknown) {
      next(e);
    }
  }
}

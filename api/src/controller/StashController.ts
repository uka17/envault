import { injectable, inject } from "tsyringe";
import { Request, Response, NextFunction } from "express";

import { TOKENS } from "#di/tokens.js";
import { CODES, MESSAGES } from "#common/constants.js";

import Stash from "#model/Stash.js";

import TranslationService from "#service/TranslationService.js";
import StashService from "#service/StashService.js";
import LogService from "#service/LogService.js";
import ApiError from "api/src/error/ApiError.js";
import User from "#model/User.js";

@injectable()
export default class StashController {
  constructor(
    @inject(TOKENS.StashService) private stashService: StashService,
    @inject(TOKENS.TranslationService) private translationService: TranslationService,
    @inject(TOKENS.LogService) private logger: LogService,
  ) {}

  /**
   * Create new stash
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async create(req: Request, res: Response, next: NextFunction) {
    // #swagger.summary = 'Create new stash'
    /*  #swagger.parameters['body'] = {
                in: 'body',
                description: 'Stash',
                schema: {
                    $body: 'Stash body text',
                    $to: 'journalist@fakemail.com',
                }
          } */
    try {
      const { body, to, sendAt } = req.body;
      const user = req.user as User;
      const newStash = new Stash();

      //TODO: add real secret
      newStash.body = this.stashService.encryptBody(body, "secret");
      newStash.key = this.stashService.generateStashKey();
      newStash.to = to;
      newStash.user = user;
      newStash.sendAt = sendAt;
      newStash.createdBy = user;
      newStash.modifiedBy = user;

      const createdStash = await this.stashService.createStash(newStash);
      return res.status(CODES.API_CREATED).json(createdStash);
    } catch (e: unknown) {
      /* istanbul ignore next */
      next(e);
    }
  }

  /**
   * Get list of stashes for current user
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async list(req: Request, res: Response, next: NextFunction) {
    // #swagger.summary = 'Get list of stashes for curret user'
    try {
      const userId = (req.user as User).id;
      let stashes = [];

      if (!userId) {
        /* istanbul ignore next */
        throw new ApiError(
          CODES.API_UNAUTHORIZED,
          this.translationService.getText("incorrect_token").translation,
          [this.translationService.getText("incorrect_token")],
        );
      } else {
        stashes = await this.stashService.getUserStashes(userId);
        return res.status(CODES.API_OK).json(stashes);
      }
    } catch (e: unknown) {
      /* istanbul ignore next */
      next(e);
    }
  }

  /**
   * Get stash by id
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async get(req: Request, res: Response, next: NextFunction) {
    // #swagger.summary = 'Get stash by id'
    try {
      const id = parseInt(req.params.id);

      //TODO test for not found behavior

      const stash = await this.stashService.getStash(id);

      if (!stash) {
        throw new ApiError(
          CODES.API_NOT_FOUND,
          this.translationService.getText("stash_not_found").translation,
          [this.translationService.getText("stash_not_found")],
        );
      }
      return res.status(200).json(stash);
    } catch (e: unknown) {
      /* istanbul ignore next */
      next(e);
    }
  }

  /**
   * Update stash by id
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async delete(req: Request, res: Response, next: NextFunction) {
    // #swagger.summary = 'Delete stash by id'
    try {
      const id = parseInt(req.params.id);

      const result = await this.stashService.deleteStash(id);

      return res.status(CODES.API_OK).json(result);
    } catch (e: unknown) {
      /* istanbul ignore next */
      next(e);
    }
  }

  /**
   * Snooze stash by id
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async snooze(req: Request, res: Response, next: NextFunction) {
    // #swagger.summary = 'Snooze stash by id for N hours'
    try {
      const id = parseInt(req.params.id);
      const hours = parseInt(req.params.hours);
      const user = req.user as User;
      const result = await this.stashService.snoozeStash(id, hours, user);
      /* istanbul ignore next */
      if (result === null) {
        throw new ApiError(CODES.SERVER_ERROR, MESSAGES.SERVER_ERROR, [
          this.translationService.getText("error_500"),
        ]);
      }
      return res.status(CODES.API_OK).json(result);
    } catch (e: unknown) {
      /* istanbul ignore next */
      next(e);
    }
  }
}

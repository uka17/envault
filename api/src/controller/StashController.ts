import { injectable, inject } from "tsyringe";
import { Request, Response, NextFunction } from "express";
import { instanceToPlain } from "class-transformer";

import { TOKENS } from "#di/tokens.js";
import { CODES } from "#common/constants.js";

import Stash from "#model/Stash.js";

import StashService from "#service/StashService.js";
import LogService from "#service/LogService.js";
import ApiError from "api/src/error/ApiError.js";
import User from "#model/User.js";

@injectable()
export default class StashController {
  constructor(
    @inject(TOKENS.StashService) private stashService: StashService,
    @inject(TOKENS.LogService) private logger: LogService,
  ) {}

  /**
   * Create new stash
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { body, to, scheduledAt } = req.body;
      //throw new Error("Everything fucked up!");
      const user = req.user as User;
      const newStash = new Stash();

      newStash.body = body;
      newStash.to = to;
      newStash.user = user;
      newStash.scheduledAt = scheduledAt;
      newStash.createdBy = user;
      newStash.modifiedBy = user;

      const createdStash = await this.stashService.createStash(newStash);
      return res.status(CODES.API_CREATED).json(instanceToPlain(createdStash));
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
    try {
      const userId = (req.user as User).id;
      let stashes = [];

      if (!userId) {
        /* istanbul ignore next */
        throw ApiError.fromCode(CODES.API_UNAUTHORIZED, "incorrect_token");
      } else {
        stashes = await this.stashService.getUserStashes(userId);
        return res.status(CODES.API_OK).json(instanceToPlain(stashes));
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
   * @returns The owner's stash or a neutral not-found error
   */
  public async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);

      const userId = (req.user as User).id;
      const stash = await this.stashService.getStash(id, userId);

      if (!stash) {
        throw ApiError.fromCode(CODES.API_NOT_FOUND, "stash_not_found");
      }
      return res.status(200).json(instanceToPlain(stash));
    } catch (e: unknown) {
      /* istanbul ignore next */
      next(e);
    }
  }

  /**
   * Delete a stash belonging to the authenticated user.
   * @param req Request object
   * @param res Response object
   * @param next Next function
   * @returns The deletion result or a neutral not-found error
   */
  public async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);

      const userId = (req.user as User).id;
      const result = await this.stashService.deleteStash(id, userId);
      if (!result.affected) {
        throw ApiError.fromCode(CODES.API_NOT_FOUND, "stash_not_found");
      }

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
   * @returns The owner's updated stash or a neutral not-found error
   */
  public async snooze(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const hours = parseInt(req.params.hours);
      const user = req.user as User;
      const result = await this.stashService.snoozeStash(id, hours, user);
      if (result === null) {
        throw ApiError.fromCode(CODES.API_NOT_FOUND, "stash_not_found");
      }
      return res.status(CODES.API_OK).json(instanceToPlain(result));
    } catch (e: unknown) {
      /* istanbul ignore next */
      next(e);
    }
  }
}

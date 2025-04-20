import express from "express";
import passport from "passport";
import { DataSource } from "typeorm";
import dotenv from "dotenv";

import { User } from "../../../model/User";
import { Stash } from "../../../model/Stash";
import StashService from "../../../service/StashService";
import { stashValidationRules } from "./validator/stashValidator";
import { validateRequest } from "./validator/common";

import Translations from "../../../lib/Translations";
import { Logger } from "../../../lib/Logger";
import { CODES, MESSAGES } from "../../../lib/constants";
import ApiError from "../../../lib/ApiError";

dotenv.config();

/**
 * User routes
 * @param app Express instance
 * @param logger Logger instance
 * @param translations Translations instance
 * @param appDataSource Database connection instance
 */
export default function (
  app: express.Router,
  logger: Logger,
  translations: Translations,
  appDataSource: DataSource
) {
  const stashService = new StashService(appDataSource, logger);
  const validationRules = stashValidationRules(translations);

  app.post(
    `/api/v1/stashes`,
    passport.authenticate("jwt", { session: false }),
    validationRules.create,
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
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
        validateRequest(req);

        const { body, to, sendAt } = req.body;
        const user = req.user as User;
        const newStash = new Stash();

        //TODO: add real secret
        newStash.body = stashService.encryptBody(body, "secret");
        newStash.key = stashService.generateStashKey();
        newStash.to = to;
        newStash.user = user;
        newStash.sendAt = sendAt;
        newStash.createdBy = user.email;
        newStash.modifiedBy = user.email;

        const createdStash = await stashService.createStash(newStash);
        return res.status(CODES.API_CREATED).json(createdStash);
      } catch (e: unknown) {
        /* istanbul ignore next */
        next(e);
      }
    }
  );

  app.get(
    `/api/v1/stashes`,
    passport.authenticate("jwt", { session: false }),
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // #swagger.summary = 'Get list of stashes for curret user'
      try {
        const userId = (req.user as User).id;
        let stashes = [];

        if (!userId) {
          /* istanbul ignore next */
          throw new ApiError(
            CODES.API_UNAUTHORIZED,
            translations.getText("incorrect_token").translation,
            [translations.getText("incorrect_token")]
          );
        } else {
          stashes = await stashService.getUserStashes(userId);
          return res.status(CODES.API_OK).json(stashes);
        }
      } catch (e: unknown) {
        /* istanbul ignore next */
        next(e);
      }
    }
  );

  app.get(
    `/api/v1/stashes/:id`,
    passport.authenticate("jwt", { session: false }),
    validationRules.find,
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // #swagger.summary = 'Get stash by id'
      try {
        validateRequest(req);

        const id = parseInt(req.params.id);

        //TODO test for not found behavior

        const stash = await stashService.getStash(id);

        if (!stash) {
          throw new ApiError(
            CODES.API_NOT_FOUND,
            translations.getText("stash_not_found").translation,
            [translations.getText("stash_not_found")]
          );
        }
        res.status(200).json(stash);
      } catch (e: unknown) {
        /* istanbul ignore next */
        next(e);
      }
    }
  );
  app.delete(
    `/api/v1/stashes/:id`,
    passport.authenticate("jwt", { session: false }),
    validationRules.delete,
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // #swagger.summary = 'Delete stash by id'
      try {
        validateRequest(req);
        const id = parseInt(req.params.id);

        const result = await stashService.deleteStash(id);

        res.status(CODES.API_OK).json(result);
      } catch (e: unknown) {
        /* istanbul ignore next */
        next(e);
      }
    }
  );

  app.post(
    `/api/v1/stashes/:id/snooze/:hours`,
    validationRules.snooze,
    passport.authenticate("jwt", { session: false }),
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // #swagger.summary = 'Snooze stash by id for N hours'
      try {
        validateRequest(req);
        const id = parseInt(req.params.id);
        const hours = parseInt(req.params.hours);
        const result = await stashService.snoozeStash(id, hours);
        /* istanbul ignore next */
        if (result === null) {
          throw new ApiError(CODES.SERVER_ERROR, MESSAGES.SERVER_ERROR, [
            translations.getText("error_500"),
          ]);
        }
        res.status(CODES.API_OK).json(result);
      } catch (e: unknown) {
        /* istanbul ignore next */
        next(e);
      }
    }

    //TODO
    //1. Connect user entity in responses
    //
  );
}

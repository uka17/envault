import express from "express";
import passport from "passport";
import { Logger } from "../../../lib/Logger";
import { DataSource } from "typeorm";
import { User } from "../../../model/User";
import { Stash } from "../../../model/Stash";
import Translations from "../../../lib/Translations";
import * as CryptoJS from "crypto-js";
import { customAlphabet } from "nanoid";
const nanoid = customAlphabet("1234567890abcdef", 32);
import StashService from "../../../service/StashService";
import { stashValidationRules } from "./validator/stashValidator";
import { validationResult } from "express-validator";

import dotenv from "dotenv";
import { resolveRuntimeExtensions } from "@aws-sdk/client-ses/dist-types/runtimeExtensions";
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
  const stashRepository = appDataSource.getRepository(Stash);
  const stashService = new StashService(appDataSource, logger);
  const validationRules = stashValidationRules(translations);

  app.post(
    `/api/v1/stashes`,
    passport.authenticate("jwt", { session: false }),
    validationRules.create,
    async (req: express.Request, res: express.Response) => {
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
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(422).json({ errors: errors.array() });
        }

        const { body, to, sendAt } = req.body;
        const user = req.user as User;
        const newStash = new Stash();

        newStash.body = CryptoJS.AES.encrypt(body, "secret").toString();
        newStash.key = nanoid();
        newStash.to = to;
        newStash.user = user;
        newStash.sendAt = sendAt;
        newStash.createdBy = user.email;
        newStash.modifiedBy = user.email;

        const createdStash = await stashService.createStash(newStash);
        return res.status(201).json(createdStash);
      } catch (e: unknown) {
        /* istanbul ignore next */
        logger.error(e as object);
        res.status(500).send({ error: translations.getText("error_500") });
      }
    }
  );

  app.get(
    `/api/v1/stashes`,
    passport.authenticate("jwt", { session: false }),
    async (req: express.Request, res: express.Response) => {
      // #swagger.summary = 'Get list of stashes for curret user'
      try {
        const userId = (req.user as User).id;
        let stashes = [];

        if (!userId) {
          return res
            .status(401)
            .json({ error: translations.getText("incorrect_token") });
        } else {
          stashes = await stashService.getUserStashes(userId);

          return res.status(200).json(stashes);
        }
      } catch (e: unknown) {
        /* istanbul ignore next */
        logger.error(e as object);
        res.status(500).send({ error: translations.getText("error_500") });
      }
    }
  );

  app.get(
    `/api/v1/stashes/:id`,
    passport.authenticate("jwt", { session: false }),
    validationRules.find,
    async (req: express.Request, res: express.Response) => {
      // #swagger.summary = 'Get stash by id'
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const id = parseInt(req.params.id);

        //TODO check for not found behavior

        const stash = await stashService.getStash(id);

        if (!stash) {
          return res.status(404).send();
        }
        res.status(200).json(stash);
      } catch (e: unknown) {
        /* istanbul ignore next */
        logger.error(e as object);
        res.status(500).send({ error: translations.getText("error_500") });
      }
    }
  );
  app.delete(
    `/api/v1/stashes/:id`,
    passport.authenticate("jwt", { session: false }),
    validationRules.delete,
    async (req: express.Request, res: express.Response) => {
      // #swagger.summary = 'Delete stash by id'
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const id = parseInt(req.params.id);

        const result = await stashService.deleteStash(id);

        res.status(200).json(result);
      } catch (e: unknown) {
        /* istanbul ignore next */
        logger.error(e as object);
        res.status(500).send({ error: translations.getText("error_500") });
      }
    }
  );

  app.post(
    `/api/v1/stashes/:id/decrypt/:key`,
    passport.authenticate("jwt", { session: false }),
    validationRules.decrypt,
    async (req: express.Request, res: express.Response) => {
      // #swagger.summary = 'Decrypt stash by id and provided key'
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const id = parseInt(req.params.id);
        const key = req.params.key;

        const result = await stashService.decryptStash(id, key);
        return res.status(200).json(result);
      } catch (e: unknown) {
        /* istanbul ignore next */
        logger.error(e as object);
        res.status(500).send({ error: translations.getText("error_500") });
      }
    }
  );

  app.post(
    `/api/v1/stashes/:id/snooze/:days`,
    validationRules.snooze,
    passport.authenticate("jwt", { session: false }),
    async (req: express.Request, res: express.Response) => {
      // #swagger.summary = 'Snooze stash by id fro N days'
      try {
        const id = parseInt(req.params.id);
        const days = parseInt(req.params.days);
        const result = await stashService.snoozeStash(id, days);
        res.status(200).json(result);
      } catch (e: unknown) {
        /* istanbul ignore next */
        logger.error(e as object);
        res.status(500).send({ error: translations.getText("error_500") });
      }
    }

    //TODO
    //1. Connect user entity in responses
    //
  );
}

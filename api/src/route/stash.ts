import express from "express";
import passport from "passport";
import { Logger } from "../../../lib/Logger";
import { DataSource } from "typeorm";
import { User } from "../../../model/User";
import { Stash } from "../../../model/Stash";
import Translations from "../../../lib/Translations";
import * as CryptoJS from "crypto-js";
import config from "../config/config";
import { customAlphabet } from "nanoid";
const nanoid = customAlphabet("1234567890abcdef", 32);
import StashService from "../../../service/StashService";

import dotenv from "dotenv";
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

  app.post(
    `/api/v1/stashes`,
    passport.authenticate("jwt", { session: false }),
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
        const { body, to, sendAt } = req.body;
        if (!to.match(config.emailRegExp)) {
          return res
            .status(422)
            .json({ error: translations.getText("email_format_incorrect") });
        }
        const user = req.user as User;
        const newStash = new Stash();

        newStash.body = CryptoJS.AES.encrypt(body, "secret").toString();
        newStash.key = nanoid();
        newStash.to = to;
        newStash.user = user;
        newStash.sendAt = sendAt;
        newStash.createdBy = user.email;
        newStash.modifiedBy = user.email;

        const stashService = new StashService(appDataSource, logger);
        stashService.createStash(newStash, user);

        delete newStash.user;
        return res.status(201).json(newStash);
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
        const id = (req.user as User).id;

        if (!id) {
          return res
            .status(401)
            .json({ error: translations.getText("incorrect_token") });
        } else {
          const result = await stashRepository.find({
            where: {
              user: {
                id: id,
              },
            },
          });

          res.status(200).json(result);
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
    async (req: express.Request, res: express.Response) => {
      // #swagger.summary = 'Get stash by id'
      try {
        const id = parseInt(req.params.id);

        if (!id) {
          return res
            .status(400)
            .json({ error: translations.getText("id_required") });
        } else {
          const result = await stashRepository.findOne({
            where: {
              id: id,
            },
          });
          if (!result) {
            res.status(404).send();
          } else {
            res.status(200).json(result);
          }
        }
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
    async (req: express.Request, res: express.Response) => {
      // #swagger.summary = 'Delete stash by id'
      try {
        const id = parseInt(req.params.id);

        if (!id) {
          return res
            .status(400)
            .json({ error: translations.getText("id_required") });
        } else {
          const result = await stashRepository
            .createQueryBuilder()
            .delete()
            .from(Stash)
            .where("id = :id", { id: id })
            .execute();
          if (!result) {
            res.status(404).send();
          } else {
            res.status(200).json(result);
          }
        }
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
    async (req: express.Request, res: express.Response) => {
      // #swagger.summary = 'Decrypt stash by id and provided key'
      try {
        const id = parseInt(req.params.id);
        const key = req.params.key;

        if (!id) {
          return res
            .status(400)
            .json({ error: translations.getText("id_required") });
        }
        if (!key) {
          return res
            .status(400)
            .json({ error: translations.getText("key_required") });
        }
        let stash = await stashRepository.findOne({
          where: {
            id: id,
          },
        });
        if (!stash) {
          res.status(404).send();
        } else {
          const stashDecryptedBody = CryptoJS.AES.decrypt(stash.body, key);
          res.status(200).json(stashDecryptedBody.toString(CryptoJS.enc.Utf8));
        }
      } catch (e: unknown) {
        /* istanbul ignore next */
        logger.error(e as object);
        res.status(500).send({ error: translations.getText("error_500") });
      }
    }
  );

  app.post(
    `/api/v1/stashes/:id/snooze/:days`,
    passport.authenticate("jwt", { session: false }),
    async (req: express.Request, res: express.Response) => {
      // #swagger.summary = 'Snooze stash by id fro N days'
      try {
        const id = parseInt(req.params.id);
        const days = parseInt(req.params.days);

        if (!id) {
          return res
            .status(400)
            .json({ error: translations.getText("id_required") });
        }

        if (!days) {
          return res
            .status(400)
            .json({ error: translations.getText("days_required") });
        }

        let stash = await stashRepository.findOne({
          where: {
            id: id,
          },
        });
        if (!stash) {
          res.status(404).send();
        } else {
          stash.sendAt = new Date(stash.sendAt);
          stash.sendAt.setDate(stash.sendAt.getDate() + days);
          const result = await stashRepository.manager.save(stash);
          res.status(200).json(result);
        }
      } catch (e: unknown) {
        /* istanbul ignore next */
        logger.error(e as object);
        res.status(500).send({ error: translations.getText("error_500") });
      }
    }
  );
}

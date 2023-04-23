import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import { Logger } from "../lib/logger";
import { DataSource } from "typeorm";
import { User } from "../model/User";
import { Stash } from "../model/Stash";
import Translations from "../lib/Translations";
import bcrypt from "bcryptjs";
import config from "../config/config";

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
  const userRepository = appDataSource.getRepository(User);
  const stashRepository = appDataSource.getRepository(Stash);

  app.post(
    "/stashes",
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
        const { body, to } = req.body;
        if (!to.match(config.emailRegExp)) {
          return res
            .status(422)
            .json({ error: translations.getText("email_format_incorrect") });
        }
        // Create a new user
        const newStash = new Stash();
        newStash.body = body;
        newStash.to = to;
        newStash.user = req.user as User;
        await stashRepository.manager.save(newStash);
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
    "/stashes",
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
}

import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import { Logger } from "../../../lib/Logger";
import { DataSource } from "typeorm";
import { User } from "../../../model/User";
import Translations from "../../../lib/Translations";
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
  //Put all routes here
  //...

  const userRepository = appDataSource.getRepository(User);

  app.post(
    "/api/v1/users",
    async (req: express.Request, res: express.Response) => {
      // #swagger.summary = 'Register new user'
      /*  #swagger.parameters['body'] = {
            in: 'body',
            description: 'User',
            schema: {
                $email: 'john@mail.com',
                $password: 'secret@123',
                $name: 'Jhon Doe',
            }
    } */
      try {
        const { email, password, name } = req.body;

        //Standart checks for password and username
        if (!email) {
          return res
            .status(422)
            .json({ error: translations.getText("email_required") });
        }

        if (!name) {
          return res
            .status(422)
            .json({ error: translations.getText("name_required") });
        }

        if (!name.match(config.nameRegExp)) {
          return res
            .status(422)
            .json({ error: translations.getText("name_alphanumeric") });
        }

        if (!email.match(config.emailRegExp)) {
          return res
            .status(422)
            .json({ error: translations.getText("email_format_incorrect") });
        }

        if (!password) {
          return res
            .status(422)
            .json({ error: translations.getText("password_required") });
        }

        if (!password.match(config.passwordRegExp)) {
          return res
            .status(422)
            .json({ error: translations.getText("password_format_incorrect") });
        }

        // Check if the user already exists
        const user = await userRepository.findOneBy({
          email: email,
        });

        if (user) {
          return res
            .status(422)
            .json({ error: translations.getText("user_already_exists") });
        }

        // Hash the password
        const hash = bcrypt.hashSync(password);

        // Create a new user
        const newUser = new User();
        newUser.name = name;
        newUser.email = email;
        newUser.password = hash;
        newUser.createdBy = email;
        newUser.modifiedBy = email;
        const createdUser = await appDataSource.manager.save(newUser);

        const result = Object.assign({}, createdUser);
        delete result.password;

        return res.status(201).json(result);
      } catch (e: unknown) /* istanbul ignore next */ {
        logger.error(e as object);
        res.status(500).send({ error: translations.getText("error_500") });
      }
    }
  );

  // Log in as an existing user
  app.post(
    "/api/v1/users/login",
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // #swagger.summary = 'Login user'
      /*  #swagger.parameters['body'] = {
            in: 'body',
            description: 'User',
            schema: {
                $email: 'john@mail.com',
                $password: 'secret@123',
            }
      } */
      try {
        // In fact route returns result of callback
        return passport.authenticate(
          "local",
          { session: false },
          async (err: Error, passportUser: User) => {
            /* istanbul ignore next */ if (err) {
              logger.error(err as object);
              res
                .status(500)
                .send({ error: translations.getText("error_500") });
            }

            if (passportUser) {
              const expirationDate = new Date();
              expirationDate.setDate(
                expirationDate.getDate() + config.JWTMaxAge
              );
              const token = jwt.sign(
                {
                  email: passportUser.email,
                  id: passportUser.id,
                  exp: Math.round(expirationDate.getTime() / 1000),
                },
                process.env.API_JWT_SECRET
              );
              return res.json({ token: token });
            }

            return res.status(401).json({
              error: translations.getText("incorrect_password_or_email"),
            });
          }
        )(req, res, next);
      } catch (e: unknown) /* istanbul ignore next */ {
        logger.error(e as object);
        res.status(500).send({ error: translations.getText("error_500") });
      }
    }
  );

  // Get a protected resource with current user
  app.get(
    "/api/v1/users/whoami",
    passport.authenticate("jwt", { session: false }),
    async (req: express.Request, res: express.Response) => {
      // #swagger.summary = 'Fetch currently current user'
      try {
        const id = (req.user as User).id;

        const user = await userRepository.findOneBy({
          id: id,
        });

        /* istanbul ignore next */ if (!user) {
          return res
            .status(401)
            .json({ error: translations.getText("incorrect_token") });
        } else {
          const result = Object.assign({}, user);
          delete result.password;
          res.status(200).json(result);
        }
      } catch (e: unknown) /* istanbul ignore next */ {
        logger.error(e as object);
        res.status(500).send({ error: translations.getText("error_500") });
      }
    }
  );
}

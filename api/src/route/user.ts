import express from "express";
import passport from "passport";
import { Logger } from "../../../lib/Logger";
import { DataSource } from "typeorm";
import { User } from "../../../model/User";
import Translations from "../../../lib/Translations";
import bcrypt from "bcryptjs";
import { validationResult } from "express-validator";
import { userValidationRules } from "./validator/userValidator";
import UserService from "../../../service/UserService";
import ApiError from "../../../lib/ApiError";
import { ERROR_MESSAGES } from "../../../lib/constants";

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
  const userService = new UserService(appDataSource, logger);
  const validationRules = userValidationRules(translations, userRepository);

  app.post(
    "/api/v1/users",
    validationRules.create,
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
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

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          throw new ApiError(
            422,
            ERROR_MESSAGES.API_REQUEST_VALIDATION_ERROR,
            errors.array()
          );
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
        const createdUser = await userService.createUser(newUser);

        if (createdUser !== null) res.status(201).json(createdUser);
        else throw new Error(ERROR_MESSAGES.USER_WAS_NOT_CREATED);
      } catch (e: unknown) /* istanbul ignore next */ {
        next(e);
      }
    }
  );

  // Log in as an existing user
  app.post(
    "/api/v1/users/login",
    validationRules.login,
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
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(422).json({ errors: errors.array() });
        }
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
              return res.json({ token: userService.createToken(passportUser) });
            }

            return res.status(401).json({
              error: translations.getText("incorrect_password_or_email"),
            });
          }
        )(req, res, next);
      } catch (e: unknown) /* istanbul ignore next */ {
        logger.error(e as object);
        return res
          .status(500)
          .send({ error: translations.getText("error_500") });
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

        const result = await userService.getUser(id);

        /* istanbul ignore next */ if (result === null) {
          return res
            .status(401)
            .json({ error: translations.getText("incorrect_token") });
        } else {
          res.status(200).json(result);
        }
      } catch (e: unknown) /* istanbul ignore next */ {
        logger.error(e as object);
        res.status(500).send({ error: translations.getText("error_500") });
      }
    }
  );
}

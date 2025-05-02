import express from "express";
import passport from "passport";
import dotenv from "dotenv";
import { DataSource } from "typeorm";

import User from "../../../model/User";
import UserService from "../../../service/UserService";

import { Logger } from "../../../lib/Logger";
import ApiError from "../../../lib/ApiError";
import Translations from "../../../lib/Translations";
import { CODES, MESSAGES } from "../../../lib/constants";

import { userValidationRules } from "./validator/userValidator";
import { validateRequest } from "./validator/common";

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
  const userService = new UserService(appDataSource, logger);
  const validationRules = userValidationRules(translations, userService);

  app.post(
    "/api/v1/users",
    validationRules.create,
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // #swagger.summary = 'Register new user'
      // #swagger.tags = ['User']
      // #swagger.description = 'Register new user'
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
        const { email, password, name } = req.body as {
          email: string;
          password: string;
          name: string;
        };
        const user = req.user as User;

        validateRequest(req);

        // Create a new user
        const newUser = new User();
        newUser.name = name;
        newUser.email = email;
        newUser.password = userService.getPasswordHash(password);
        newUser.createdBy = user;
        newUser.modifiedBy = user;

        const createdUser = await userService.createUser(newUser);

        if (createdUser !== null)
          return res.status(CODES.API_CREATED).json(createdUser);
        else throw new Error(MESSAGES.USER_WAS_NOT_CREATED);
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
        validateRequest(req);
        // In fact route returns result of callback
        return passport.authenticate(
          "local",
          { session: false },
          async (err: Error, passportUser: User) => {
            /* istanbul ignore next */ if (err) {
              logger.error(err as object);
              res
                .status(CODES.SERVER_ERROR)
                .send({ error: translations.getText("error_500") });
            }

            if (passportUser) {
              return res.json({ token: userService.createToken(passportUser) });
            }

            return res.status(CODES.API_UNAUTHORIZED).json({
              error: translations.getText("incorrect_password_or_email"),
            });
          }
        )(req, res, next);
      } catch (e: unknown) /* istanbul ignore next */ {
        next(e);
      }
    }
  );

  // Get a protected resource with current user
  app.get(
    "/api/v1/users/whoami",
    passport.authenticate("jwt", { session: false }),
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // #swagger.summary = 'Fetch currently current user'
      try {
        const id = (req.user as User).id;

        const result = await userService.getUserById(id);

        /* istanbul ignore next */ if (result === null) {
          throw new ApiError(
            CODES.API_UNAUTHORIZED,
            MESSAGES.API_UNAUTHORIZED_ERROR,
            [translations.getText("incorrect_token")]
          );
        } else {
          return res.status(CODES.API_OK).json(result);
        }
      } catch (e: unknown) /* istanbul ignore next */ {
        next(e);
      }
    }
  );
}

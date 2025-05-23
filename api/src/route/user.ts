import express from "express";
import passport from "passport";
import dotenv from "dotenv";
import { container } from "tsyringe";

import { TOKENS } from "di/tokens";

import UserValidator from "api/src/route/validator/UserValidator";
import { validateRequest } from "api/src/route/validator/common";
import UserController from "api/src/controller/UserController";

dotenv.config();

/**
 * User routes
 * @param app Express instance
 */
export default function(app: express.Router) {
  const userController =
    container.resolve<UserController>(
      TOKENS.UserController,
    );
  const userValidator =
    container.resolve<UserValidator>(
      TOKENS.UserValidator,
    );
  const validationRules =
    userValidator.getRules();

  // Register a new user
  app.post(
    "/api/v1/users",
    validationRules.create,
    validateRequest,
    userController.create.bind(userController),
  );

  // Log in as an existing user
  app.post(
    "/api/v1/users/login",
    validationRules.login,
    validateRequest,
    userController.login.bind(userController),
  );

  // Get a protected resource with current user
  app.get(
    "/api/v1/users/whoami",
    passport.authenticate("jwt", {
      session: false,
    }),
    userController.whoami.bind(userController),
  );
}

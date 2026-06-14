import express from "express";
import passport from "passport";
import dotenv from "dotenv";
import { container } from "tsyringe";

import { TOKENS } from "#di/tokens.js";

import UserValidator from "api/src/route/validator/UserValidator.js";
import { validateRequest } from "api/src/route/validator/common.js";
import UserController from "api/src/controller/UserController.js";

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
    /* #swagger.summary = 'Register new user' */
    /* #swagger.tags = ['User'] */
    /* #swagger.description = 'Creates a new user account. Returns the created user object (without password). The email must be unique.' */
    /* #swagger.parameters['body'] = {
          in: 'body',
          description: 'User registration data',
          required: true,
          schema: { $ref: '#/definitions/UserCreateRequest' }
    } */
    /* #swagger.responses[201] = {
          description: 'User created successfully',
          schema: { $ref: '#/definitions/UserResponse' }
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error — missing or invalid fields',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    /* #swagger.responses[500] = {
          description: 'Server error',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    userController.create.bind(userController),
  );

  // Log in as an existing user
  app.post(
    "/api/v1/users/login",
    validationRules.login,
    validateRequest,
    /* #swagger.summary = 'Login user' */
    /* #swagger.tags = ['User'] */
    /* #swagger.description = 'Authenticates a user with email and password. Returns a JWT token to use in the Authorization header for protected endpoints.' */
    /* #swagger.parameters['body'] = {
          in: 'body',
          description: 'User credentials',
          required: true,
          schema: { $ref: '#/definitions/UserLoginRequest' }
    } */
    /* #swagger.responses[200] = {
          description: 'Login successful — JWT token returned',
          schema: { $ref: '#/definitions/TokenResponse' }
    } */
    /* #swagger.responses[401] = {
          description: 'Invalid email or password',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[500] = {
          description: 'Server error',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    userController.login.bind(userController),
  );

  // Get a protected resource with current user
  app.get(
    "/api/v1/users/whoami",
    passport.authenticate("jwt", { session: false }),
    /* #swagger.summary = 'Get current user' */
    /* #swagger.tags = ['User'] */
    /* #swagger.description = 'Returns the profile of the currently authenticated user based on the JWT token provided in the Authorization header.' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.responses[200] = {
          description: 'Current user profile',
          schema: { $ref: '#/definitions/UserResponse' }
    } */
    /* #swagger.responses[401] = {
          description: 'Missing or invalid JWT token',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    userController.whoami.bind(userController),
  );

  // Issue new access token using refresh token cookie
  app.post(
    "/api/v1/token/refresh",
    /* #swagger.summary = 'Refresh access token' */
    /* #swagger.tags = ['User'] */
    /* #swagger.description = 'Issues a new short-lived access token using the refresh token stored in the HttpOnly cookie. Also rotates the refresh token.' */
    /* #swagger.responses[200] = {
          description: 'New access token',
          schema: { $ref: '#/definitions/TokenResponse' }
    } */
    /* #swagger.responses[401] = {
          description: 'Missing or invalid refresh token',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    userController.refresh.bind(userController),
  );

  // Logout — revoke refresh token
  app.post(
    "/api/v1/users/logout",
    passport.authenticate("jwt", { session: false }),
    /* #swagger.summary = 'Logout user' */
    /* #swagger.tags = ['User'] */
    /* #swagger.description = 'Revokes the refresh token and clears the cookie. Requires a valid access token.' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.responses[200] = {
          description: 'Logout successful'
    } */
    userController.logout.bind(userController),
  );
}

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
    /* #swagger.requestBody = {
          description: 'User registration data',
          required: true,
          content: {
            "application/json": {
              schema: { $ref: '#/definitions/UserCreateRequest' }
            }
          }
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
    /* #swagger.requestBody = {
          description: 'User credentials',
          required: true,
          content: {
            "application/json": {
              schema: { $ref: '#/definitions/UserLoginRequest' }
            }
          }
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

  // Update current user profile (name and/or email)
  app.patch(
    "/api/v1/users/me",
    passport.authenticate("jwt", { session: false }),
    validationRules.updateProfile,
    validateRequest,
    /* #swagger.summary = 'Update user profile' */
    /* #swagger.tags = ['User'] */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.responses[200] = {
          description: 'Updated user profile',
          schema: { $ref: '#/definitions/UserResponse' }
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    userController.updateProfile.bind(userController),
  );

  // Change current user password
  app.patch(
    "/api/v1/users/me/password",
    passport.authenticate("jwt", { session: false }),
    validationRules.updatePassword,
    validateRequest,
    /* #swagger.summary = 'Change user password' */
    /* #swagger.tags = ['User'] */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.responses[200] = {
          description: 'Password changed successfully'
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error or incorrect current password',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    userController.updatePassword.bind(userController),
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

  // List active sessions for the current user
  app.get(
    "/api/v1/users/sessions",
    passport.authenticate("jwt", { session: false }),
    /* #swagger.summary = 'List active sessions' */
    /* #swagger.tags = ['User'] */
    /* #swagger.description = 'Returns every active (non-revoked, non-expired) session of the authenticated user, most recently created first. Each entry is flagged with `current: true` if it is the session used for this request.' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.responses[200] = {
          description: 'List of active sessions',
          schema: { type: 'array', items: { $ref: '#/definitions/SessionResponse' } }
    } */
    /* #swagger.responses[401] = {
          description: 'Missing or invalid JWT token',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    userController.listSessions.bind(userController),
  );

  // Terminate every session of the current user except the one currently in use
  app.delete(
    "/api/v1/users/sessions",
    passport.authenticate("jwt", { session: false }),
    /* #swagger.summary = 'Terminate all other sessions' */
    /* #swagger.tags = ['User'] */
    /* #swagger.description = 'Revokes every active session of the authenticated user except the one used for this request (logout from all other devices).' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.responses[200] = {
          description: 'Other sessions terminated'
    } */
    /* #swagger.responses[401] = {
          description: 'Missing or invalid JWT token',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    userController.revokeOtherSessions.bind(userController),
  );

  // Terminate a single session by ID
  app.delete(
    "/api/v1/users/sessions/:id",
    passport.authenticate("jwt", { session: false }),
    validationRules.sessionId,
    validateRequest,
    /* #swagger.summary = 'Terminate a session' */
    /* #swagger.tags = ['User'] */
    /* #swagger.description = 'Revokes a single session by its numeric ID. The session must belong to the authenticated user.' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.parameters['id'] = {
          in: 'path',
          description: 'Session ID',
          required: true,
          type: 'integer',
          example: 42
    } */
    /* #swagger.responses[200] = {
          description: 'Session terminated'
    } */
    /* #swagger.responses[401] = {
          description: 'Missing or invalid JWT token',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[404] = {
          description: 'Session not found',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error — invalid ID format',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    userController.revokeSession.bind(userController),
  );
}

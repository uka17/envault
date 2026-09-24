import express from "express";
import passport from "passport";
import { rateLimit } from "express-rate-limit";
import { container } from "tsyringe";

import { TOKENS } from "#di/tokens.js";
import config from "api/src/config/config.js";

import UserValidator from "api/src/route/validator/UserValidator.js";
import { validateRequest } from "api/src/route/validator/common.js";
import UserController from "api/src/controller/UserController.js";

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

  const emailVerificationRateLimiter = rateLimit({
    windowMs: config.emailVerificationRateLimit.windowMs,
    max: config.emailVerificationRateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
  });

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
          description: 'Validation error: missing or invalid fields',
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
          description: 'Login successful: JWT token returned',
          schema: { $ref: '#/definitions/TokenResponse' }
    } */
    /* #swagger.responses[401] = {
          description: 'Invalid email or password',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[403] = {
          description: 'Email not verified yet',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[500] = {
          description: 'Server error',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    userController.login.bind(userController),
  );

  // Verify a user's email using the code received by email
  app.post(
    "/api/v1/users/verify-email",
    emailVerificationRateLimiter,
    validationRules.verifyEmail,
    validateRequest,
    /* #swagger.summary = 'Verify email' */
    /* #swagger.tags = ['User'] */
    /* #swagger.description = 'Activates a user account using the code sent by email at registration.' */
    /* #swagger.requestBody = {
          description: 'Verification code',
          required: true,
          content: {
            "application/json": {
              schema: { $ref: '#/definitions/VerifyEmailRequest' }
            }
          }
    } */
    /* #swagger.responses[200] = {
          description: 'Email verified successfully'
    } */
    /* #swagger.responses[401] = {
          description: 'Verification code is invalid, expired or already used',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error: missing code',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    userController.verifyEmail.bind(userController),
  );

  // Resend the email verification code
  app.post(
    "/api/v1/users/verify-email/resend",
    emailVerificationRateLimiter,
    validationRules.resendVerification,
    validateRequest,
    /* #swagger.summary = 'Resend verification email' */
    /* #swagger.tags = ['User'] */
    /* #swagger.description = 'Resends the verification code. Always succeeds, to avoid leaking account existence.' */
    /* #swagger.requestBody = {
          description: 'Email address to resend the verification code to',
          required: true,
          content: {
            "application/json": {
              schema: { $ref: '#/definitions/ResendVerificationRequest' }
            }
          }
    } */
    /* #swagger.responses[200] = {
          description: 'Verification email resent (if applicable)'
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error: missing or invalid email',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    userController.resendVerification.bind(userController),
  );

  app.post(
    "/api/v1/users/email-change/confirm",
    emailVerificationRateLimiter,
    validationRules.confirmEmailChange,
    validateRequest,
    /* #swagger.summary = 'Confirm email change' */
    /* #swagger.tags = ['User'] */
    /* #swagger.requestBody = { required: true, content: { "application/json": {
      schema: { $ref: '#/definitions/EmailChangeConfirmRequest' }
    } } } */
    /* #swagger.responses[200] = { description: 'Email replaced; all sessions revoked. Log in with the new address.', schema: { $ref: '#/definitions/EmptyResponse' } } */
    /* #swagger.responses[401] = { description: 'email_change_token_invalid: expired, cancelled, used or unknown token', schema: { $ref: '#/definitions/ErrorResponse' } } */
    /* #swagger.responses[409] = { description: 'user_already_exists: address was taken; account unchanged', schema: { $ref: '#/definitions/ErrorResponse' } } */
    /* #swagger.responses[422] = { description: 'Invalid token format', schema: { $ref: '#/definitions/ValidationErrorResponse' } } */
    /* #swagger.responses[429] = { description: 'IP confirmation limit; Retry-After header' } */
    userController.confirmEmailChange.bind(userController),
  );

  app.post(
    "/api/v1/users/email-change/resend",
    passport.authenticate("jwt", { session: false }),
    /* #swagger.summary = 'Resend pending email change confirmation' */
    /* #swagger.tags = ['User'] */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.responses[200] = { description: 'Confirmation sent; previous token invalidated', schema: { $ref: '#/definitions/EmptyResponse' } } */
    /* #swagger.responses[401] = { description: 'Unauthorized', schema: { $ref: '#/definitions/ErrorResponse' } } */
    /* #swagger.responses[409] = { description: 'email_change_not_pending or user_already_exists', schema: { $ref: '#/definitions/ErrorResponse' } } */
    /* #swagger.responses[429] = { description: 'email_change_rate_limited: 60-second cooldown and 3 sends per 15 minutes per user, including address replacements; Retry-After header', schema: { $ref: '#/definitions/ErrorResponse' } } */
    /* #swagger.responses[503] = { description: 'email_change_delivery_failed: pending address retained; retry resend after cooldown', schema: { $ref: '#/definitions/ErrorResponse' } } */
    userController.resendEmailChange.bind(userController),
  );

  app.post(
    "/api/v1/users/email-change/request",
    passport.authenticate("jwt", { session: false }),
    validationRules.requestEmailChange,
    validateRequest,
    /* #swagger.summary = 'Request an email change' */
    /* #swagger.tags = ['User'] */
    /* #swagger.description = 'Starts a pending email change; current login and verification remain valid until confirmation. Repeating the pending email sends nothing; submitting the current email cancels the pending change.' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.requestBody = { required: true, content: { "application/json": {
      schema: { $ref: '#/definitions/EmailChangeRequest' }
    } } } */
    /* #swagger.responses[200] = {
          description: 'Updated user profile (email unchanged until confirmed)',
          schema: { $ref: '#/definitions/UserResponse' }
    } */
    /* #swagger.responses[401] = { description: 'Unauthorized', schema: { $ref: '#/definitions/ErrorResponse' } } */
    /* #swagger.responses[409] = { description: 'user_already_exists', schema: { $ref: '#/definitions/ErrorResponse' } } */
    /* #swagger.responses[429] = { description: 'email_change_rate_limited; Retry-After header', schema: { $ref: '#/definitions/ErrorResponse' } } */
    /* #swagger.responses[503] = { description: 'email_change_delivery_failed: old login preserved, pending change retained for resend', schema: { $ref: '#/definitions/ErrorResponse' } } */
    /* #swagger.responses[422] = {
          description: 'Validation error',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    userController.requestEmailChange.bind(userController),
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

  // Update current user's display name
  app.patch(
    "/api/v1/users/me",
    passport.authenticate("jwt", { session: false }),
    validationRules.updateName,
    validateRequest,
    /* #swagger.summary = 'Update user name' */
    /* #swagger.description = 'Updates the display name. Applies immediately, no confirmation required. Email changes go through /api/v1/users/email-change/request instead.' */
    /* #swagger.requestBody = { required: true, content: { "application/json": {
      schema: { $ref: '#/definitions/UserUpdateRequest' }
    } } } */
    /* #swagger.responses[401] = { description: 'Unauthorized', schema: { $ref: '#/definitions/ErrorResponse' } } */
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
    userController.updateName.bind(userController),
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
    /* #swagger.description = 'Changes the password and revokes all sessions, including the current one. The next request returns 401.' */
    /* #swagger.responses[200] = {
          description: 'Password changed successfully'
    } */
    /* #swagger.responses[401] = {
          description: 'Missing or invalid JWT token, or its session is revoked or expired',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error or incorrect current password',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    userController.updatePassword.bind(userController),
  );

  // Logout: revoke refresh token
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
    /* #swagger.responses[401] = {
          description: 'Missing or invalid JWT token, or its session is revoked or expired',
          schema: { $ref: '#/definitions/ErrorResponse' }
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
          description: 'Validation error: invalid ID format',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    userController.revokeSession.bind(userController),
  );
}

import express from "express";
import passport from "passport";
import { container } from "tsyringe";

import { TOKENS } from "#di/tokens.js";
import { validateRequest } from "api/src/route/validator/common.js";

import StashController from "api/src/controller/StashController.js";
import StashValidator from "api/src/route/validator/StashValidator.js";

/**
 * Registers authenticated stash endpoints.
 * @param app Router receiving the stash routes
 * @returns Nothing
 */
export default function(app: express.Router) {
  const stashController = container.resolve<StashController>(TOKENS.StashController);
  const stashValidator = container.resolve<StashValidator>(TOKENS.StashValidator);
  const validationRules =
    stashValidator.getRules();

  app.post(
    "/api/v1/stashes",
    passport.authenticate("jwt", { session: false }),
    validationRules.create,
    validateRequest,
    /* #swagger.summary = 'Create new stash' */
    /* #swagger.tags = ['Stash'] */
    /* #swagger.description = 'Creates a new stash (encrypted message) for the authenticated user.
          The request body must already be encrypted client-side. The server stores it as an
          opaque string and never sees the decryption key. Sent to the recipient at scheduledAt via SES.' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.requestBody = {
          description: 'Stash data',
          required: true,
          content: {
            "application/json": {
              schema: { $ref: '#/definitions/StashCreateRequest' }
            }
          }
    } */
    /* #swagger.responses[201] = {
          description: 'Stash created successfully',
          schema: { $ref: '#/definitions/StashResponse' }
    } */
    /* #swagger.responses[401] = {
          description: 'Missing or invalid JWT token',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error: missing or invalid fields',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    /* #swagger.responses[500] = {
          description: 'Server error',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    stashController.create.bind(stashController),
  );

  app.get(
    "/api/v1/stashes",
    passport.authenticate("jwt", { session: false }),
    /* #swagger.summary = 'List stashes for current user' */
    /* #swagger.tags = ['Stash'] */
    /* #swagger.description = 'Returns all stashes belonging to the authenticated user, ordered by creation date.' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.responses[200] = {
          description: 'List of stashes',
          schema: { type: 'array', items: { $ref: '#/definitions/StashResponse' } }
    } */
    /* #swagger.responses[401] = {
          description: 'Missing or invalid JWT token',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    stashController.list.bind(stashController),
  );

  app.get(
    "/api/v1/stashes/:id",
    passport.authenticate("jwt", { session: false }),
    validationRules.find,
    validateRequest,
    /* #swagger.summary = 'Get stash by ID' */
    /* #swagger.tags = ['Stash'] */
    /* #swagger.description = 'Returns a stash belonging to the authenticated user.
          Missing stashes and stashes owned by another user return the same 404 stash_not_found response.' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.parameters['id'] = {
          in: 'path',
          description: 'Stash ID',
          required: true,
          type: 'integer',
          example: 42
    } */
    /* #swagger.responses[200] = {
          description: 'Stash found',
          schema: { $ref: '#/definitions/StashResponse' }
    } */
    /* #swagger.responses[401] = {
          description: 'Missing or invalid JWT token',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[404] = {
          description: 'Stash does not exist or belongs to another user (stash_not_found)',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    stashController.get.bind(stashController),
  );

  app.delete(
    "/api/v1/stashes/:id",
    passport.authenticate("jwt", { session: false }),
    validationRules.delete,
    validateRequest,
    /* #swagger.summary = 'Delete stash by ID' */
    /* #swagger.tags = ['Stash'] */
    /* #swagger.description = 'Permanently deletes a stash belonging to the authenticated user.
          Ownership is checked in the delete query. Missing and foreign stashes return 404 stash_not_found.' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.parameters['id'] = {
          in: 'path',
          description: 'Stash ID',
          required: true,
          type: 'integer',
          example: 42
    } */
    /* #swagger.responses[200] = {
          description: 'Stash deleted, returns the TypeORM DeleteResult',
          schema: { affected: 1 }
    } */
    /* #swagger.responses[401] = {
          description: 'Missing or invalid JWT token',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[404] = {
          description: 'Stash does not exist or belongs to another user (stash_not_found)',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[500] = {
          description: 'Database deletion failed',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error: invalid ID format',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    stashController.delete.bind(stashController),
  );

  app.post(
    "/api/v1/stashes/:id/snooze/:hours",
    passport.authenticate("jwt", { session: false }),
    validationRules.snooze,
    validateRequest,
    /* #swagger.summary = 'Snooze stash for N hours' */
    /* #swagger.tags = ['Stash'] */
    /* #swagger.description = 'Postpones a stash belonging to the authenticated user by the given number of hours.
          Ownership is checked in both the lookup and update.
          Missing and foreign stashes return 404 stash_not_found.' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.parameters['id'] = {
          in: 'path',
          description: 'Stash ID',
          required: true,
          type: 'integer',
          example: 42
    } */
    /* #swagger.parameters['hours'] = {
          in: 'path',
          description: 'Number of hours to postpone',
          required: true,
          type: 'integer',
          example: 24
    } */
    /* #swagger.responses[200] = {
          description: 'Stash snoozed, returns updated stash',
          schema: { $ref: '#/definitions/StashResponse' }
    } */
    /* #swagger.responses[401] = {
          description: 'Missing or invalid JWT token',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error: invalid ID or hours format',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    /* #swagger.responses[404] = {
          description: 'Stash does not exist or belongs to another user (stash_not_found)',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[500] = {
          description: 'Snooze update failed',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    stashController.snooze.bind(stashController),
  );
}

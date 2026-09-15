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
          opaque string and never sees the decryption key. scheduledAt must be a valid future ISO 8601 date.
          A notification is sent when due via SES.
          Public token reading remains available before the scheduled date.' */
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
          description: 'Invalid fields; dates use date_format_incorrect or scheduled_at_must_be_future',
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
    /* #swagger.responses[500] = {
          description: 'Database lookup failed',
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
          description: 'Positive integer Stash ID, maximum 2147483647',
          required: true,
          '@schema': { type: 'integer', minimum: 1, maximum: 2147483647 },
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
    /* #swagger.responses[500] = {
          description: 'Database lookup failed',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error: stash_id_invalid',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
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
          Owner and state are checked under a PostgreSQL row lock. An unsent message can only be cancelled
          before the sender locks its row for delivery. Active delivery or a concurrent mutation
          return 409 stash_delivery_in_progress. Deleting an already sent stash removes its content and
          SendLog entries and revokes the public link; it cannot recall the delivered email.
          Missing and foreign stashes return 404 stash_not_found.' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.parameters['id'] = {
          in: 'path',
          description: 'Positive integer Stash ID, maximum 2147483647',
          required: true,
          '@schema': { type: 'integer', minimum: 1, maximum: 2147483647 },
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
          description: 'Validation error: stash_id_invalid',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    /* #swagger.responses[409] = {
          description: 'stash_delivery_in_progress: delivery or another mutation holds the row lock',
          schema: { $ref: '#/definitions/ErrorResponse' }
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
          Owner and state are checked under a PostgreSQL row lock.
          Only unsent stashes without an active delivery can be postponed.
          Active delivery or a concurrent mutation returns 409 stash_delivery_in_progress.
          Already sent stashes return 409 stash_already_sent. Adds exactly N times 3600000 milliseconds to
          the existing schedule, independent of DST; a still-overdue result remains eligible for delivery.
          Missing and foreign stashes return 404 stash_not_found.' */
    /* #swagger.security = [{ "bearerAuth": [] }] */
    /* #swagger.parameters['id'] = {
          in: 'path',
          description: 'Positive integer Stash ID, maximum 2147483647',
          required: true,
          '@schema': { type: 'integer', minimum: 1, maximum: 2147483647 },
          example: 42
    } */
    /* #swagger.parameters['hours'] = {
          in: 'path',
          description: 'Integer from 1 through 8760 (365 days); each hour is exactly 3600000 milliseconds',
          required: true,
          '@schema': { type: 'integer', minimum: 1, maximum: 8760 },
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
          description: 'Validation error: stash_id_invalid or snooze_hours_invalid (integer 1 through 8760)',
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
    /* #swagger.responses[409] = {
          description: 'stash_delivery_in_progress (sending or busy) or stash_already_sent (delivered)',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    stashController.snooze.bind(stashController),
  );
}

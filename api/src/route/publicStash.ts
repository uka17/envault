import express from "express";
import { rateLimit } from "express-rate-limit";
import dotenv from "dotenv";
import { container } from "tsyringe";

import { TOKENS } from "#di/tokens.js";
import { validateRequest } from "api/src/route/validator/common.js";
import config from "api/src/config/config.js";

import PublicStashController from "api/src/controller/PublicStashController.js";
import PublicStashValidator from "api/src/route/validator/PublicStashValidator.js";

dotenv.config();

export default function(app: express.Router) {
  const publicStashController =
    container.resolve<PublicStashController>(TOKENS.PublicStashController);
  const publicStashValidator =
    container.resolve<PublicStashValidator>(TOKENS.PublicStashValidator);
  const validationRules = publicStashValidator.getRules();

  const getRateLimiter = rateLimit({
    windowMs: config.publicStashRateLimit.windowMs,
    max: config.publicStashRateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const unlockRateLimiter = rateLimit({
    windowMs: config.publicStashUnlockRateLimit.windowMs,
    max: config.publicStashUnlockRateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get(
    "/api/public/stashes/:token",
    getRateLimiter,
    validationRules.getByToken,
    validateRequest,
    /* #swagger.summary = 'Check public stash availability' */
    /* #swagger.tags = ['PublicStash'] */
    /* #swagger.description = 'Checks whether a stash is available for unlock via its public access
          token and returns only the information required to display the key input form.
          Requires no authentication.' */
    /* #swagger.parameters['token'] = {
          in: 'path',
          description: 'Public access token',
          required: true,
          type: 'string',
          example: 'abcdefgh23456789jkmn'
    } */
    /* #swagger.responses[200] = {
          description: 'Stash is available',
          schema: { $ref: '#/definitions/PublicStashInfoResponse' }
    } */
    /* #swagger.responses[404] = {
          description: 'Invalid or unknown token',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error — invalid token format',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    /* #swagger.responses[429] = {
          description: 'Too many requests',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    publicStashController.getByToken.bind(publicStashController),
  );

  app.post(
    "/api/public/stashes/:token/unlock",
    unlockRateLimiter,
    validationRules.unlock,
    validateRequest,
    /* #swagger.summary = 'Unlock a public stash' */
    /* #swagger.tags = ['PublicStash'] */
    /* #swagger.description = 'Validates the public access token and decryption key, and returns
          the decrypted stash content on success. Requires no authentication.' */
    /* #swagger.parameters['token'] = {
          in: 'path',
          description: 'Public access token',
          required: true,
          type: 'string',
          example: 'abcdefgh23456789jkmn'
    } */
    /* #swagger.requestBody = {
          description: 'Decryption key',
          required: true,
          content: {
            "application/json": {
              schema: { $ref: '#/definitions/StashUnlockRequest' }
            }
          }
    } */
    /* #swagger.responses[200] = {
          description: 'Stash unlocked successfully',
          schema: { $ref: '#/definitions/StashUnlockResponse' }
    } */
    /* #swagger.responses[404] = {
          description: 'Invalid token or key — neutral error, does not reveal which one failed',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error — missing or invalid fields',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    /* #swagger.responses[429] = {
          description: 'Too many requests',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    publicStashController.unlock.bind(publicStashController),
  );
}

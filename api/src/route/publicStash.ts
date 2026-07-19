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

  app.get(
    "/api/public/stashes/:token",
    getRateLimiter,
    validationRules.getByToken,
    validateRequest,
    /* #swagger.summary = 'Get public stash by token' */
    /* #swagger.tags = ['PublicStash'] */
    /* #swagger.description = 'Returns a stash by its public access token, including its encrypted
          body. The body is encrypted client-side by the sender and is decrypted entirely in the
          recipient browser using the key shared with them out-of-band. Requires no authentication.' */
    /* #swagger.parameters['token'] = {
          in: 'path',
          description: 'Public access token',
          required: true,
          type: 'string',
          example: 'abcdefgh23456789jkmn'
    } */
    /* #swagger.responses[200] = {
          description: 'Stash found',
          schema: { $ref: '#/definitions/PublicStashResponse' }
    } */
    /* #swagger.responses[404] = {
          description: 'Invalid or unknown token',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    /* #swagger.responses[422] = {
          description: 'Validation error: invalid token format',
          schema: { $ref: '#/definitions/ValidationErrorResponse' }
    } */
    /* #swagger.responses[429] = {
          description: 'Too many requests',
          schema: { $ref: '#/definitions/ErrorResponse' }
    } */
    publicStashController.getByToken.bind(publicStashController),
  );
}

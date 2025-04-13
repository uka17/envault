import express from "express";
import { DataSource } from "typeorm";

import { Logger } from "../../../lib/Logger";
import Translations from "../../../lib/Translations";

import { CODES, MESSAGES } from "../../../lib/constants";

/**
 * Main route. Initiates `GET("/")` and all nested routes
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
  app.get("/", async (req: express.Request, res: express.Response) => {
    // #swagger.summary = 'Check if api is online'
    res.send(
      "API is online (TypeORM, Passport, Express.js)<br/><a href='/swagger/'>Swagger doc</a>"
    );
  });
  //Health endpoint
  app.get("/health", async (req: express.Request, res: express.Response) => {
    res.status(CODES.API_OK).send();
  });
  //Default error handlers
  app.use(function (
    err: express.ErrorRequestHandler,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    if (err) {
      if (err.name === "UnauthorizedError") {
        res
          .status(CODES.API_UNAUTHORIZED)
          .send({ error: translations.getText("unauthorized") });
      } else {
        logger.error(err);
      }
    }
    next();
  });
}

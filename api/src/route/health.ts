import express from "express";
import { Logger } from "../lib/logger";
import { DataSource } from "typeorm";
import Translations from "../lib/Translations";

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
    res.send("API is online. TypeORM, Passport, Express.js");
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
        res.status(401).send({ error: translations.getText("unauthorized") });
      } else {
        logger.error(err);
      }
    }
    next();
  });
}

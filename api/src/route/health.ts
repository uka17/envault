import express from "express";
import { DataSource } from "typeorm";
import swaggerUi from "swagger-ui-express";

import { Logger } from "../../../lib/Logger";
import Translations from "../../../lib/Translations";

import { CODES, MESSAGES } from "../../../lib/constants";

import swaggerDocument from "api/src/swagger/swagger.json";

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
  app.get(
    "/",
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // #swagger.summary = 'Check if api is online'
      try {
        return res.send(
          `API is online (TypeORM, Passport, Express.js)<br/>
    SHA: ${process.env.GIT_COMMIT_SHA}<br/> 
    <a href='/swagger/'>Swagger doc</a>`
        );
      } catch (error) {
        next(error);
      }
    }
  );
  //Health endpoint
  app.get("/health", async (req: express.Request, res: express.Response) => {
    return res.status(CODES.API_OK).send();
  });
  //Swagger
  app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

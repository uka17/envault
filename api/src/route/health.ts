import express from "express";
import swaggerUi from "swagger-ui-express";

import { CODES } from "common/constants";

import swaggerDocument from "api/src/swagger/swagger.json";

/**
 * Main route. Initiates `GET("/")` and all nested routes
 * @param app Express instance
 */
export default function(app: express.Router) {
  app.get(
    "/",
    async(
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      // #swagger.summary = 'Check if api is online'
      try {
        return res.send(
          `API is online (TypeORM, Passport, Express.js)<br/>
    SHA: ${process.env.GIT_COMMIT_SHA}<br/> 
    <a href='/swagger/'>Swagger doc</a>`,
        );
      } catch (error) {
        next(error);
      }
    },
  );
  //Health endpoint
  app.get("/health", async(req: express.Request, res: express.Response) => {
    return res.status(CODES.API_OK).send();
  });
  //Swagger
  app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

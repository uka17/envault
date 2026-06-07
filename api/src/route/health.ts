import express from "express";
import swaggerUi from "swagger-ui-express";

import { CODES } from "#common/constants.js";

import swaggerDocument from "api/src/swagger/swagger.json" with { type: "json" };;

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
      // #swagger.summary = 'API root'
      // #swagger.tags = ['Health']
      // #swagger.description = 'Returns a plain-text status page confirming the API is online, with the current commit SHA and a link to the Swagger UI.'
      /* #swagger.responses[200] = {
            description: 'API is online',
            schema: { type: 'string', example: 'API is online (TypeORM, Passport, Express.js)' }
      } */
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
    // #swagger.summary = 'Health check'
    // #swagger.tags = ['Health']
    // #swagger.description = 'Returns HTTP 200 with an empty body. Used by load balancers and monitoring tools to verify the API is alive.'
    /* #swagger.responses[200] = { description: 'Service is healthy' } */
    return res.status(CODES.API_OK).send();
  });
  //OpenAPI spec endpoint
  app.get("/swagger/openapi.json", (req: express.Request, res: express.Response) => {
    res.json(swaggerDocument);
  });
  //Swagger
  app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument, { explorer: true, swaggerOptions: { url: "/swagger/openapi.json" } }));
}

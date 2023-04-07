import express from "express";
import labels from "../lib/labels";
import { Sequelize } from "sequelize";
import { Logger } from "../lib/logger";

/**
 * Main route. Initiates `GET("/")` and all nested routes
 * @param app Express instance
 * @param logger Logger instance
 * @param connection Database connection instanse
 */
export default function (
  app: express.Application,
  logger: Logger,
  connection: Sequelize
) {
  //Put all routes here
  //...

  app.get("/", async (req: express.Request, res: express.Response) => {
    res.send("Custodian is online");
    try {
      await connection.authenticate();
      console.log("Connection has been established successfully.");
    } catch (error) {
      console.error("Unable to connect to the database:", error);
    }
  });
  //Error handlers
  app.use(function (
    err: express.ErrorRequestHandler,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    if (err) {
      if (err.name === "UnauthorizedError") {
        res.status(401).send({ error: labels.notAuthorized });
      } else {
        logger.error(err);
      }
    }
    next();
  });
}

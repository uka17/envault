import express from "express";
import labels from "../lib/labels";
import { Logger } from "../lib/logger";
import { DataSource } from "typeorm";
import { User } from "../model/User";

/**
 * Main route. Initiates `GET("/")` and all nested routes
 * @param app Express instance
 * @param logger Logger instance
 * @param connection Database connection instance
 */
export default function (
  app: express.Application,
  logger: Logger,
  appDataSource: DataSource
) {
  //Put all routes here
  //...

  app.get("/", async (req: express.Request, res: express.Response) => {
    res.send("Custodian is online");
    // Create a new user
    const jane = new User();
    jane.name = "Kolyan";
    jane.email = "kot@kot.ru";
    jane.password = "12345";
    await appDataSource.manager.save(jane);
    console.log("Photo has been saved. Photo id is", jane.id);
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

import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
dotenv.config();
import { Logger, LogLevel } from "./lib/logger";
const logger = Logger.getInstance(true, process.env.LOGLEVEL as LogLevel);

const app: Express = express();
const port = process.env.PORT;

app.get("/", (req: Request, res: Response) => {
  res.send("Custodian is online");
});

app.listen(port, () => {
  logger.info(`Service is live on ${port}.`);
  logger.error(`Service is live on ${port}.`);
  logger.warn(`Service is live on ${port}.`);
});

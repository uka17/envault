import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import LogDispatcher from "./lib/logDispatcher";

const log = LogDispatcher.getInstance(true, "info");
dotenv.config();

const app: Express = express();
const port = process.env.PORT;

app.get("/", (req: Request, res: Response) => {
  res.send("Custodian");
});

app.listen(port, () => {
  log.console(`Service is live on ${port}.`);
});

import "reflect-metadata";
import dotenv from "dotenv";
import SendMail from "../lib/SendMail";
dotenv.config();

import { LessThan } from "typeorm";
import getAppDataSource from "../model/dataSource";
import { Stash } from "../model/Stash";
import config from "./src/config/config";
import chalk from "chalk";
import { fromEnv } from "@aws-sdk/credential-providers";

import { Logger, LogLevel } from "../lib/logger";
const logger = Logger.getInstance(
  process.env.ENV != "PROD",
  config.logLevel as LogLevel
);

const credentials = fromEnv();
var sendMail = new SendMail(logger, credentials);
const mailOptions = {
  to: "ukaoneseven@gmail.com",
  from: "ukaoneseven@gmail.com",
  subject: "New stash",
  html: "<h1>New stash</h1>",
  text: "New stash",
};

sendMail.send(mailOptions);

logger.info(`Initializing service (logLevel=${config.logLevel})...`);

//Init data source and configure all routes
const dbURL = config.dbURL;
const appDataSource = getAppDataSource(dbURL);
appDataSource
  .initialize()
  .then(async () => {
    /*
    sendMail.send(
      { name: "Kolyan", email: "ukaoneseven@gmail.com" },
      "test",
      "<b>Fuck off</b>"
    );
    */
    setInterval(function () {
      main();
    }, config.runInterval);
  })
  .catch((error) => {
    logger.error(error);
  });

async function main() {
  const stashRepository = appDataSource.getRepository(Stash);
  const result = await stashRepository.find({
    where: { send_at: LessThan(new Date(Date.now())) },
  });
  console.log(
    chalk.yellow(result[0] ? result[0].body : "Was DB init? No stahes found.")
  );
}

import "reflect-metadata";
import dotenv from "dotenv";
import SendMail from "./src/lib/SendMail";
dotenv.config();

import { LessThan } from "typeorm";
import appDataSource from "../api/src/model/dataSource";
import { Stash } from "../api/src/model/Stash";
const stashRepository = appDataSource.getRepository(Stash);
import config from "./src/config/config";
import chalk from "chalk";

import { Logger, LogLevel } from "../api/src/lib/logger";
const logger = Logger.getInstance(
  process.env.ENV != "PROD",
  config.logLevel as LogLevel
);
if (process.env.SERVICE_MAILAPI) {
  var sendMail = new SendMail(
    config.sendFrom,
    process.env.SERVICE_MAILAPI,
    logger
  );
} else {
  throw new Error("No API key for mail service was found");
}

logger.info(`Initializing service (logLevel=${config.logLevel})...`);

//Init data source and configure all routes
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
      return main();
    }, config.runInterval);
  })
  .catch((error) => {
    logger.error(error);
  });

async function main() {
  const result = await stashRepository.find({
    where: { send_at: LessThan(new Date(Date.now())) },
  });
  console.log(chalk.yellow(result[0] ? result[0].body : "Was DB init?"));
}

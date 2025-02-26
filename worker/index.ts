import "reflect-metadata";
import dotenv from "dotenv";
import EmailService from "../service/EmailService";
dotenv.config();

import { LessThan } from "typeorm";
import getAppDataSource from "../model/dataSource";
import { Stash } from "../model/Stash";
import config from "./src/config/config";
import chalk from "chalk";
import { fromEnv } from "@aws-sdk/credential-providers";
import { DataSource } from "typeorm";
import StashService from "../service/StashService";

import { Logger, LogLevel } from "../lib/logger";

async function init() {
  //Init logger
  const logger = Logger.getInstance(
    process.env.ENV != "PROD",
    config.logLevel as LogLevel
  );
  logger.info(`Initializing service (logLevel=${config.logLevel})...`);

  //Init data source
  const dbURL = config.dbURL;
  const appDataSource = getAppDataSource(dbURL);
  await appDataSource.initialize();

  //---Play zone
  const credentials = fromEnv();
  var emailService = new EmailService(logger, appDataSource, credentials);
  const mailOptions = {
    to: "ukaoneseven@gmail.com",
    from: "ukaoneseven@gmail.com",
    subject: "New stash",
    html: "<h1>New stash</h1>",
    text: "New stash",
  };
  const messageId = await emailService.send(mailOptions);
  const stashService = new StashService(appDataSource, logger);
  await stashService.log(5, mailOptions, messageId);

  //---End of play zone

  //Init watch function to check for stashes to send
  setInterval(function () {
    main(appDataSource);
  }, config.runInterval);
}

async function main(appDataSource: DataSource) {
  const stashRepository = appDataSource.getRepository(Stash);
  const result = await stashRepository.find({
    where: { send_at: LessThan(new Date(Date.now())) },
  });
  console.log(
    chalk.yellow(result[0] ? result[0].body : "Was DB init? No stahes found.")
  );
}

init();

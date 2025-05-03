import "reflect-metadata";
import { LessThan } from "typeorm";
import chalk from "chalk";
import { DataSource } from "typeorm";
import { fromEnv } from "@aws-sdk/credential-providers";
import dotenv from "dotenv";
dotenv.config();

import config from "worker/src/config/config";
import getAppDataSource from "lib/dataSource";
import Stash from "model/Stash";
import SendLog from "model/SendLog";
import { Logger, LogLevel } from "lib/Logger";

import StashService from "service/StashService";
import EmailService from "service/EmailService";

async function init() {
  //Init logger
  const logger = new Logger(
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
  let stashRepository = appDataSource.getRepository(Stash);
  let sendLogRepository = appDataSource.getRepository(SendLog);
  const stashService = new StashService(
    stashRepository,
    sendLogRepository,
    logger
  );
  await stashService.log(3, mailOptions, messageId);

  //---End of play zone

  //Init watch function to check for stashes to send
  setInterval(function () {
    main(appDataSource);
  }, config.runInterval);
}

async function main(appDataSource: DataSource) {
  const stashRepository = appDataSource.getRepository(Stash);
  const result = await stashRepository.find({
    where: { sendAt: LessThan(new Date(Date.now())) },
  });
  console.log(
    chalk.yellow(result[0] ? result[0].body : "Was DB init? No stahes found.")
  );
}

init();

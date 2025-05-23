import "reflect-metadata";
import { LessThan } from "typeorm";
import chalk from "chalk";
import { container } from "tsyringe";
import { DataSource } from "typeorm";
import dotenv from "dotenv";
dotenv.config();

import config from "worker/src/config/config";
import getAppDataSource from "common/dataSource";
import Stash from "model/Stash";
import LogService from "service/LogService";
import { TOKENS } from "di/tokens";
import initDI from "di/container";

import StashService from "service/StashService";
import EmailService from "service/EmailService";


async function init() {
  //Init data source
  const dbURL = config.dbURL;
  const appDataSource = getAppDataSource(dbURL);
  await appDataSource.initialize();
  initDI(appDataSource);

  const logger = container.resolve<LogService>(TOKENS.LogService);
  
  logger.info(`Initializing service (logLevel=${config.logLevel})...`);

  //---Play zone
  const emailService = container.resolve<EmailService> (TOKENS.EmailService);
  const mailOptions = {
    to: "ukaoneseven@gmail.com",
    from: "ukaoneseven@gmail.com",
    subject: "New stash",
    html: "<h1>New stash</h1>",
    text: "New stash",
  };
  const messageId = await emailService.send(mailOptions);
  let stashService = container.resolve<StashService>(TOKENS.StashService);
  await stashService.log(3, mailOptions, messageId);

  //---End of play zone

  //Init watch function to check for stashes to send
  setInterval(function() {
    main(appDataSource);
  }, config.runInterval);
}

async function main(appDataSource: DataSource) {
  const stashRepository = appDataSource.getRepository(Stash);
  const result = await stashRepository.find({
    where: { sendAt: LessThan(new Date(Date.now())) },
  });
  console.log(
    chalk.yellow(result[0] ? result[0].body : "Was DB init? No stahes found."),
  );
}

init();

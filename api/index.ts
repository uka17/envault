import "reflect-metadata";
import { container } from "tsyringe";
import express, { Express } from "express";
import session from "express-session";
import cors from "cors";
import bodyParser from "body-parser";
import chalk from "chalk";
import dotenv from "dotenv";
dotenv.config();

import getAppDataSource from "../common/dataSource";
import initDB from "./scripts/init";
import config from "./src/config/config";

import health from "./src/route/health";
import user from "api/src/route/user";
import stash from "./src/route/stash";
import User from "../model/User";
import passportConfig from "./src/config/passport";
import createErrorHandler from "./src/route/error";
import TranslationService from "service/TranslationService";
import LogService from "service/LogService";

import initDI from "di/container";
import { TOKENS } from "di/tokens";


//Init data source
const dbURL = config.dbURL;
const showSQLLogs = config.showSQLLogs;
const appDataSource = getAppDataSource(dbURL, showSQLLogs);

initDI(appDataSource);

const logger = container.resolve<LogService>(TOKENS.LogService);

welcomeMessage();

logger.info(
  `Initializing API (port=${config.port}, ENV=${process.env.ENV}, logLevel=${config.logLevel})...`,
);

const app: Express = express();

app.use(cors(config.cors));
app.use(session(config.session));
app.use(bodyParser.json());

//Basic checks
if (!process.env.API_JWT_SECRET) {
  throw "JWT_SECRET is empty or nor found";
}

appDataSource
  .initialize()
  .then(async() => {
    //Get translationService
    const translationService = container.resolve<TranslationService>(TOKENS.TranslationService);
    await translationService.init();

    //Configure passport policies
    passportConfig(appDataSource, translationService);

    //Configure all routes
    const router = express.Router();
    health(router);
    user(router);
    stash(router);

    //Attach routes to app
    app.use("/", router);

    //Add global error handler middleware
    app.use(createErrorHandler(logger, translationService));

    initDB(appDataSource, process.env.API_SILENT_INIT === "TRUE");

    //Start app
    app.listen(config.port, async() => {
      logger.info(`API is live at: http://${config.currentIp()}:${config.port}/`);
      //TODO: remove this
      let userCount = await appDataSource.getRepository(User).count();
      logger.info(`Users: ${userCount} `);
    });
  })
  .catch((error) => {
    logger.error(error);
  });

/**
 * Shows api welcome message with some parameters
 */
function welcomeMessage() {
  console.log(chalk.yellowBright(config.logo));
  console.log("==========================================");
  console.log(
    `Envault API. Logs: level=${chalk.yellowBright(config.logLevel)}, show=${chalk.yellowBright(
      config.showLogs,
    )}`,
  );
  console.log(`SHA: ${chalk.blueBright(process.env.GIT_COMMIT_SHA || "DEV")}`);
  console.log("==========================================" + "\n");
}

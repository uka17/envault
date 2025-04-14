import "reflect-metadata";
import express, { Express } from "express";
import session from "express-session";
import cors from "cors";
import bodyParser from "body-parser";

import dotenv from "dotenv";
dotenv.config();

import getAppDataSource from "../model/dataSource";
import initDB from "./scripts/init";
import config from "./src/config/config";

import health from "./src/route/health";
import user from "./src/route/user";
import stash from "./src/route/stash";
import { User } from "../model/User";
import passportConfig from "./src/config/passport";
import Translations from "../lib/Translations";
const expressListRoutes = require("express-list-routes");
import { createErrorHandler } from "./src/route/error";

import { Logger, LogLevel } from "../lib/Logger";
import chalk from "chalk";
import { DataSource } from "typeorm";
const logger = Logger.getInstance(config.showLogs, config.logLevel as LogLevel);

//Init data source
const dbURL = config.dbURL;
const showSQLLogs = config.showSQLLogs;
const appDataSource = getAppDataSource(dbURL, showSQLLogs);

welcomeMessage();

logger.info(
  `Initializing API (version=${config.version}, port=${config.port}, ENV=${process.env.ENV}, logLevel=${config.logLevel})...`
);

const app: Express = express();

app.use(cors(config.cors));
app.use(session(config.session));
app.use(bodyParser.json());

//Basic checks
if (!process.env.API_JWT_SECRET) throw "JWT_SECRET is empty or nor found";

appDataSource
  .initialize()
  .then(async () => {
    //Get translations
    const translations = new Translations(appDataSource);
    await translations.loadTranslations("en");

    //Configure passport policies
    passportConfig(appDataSource, translations);

    //Configure all routes
    const router = express.Router();
    health(router, logger, translations, appDataSource);
    user(router, logger, translations, appDataSource);
    stash(router, logger, translations, appDataSource);

    //Attach routes to app
    app.use("/", router);

    //Add global error handler middleware
    app.use(createErrorHandler(logger, translations));

    initDB(appDataSource, process.env.API_SILENT_INIT === "TRUE");

    //Start app
    app.listen(config.port, async () => {
      logger.info(
        `API is live at: http://${config.currentIp()}:${config.port}/`
      );
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
    `Envault API. Logs: level=${chalk.yellowBright(
      config.logLevel
    )}, show=${chalk.yellowBright(config.showLogs)}`
  );
  console.log(
    `SHA: ${chalk.blueBright(
      process.env.GIT_COMMIT_SHA || "DEV"
    )}, version: ${chalk.blueBright(config.version)}`
  );
  console.log("==========================================" + "\n");
}

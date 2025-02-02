import "reflect-metadata";
import express, { Express } from "express";
import session from "express-session";
import cors from "cors";
import bodyParser from "body-parser";

import dotenv from "dotenv";
dotenv.config();

import appDataSource from "./src/model/dataSource";
import config from "./src/config/config";
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "./src/swagger/swagger.json";
import health from "./src/route/health";
import user from "./src/route/user";
import stash from "./src/route/stash";
import { User } from "./src/model/User";
import passportConfig from "./src/config/passport";
import Translations from "./src/lib/Translations";
const expressListRoutes = require("express-list-routes");

import { Logger, LogLevel } from "./src/lib/logger";
import chalk from "chalk";
const logger = Logger.getInstance(config.showLogs, config.logLevel as LogLevel);

// Welcome message

console.log(chalk.yellowBright(config.logo));

console.log("==========================================");
console.log(
  `Envault API. Logs: level=${chalk.yellowBright(
    config.logLevel
  )}, show=${chalk.yellowBright(config.showLogs)}`
);
console.log("==========================================" + "\n");

logger.info(
  `Initializing API (version=${config.version}, port=${config.port}, ENV=${process.env.ENV}, logLevel=${config.logLevel})...`
);

// Welcome message END

const app: Express = express();

app.use(cors(config.cors));
app.use(session(config.session));
app.use(bodyParser.json());

//Basic checks
if (!process.env.JWT_SECRET) throw "JWT_SECRET is empty or nor found";

//Swagger
app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get("/", async (req: express.Request, res: express.Response) => {
  // #swagger.summary = 'Check if api is online'
  res.send(
    "API is online (TypeORM, Passport, Express.js)<br/><a href='/swagger/'>Swagger doc</a>"
  );
});

//Init data source and configure all routes
appDataSource
  .initialize()
  .then(async () => {
    //Get translations
    const translations = new Translations();
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

    //Start app
    app.listen(config.port, async () => {
      logger.info(
        `API is live at: http://${config.currentIp()}:${config.port}/`
      );
      let userCount = await appDataSource.getRepository(User).count();
      logger.info(`Users: ${userCount} `);
    });
  })
  .catch((error) => {
    logger.error(error);
  });

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
import passportConfig from "./src/config/passport";
import Translations from "./src/lib/Translations";

import { Logger, LogLevel } from "./src/lib/logger";
const logger = Logger.getInstance(
  process.env.ENV != "PROD",
  config.logLevel as LogLevel
);

logger.info(
  `Initializing API (version=${config.version}, port=${config.port}, ENV=${process.env.ENV}, logLevel=${config.logLevel})...`
);

const app: Express = express();

app.use(cors(config.cors));
app.use(session(config.session));
app.use(bodyParser.json());

//Basic checks
if (!process.env.JWT_SECRET) throw "JWT_SECRET is empty or nor found";

//Swagger
app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

//Init datasourse and configure all routes
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
    //Attach routes to app

    app.use(`/api/${config.version}`, router);

    //Start app
    app.listen(config.port, () => {
      logger.info(`API ${config.version} is live on ${config.port}.`);
    });
  })
  .catch((error) => {
    logger.error(error);
  });

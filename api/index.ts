import "reflect-metadata";
import express, { Express, Request, Response } from "express";
import session from "express-session";
import cors from "cors";
import bodyParser from "body-parser";

import dotenv from "dotenv";
dotenv.config();

import appDataSource from "./src/model/dataSource";
import config from "./src/config/config";
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "./src/swagger/swagger.json";
import index from "./src/route/index";
import user from "./src/route/user";
import passportConfig from "./src/config/passport";
import Translations from "./src/lib/Translations";

import { Logger, LogLevel } from "./src/lib/logger";
const logger = Logger.getInstance(true, config.logLevel as LogLevel);

const app: Express = express();

//TODO separate PROD and DEBUG runs with "const isProduction = process.env.NODE_ENV === 'production'";
app.use(cors(config.cors));
app.use(session(config.session));
app.use(bodyParser.json());

//Basic checks
if (!process.env.JWT_SECRET) throw "JWT_SECRET is empty or nor found";

//Swagger
//TODO bring more clarity and details to swagger
//TODO swagger shows paths like "ver/users"
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
    index(router, logger, translations, appDataSource);
    user(router, logger, translations, appDataSource);
    //Attach routes to app

    app.use(`/api/${config.version}`, router);
  })
  .catch((error) => logger.error(error));

//Start app
app.listen(config.port, () => {
  logger.info(`Service is live on ${config.port}.`);
});

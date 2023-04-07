import "reflect-metadata";
import express, { Express, Request, Response } from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";
import { appDataSource } from "./src/model/dataSource";
import config from "./src/config/config";
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "./src/swagger/swagger.json";
import index from "./src/route/index";

dotenv.config();
import { Logger, LogLevel } from "./src/lib/logger";
const logger = Logger.getInstance(true, config.logLevel as LogLevel);

const app: Express = express();

//TODO separate PROD and DEBUG runs with "const isProduction = process.env.NODE_ENV === 'production'";
app.use(cors(config.cors));
app.use(session(config.session));

//Swagger
//TODO bring more clarity and details to swagger
app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
/*import passportConfig from "../config/passport";
passportConfig();
*/
appDataSource
  .initialize()
  .then(() => {
    index(app, logger, appDataSource);
  })
  .catch((error) => logger.error(error));

//Start app
app.listen(config.port, () => {
  logger.info(`Service is live on ${config.port}.`);
});

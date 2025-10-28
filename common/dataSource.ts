import dotenv from "dotenv";
dotenv.config();
import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "./SnakeNamingStrategy.js";
//--Tables
import User from "#model/User.js";
import Language from "#model/Language.js";
import Translation from "#model/Translation.js";
import Text from "#model/Text.js";
import Stash from "#model/Stash.js";
import SendLog from "#model/SendLog.js";

/**
 *
 * @param dbURL URL to connect to the database
 * @returns Preconfigured DataSource
 * @param showLogs Show SQL logs
 */
function getAppDataSource(dbURL: string, showLogs = false): DataSource {
  return new DataSource({
    type: "postgres",
    url: dbURL,
    database: process.env.DB_NAME,
    entities: [User, Language, Text, Translation, Stash, SendLog],
    synchronize: true,
    logging: showLogs,
    connectTimeoutMS: 10000,
    namingStrategy: new SnakeNamingStrategy(),
  });
}

export default getAppDataSource;

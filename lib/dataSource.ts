import dotenv from "dotenv";
dotenv.config();
import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "./SnakeNamingStrategy";
//--Tables
import User from "../model/User";
import Language from "../model/Language";
import Translation from "../model/Translation";
import Text from "../model/Text";
import Stash from "../model/Stash";
import SendLog from "../model/SendLog";

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

import dotenv from "dotenv";
dotenv.config();
import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "../lib/SnakeNamingStrategy";
//--Tables
import { User } from "./User";
import { Language } from "./Language";
import { Translation } from "./Translation";
import { Text } from "./Text";
import { Stash } from "./Stash";
import { SendLog } from "./SendLog";

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

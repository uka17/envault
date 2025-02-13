import dotenv from "dotenv";
dotenv.config();
import { DataSource } from "typeorm";
import { User } from "./User";
import { Language } from "./Language";
import { Translation } from "./Translation";
import { Text } from "./Text";
import { Stash } from "./Stash";

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
    entities: [User, Language, Text, Translation, Stash],
    synchronize: true,
    logging: showLogs,
    connectTimeoutMS: 10000,
  });
}

export default getAppDataSource;

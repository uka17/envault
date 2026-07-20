import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "./SnakeNamingStrategy.js";
//--Tables
import User from "#model/User.js";
import Stash from "#model/Stash.js";
import SendLog from "#model/SendLog.js";
import Session from "#model/Session.js";

/**
 *
 * @param dbURL URL to connect to the database
 * @param dbName Database name
 * @param showLogs Show SQL logs
 * @returns Preconfigured DataSource
 */
function getAppDataSource(
  dbURL: string,
  dbName: string,
  showLogs = false,
): DataSource {
  return new DataSource({
    type: "postgres",
    url: dbURL,
    database: dbName,
    entities: [User, Stash, SendLog, Session],
    synchronize: true,
    logging: showLogs,
    connectTimeoutMS: 10000,
    namingStrategy: new SnakeNamingStrategy(),
  });
}

export default getAppDataSource;

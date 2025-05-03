import { container } from "tsyringe";
import { DataSource } from "typeorm";

import config from "api/src/config/config";
import Logger, { LogLevel } from "lib/Logger";
import { TOKENS } from "di/tokens";

import Stash from "model/Stash";
import User from "model/User";
import StashService from "service/StashService";
import SendLog from "model/SendLog";
import UserService from "service/UserService";

export default function initDI(appDataSource: DataSource) {
  const logger = new Logger(config.showLogs, config.logLevel as LogLevel);
  container.registerInstance(TOKENS.Logger, logger);

  const stashRepository = appDataSource.getRepository(Stash);
  container.registerInstance(TOKENS.StashRepository, stashRepository);

  const sendLogRepository = appDataSource.getRepository(SendLog);
  container.registerInstance(TOKENS.SendLogRepository, sendLogRepository);

  const userRepository = appDataSource.getRepository(User);
  container.registerInstance(TOKENS.UserRepository, userRepository);

  container.registerSingleton(TOKENS.StashService, StashService);
  container.registerSingleton(TOKENS.UserService, UserService);
}

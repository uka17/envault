import { container } from "tsyringe";
import { DataSource } from "typeorm";

import config from "api/src/config/config";
import Logger, { LogLevel } from "lib/Logger";
import getAppDataSource from "lib/dataSource";
import { TOKENS } from "di/tokens";

import Stash from "model/Stash";
import SendLog from "model/SendLog";

export default function initDI(appDataSource: DataSource) {
  container.register<Logger>(TOKENS.Logger, {
    useFactory: () => new Logger(config.showLogs, config.logLevel as LogLevel),
  });

  container.register(TOKENS.StashRepository, {
    useFactory: () => appDataSource.getRepository(Stash),
  });

  container.register(TOKENS.SendLogRepository, {
    useFactory: () => appDataSource.getRepository(SendLog),
  });
}

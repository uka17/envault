import { container } from "tsyringe";
import { DataSource } from "typeorm";
import { fromEnv } from "@aws-sdk/credential-providers";

import LogService, { LogLevel } from "#service/LogService.js";
import { TOKENS } from "#di/tokens.js";

import Stash from "#model/Stash.js";
import User from "#model/User.js";
import Session from "#model/Session.js";

import StashService from "#service/StashService.js";
import StashSenderService from "#service/StashSenderService.js";
import SendLog from "#model/SendLog.js";
import UserService from "#service/UserService.js";
import EmailService from "#service/EmailService.js";

import UserController from "api/src/controller/UserController.js";
import StashController from "api/src/controller/StashController.js";
import PublicStashController from "api/src/controller/PublicStashController.js";

import UserValidator from "api/src/route/validator/UserValidator.js";
import StashValidator from "api/src/route/validator/StashValidator.js";
import PublicStashValidator from "api/src/route/validator/PublicStashValidator.js";

/** Options controlling how the `LogService` registered by {@link initDI} behaves */
export interface LoggerOptions {
  /** Name of the calling process (e.g. `"api"`, `"worker"`), used as the Loki `service` label */
  service?: string;
  /** When `true`, log output is not suppressed */
  showLogs?: boolean;
  /** Minimum log level to emit */
  logLevel?: string;
  /** Grafana Cloud Loki connection details; when omitted, logs are not shipped to Loki */
  loki?: { host: string; user: string; apiKey: string };
}

/**
 * Initializes the dependency injection container, registering repositories, services,
 * controllers and validators shared by both the `api` and `worker` processes.
 * @param appDataSource Initialized TypeORM data source
 * @param loggerOptions Options for the `LogService` instance registered under `TOKENS.LogService`
 */
export default function initDI(appDataSource: DataSource, loggerOptions: LoggerOptions = {}) {
  // Register the logger
  const logger = new LogService(
    loggerOptions.service,
    loggerOptions.showLogs,
    loggerOptions.logLevel as LogLevel,
    loggerOptions.loki,
  );
  container.registerInstance(TOKENS.LogService, logger);

  // Register repositories
  const stashRepository = appDataSource.getRepository(Stash);
  container.registerInstance(TOKENS.StashRepository, stashRepository);

  const sendLogRepository = appDataSource.getRepository(SendLog);
  container.registerInstance(TOKENS.SendLogRepository, sendLogRepository);

  const userRepository = appDataSource.getRepository(User);
  container.registerInstance(TOKENS.UserRepository, userRepository);

  const sessionRepository = appDataSource.getRepository(Session);
  container.registerInstance(TOKENS.SessionRepository, sessionRepository);

  const emailCredentialsProvider = fromEnv();
  container.registerInstance(TOKENS.EmailCredentialsProvider, emailCredentialsProvider);

  // Register services
  container.registerSingleton(TOKENS.StashService, StashService);
  container.registerSingleton(TOKENS.StashSenderService, StashSenderService);
  container.registerSingleton(TOKENS.UserService, UserService);
  container.registerSingleton(TOKENS.EmailService, EmailService);

  // Register controllers
  container.registerSingleton(TOKENS.UserController, UserController);
  container.registerSingleton(TOKENS.StashController, StashController);
  container.registerSingleton(TOKENS.PublicStashController, PublicStashController);

  // Register validators
  container.registerSingleton(TOKENS.UserValidator, UserValidator);
  container.registerSingleton(TOKENS.StashValidator, StashValidator);
  container.registerSingleton(TOKENS.PublicStashValidator, PublicStashValidator);
}

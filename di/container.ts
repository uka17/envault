import { container } from "tsyringe";
import { DataSource } from "typeorm";
import { fromEnv } from "@aws-sdk/credential-providers";

//TODO Problem, as this file should be service agnostic, we should not import config from api
import config from "api/src/config/config.js";
import LogService, { LogLevel } from "#service/LogService.js";
import { TOKENS } from "#di/tokens.js";

import Stash from "#model/Stash.js";
import User from "#model/User.js";
import Session from "#model/Session.js";

import StashService from "#service/StashService.js";
import SendLog from "#model/SendLog.js";
import UserService from "#service/UserService.js";
import EmailService from "#service/EmailService.js";

import UserController from "api/src/controller/UserController.js";
import StashController from "api/src/controller/StashController.js";
import PublicStashController from "api/src/controller/PublicStashController.js";

import UserValidator from "api/src/route/validator/UserValidator.js";
import StashValidator from "api/src/route/validator/StashValidator.js";
import PublicStashValidator from "api/src/route/validator/PublicStashValidator.js";

export default function initDI(appDataSource: DataSource) {
  // Register the logger
  const logger = new LogService(config.showLogs, config.logLevel as LogLevel);
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

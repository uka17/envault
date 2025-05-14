import { container } from "tsyringe";
import { DataSource } from "typeorm";
import { fromEnv } from "@aws-sdk/credential-providers";

import config from "api/src/config/config";
import LogService, { LogLevel } from "service/LogService";
import { TOKENS } from "di/tokens";

import Stash from "model/Stash";
import User from "model/User";
import Translation from "model/Translation";

import StashService from "service/StashService";
import SendLog from "model/SendLog";
import UserService from "service/UserService";
import TranslationService from "service/TranslationService";
import EmailService from "service/EmailService";

import UserController from "api/src/controller/UserController";
import StashController from "api/src/controller/StashController";

import UserValidator from "api/src/route/validator/UserValidator";
import StashValidator from "api/src/route/validator/StashValidator";

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

  const translationRepository = appDataSource.getRepository(Translation);
  container.registerInstance(TOKENS.TranslationRepository, translationRepository);

  const emailCredentialsProvider = fromEnv();
  container.registerInstance(TOKENS.EmailCredentialsProvider, emailCredentialsProvider);

  // Register services
  container.registerSingleton(TOKENS.TranslationService, TranslationService);
  container.registerSingleton(TOKENS.StashService, StashService);
  container.registerSingleton(TOKENS.UserService, UserService);
  container.registerSingleton(TOKENS.EmailService, EmailService);

  // Register controllers
  container.registerSingleton(TOKENS.UserController, UserController);
  container.registerSingleton(TOKENS.StashController, StashController);

  // Register validators
  container.registerSingleton(TOKENS.UserValidator, UserValidator);
  container.registerSingleton(TOKENS.StashValidator, StashValidator);
}

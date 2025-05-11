import "reflect-metadata";
import sinon from "sinon";
import express from "express";
import dotenv from "dotenv";
import { container } from "tsyringe";
dotenv.config();

import getAppDataSource from "lib/dataSource";

import config from "api/src/config/config";
import passportConfig from "api/src/config/passport";
import LogService from "service/LogService";
import { TOKENS } from "di/tokens";

import { createErrorHandler } from "api/src/route/error";
import initDI from "di/container";
import initDB from "api/scripts/init";
import userRoutes from "api/src/route/user";
import stashRoutes from "api/src/route/stash";
import TranslationService from "service/TranslationService";

const dbURL = config.testDbURL;
globalThis.appDataSource = getAppDataSource(dbURL);
globalThis.translationService = null;

async function startApp() {
  await globalThis.appDataSource.initialize();
  // Mock/setup dependencies
  initDI(globalThis.appDataSource);
  await initDB(globalThis.appDataSource, true);  
  const translationService = container.resolve<TranslationService>(TOKENS.TranslationService);
  await translationService.init();
  //Suppress logs
  const loggerServiceStub = sinon.createStubInstance(LogService);
  container.registerInstance(TOKENS.LogService, loggerServiceStub);

  globalThis.app = express();
  globalThis.app.use(express.json());

  passportConfig(globalThis.appDataSource, translationService);
  userRoutes(globalThis.app);
  stashRoutes(globalThis.app);

  const errorHandler = createErrorHandler(loggerServiceStub, translationService);
  globalThis.app.use(errorHandler);
}

before(async() => {
  await startApp();
});

after(async() => {
  await globalThis.appDataSource.destroy();
});

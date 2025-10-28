import "reflect-metadata";
import sinon from "sinon";
import express from "express";
import dotenv from "dotenv";
import { container } from "tsyringe";
dotenv.config();

import getAppDataSource from "#common/dataSource.js";

import config from "api/src/config/config.js";
import passportConfig from "api/src/config/passport.js";
import LogService from "#service/LogService.js";
import { TOKENS } from "#di/tokens.js";

import createErrorHandler from "api/src/route/error.js";
import initDI from "#di/container.js";
import initTranslations from "api/scripts/initTranslations.js";
import userRoutes from "api/src/route/user.js";
import stashRoutes from "api/src/route/stash.js";
import TranslationService from "#service/TranslationService.js";

const dbURL = config.testDbURL;
globalThis.appDataSource = getAppDataSource(dbURL);
globalThis.translationService = null;

async function startApp() {
  await globalThis.appDataSource.initialize();
  // Mock/setup dependencies
  initDI(globalThis.appDataSource);
  await initTranslations(globalThis.appDataSource, true);  
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

  globalThis.app.use(createErrorHandler());
}

before(async() => {
  await startApp();
});

after(async() => {
  await globalThis.appDataSource.destroy();
});

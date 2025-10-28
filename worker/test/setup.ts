import "reflect-metadata";
import sinon from "sinon";
import dotenv from "dotenv";
import { container } from "tsyringe";
dotenv.config();

import TranslationService from "#service/TranslationService.js";
import getAppDataSource from "#common/dataSource.js";
import LogService from "#service/LogService.js";
import initDI from "#di/container.js";
import { TOKENS } from "#di/tokens.js";
import initTranslations from "api/scripts/initTranslations.js";

import config from "worker/src/config/config.js";


const dbURL = config.testDbURL;
globalThis.appDataSource = getAppDataSource(dbURL);

async function startApp() {
  await globalThis.appDataSource.initialize();
  initDI(globalThis.appDataSource);
  await initTranslations(globalThis.appDataSource, true);
  const translationService = container.resolve<TranslationService>(TOKENS.TranslationService);
  await translationService.init();

  // Mock/setup dependencies
  globalThis.mockLogService = sinon.createStubInstance(LogService);

  //Suppress logs
  const loggerServiceStub = sinon.createStubInstance(LogService);
  container.registerInstance(TOKENS.LogService, loggerServiceStub);

  globalThis.translationService = translationService;
}

before(async() => {
  await startApp();
});

after(async() => {
  await globalThis.appDataSource.destroy();
});

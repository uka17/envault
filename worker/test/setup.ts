import "reflect-metadata";
import sinon from "sinon";
import dotenv from "dotenv";
import { container } from "tsyringe";
dotenv.config();

import TranslationService from "service/TranslationService";
import getAppDataSource from "common/dataSource";
import LogService from "service/LogService";
import initDI from "di/container";
import { TOKENS } from "di/tokens";
import initDB from "api/scripts/initTranslations";

import config from "worker/src/config/config";


const dbURL = config.testDbURL;
globalThis.appDataSource = getAppDataSource(dbURL);

async function startApp() {
  await globalThis.appDataSource.initialize();
  initDI(globalThis.appDataSource);
  await initDB(globalThis.appDataSource, process.env.API_SILENT_INIT === "TRUE");
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

import "reflect-metadata";
import sinon from "sinon";
import dotenv from "dotenv";
import { container } from "tsyringe";
dotenv.config();

import getAppDataSource from "#common/dataSource.js";
import LogService from "#service/LogService.js";
import initDI from "#di/container.js";
import { TOKENS } from "#di/tokens.js";

import config from "worker/src/config/config.js";


const dbURL = config.testDbURL;
globalThis.appDataSource = getAppDataSource(dbURL);

async function startApp() {
  await globalThis.appDataSource.initialize();
  initDI(globalThis.appDataSource);

  // Mock/setup dependencies
  globalThis.mockLogService = sinon.createStubInstance(LogService);

  //Suppress logs
  const loggerServiceStub = sinon.createStubInstance(LogService);
  container.registerInstance(TOKENS.LogService, loggerServiceStub);
}

before(async() => {
  await startApp();
});

after(async() => {
  await globalThis.appDataSource.destroy();
});

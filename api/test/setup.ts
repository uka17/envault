import "dotenv/config";
import "reflect-metadata";
import sinon from "sinon";
import express from "express";
import cookieParser from "cookie-parser";
import { container } from "tsyringe";

import getAppDataSource from "#common/dataSource.js";

import config from "api/src/config/config.js";
import passportConfig from "api/src/config/passport.js";
import LogService from "#service/LogService.js";
import { TOKENS } from "#di/tokens.js";

import createErrorHandler from "api/src/route/error.js";
import initDI from "#di/container.js";
import userRoutes from "api/src/route/user.js";
import stashRoutes from "api/src/route/stash.js";
import publicStashRoutes from "api/src/route/publicStash.js";

const dbURL = config.testDbURL;
globalThis.appDataSource = getAppDataSource(dbURL, config.testDbName);

async function startApp() {
  await globalThis.appDataSource.initialize();
  // Mock/setup dependencies
  initDI(globalThis.appDataSource);

  //Suppress logs
  const loggerServiceStub = sinon.createStubInstance(LogService);
  container.registerInstance(TOKENS.LogService, loggerServiceStub);

  globalThis.app = express();
  globalThis.app.use(cookieParser());
  globalThis.app.use(express.json());

  passportConfig(globalThis.appDataSource, config.jwtSecret);
  userRoutes(globalThis.app);
  stashRoutes(globalThis.app);
  publicStashRoutes(globalThis.app);

  globalThis.app.use(createErrorHandler());
}

before(async() => {
  await startApp();
});

after(async() => {
  await globalThis.appDataSource.destroy();
});

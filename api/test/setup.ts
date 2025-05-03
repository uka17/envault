import "reflect-metadata";
import sinon from "sinon";
import express from "express";
import dotenv from "dotenv";
import { container } from "tsyringe";
dotenv.config();

import getAppDataSource from "lib/dataSource";

import config from "api/src/config/config";
import passportConfig from "api/src/config/passport";
import { Logger } from "lib/Logger";
import initDI from "di/container";
import { TOKENS } from "di/tokens";

import { createErrorHandler } from "api/src/route/error";
import userRoutes from "api/src/route/user";
import stashRoutes from "api/src/route/stash";
import TranslationService from "service/TranslationService";

const dbURL = config.testDbURL;

globalThis.appDataSource = getAppDataSource(dbURL);
globalThis.translationService = null;

async function startApp() {
  await globalThis.appDataSource.initialize();
  initDI(globalThis.appDataSource);
  // Mock/setup dependencies
  globalThis.mockLogger = sinon.createStubInstance(Logger);

  globalThis.translationService = container.resolve<TranslationService>(
    TOKENS.TranslationService
  );

  globalThis.app = express();
  globalThis.app.use(express.json());

  userRoutes(
    globalThis.app,
    globalThis.mockLogger,
    globalThis.translationService
  );
  stashRoutes(globalThis.app, globalThis.translationService);

  globalThis.app.use(
    createErrorHandler(globalThis.mockLogger, globalThis.translationService)
  );

  passportConfig(globalThis.appDataSource, globalThis.translationService);
}

before(async () => {
  await startApp();
});

after(async () => {
  await globalThis.appDataSource.destroy();
});

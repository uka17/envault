import sinon from "sinon";
import express from "express";
import dotenv from "dotenv";
dotenv.config();

import getAppDataSource from "model/dataSource";

import config from "api/src/config/config";
import passportConfig from "api/src/config/passport";
import Translations from "lib/Translations";
import { Logger } from "lib/Logger";

import { createErrorHandler } from "api/src/route/error";
import userRoutes from "api/src/route/user";
import stashRoutes from "api/src/route/user";

const dbURL = config.testDbURL;

globalThis.appDataSource = getAppDataSource(dbURL);
globalThis.translations = null;

async function startApp() {
  // Mock/setup dependencies
  globalThis.mockLogger = sinon.createStubInstance(Logger);

  await globalThis.appDataSource.initialize();

  globalThis.translations = new Translations(globalThis.appDataSource);
  await globalThis.translations.loadTranslations("en");

  globalThis.app = express();
  globalThis.app.use(express.json());
  userRoutes(
    globalThis.app,
    globalThis.mockLogger,
    globalThis.translations,
    globalThis.appDataSource
  );

  stashRoutes(
    globalThis.app,
    globalThis.mockLogger,
    globalThis.translations,
    globalThis.appDataSource
  );

  globalThis.app.use(
    createErrorHandler(globalThis.mockLogger, globalThis.translations)
  );

  passportConfig(globalThis.appDataSource, globalThis.translations);
}

before(async () => {
  await startApp();
});

after(async () => {
  await globalThis.appDataSource.destroy();
});

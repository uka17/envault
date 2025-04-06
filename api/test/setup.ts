import Translations from "../../lib/Translations";
import getAppDataSource from "../../model/dataSource";
import config from "../src/config/config";
import sinon from "sinon";
import { Logger } from "../../lib/Logger";
import express from "express";
import passportConfig from "../src/config/passport";
import UserService from "../../service/UserService";
import { createErrorHandler } from "../src/route/error";
import userRoutes from "../src/route/user";

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

  globalThis.app.use(
    createErrorHandler(globalThis.mockLogger, globalThis.translations)
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

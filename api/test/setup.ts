import Translations from "../../lib/Translations";
import getAppDataSource from "../../model/dataSource";
import config from "../src/config/config";
import sinon from "sinon";
import { Logger } from "../../lib/Logger";
import express from "express";
import passportConfig from "../src/config/passport";
import UserService from "../../service/UserService";

const dbURL = config.testDbURL;

globalThis.appDataSource = getAppDataSource(dbURL);
globalThis.translations = null;

async function startApp() {
  // Mock/setup dependencies
  globalThis.mockLogger = sinon.createStubInstance(Logger);

  globalThis.app = express();
  globalThis.app.use(express.json());

  await globalThis.appDataSource.initialize();

  globalThis.translations = new Translations(globalThis.appDataSource);
  await globalThis.translations.loadTranslations("en");

  passportConfig(globalThis.appDataSource, globalThis.translations);
}

before(async () => {
  await startApp();
});

after(async () => {
  await globalThis.appDataSource.destroy();
});

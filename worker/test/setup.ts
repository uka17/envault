import sinon from "sinon";
import express from "express";
import dotenv from "dotenv";
dotenv.config();

import Translations from "lib/Translations";
import getAppDataSource from "model/dataSource";
import config from "../src/config/config";

import { Logger } from "lib/Logger";

const dbURL = config.testDbURL;
console.log(dbURL);
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
}

before(async () => {
  await startApp();
});

after(async () => {
  await globalThis.appDataSource.destroy();
});

import "reflect-metadata";
import sinon from "sinon";
import express from "express";
import dotenv from "dotenv";
import { container } from "tsyringe";
dotenv.config();

import TranslationService from "service/TranslationService";
import getAppDataSource from "lib/dataSource";
import { TOKENS } from "di/tokens";

import config from "../src/config/config";

import { Logger } from "lib/Logger";
import initDI from "di/container";

const dbURL = config.testDbURL;
globalThis.appDataSource = getAppDataSource(dbURL);
globalThis.translationService = null;

async function startApp() {
  // Mock/setup dependencies
  globalThis.mockLogger = sinon.createStubInstance(Logger);

  globalThis.app = express();
  globalThis.app.use(express.json());

  await globalThis.appDataSource.initialize();
  initDI(globalThis.appDataSource);
  globalThis.translationService = container.resolve<TranslationService>(
    TOKENS.TranslationService
  );
}

before(async () => {
  await startApp();
});

after(async () => {
  await globalThis.appDataSource.destroy();
});

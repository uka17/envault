import "dotenv/config";
import "reflect-metadata";
import { container } from "tsyringe";

import config from "worker/src/config/config.js";
import getAppDataSource from "#common/dataSource.js";
import LogService from "#service/LogService.js";
import { TOKENS } from "#di/tokens.js";
import initDI from "#di/container.js";

import StashSenderService from "#service/StashSenderService.js";

/**
 * Initializes the worker process: sets up the database connection and DI
 * container, immediately catches up on any already-due stashes, then starts
 * the periodic send loop.
 */
async function init() {
  //Init data source
  const dbURL = config.dbURL;
  const appDataSource = getAppDataSource(dbURL, config.dbName);
  await appDataSource.initialize();
  initDI(appDataSource, {
    service: "worker",
    showLogs: config.showLogs,
    logLevel: config.logLevel,
    loki: config.loki.host ? config.loki : undefined,
  });

  const logger = container.resolve<LogService>(TOKENS.LogService);
  const stashSenderService = container.resolve<StashSenderService>(TOKENS.StashSenderService);

  logger.info(`Initializing service (logLevel=${config.logLevel})...`);

  /**
   * Runs one claim-and-send pass, logging (but never throwing) on
   * unexpected errors so a single bad tick cannot crash the worker process.
   * @returns Nothing
   */
  const tick = async() => {
    try {
      await stashSenderService.processDueStashes(config.stashBatchSize, config.staleLockThresholdMs);
    } catch (error) {
      logger.error(error);
    }
  };

  // Catch-up: process any stashes that are already due before waiting for the first tick.
  await tick();

  // Periodic watch loop.
  setInterval(tick, config.runInterval);
}

init();

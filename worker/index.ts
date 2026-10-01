import "dotenv/config";
import "reflect-metadata";
import { container } from "tsyringe";

import config from "worker/src/config/config.js";
import getAppDataSource from "#common/dataSource.js";
import LogService from "#service/LogService.js";
import { TOKENS } from "#di/tokens.js";
import initDI from "#di/container.js";
import { validateRuntimeConfigOrExit } from "#common/runtimeConfig.js";
import { exitOnStartupError } from "#common/startup.js";

import StashSenderService from "#service/StashSenderService.js";
import { clearHeartbeat, writeHeartbeat } from "worker/src/heartbeat.js";

validateRuntimeConfigOrExit("worker");

/**
 * Initializes the worker process: sets up the database connection and DI
 * container, immediately catches up on any already-due stashes, then starts
 * the periodic send loop.
 */
async function init() {
  // A heartbeat of a previous process must not make this one look alive before its first pass.
  clearHeartbeat(config.heartbeat.file);

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
   * Records delivery progress for the container health check. A failed write is only logged:
   * it must not interrupt delivery, and the stale heartbeat reports the problem by itself.
   * @returns Nothing
   */
  const reportProgress = () => {
    try {
      writeHeartbeat(config.heartbeat.file);
    } catch (error) {
      logger.error(error);
    }
  };

  /**
   * Runs one sequential delivery pass, logging (but never throwing) on
   * unexpected errors so a single bad tick cannot crash the worker process.
   * @returns Nothing
   */
  const tick = async() => {
    try {
      await stashSenderService.processDueStashes(reportProgress);
    } catch (error) {
      logger.error(error);
    }
  };

  // Catch-up: process any stashes that are already due before waiting for the first tick.
  await tick();

  // Periodic watch loop.
  setInterval(tick, config.runInterval);
}

init().catch((error) => exitOnStartupError("worker", error));

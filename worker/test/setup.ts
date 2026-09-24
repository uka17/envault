import "dotenv/config";
import "reflect-metadata";
import sinon from "sinon";
import { container } from "tsyringe";

import getAppDataSource from "#common/dataSource.js";
import LogService from "#service/LogService.js";
import EmailService from "#service/EmailService.js";
import initDI from "#di/container.js";
import { TOKENS } from "#di/tokens.js";

import config from "worker/src/config/config.js";


const dbURL = config.testDbURL;
globalThis.appDataSource = getAppDataSource(dbURL, config.testDbName);

// Dedicated sandbox so individual tests' own `sinon.restore()` calls never undo this guard:
// any test that forgets to stub EmailService.send must still hit a fake transport, never real SES.
const emailGuardSandbox = sinon.createSandbox();

async function startApp() {
  await globalThis.appDataSource.initialize();
  initDI(globalThis.appDataSource);

  // Mock/setup dependencies
  globalThis.mockLogService = sinon.createStubInstance(LogService);

  //Suppress logs
  const loggerServiceStub = sinon.createStubInstance(LogService);
  container.registerInstance(TOKENS.LogService, loggerServiceStub);

  // Safety net: never let a test that forgets to stub EmailService.send reach real AWS SES.
  const emailService = container.resolve<EmailService>(TOKENS.EmailService);
  emailGuardSandbox.stub((emailService as any).transporter, "sendMail")
    .resolves({ messageId: "test-message-id" });
}

before(async() => {
  await startApp();
});

after(async() => {
  emailGuardSandbox.restore();
  await globalThis.appDataSource.destroy();
});

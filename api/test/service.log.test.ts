import { expect } from "chai";
import sinon from "sinon";

import LogService from "#service/LogService.js";
import { LogLevel } from "#service/LogService.js";

const logService = new LogService("api", false, LogLevel.Info);

describe("Log service", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("Regular logic", () => {
    it("should log info", async() => {
      const winstonLogger = (logService as any).winstonLogger;
      const stub = sinon.stub(winstonLogger, "info");
      logService.info("test info");
      expect(stub.calledOnce).to.be.true;
    });

    it("should log warn", async() => {
      const winstonLogger = (logService as any).winstonLogger;
      const stub = sinon.stub(winstonLogger, "warn");
      logService.warn("test warn");
      expect(stub.calledOnce).to.be.true;
    });

    it("should log error", async() => {
      const winstonLogger = (logService as any).winstonLogger;
      const stub = sinon.stub(winstonLogger, "error");
      logService.error("test error");
      expect(stub.calledOnce).to.be.true;
    });
  });

  describe("Loki transport", () => {
    it("should not add a Loki transport when no Loki config is provided", () => {
      const winstonLogger = (logService as any).winstonLogger;
      expect(winstonLogger.transports).to.have.lengthOf(2);
    });

    it("should not add a Loki transport when the Loki host is empty", () => {
      const noHostLogService = new LogService("api", false, LogLevel.Info, {
        host: "",
        user: "test-user",
        apiKey: "test-api-key",
      });
      const winstonLogger = (noHostLogService as any).winstonLogger;
      expect(winstonLogger.transports).to.have.lengthOf(2);
    });
  });

  describe("getActiveTransports", () => {
    it("should list only the file and console transports when Loki is not configured", () => {
      expect(logService.getActiveTransports()).to.deep.equal(["File", "Console"]);
    });
  });
});

import { expect } from "chai";
import sinon from "sinon";
import { MESSAGE } from "triple-beam";

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

    it("should include the actual message and stack when logging an Error instance", async() => {
      // Note the inverted `silent` naming (see LogService's constructor
      // JSDoc): passing `true` here actually makes winston non-silent, so
      // this instance really writes to its transports instead of
      // discarding everything in `Transform._transform`.
      const activeLogService = new LogService("api", true, LogLevel.Info);
      const winstonLogger = (activeLogService as any).winstonLogger;
      const consoleTransport = winstonLogger.transports.find(
        (transport: any) => transport.constructor.name === "Console",
      );

      const logged = new Promise<any>((resolve) => {
        sinon.stub(consoleTransport, "log").callsFake((info: any, callback: () => void) => {
          callback();
          resolve(info);
        });
      });

      activeLogService.error(new Error("boom test message"));
      const info = await logged;

      const formatted = info[MESSAGE];
      expect(formatted).to.not.include("undefined");
      expect(formatted).to.include("boom test message");
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

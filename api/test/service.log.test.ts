import { expect } from "chai";
import sinon from "sinon";

import LogService from "service/LogService";
import { LogLevel } from "service/LogService";

const logService = new LogService(false, LogLevel.Info);

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
});

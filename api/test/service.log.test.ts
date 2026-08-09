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

    it("should not throw when logging an object with a circular reference", () => {
      const winstonLogger = (logService as any).winstonLogger;
      const stub = sinon.stub(winstonLogger, "info");
      const circular: any = { name: "circular" };
      circular.self = circular;

      expect(() => logService.info(circular)).to.not.throw();

      const passed = stub.firstCall.args[0];
      expect(() => JSON.stringify(passed)).to.not.throw();
      expect(passed.self).to.equal("[Circular]");
    });

    it("should not throw when logging an object containing a BigInt", () => {
      const winstonLogger = (logService as any).winstonLogger;
      const stub = sinon.stub(winstonLogger, "info");

      expect(() => logService.info({ big: BigInt(42) })).to.not.throw();

      const passed = stub.firstCall.args[0];
      expect(passed.big).to.equal("42");
    });

    it("should preserve custom enumerable properties of an Error", () => {
      const winstonLogger = (logService as any).winstonLogger;
      const stub = sinon.stub(winstonLogger, "error");

      class CustomError extends Error {
        code: string;
        constructor(message: string, code: string) {
          super(message);
          this.code = code;
        }
      }
      logService.error(new CustomError("boom", "E_BOOM"));

      const passed = stub.firstCall.args[0];
      expect(passed.message).to.equal("boom");
      expect(passed.code).to.equal("E_BOOM");
      expect(passed.stack).to.be.a("string");
    });

    it("should stringify non-string custom properties of an Error", () => {
      // Real-world trigger: AWS SDK's CredentialsProviderError carries a boolean
      // `tryNextLink` field. winston-loki ships every extra field as Loki "structured
      // metadata", which Grafana Loki's push API only accepts as string values - a
      // non-string value there makes Loki reject the whole batch.
      const winstonLogger = (logService as any).winstonLogger;
      const stub = sinon.stub(winstonLogger, "error");

      class CredentialsProviderError extends Error {
        tryNextLink: boolean;
        attempt: number;
        constructor(message: string) {
          super(message);
          this.tryNextLink = true;
          this.attempt = 3;
        }
      }
      logService.error(new CredentialsProviderError("Unable to find environment variable credentials."));

      const passed = stub.firstCall.args[0];
      expect(passed.tryNextLink).to.equal("true");
      expect(passed.attempt).to.equal("3");
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

    it("should drop a rejected batch instead of requeuing it forever", async function() {
      // winston-loki's Batcher#close() only short-circuits the wait between batches if
      // it runs *after* the send loop has reached it; closing right after construction
      // can race that and fall back to waiting out the full default interval (5s).
      this.timeout(7000);
      const lokiLogService = new LogService("api", false, LogLevel.Info, {
        host: "https://loki.example.com",
        user: "test-user",
        apiKey: "test-api-key",
      });
      const winstonLogger = (lokiLogService as any).winstonLogger;
      const lokiTransport = winstonLogger.transports.find(
        (transport: any) => transport.constructor.name === "LokiTransport",
      );

      try {
        expect((lokiTransport as any).batcher.options.clearOnError).to.be.true;
      } finally {
        // The batcher starts a real background send loop on construction; close it so it
        // doesn't keep a timer alive past this test (mocha here runs without `--exit`).
        await (lokiTransport as any).batcher.close();
      }
    });
  });

  describe("getActiveTransports", () => {
    it("should list only the file and console transports when Loki is not configured", () => {
      expect(logService.getActiveTransports()).to.deep.equal(["File", "Console"]);
    });
  });
});

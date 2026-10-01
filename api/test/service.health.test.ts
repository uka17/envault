import { expect } from "chai";
import sinon from "sinon";
import { DataSource } from "typeorm";

import HealthService from "#service/HealthService.js";
import LogService from "#service/LogService.js";

describe("HealthService", () => {
  let logger: sinon.SinonStubbedInstance<LogService>;

  beforeEach(() => {
    logger = sinon.createStubInstance(LogService);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("isDatabaseReady", () => {
    it("should return true when the real database answers", async() => {
      const service = new HealthService(globalThis.appDataSource, logger);

      expect(await service.isDatabaseReady(3000)).to.be.true;
      expect(logger.error.called).to.be.false;
    });

    it("should return false and log the reason when the query fails", async() => {
      const failure = new Error("connection terminated");
      const dataSource = { query: sinon.stub().rejects(failure) } as unknown as DataSource;
      const service = new HealthService(dataSource, logger);

      expect(await service.isDatabaseReady(3000)).to.be.false;
      expect(logger.error.calledOnceWith(failure)).to.be.true;
    });

    it("should return false when the database hangs longer than the timeout", async() => {
      const dataSource = { query: () => new Promise(() => {}) } as unknown as DataSource;
      const service = new HealthService(dataSource, logger);

      expect(await service.isDatabaseReady(20)).to.be.false;
      expect(String(logger.error.firstCall.args[0])).to.include("did not answer in 20 ms");
    });
  });
});

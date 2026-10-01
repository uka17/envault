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

    it("should not start another query while one is unanswered, so a stall cannot exhaust the pool", async() => {
      const query = sinon.stub().returns(new Promise(() => {}));
      const service = new HealthService({ query } as unknown as DataSource, logger);

      expect(await service.isDatabaseReady(20)).to.be.false;
      expect(await service.isDatabaseReady(20)).to.be.false;
      expect(await service.isDatabaseReady(20)).to.be.false;

      expect(query.calledOnce).to.be.true;
    });

    it("should probe again once the previous query was answered, so recovery is noticed", async() => {
      let answer: () => void = () => {};
      const query = sinon.stub();
      query.onFirstCall().returns(new Promise<void>((resolve) => {
        answer = resolve;
      }));
      query.onSecondCall().resolves();
      const service = new HealthService({ query } as unknown as DataSource, logger);

      expect(await service.isDatabaseReady(20)).to.be.false;
      answer();
      await new Promise((resolve) => setImmediate(resolve));

      expect(await service.isDatabaseReady(20)).to.be.true;
      expect(query.calledTwice).to.be.true;
    });

    it("should probe again after a failed query", async() => {
      const query = sinon.stub();
      query.onFirstCall().rejects(new Error("connection terminated"));
      query.onSecondCall().resolves();
      const service = new HealthService({ query } as unknown as DataSource, logger);

      expect(await service.isDatabaseReady(3000)).to.be.false;
      expect(await service.isDatabaseReady(3000)).to.be.true;
      expect(query.calledTwice).to.be.true;
    });
  });
});

import { expect } from "chai";
import request from "supertest";
import express from "express";
import sinon from "sinon";

import { CODES } from "#common/constants.js";
import healthRoutes from "api/src/route/health.js";

describe("Health routes", () => {
  let app: express.Express;

  before(() => {
    app = express();
    healthRoutes(app);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("GET /ready", () => {
    it("should report ready with the running version while the database answers", async() => {
      const response = await request(app).get("/ready").send();

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body).to.deep.equal({ status: "ok", version: process.env.GIT_COMMIT_SHA || "DEV" });
    });

    it("should report 503 when the database fails, so a deploy cannot pass on a dead database", async() => {
      sinon.stub(globalThis.appDataSource, "query").rejects(new Error("connection terminated"));

      const response = await request(app).get("/ready").send();

      expect(response.status).to.equal(CODES.API_SERVICE_UNAVAILABLE);
      expect(response.body.status).to.equal("unavailable");
    });
  });

  describe("GET /health", () => {
    it("should stay 200 without the database, as it only shows that the process is alive", async() => {
      const queryStub = sinon.stub(globalThis.appDataSource, "query").rejects(new Error("connection terminated"));

      const response = await request(app).get("/health").send();

      expect(response.status).to.equal(CODES.API_OK);
      expect(queryStub.called).to.be.false;
    });
  });
});

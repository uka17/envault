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

  describe("GET /", () => {
    it("should show the running commit, so the deployed version can be read from the root page", async() => {
      const saved = process.env.GIT_COMMIT_SHA;
      process.env.GIT_COMMIT_SHA = "0123456789abcdef";
      try {
        const response = await request(app).get("/").send();

        expect(response.status).to.equal(CODES.API_OK);
        expect(response.text).to.include("API is online");
        expect(response.text).to.include("SHA: 0123456789abcdef");
      } finally {
        if (saved === undefined) {
          delete process.env.GIT_COMMIT_SHA;
        } else {
          process.env.GIT_COMMIT_SHA = saved;
        }
      }
    });
  });

  describe("GET /swagger/openapi.json", () => {
    it("should document both probes, so the published spec matches the health routes", async() => {
      const response = await request(app).get("/swagger/openapi.json").send();

      expect(response.status).to.equal(CODES.API_OK);
      expect(response.body.paths).to.include.keys("/health", "/ready");
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

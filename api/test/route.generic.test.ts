// config.test.ts
import { expect } from "chai";
import request from "supertest";

import config from "api/src/config/config";
import { CODES } from "common/constants";

describe("Config", () => {
  it("should return valid IP", async() => {
    expect(config.currentIp()).to.be.a("string");
  });
});

describe("Default routes", () => {
  it("should return 404 for non existing route", async() => {
    const response = await request(globalThis.app).get("/api/v1/nonexistent").send();

    expect(response.status).to.equal(CODES.API_NOT_FOUND);
  });
});

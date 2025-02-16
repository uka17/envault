// config.test.ts
import { expect } from "chai";
import config from "../src/config/config";

describe("config.currentIp", () => {
  it("should return valid IP", async () => {
    expect(config.currentIp()).to.be.a("string");
  });
});

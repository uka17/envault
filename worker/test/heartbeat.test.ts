import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";

import config from "worker/src/config/config.js";
import { clearHeartbeat, isHeartbeatFresh, writeHeartbeat } from "worker/src/heartbeat.js";

describe("Worker heartbeat", () => {
  const staleAfterMs = 1000;
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "envault-heartbeat-test-"));
    file = path.join(dir, "heartbeat");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("should be fresh right after the worker reported progress", () => {
    writeHeartbeat(file);

    expect(isHeartbeatFresh(file, staleAfterMs)).to.be.true;
  });

  it("should turn stale once the worker stops reporting, so a stuck worker is detected", () => {
    const beatAt = Date.now();
    writeHeartbeat(file, beatAt);

    expect(isHeartbeatFresh(file, staleAfterMs, beatAt + staleAfterMs)).to.be.true;
    expect(isHeartbeatFresh(file, staleAfterMs, beatAt + staleAfterMs + 1)).to.be.false;
  });

  it("should be fresh again after new progress", () => {
    const beatAt = Date.now();
    writeHeartbeat(file, beatAt);
    writeHeartbeat(file, beatAt + 5000);

    expect(isHeartbeatFresh(file, staleAfterMs, beatAt + 5000)).to.be.true;
  });

  it("should be stale without a heartbeat, as a worker which never completed a pass is not alive", () => {
    expect(isHeartbeatFresh(file, staleAfterMs)).to.be.false;
  });

  for (const content of ["", "   ", "not-a-timestamp"]) {
    it(`should be stale for an unreadable heartbeat (${JSON.stringify(content)})`, () => {
      fs.writeFileSync(file, content);

      expect(isHeartbeatFresh(file, staleAfterMs)).to.be.false;
    });
  }

  it("should drop the heartbeat of a previous process on start", () => {
    writeHeartbeat(file);

    clearHeartbeat(file);

    expect(isHeartbeatFresh(file, staleAfterMs)).to.be.false;
  });

  it("should not fail on start when there is no previous heartbeat", () => {
    expect(() => clearHeartbeat(file)).to.not.throw();
  });

  it("should tolerate the longest single send before reporting a stuck worker", () => {
    // One message can take 3 SES attempts of connection + request timeout (api/src/config/config.ts).
    const longestSendMs = 3 * (3000 + 10000);

    expect(config.heartbeat.staleAfterMs).to.be.above(longestSendMs);
  });
});

// config.test.ts
import { expect } from "chai";
import sinon from "sinon";

import StashService from "service/StashService";

describe("Stash service", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("should log sending email", async () => {
    let stashService: StashService = new StashService(
      globalThis.appDataSource,
      globalThis.mockLogger
    );

    sinon
      .stub(globalThis.appDataSource.manager, "save")
      .throws(new Error("Unexpected error"));

    const loggerStub = { error: sinon.stub() };
    (stashService as any).logger = loggerStub;

    let result = await stashService.log(1, {} as any, "msg-1");

    expect(result).to.be.null;
    expect(loggerStub.error.called).to.be.true;
  });
});

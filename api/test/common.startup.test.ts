import { expect } from "chai";
import sinon from "sinon";

import { exitOnStartupError } from "#common/startup.js";

describe("Startup failure", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("should exit with code 1 so Docker and the deploy see a failed start", () => {
    const exitStub = sinon.stub(process, "exit");
    const errorStub = sinon.stub(console, "error");

    exitOnStartupError("api", new Error("connect ECONNREFUSED"));

    expect(exitStub.calledOnceWith(1)).to.be.true;
    expect(errorStub.firstCall.args[0]).to.equal("api failed to start: connect ECONNREFUSED");
  });

  it("should print only the message, never fields of the error object", () => {
    sinon.stub(process, "exit");
    const errorStub = sinon.stub(console, "error");
    const error = Object.assign(new Error("password authentication failed"), { password: "super-secret-password" });

    exitOnStartupError("worker", error);

    expect(errorStub.calledOnce).to.be.true;
    expect(errorStub.firstCall.args).to.have.length(1);
    expect(errorStub.firstCall.args[0]).to.not.include("super-secret-password");
  });
});

import { expect } from "chai";

describe("Service tests", () => {
  before(async() => {

  });

  after(async() => {});

  describe("Example test", () => {
    it("should do a simple test", async() => {
      expect(true).to.equal(true);
    });
  });
});

describe("Gate check", () => {
  it("fails on purpose to prove that a failing test blocks image publishing", () => {
    expect(true).to.equal(false);
  });
});

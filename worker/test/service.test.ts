// user.test.ts
import { expect } from "chai";
import { customAlphabet } from "nanoid";
const userId = customAlphabet("1234567890abcdef", 10);

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

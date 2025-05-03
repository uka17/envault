// user.test.ts
import request from "supertest";
import { expect } from "chai";
import userRoutes from "../../api/src/route/user";
import { customAlphabet } from "nanoid";
const userId = customAlphabet("1234567890abcdef", 10);

describe("Service tests", () => {
  before(async () => {
    userRoutes(
      globalThis.app,
      globalThis.mockLogger,
      globalThis.translationService
    );
  });

  after(async () => {});

  describe("Example test", () => {
    it("should do a simple test", async () => {
      expect(true).to.equal(true);
    });
  });
});

// user.test.ts
import request from "supertest";
import { expect } from "chai";
import userRoutes from "../src/route/user";
import { customAlphabet } from "nanoid";
const userId = customAlphabet("1234567890abcdef", 10);

describe("User Routes", () => {
  before(async () => {
    userRoutes(
      globalThis.app,
      globalThis.mockLogger,
      globalThis.translations,
      globalThis.appDataSource
    );
  });

  after(async () => {});

  describe("POST /api/v1/users", () => {
    it("should register a new user", async () => {
      const newUser = {
        email: `${userId()}@test.com`,
        password: `Password${userId()}`,
        name: `user${userId()}`,
      };

      const response = await request(globalThis.app)
        .post("/api/v1/users")
        .send(newUser);
      expect(response.body.error).to.not.exist;
      expect(response.body.name).to.exist;
      expect(response.status).to.equal(201);
    });
  });
});

import request from "supertest";
import { expect } from "chai";
import sinon from "sinon";
import { randomUUID } from "node:crypto";

import { container } from "tsyringe";
import { TOKENS } from "#di/tokens.js";
import StashService from "#service/StashService.js";
import Stash from "#model/Stash.js";
import { registerAndVerifyUser } from "./helpers.js";

/**
 * Registers and verifies an account, then authenticates it through the API.
 * @returns The authenticated user's ID and access token
 */
async function createAccount(): Promise<{ id: number; token: string }> {
  const credentials = { email: `${randomUUID()}@example.com`, password: "TestPassword123!", name: "Test User" };
  const created = await registerAndVerifyUser(credentials);
  expect(created.status).to.equal(201);
  const login = await request(globalThis.app).post("/api/v1/users/login").send(credentials);
  expect(login.status).to.equal(200);
  return { id: created.body.id, token: login.body.token };
}

describe("Private stash ownership", () => {
  let owner: { id: number; token: string };
  let other: { id: number; token: string };
  let stash: Stash;
  const payload = {
    body: "v1.c2FsdA==.aXY=.ownership-test-ciphertext",
    to: "recipient@example.com",
    scheduledAt: "2030-01-01T12:00:00.000Z",
  };

  before(async() => {
    owner = await createAccount();
    other = await createAccount();
  });

  beforeEach(async() => {
    const response = await request(globalThis.app).post("/api/v1/stashes")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ ...payload, userId: other.id, user: { id: other.id } });
    expect(response.status).to.equal(201);
    expect(response.body.publicAccessToken).to.be.undefined;
    stash = await globalThis.appDataSource.getRepository(Stash).findOneByOrFail({ id: response.body.id });
  });

  afterEach(async() => {
    sinon.restore();
    await globalThis.appDataSource.getRepository(Stash).delete(stash.id);
  });

  for (const { method, suffix } of [
    { method: "get", suffix: "" },
    { method: "delete", suffix: "" },
    { method: "post", suffix: "/snooze/24" },
  ] as const) {
    it(`should hide foreign and missing stashes identically for ${method} ${suffix}`, async() => {
      const foreign = await request(globalThis.app)[method](`/api/v1/stashes/${stash.id}${suffix}`)
        .set("Authorization", `Bearer ${other.token}`)
        .send({ userId: owner.id, user: { id: owner.id } });
      const missing = await request(globalThis.app)[method](`/api/v1/stashes/2147483647${suffix}`)
        .set("Authorization", `Bearer ${other.token}`);

      expect(foreign.status).to.equal(404);
      expect(missing.status).to.equal(404);
      expect(foreign.body).to.deep.equal({ code: "stash_not_found", message: "Stash not found", errors: [] });
      expect(foreign.body).to.deep.equal(missing.body);
      const persisted = await globalThis.appDataSource.getRepository(Stash).findOneOrFail({
        where: { id: stash.id }, relations: { user: true, modifiedBy: true },
      });
      expect(persisted.user.id).to.equal(owner.id);
      expect(persisted.modifiedBy.id).to.equal(owner.id);
      expect(persisted.scheduledAt.getTime()).to.equal(stash.scheduledAt.getTime());
      expect(persisted.modifiedOn.getTime()).to.equal(stash.modifiedOn.getTime());
      expect(persisted.body).to.equal(stash.body);
      expect(persisted.to).to.equal(stash.to);
    });

    it(`should require authentication for ${method} ${suffix}`, async() => {
      const response = await request(globalThis.app)[method](`/api/v1/stashes/${stash.id}${suffix}`);
      expect(response.status).to.equal(401);
      const persisted = await globalThis.appDataSource.getRepository(Stash).findOneByOrFail({ id: stash.id });
      expect(persisted.scheduledAt.getTime()).to.equal(stash.scheduledAt.getTime());
    });
  }

  it("should scope creation, listing and reading to the authenticated account", async() => {
    const ownerList = await request(globalThis.app).get("/api/v1/stashes")
      .set("Authorization", `Bearer ${owner.token}`);
    const otherList = await request(globalThis.app).get("/api/v1/stashes")
      .set("Authorization", `Bearer ${other.token}`);
    const ownerRead = await request(globalThis.app).get(`/api/v1/stashes/${stash.id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(ownerList.status).to.equal(200);
    expect(ownerList.body.map((item: Stash) => item.id)).to.deep.equal([stash.id]);
    expect(otherList.status).to.equal(200);
    expect(otherList.body).to.deep.equal([]);
    expect(ownerRead.status).to.equal(200);
    expect(ownerRead.body.body).to.equal(payload.body);
    expect(ownerRead.body.to).to.equal(payload.to);
    expect(ownerRead.body.publicAccessToken).to.be.undefined;
    expect(ownerList.body[0].publicAccessToken).to.be.undefined;
  });

  it("should return 500 when an owner-scoped delete fails", async() => {
    sinon.stub(globalThis.appDataSource.manager, "transaction").rejects(new Error("Delete failed"));
    const response = await request(globalThis.app).delete(`/api/v1/stashes/${stash.id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(response.status).to.equal(500);
    expect(response.body.code).to.equal("error_500");
  });

  it("should return 500 when an owner-scoped snooze update fails", async() => {
    sinon.stub(globalThis.appDataSource.manager, "transaction").rejects(new Error("Update failed"));
    const response = await request(globalThis.app).post(`/api/v1/stashes/${stash.id}/snooze/24`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(response.status).to.equal(500);
    expect(response.body.code).to.equal("error_500");
  });
  for (const { method, suffix } of [
    { method: "delete", suffix: "" }, { method: "post", suffix: "/snooze/24" },
  ] as const) {
    it(`returns 409 for ${method} after the worker claims the message`, /**
     * Claims through PostgreSQL and checks owner and foreign API responses.
     * @returns Nothing
     */ async() => {
        await globalThis.appDataSource.getRepository(Stash).update(stash.id, { scheduledAt: new Date(0) });
        const service = container.resolve<StashService>(TOKENS.StashService);
        expect((await service.claimDueStashes(1, 300000))?.[0].id).to.equal(stash.id);
        const response = await request(globalThis.app)[method](`/api/v1/stashes/${stash.id}${suffix}`)
          .set("Authorization", `Bearer ${owner.token}`);
        expect(response.status).to.equal(409);
        expect(response.body.code).to.equal("stash_delivery_in_progress");
        const foreign = await request(globalThis.app)[method](`/api/v1/stashes/${stash.id}${suffix}`)
          .set("Authorization", `Bearer ${other.token}`);
        expect(foreign.status).to.equal(404);
      });
  }

  for (const id of ["0", "-1", "1.5", "1e2", "2147483648", "abc"]) {
    for (const { method, suffix } of [
      { method: "get", suffix: "" }, { method: "delete", suffix: "" },
      { method: "post", suffix: "/snooze/24" },
    ] as const) {
      it(`rejects invalid ID ${id} for ${method}`, /**
       * Checks the positive PostgreSQL integer ID boundary.
       * @returns Nothing
       */ async() => {
          const response = await request(globalThis.app)[method](`/api/v1/stashes/${id}${suffix}`)
            .set("Authorization", `Bearer ${owner.token}`);
          expect(response.status).to.equal(422);
          expect(response.body.errors[0].code).to.equal("stash_id_invalid");
        });
    }
  }
  for (const hours of ["-24", "0", "1.5", "1e2", "8761", "abc"]) {
    it(`rejects invalid snooze duration ${hours}`, /**
     * Checks the bounded positive integer duration.
     * @returns Nothing
     */ async() => {
        const response = await request(globalThis.app).post(`/api/v1/stashes/${stash.id}/snooze/${hours}`)
          .set("Authorization", `Bearer ${owner.token}`);
        expect(response.status).to.equal(422);
        expect(response.body.errors[0].code).to.equal("snooze_hours_invalid");
      });
  }
  it("accepts the maximum snooze duration", /**
   * Checks the inclusive 8760-hour boundary.
   * @returns Nothing
   */ async() => {
      const response = await request(globalThis.app).post(`/api/v1/stashes/${stash.id}/snooze/8760`)
        .set("Authorization", `Bearer ${owner.token}`);
      expect(response.status).to.equal(200);
      expect(new Date(response.body.scheduledAt).getTime() - stash.scheduledAt.getTime()).to.equal(8760 * 3600000);
    });
  it("rejects a past scheduled date", /**
   * Verifies the stable future-date validation code.
   * @returns Nothing
   */ async() => {
      const response = await request(globalThis.app).post("/api/v1/stashes")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ ...payload, scheduledAt: "2000-01-01T00:00:00Z" });
      expect(response.status).to.equal(422);
      expect(response.body.errors[0].code).to.equal("scheduled_at_must_be_future");
    });

});

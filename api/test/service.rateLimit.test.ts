import { expect } from "chai";
import sinon from "sinon";

import RateLimitService from "#service/RateLimitService.js";
import RateLimitCounter from "#model/RateLimitCounter.js";

const counters = globalThis.appDataSource.getRepository(RateLimitCounter);
const limit = { windowMs: 15 * 60 * 1000, max: 3 };

describe("RateLimitService", () => {
  let service: RateLimitService;

  beforeEach(async() => {
    service = new RateLimitService(counters);
    await counters.clear();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should allow max requests and reject the next one with Retry-After until the window ends", async() => {
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    for (let i = 0; i < limit.max; i++) {
      expect(await service.consume("test", "a", limit)).to.equal(0);
    }

    expect(await service.consume("test", "a", limit)).to.equal(limit.windowMs / 1000);
    clock.tick(60 * 1000);
    expect(await service.consume("test", "a", limit)).to.equal(limit.windowMs / 1000 - 60);
  });

  it("should start a new budget once the window has passed", async() => {
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    for (let i = 0; i <= limit.max; i++) {
      await service.consume("test", "a", limit);
    }

    clock.tick(limit.windowMs);
    expect(await service.consume("test", "a", limit)).to.equal(0);
    expect((await counters.findOneByOrFail({ bucket: "test", key: "a" })).count).to.equal(1);
  });

  it("should keep budgets of different keys and buckets independent", async() => {
    for (let i = 0; i <= limit.max; i++) {
      await service.consume("test", "a", limit);
    }

    expect(await service.consume("test", "b", limit)).to.equal(0);
    expect(await service.consume("other", "a", limit)).to.equal(0);
  });

  it("should never exceed the budget under concurrent requests", async() => {
    const concurrentLimit = { windowMs: limit.windowMs, max: 20 };
    const results = await Promise.all(
      Array.from({ length: 30 }, () => service.consume("test", "a", concurrentLimit)),
    );

    expect(results.filter((retryAfter) => retryAfter === 0)).to.have.length(20);
  });

  it("should keep the budget in the database, so a new service instance (restart) continues it", async() => {
    for (let i = 0; i < limit.max; i++) {
      await service.consume("test", "a", limit);
    }

    expect(await new RateLimitService(counters).consume("test", "a", limit)).to.be.greaterThan(0);
  });

  it("should drop expired counters of the bucket", async() => {
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    await service.consume("test", "a", limit);
    await service.consume("other", "a", limit);

    clock.tick(limit.windowMs);
    await service.consume("test", "b", limit);

    expect(await counters.findOneBy({ bucket: "test", key: "a" })).to.equal(null);
    expect(await counters.findOneBy({ bucket: "other", key: "a" })).to.not.equal(null);
  });

  it("should derive the same email key for case and whitespace variants without storing the address", () => {
    const key = RateLimitService.emailKey(" User@Example.com ");

    expect(key).to.equal(RateLimitService.emailKey("user@example.com"));
    expect(key).to.match(/^[0-9a-f]{64}$/);
    expect(key).to.not.equal(RateLimitService.emailKey("other@example.com"));
  });
});

import { describe, it, expect } from "vitest";
import { resolvePolicy, computeDelay, DEFAULT_POLICY } from "../src/retry.js";

describe("resolvePolicy", () => {
  it("returns defaults when no options given", () => {
    expect(resolvePolicy()).toEqual(DEFAULT_POLICY);
  });

  it("overrides maxAttempts", () => {
    expect(resolvePolicy({ maxAttempts: 5 }).maxAttempts).toBe(5);
  });

  it("overrides backoff", () => {
    expect(resolvePolicy({ backoff: "exponential" }).backoff).toBe(
      "exponential",
    );
  });

  it("overrides backoffBaseMS", () => {
    expect(resolvePolicy({ backoffBaseMS: 500 }).backoffBaseMS).toBe(500);
  });
});

describe("computeDelay", () => {
  it("returns 0 for first attempt", () => {
    expect(
      computeDelay(1, { maxAttempts: 3, backoff: "exponential", backoffBaseMS: 200 }),
    ).toBe(0);
  });

  it("returns 0 for 'none' backoff", () => {
    expect(
      computeDelay(3, { maxAttempts: 3, backoff: "none", backoffBaseMS: 200 }),
    ).toBe(0);
  });

  it("computes linear backoff", () => {
    const policy = { maxAttempts: 5, backoff: "linear" as const, backoffBaseMS: 100 };
    expect(computeDelay(2, policy)).toBe(100);
    expect(computeDelay(3, policy)).toBe(200);
    expect(computeDelay(4, policy)).toBe(300);
  });

  it("computes exponential backoff", () => {
    const policy = { maxAttempts: 5, backoff: "exponential" as const, backoffBaseMS: 100 };
    expect(computeDelay(2, policy)).toBe(100);
    expect(computeDelay(3, policy)).toBe(200);
    expect(computeDelay(4, policy)).toBe(400);
  });
});

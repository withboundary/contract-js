import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineContract } from "../src/index.js";

describe("contract.describe()", () => {
  it("returns schema + rule metadata without running the contract", () => {
    const contract = defineContract({
      name: "lead-scoring",
      schema: z.object({
        score: z.number().min(0).max(100),
        tier: z.enum(["hot", "warm", "cold"]),
        qualified: z.boolean(),
      }),
      rules: [
        {
          name: "score_range",
          fields: ["score"],
          message: "score must be between 0 and 100",
          check: (d) => (d.score >= 0 && d.score <= 100) || "score out of range",
        },
        {
          name: "qualified_requires_tier",
          fields: ["qualified", "tier"],
          check: (d) => !d.qualified || d.tier !== "cold" || "qualified leads cannot be cold",
        },
      ],
    });

    const described = contract.describe();

    expect(described.schema).toEqual([
      { name: "score", type: "number", constraints: "min:0,max:100" },
      { name: "tier", type: "enum", constraints: "hot|warm|cold" },
      { name: "qualified", type: "boolean" },
    ]);

    expect(described.rules).toHaveLength(2);
    expect(described.rules[0]!.name).toBe("score_range");
    expect(described.rules[0]!.fields).toEqual(["score"]);
    expect(described.rules[0]!.description).toBe("score must be between 0 and 100");
    expect(described.rules[0]!.expression).toContain("score >= 0");
    expect(described.rules[1]!.name).toBe("qualified_requires_tier");
  });

  it("is cached across calls", () => {
    const contract = defineContract({
      name: "x",
      schema: z.object({ v: z.string() }),
      rules: [{ name: "non_empty", check: (d) => d.v.length > 0 || "empty" }],
    });
    expect(contract.describe()).toBe(contract.describe());
  });

  it("rejects duplicate rule names at definition time", () => {
    expect(() =>
      defineContract({
        name: "x",
        schema: z.object({ v: z.number() }),
        rules: [
          { name: "same", check: (d) => d.v >= 0 || "neg" },
          { name: "same", check: (d) => d.v <= 10 || "big" },
        ],
      }),
    ).toThrow(/Duplicate rule name/);
  });

  it("rejects rules without a name", () => {
    expect(() =>
      defineContract({
        name: "x",
        schema: z.object({ v: z.number() }),
        // @ts-expect-error intentionally malformed
        rules: [{ check: (d) => d.v >= 0 || "neg" }],
      }),
    ).toThrow(/non-empty/);
  });
});

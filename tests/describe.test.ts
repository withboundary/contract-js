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
          description: "Score must be between 0 and 100",
          fields: ["score"],
          message: "score out of range",
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
    expect(described.rules[0]!.description).toBe("Score must be between 0 and 100");
    expect(described.rules[0]!.expression).toContain("score >= 0");
    expect(described.rules[1]!.name).toBe("qualified_requires_tier");
  });

  it("sources RuleDefinition.description only from rule.description, not from rule.message", () => {
    const contract = defineContract({
      name: "x",
      schema: z.object({ v: z.number() }),
      rules: [
        {
          name: "with_both",
          description: "v must be positive",
          message: "v was not positive",
          check: (d) => d.v > 0,
        },
        {
          name: "with_only_message",
          message: "v was not below 100",
          check: (d) => d.v < 100,
        },
        {
          name: "with_only_description",
          description: "v must be an integer",
          check: (d) => Number.isInteger(d.v),
        },
      ],
    });
    const rules = contract.describe().rules;
    // description wins when both are set
    expect(rules[0]!.description).toBe("v must be positive");
    // message alone does NOT populate description (no implicit fallback)
    expect(rules[1]!.description).toBeUndefined();
    // description alone lands as expected
    expect(rules[2]!.description).toBe("v must be an integer");
  });

  it("infers rule fields from the check source when omitted", () => {
    const contract = defineContract({
      name: "inference",
      schema: z.object({ score: z.number(), tier: z.string() }),
      rules: [
        // No `fields` — parser derives ["score"] from the arrow source.
        { name: "score_threshold", check: (d) => d.score >= 90 || "low" },
        // No `fields` — parser derives ["score", "tier"] from the compound expr.
        { name: "combo", check: (d) => d.score > 0 && d.tier !== "cold" },
        // Explicit `fields` always wins — don't run inference when the user
        // already knows what they want (e.g. the helper path below would
        // otherwise yield undefined).
        {
          name: "with_helper",
          fields: ["score"],
          check: (d) => JSON.stringify(d).length > 0,
        },
      ],
    });
    const rules = contract.describe().rules;
    expect(rules[0]!.fields).toEqual(["score"]);
    expect(rules[1]!.fields?.sort()).toEqual(["score", "tier"]);
    expect(rules[2]!.fields).toEqual(["score"]);
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

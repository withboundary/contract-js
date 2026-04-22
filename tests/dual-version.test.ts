import { describe, it, expect } from "vitest";
import { z as z3 } from "zod-v3";
import { z as z4 } from "zod";
import {
  defineContract,
  enforce,
  instructions,
  verify,
  type ContractSchema,
} from "../src/index.js";

// End-to-end dual-version proof. Each describe.each block runs every test
// against both the zod v3 and zod v4 schema packages, proving that the
// public API (`defineContract`, `enforce`, `instructions`, `verify`) behaves
// the same regardless of which zod a consumer brings.
const versions = [
  ["zod v3", z3 as unknown as typeof z4],
  ["zod v4", z4],
] as const;

describe.each(versions)("%s end-to-end", (_label, z) => {
  const Schema = z.object({
    tier: z.enum(["hot", "warm", "cold"]),
    score: z.number().min(0).max(100),
  });

  it("instructions emits a prompt mentioning every field", () => {
    const prompt = instructions(Schema as unknown as ContractSchema<unknown>);
    expect(prompt).toContain("JSON");
    expect(prompt).toContain('"tier"');
    expect(prompt).toContain('"score"');
    expect(prompt).toContain("hot");
    expect(prompt).toContain(">= 0");
    expect(prompt).toContain("<= 100");
  });

  it("verify succeeds on valid data", () => {
    const result = verify(
      { tier: "hot", score: 85 },
      Schema as unknown as ContractSchema<{ tier: string; score: number }>,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ tier: "hot", score: 85 });
    }
  });

  it("verify surfaces field path on failure", () => {
    const result = verify(
      { tier: "boiling", score: 85 },
      Schema as unknown as ContractSchema<{ tier: string; score: number }>,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.attempts[0].issues[0]).toContain("tier");
    }
  });

  it("defineContract runs the happy path", async () => {
    const contract = defineContract({
      name: "dual-version-happy",
      schema: Schema as unknown as ContractSchema<{
        tier: string;
        score: number;
      }>,
    });
    const result = await contract.accept(async () =>
      JSON.stringify({ tier: "warm", score: 42 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ tier: "warm", score: 42 });
    }
  });

  it("defineContract fails validation on bad JSON shape", async () => {
    const contract = defineContract({
      name: "dual-version-bad-shape",
      schema: Schema as unknown as ContractSchema<{
        tier: string;
        score: number;
      }>,
      retry: { maxAttempts: 1 },
    });
    const result = await contract.accept(async () =>
      JSON.stringify({ tier: "nope", score: 999 }),
    );
    expect(result.ok).toBe(false);
  });

  it("defineContract enforces rules when schema passes", async () => {
    const contract = defineContract({
      name: "dual-version-rules",
      schema: Schema as unknown as ContractSchema<{
        tier: string;
        score: number;
      }>,
      retry: { maxAttempts: 1 },
      rules: [
        {
          name: "score_threshold",
          fields: ["score"],
          check: (d) => d.score >= 90 || "score too low",
        },
      ],
    });
    const result = await contract.accept(async () =>
      JSON.stringify({ tier: "cold", score: 10 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.attempts[0].category).toBe("RULE_ERROR");
      expect(result.error.attempts[0].issues).toContain("score too low");
      expect(result.error.attempts[0].ruleIssues?.[0]?.rule.name).toBe(
        "score_threshold",
      );
    }
  });

  it("enforce shortcut works with either zod version", async () => {
    const result = await enforce(
      Schema as unknown as ContractSchema<{ tier: string; score: number }>,
      async () => JSON.stringify({ tier: "hot", score: 100 }),
      { name: "dual-version-enforce" },
    );
    expect(result.ok).toBe(true);
  });

  it("instructions handles optional fields, arrays, nested objects", () => {
    const Rich = z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      tags: z.array(z.string()),
      profile: z.object({
        bio: z.string().optional(),
        website: z.string().url().optional(),
      }),
      role: z.enum(["admin", "user"]),
    });
    const prompt = instructions(Rich as unknown as ContractSchema<unknown>);
    expect(prompt).toContain("UUID format");
    expect(prompt).toContain("email format");
    expect(prompt).toContain("array of:");
    expect(prompt).toContain("optional");
    expect(prompt).toContain('"admin"');
  });
});

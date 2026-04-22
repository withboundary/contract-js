import { describe, it, expect } from "vitest";
import { inferRuleFields } from "../src/utils/inferRuleFields.js";

describe("inferRuleFields", () => {
  describe("single-identifier param", () => {
    it("extracts a single field", () => {
      expect(inferRuleFields((d: { score: number }) => d.score >= 90)).toEqual([
        "score",
      ]);
    });

    it("extracts multiple fields from a compound expression", () => {
      const rule = (d: { score: number; tier: string }) =>
        d.score > 0 && d.tier !== "cold";
      expect(inferRuleFields(rule)?.sort()).toEqual(["score", "tier"]);
    });

    it("returns top-level field only for nested access", () => {
      expect(
        inferRuleFields((d: { items: { id: string }[] }) => d.items.length > 0),
      ).toEqual(["items"]);
    });

    it("handles optional chaining", () => {
      expect(
        inferRuleFields((d: { maybe?: number }) => d?.maybe === 1),
      ).toEqual(["maybe"]);
    });

    it("picks the first param when multiple are declared", () => {
      const rule = (d: { x: number }, i: number) => d.x > i;
      expect(inferRuleFields(rule)).toEqual(["x"]);
    });

    it("handles bare arrow (no parens)", () => {
      // Intentionally avoid TS annotation so the stringified source is bare.
      const rule = ((d: any) => d.x) as unknown as (d: unknown) => boolean;
      // Some TS emitters keep parens; the helper should handle either form.
      const result = inferRuleFields(rule);
      expect(result).toEqual(["x"]);
    });

    it("handles async arrow", () => {
      const rule = async (d: { x: number }) => d.x > 0;
      expect(inferRuleFields(rule)).toEqual(["x"]);
    });

    it("handles a classic named function", () => {
      function check(d: { x: number }) {
        return d.x > 0;
      }
      expect(inferRuleFields(check)).toEqual(["x"]);
    });

    it("does not match dotted paths through other identifiers", () => {
      // `other.d.x` must NOT be read as `d.x`.
      const rule = (d: { real: number }) => {
        const other = { d: { x: 42 } };
        return d.real > other.d.x;
      };
      const result = inferRuleFields(rule);
      // Only `real` should be captured — `d.x` above lives under `other.`, not the param.
      expect(result).toEqual(["real"]);
    });
  });

  describe("destructured param", () => {
    it("extracts destructured keys", () => {
      const rule = ({ score, tier }: { score: number; tier: string }) =>
        score > 0 || tier === "hot";
      expect(inferRuleFields(rule)?.sort()).toEqual(["score", "tier"]);
    });

    it("uses the source key name for renamed bindings", () => {
      const rule = ({ score: s }: { score: number }) => s > 0;
      expect(inferRuleFields(rule)).toEqual(["score"]);
    });

    it("handles defaults in destructuring", () => {
      const rule = ({ score = 0 }: { score?: number }) => score > 0;
      expect(inferRuleFields(rule)).toEqual(["score"]);
    });

    it("skips rest element", () => {
      const rule = ({ keep, ...rest }: { keep: number } & Record<string, unknown>) =>
        keep > 0 && Object.keys(rest).length === 0;
      expect(inferRuleFields(rule)).toEqual(["keep"]);
    });
  });

  describe("inference failures (documented limitations)", () => {
    it("returns undefined when the check delegates to a helper", () => {
      const validate = (d: unknown) => typeof d === "object";
      const rule = (d: unknown) => validate(d);
      expect(inferRuleFields(rule)).toBeUndefined();
    });

    it("returns undefined when there is no data parameter", () => {
      const rule = () => true;
      expect(inferRuleFields(rule)).toBeUndefined();
    });

    it("returns undefined when the data is aliased before access", () => {
      const rule = (d: { y: number }) => {
        const x = d;
        return x.y > 0;
      };
      // Our parser doesn't track simple aliases; this is documented.
      expect(inferRuleFields(rule)).toBeUndefined();
    });

    it("returns undefined for non-function input", () => {
      expect(inferRuleFields(undefined)).toBeUndefined();
      expect(inferRuleFields(null)).toBeUndefined();
      expect(inferRuleFields("not a function")).toBeUndefined();
      expect(inferRuleFields(42)).toBeUndefined();
    });
  });

  describe("caching", () => {
    it("returns the same array instance for repeated calls (WeakMap cache)", () => {
      const rule = (d: { x: number }) => d.x > 0;
      const first = inferRuleFields(rule);
      const second = inferRuleFields(rule);
      expect(first).toBe(second);
    });

    it("caches undefined results too", () => {
      const rule = () => true;
      expect(inferRuleFields(rule)).toBeUndefined();
      // Second call should still return undefined without re-parsing.
      expect(inferRuleFields(rule)).toBeUndefined();
    });
  });
});

import { describe, it, expect } from "vitest";
import { clean } from "../src/clean.js";

describe("clean", () => {
  describe("markdown fence stripping", () => {
    it("strips ```json fences", () => {
      expect(clean('```json\n{"score": 85}\n```')).toEqual({ score: 85 });
    });

    it("strips ```JSON fences", () => {
      expect(clean('```JSON\n{"score": 85}\n```')).toEqual({ score: 85 });
    });

    it("strips bare ``` fences", () => {
      expect(clean('```\n{"score": 85}\n```')).toEqual({ score: 85 });
    });

    it("strips fences with extra whitespace", () => {
      expect(clean('```json\n  {"score": 85}  \n```')).toEqual({ score: 85 });
    });
  });

  describe("prose extraction", () => {
    it("extracts JSON from surrounding prose", () => {
      const input =
        'Here is the analysis:\n\n{"score": 85}\n\nLet me know if you need more.';
      expect(clean(input)).toEqual({ score: 85 });
    });

    it("extracts JSON object from leading prose", () => {
      expect(clean('The result is: {"ok": true}')).toEqual({ ok: true });
    });

    it("extracts JSON array from prose", () => {
      expect(clean('Here you go: [1, 2, 3]')).toEqual([1, 2, 3]);
    });
  });

  describe("type coercion", () => {
    it("coerces string numbers to numbers", () => {
      expect(clean('{"score": "85"}')).toEqual({ score: 85 });
    });

    it("coerces string booleans to booleans", () => {
      expect(clean('{"active": "true", "deleted": "false"}')).toEqual({
        active: true,
        deleted: false,
      });
    });

    it("coerces string null to null", () => {
      expect(clean('{"value": "null"}')).toEqual({ value: null });
    });

    it("coerces nested values", () => {
      expect(
        clean('{"item": {"count": "3", "enabled": "true"}}'),
      ).toEqual({
        item: { count: 3, enabled: true },
      });
    });

    it("coerces values in arrays", () => {
      expect(clean('[{"score": "85"}, {"score": "90"}]')).toEqual([
        { score: 85 },
        { score: 90 },
      ]);
    });

    it("does not coerce non-numeric strings", () => {
      expect(clean('{"name": "Alice"}')).toEqual({ name: "Alice" });
    });

    it("coerces float strings", () => {
      expect(clean('{"confidence": "0.95"}')).toEqual({ confidence: 0.95 });
    });
  });

  describe("edge cases", () => {
    it("returns null for null input", () => {
      expect(clean(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(clean(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(clean("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      expect(clean("   \n\n  ")).toBeNull();
    });

    it("returns null for non-JSON text", () => {
      expect(clean("This is just plain text with no JSON")).toBeNull();
    });

    it("handles already-valid JSON string", () => {
      expect(clean('{"name": "Alice", "age": 30}')).toEqual({
        name: "Alice",
        age: 30,
      });
    });
  });
});

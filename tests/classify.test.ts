import { describe, it, expect } from "vitest";
import { classify } from "../src/index.js";

describe("classify", () => {
  describe("EMPTY_RESPONSE", () => {
    it("classifies empty string", () => {
      expect(classify("", null)).toBe("EMPTY_RESPONSE");
    });

    it("classifies whitespace-only string", () => {
      expect(classify("   \n\n  ", null)).toBe("EMPTY_RESPONSE");
    });
  });

  describe("REFUSAL", () => {
    it("detects 'I'm sorry' refusal", () => {
      expect(
        classify("I'm sorry, I can't assist with that request.", null),
      ).toBe("REFUSAL");
    });

    it("detects 'I apologize' refusal", () => {
      expect(
        classify("I apologize, but I'm unable to provide that information.", null),
      ).toBe("REFUSAL");
    });

    it("detects 'As an AI' refusal", () => {
      expect(
        classify("As an AI language model, I cannot do that.", null),
      ).toBe("REFUSAL");
    });

    it("detects 'I cannot assist' refusal", () => {
      expect(
        classify("I cannot assist with this type of request.", null),
      ).toBe("REFUSAL");
    });

    it("detects 'against my guidelines' refusal", () => {
      expect(
        classify("This is against my guidelines to provide.", null),
      ).toBe("REFUSAL");
    });
  });

  describe("TRUNCATED", () => {
    it("detects unmatched opening brace", () => {
      expect(
        classify('{"name": "Alice", "items": [{"desc":', null),
      ).toBe("TRUNCATED");
    });

    it("detects unmatched opening bracket", () => {
      expect(classify('[1, 2, 3', null)).toBe("TRUNCATED");
    });

    it("detects nested unmatched braces", () => {
      expect(
        classify('{"user": {"name": "Alice", "address": {"city":', null),
      ).toBe("TRUNCATED");
    });
  });

  describe("PARSE_ERROR", () => {
    it("detects trailing comma", () => {
      expect(classify('{"name": "Alice", "age": 30,}', null)).toBe(
        "PARSE_ERROR",
      );
    });

    it("detects single quotes", () => {
      expect(classify("{'name': 'Alice'}", null)).toBe("PARSE_ERROR");
    });

    it("detects missing comma", () => {
      expect(classify('{"name": "Alice" "age": 30}', null)).toBe(
        "PARSE_ERROR",
      );
    });
  });

  describe("NO_JSON", () => {
    it("classifies plain prose", () => {
      expect(
        classify("The sentiment is positive with high confidence.", null),
      ).toBe("NO_JSON");
    });

    it("classifies plain text without any JSON characters", () => {
      expect(classify("Just some random text here.", null)).toBe("NO_JSON");
    });
  });

  describe("VALIDATION_ERROR passthrough", () => {
    it("returns VALIDATION_ERROR when cleaned is not null", () => {
      expect(classify('{"name": "Alice"}', { name: "Alice" })).toBe(
        "VALIDATION_ERROR",
      );
    });
  });
});

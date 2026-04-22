import { describe, it, expect } from "vitest";
import { z as z3 } from "zod-v3";
import { z as z4 } from "zod";
import {
  kindOf,
  unwrapOne,
  unwrapAll,
  getStringInfo,
  getNumberInfo,
  getObjectShape,
  getArrayElement,
  getEnumOptions,
  getLiteralValue,
  getUnionOptions,
  getNativeEnumValues,
  safeParse,
  type AnyZodSchema,
} from "../src/utils/zodCompat.js";

// Run the same suite against both zod versions. The adapter's job is to
// paper over v3/v4 internal differences, so every test here should pass
// identically for both z3 and z4 — any divergence is a bug in the adapter.
const versions = [
  ["zod v3", z3 as unknown as typeof z4],
  ["zod v4", z4],
] as const;

describe.each(versions)("zodCompat — %s", (_label, z) => {
  describe("kindOf", () => {
    it("tags object schemas", () => {
      expect(kindOf(z.object({ a: z.string() }) as AnyZodSchema)).toBe("object");
    });
    it("tags array schemas", () => {
      expect(kindOf(z.array(z.string()) as AnyZodSchema)).toBe("array");
    });
    it("tags enum schemas", () => {
      expect(kindOf(z.enum(["a", "b"]) as AnyZodSchema)).toBe("enum");
    });
    it("tags literal schemas", () => {
      expect(kindOf(z.literal("x") as AnyZodSchema)).toBe("literal");
    });
    it("tags union schemas", () => {
      expect(
        kindOf(z.union([z.string(), z.number()]) as AnyZodSchema),
      ).toBe("union");
    });
    it("tags string schemas", () => {
      expect(kindOf(z.string() as AnyZodSchema)).toBe("string");
    });
    it("tags number schemas", () => {
      expect(kindOf(z.number() as AnyZodSchema)).toBe("number");
    });
    it("tags boolean schemas", () => {
      expect(kindOf(z.boolean() as AnyZodSchema)).toBe("boolean");
    });
    it("tags optional wrappers", () => {
      expect(kindOf(z.string().optional() as AnyZodSchema)).toBe("optional");
    });
    it("tags default wrappers", () => {
      expect(kindOf(z.string().default("x") as AnyZodSchema)).toBe("default");
    });
    it("tags nullable wrappers", () => {
      expect(kindOf(z.string().nullable() as AnyZodSchema)).toBe("nullable");
    });
    it("classifies email format as string", () => {
      // v3: z.string().email() → ZodString with an email check
      // v4: z.email() → ZodEmail, but _zod.def.type is "string"
      // Either path reports "string".
      const email = (z as unknown as { email?: () => unknown }).email
        ? (z as unknown as { email: () => AnyZodSchema }).email()
        : (z.string() as unknown as { email: () => AnyZodSchema }).email();
      expect(kindOf(email)).toBe("string");
    });
  });

  describe("unwrapOne", () => {
    it("returns null for leaf schemas", () => {
      expect(unwrapOne(z.string() as AnyZodSchema)).toBeNull();
      expect(unwrapOne(z.number() as AnyZodSchema)).toBeNull();
      expect(unwrapOne(z.object({}) as AnyZodSchema)).toBeNull();
    });
    it("peels optional one level", () => {
      const inner = z.string();
      const unwrapped = unwrapOne(inner.optional() as AnyZodSchema);
      expect(unwrapped).not.toBeNull();
      expect(kindOf(unwrapped!)).toBe("string");
    });
    it("peels nullable one level", () => {
      const unwrapped = unwrapOne(z.number().nullable() as AnyZodSchema);
      expect(kindOf(unwrapped!)).toBe("number");
    });
    it("peels default one level", () => {
      const unwrapped = unwrapOne(z.string().default("hi") as AnyZodSchema);
      expect(kindOf(unwrapped!)).toBe("string");
    });
  });

  describe("unwrapAll", () => {
    it("walks through stacked wrappers to the leaf", () => {
      const stacked = z.string().optional().nullable();
      const leaf = unwrapAll(stacked as AnyZodSchema);
      expect(kindOf(leaf)).toBe("string");
    });
    it("returns the schema itself when already a leaf", () => {
      const leaf = z.number();
      expect(unwrapAll(leaf as AnyZodSchema)).toBe(leaf);
    });
  });

  describe("getStringInfo", () => {
    it("extracts min / max", () => {
      const s = z.string().min(3).max(10);
      const info = getStringInfo(s as AnyZodSchema);
      expect(info.minLength).toBe(3);
      expect(info.maxLength).toBe(10);
    });
    it("extracts regex", () => {
      const pattern = /^[a-z]+$/;
      const s = z.string().regex(pattern);
      const info = getStringInfo(s as AnyZodSchema);
      expect(info.regex).toBeInstanceOf(RegExp);
    });
    it("detects email format (chained)", () => {
      const s = z.string().email();
      const info = getStringInfo(s as AnyZodSchema);
      expect(info.formats.has("email")).toBe(true);
    });
    it("detects url format (chained)", () => {
      const s = z.string().url();
      const info = getStringInfo(s as AnyZodSchema);
      expect(info.formats.has("url")).toBe(true);
    });
    it("detects uuid format (chained)", () => {
      const s = z.string().uuid();
      const info = getStringInfo(s as AnyZodSchema);
      expect(info.formats.has("uuid")).toBe(true);
    });
    it("returns empty formats set for plain strings", () => {
      const info = getStringInfo(z.string() as AnyZodSchema);
      expect(info.formats.size).toBe(0);
      expect(info.minLength).toBeUndefined();
      expect(info.maxLength).toBeUndefined();
    });
  });

  describe("getNumberInfo", () => {
    it("extracts min / max", () => {
      const info = getNumberInfo(z.number().min(0).max(100) as AnyZodSchema);
      expect(info.min).toBe(0);
      expect(info.max).toBe(100);
    });
    it("detects int", () => {
      const info = getNumberInfo(z.number().int() as AnyZodSchema);
      expect(info.int).toBe(true);
    });
    it("returns empty info for plain numbers", () => {
      const info = getNumberInfo(z.number() as AnyZodSchema);
      expect(info.min).toBeUndefined();
      expect(info.max).toBeUndefined();
      expect(info.int).toBeUndefined();
    });
  });

  describe("getObjectShape", () => {
    it("returns the shape map", () => {
      const s = z.object({ name: z.string(), age: z.number() });
      const shape = getObjectShape(s as AnyZodSchema);
      expect(shape).not.toBeNull();
      expect(Object.keys(shape!).sort()).toEqual(["age", "name"]);
      expect(kindOf(shape!.name)).toBe("string");
      expect(kindOf(shape!.age)).toBe("number");
    });
    it("returns null for non-objects", () => {
      expect(getObjectShape(z.string() as AnyZodSchema)).toBeNull();
    });
  });

  describe("getArrayElement", () => {
    it("returns the element schema", () => {
      const s = z.array(z.boolean());
      const el = getArrayElement(s as AnyZodSchema);
      expect(el).not.toBeNull();
      expect(kindOf(el!)).toBe("boolean");
    });
    it("returns null for non-arrays", () => {
      expect(getArrayElement(z.string() as AnyZodSchema)).toBeNull();
    });
  });

  describe("getEnumOptions", () => {
    it("returns the value list", () => {
      const opts = getEnumOptions(z.enum(["hot", "warm", "cold"]) as AnyZodSchema);
      expect(opts).toEqual(expect.arrayContaining(["hot", "warm", "cold"]));
      expect(opts).toHaveLength(3);
    });
    it("returns null for non-enums", () => {
      expect(getEnumOptions(z.string() as AnyZodSchema)).toBeNull();
    });
  });

  describe("getLiteralValue", () => {
    it("returns the literal value", () => {
      expect(getLiteralValue(z.literal("hello") as AnyZodSchema)).toBe("hello");
      expect(getLiteralValue(z.literal(42) as AnyZodSchema)).toBe(42);
    });
    it("returns undefined for non-literals", () => {
      expect(getLiteralValue(z.string() as AnyZodSchema)).toBeUndefined();
    });
  });

  describe("getUnionOptions", () => {
    it("returns the option list", () => {
      const s = z.union([z.string(), z.number(), z.boolean()]);
      const opts = getUnionOptions(s as AnyZodSchema);
      expect(opts).not.toBeNull();
      expect(opts!).toHaveLength(3);
      expect(opts!.map((o) => kindOf(o)).sort()).toEqual([
        "boolean",
        "number",
        "string",
      ]);
    });
    it("returns null for non-unions", () => {
      expect(getUnionOptions(z.string() as AnyZodSchema)).toBeNull();
    });
  });

  describe("safeParse", () => {
    it("returns success with data on valid input", () => {
      const s = z.object({ n: z.number() });
      const result = safeParse<{ n: number }>(s as AnyZodSchema, { n: 42 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ n: 42 });
    });
    it("returns issues with path on invalid input", () => {
      const s = z.object({ n: z.number() });
      const result = safeParse(s as AnyZodSchema, { n: "oops" });
      expect(result.success).toBe(false);
      expect(result.issues).toBeDefined();
      expect(result.issues!.length).toBeGreaterThan(0);
      expect(result.issues![0].path).toEqual(["n"]);
    });
  });
});

// v3-specific — native enums were merged into ZodEnum in v4, so this is
// tested only against z3.
describe("zodCompat — v3-specific", () => {
  it("getNativeEnumValues reads values off v3 ZodNativeEnum", () => {
    enum Status {
      Hot = "hot",
      Cold = "cold",
    }
    const schema = z3.nativeEnum(Status);
    const values = getNativeEnumValues(schema as unknown as AnyZodSchema);
    expect(values).not.toBeNull();
    expect(values).toEqual(expect.arrayContaining(["hot", "cold"]));
  });

  it("kindOf tags ZodEffects (refine wrapper) as 'effects'", () => {
    const schema = z3.object({ a: z3.string() }).refine((v) => v.a.length > 0);
    expect(kindOf(schema as unknown as AnyZodSchema)).toBe("effects");
  });

  it("unwrapOne peels ZodEffects to inner schema", () => {
    const inner = z3.object({ a: z3.string() });
    const refined = inner.refine((v) => v.a.length > 0);
    const unwrapped = unwrapOne(refined as unknown as AnyZodSchema);
    expect(unwrapped).not.toBeNull();
    expect(kindOf(unwrapped!)).toBe("object");
  });
});

// v4-specific — refine() no longer wraps; transforms produce ZodPipe.
describe("zodCompat — v4-specific", () => {
  it("refine on a string keeps it a string (no ZodEffects wrapper)", () => {
    const refined = z4.string().refine((v) => v.length > 3);
    expect(kindOf(refined as AnyZodSchema)).toBe("string");
  });

  it("transform produces a pipe; unwrapOne returns the input side", () => {
    const piped = z4
      .object({ a: z4.string() })
      .transform((v) => v.a.toUpperCase());
    expect(kindOf(piped as AnyZodSchema)).toBe("pipe");
    const unwrapped = unwrapOne(piped as AnyZodSchema);
    expect(unwrapped).not.toBeNull();
    expect(kindOf(unwrapped!)).toBe("object");
  });

  it("z.email() is tagged as a string and carries email format", () => {
    const email = z4.email();
    expect(kindOf(email as AnyZodSchema)).toBe("string");
    expect(getStringInfo(email as AnyZodSchema).formats.has("email")).toBe(true);
  });
});

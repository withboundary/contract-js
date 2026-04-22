import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodToSchemaFields } from "../src/contract/zodToSchemaFields.js";

describe("zodToSchemaFields", () => {
  it("flattens a top-level object to one field per property", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean(),
    });
    expect(zodToSchemaFields(schema)).toEqual([
      { name: "name", type: "string" },
      { name: "age", type: "number" },
      { name: "active", type: "boolean" },
    ]);
  });

  it("produces a single 'value' field for non-object schemas", () => {
    expect(zodToSchemaFields(z.string())).toEqual([{ name: "value", type: "string" }]);
  });

  it("captures string constraints as a compact label", () => {
    const schema = z.object({
      email: z.string().email(),
      short: z.string().min(1).max(10),
    });
    const fields = zodToSchemaFields(schema);
    expect(fields[0]).toEqual({ name: "email", type: "string", constraints: "email" });
    expect(fields[1]).toEqual({ name: "short", type: "string", constraints: "min:1,max:10" });
  });

  it("captures number constraints", () => {
    const schema = z.object({
      score: z.number().min(0).max(1),
      count: z.number().int().min(0),
    });
    const fields = zodToSchemaFields(schema);
    expect(fields[0]).toEqual({ name: "score", type: "number", constraints: "min:0,max:1" });
    expect(fields[1]).toEqual({ name: "count", type: "number", constraints: "int,min:0" });
  });

  it("represents enums as type=enum with pipe-joined values", () => {
    const schema = z.object({
      priority: z.enum(["low", "medium", "high"]),
    });
    expect(zodToSchemaFields(schema)).toEqual([
      { name: "priority", type: "enum", constraints: "low|medium|high" },
    ]);
  });

  it("peels Optional and Nullable wrappers and merges constraints", () => {
    const schema = z.object({
      maybeName: z.string().min(1).optional(),
      nullableAge: z.number().nullable(),
    });
    const fields = zodToSchemaFields(schema);
    expect(fields[0]).toEqual({ name: "maybeName", type: "string", constraints: "min:1,optional" });
    expect(fields[1]).toEqual({ name: "nullableAge", type: "number", constraints: "nullable" });
  });

  it("describes arrays with their element type + length constraints", () => {
    const schema = z.object({
      tags: z.array(z.string()).min(1).max(10),
    });
    const fields = zodToSchemaFields(schema);
    expect(fields[0]).toEqual({
      name: "tags",
      type: "array<string>",
      constraints: "min:1,max:10",
    });
  });

  it("represents nested objects as type=object without expanding inner fields", () => {
    const schema = z.object({
      user: z.object({ id: z.string(), name: z.string() }),
    });
    expect(zodToSchemaFields(schema)).toEqual([{ name: "user", type: "object" }]);
  });

  it("respects backend ingest caps", () => {
    const longName = "x".repeat(200);
    const schema = z.object({ [longName]: z.string() });
    const fields = zodToSchemaFields(schema);
    expect(fields[0]!.name.length).toBeLessThanOrEqual(128);
  });

  it("handles unions", () => {
    const schema = z.object({
      id: z.union([z.string(), z.number()]),
    });
    const fields = zodToSchemaFields(schema);
    expect(fields[0]).toEqual({ name: "id", type: "string|number" });
  });

  it("handles literals", () => {
    const schema = z.object({
      kind: z.literal("refund"),
    });
    expect(zodToSchemaFields(schema)).toEqual([
      { name: "kind", type: "literal", constraints: '="refund"' },
    ]);
  });
});

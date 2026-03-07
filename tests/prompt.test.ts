import { describe, it, expect } from "vitest";
import { z } from "zod";
import { instructions } from "../src/index.js";

describe("instructions", () => {
  it("generates a prompt from a simple object schema", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const result = instructions(schema);
    expect(result).toContain("JSON");
    expect(result).toContain('"name"');
    expect(result).toContain("string");
    expect(result).toContain('"age"');
    expect(result).toContain("number");
  });

  it("includes enum values", () => {
    const schema = z.object({
      status: z.enum(["active", "inactive", "pending"]),
    });

    const result = instructions(schema);
    expect(result).toContain('"active"');
    expect(result).toContain('"inactive"');
    expect(result).toContain('"pending"');
  });

  it("includes number constraints", () => {
    const schema = z.object({
      score: z.number().min(0).max(100),
    });

    const result = instructions(schema);
    expect(result).toContain(">= 0");
    expect(result).toContain("<= 100");
  });

  it("includes string constraints", () => {
    const schema = z.object({
      email: z.string().email(),
    });

    const result = instructions(schema);
    expect(result).toContain("email");
  });

  it("handles nested objects", () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        address: z.object({
          city: z.string(),
        }),
      }),
    });

    const result = instructions(schema);
    expect(result).toContain('"user"');
    expect(result).toContain('"name"');
    expect(result).toContain('"address"');
    expect(result).toContain('"city"');
  });

  it("handles arrays", () => {
    const schema = z.object({
      items: z.array(z.object({ name: z.string() })),
    });

    const result = instructions(schema);
    expect(result).toContain("array");
    expect(result).toContain('"name"');
  });

  it("marks optional fields", () => {
    const schema = z.object({
      name: z.string(),
      nickname: z.string().optional(),
    });

    const result = instructions(schema);
    expect(result).toContain("optional");
  });

  it("includes boolean type", () => {
    const schema = z.object({
      active: z.boolean(),
    });

    const result = instructions(schema);
    expect(result).toContain("boolean");
  });

  it("instructs no markdown fences", () => {
    const schema = z.object({ ok: z.boolean() });
    const result = instructions(schema);
    expect(result.toLowerCase()).toContain("no markdown");
  });
});

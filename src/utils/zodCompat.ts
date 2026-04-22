// Dual-version zod adapter. Every place the engine needs to introspect a
// schema funnels through this module, so the two version-specific shapes
// (`_def.*` in v3, `_zod.def.*` in v4) never leak into the engine.
//
// Version detection is property-based (`"_zod" in schema`), not class-based,
// so two copies of zod in the same node_modules tree don't break us.
import type * as z3 from "zod/v3";
import type * as z4 from "zod/v4/core";

export type AnyZodSchema = z3.ZodType<unknown> | z4.$ZodType;

export type SchemaKind =
  | "object"
  | "array"
  | "enum"
  | "nativeEnum"
  | "literal"
  | "union"
  | "string"
  | "number"
  | "boolean"
  | "optional"
  | "default"
  | "nullable"
  | "effects" // v3-only: wraps .refine() / .transform()
  | "pipe" // v4-only: produced by .transform()
  | "unknown";

type V4Schema = { _zod: { def: Record<string, unknown> } };

function isV4(schema: unknown): schema is V4Schema {
  return typeof schema === "object" && schema !== null && "_zod" in schema;
}

function v4Def(schema: unknown): Record<string, any> | null {
  return isV4(schema) ? (schema._zod.def as Record<string, any>) : null;
}

function v3Def(schema: unknown): Record<string, any> | null {
  if (isV4(schema)) return null;
  if (typeof schema !== "object" || schema === null) return null;
  const def = (schema as { _def?: unknown })._def;
  return typeof def === "object" && def !== null
    ? (def as Record<string, any>)
    : null;
}

export function kindOf(schema: AnyZodSchema): SchemaKind {
  const v4 = v4Def(schema);
  if (v4) {
    switch (v4.type) {
      case "object":
        return "object";
      case "array":
        return "array";
      case "enum":
        return "enum";
      case "literal":
        return "literal";
      case "union":
      case "discriminated_union":
        return "union";
      case "string":
        return "string";
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "optional":
        return "optional";
      case "default":
        return "default";
      case "nullable":
        return "nullable";
      case "pipe":
        return "pipe";
      default:
        return "unknown";
    }
  }
  const v3 = v3Def(schema);
  if (v3) {
    switch (v3.typeName) {
      case "ZodObject":
        return "object";
      case "ZodArray":
        return "array";
      case "ZodEnum":
        return "enum";
      case "ZodNativeEnum":
        return "nativeEnum";
      case "ZodLiteral":
        return "literal";
      case "ZodUnion":
      case "ZodDiscriminatedUnion":
        return "union";
      case "ZodString":
        return "string";
      case "ZodNumber":
        return "number";
      case "ZodBoolean":
        return "boolean";
      case "ZodOptional":
        return "optional";
      case "ZodDefault":
        return "default";
      case "ZodNullable":
        return "nullable";
      case "ZodEffects":
        return "effects";
      default:
        return "unknown";
    }
  }
  return "unknown";
}

// Unwrap one level of Optional / Nullable / Default / v3-ZodEffects / v4-Pipe.
// Returns null if the schema is not a wrapper.
export function unwrapOne(schema: AnyZodSchema): AnyZodSchema | null {
  const kind = kindOf(schema);
  const v4 = v4Def(schema);
  const v3 = v3Def(schema);

  switch (kind) {
    case "optional":
    case "nullable":
    case "default":
      if (v4?.innerType) return v4.innerType as AnyZodSchema;
      if (v3?.innerType) return v3.innerType as AnyZodSchema;
      return null;
    case "effects":
      // v3 only: .refine() / .transform() wrap the original schema.
      if (v3?.schema) return v3.schema as AnyZodSchema;
      return null;
    case "pipe":
      // v4: .transform() produces a ZodPipe { in, out }. Use the input side —
      // that's the pre-transform schema shape, which is what describe/select
      // care about (the LLM produces the input shape; the transform runs after).
      if (v4?.in) return v4.in as AnyZodSchema;
      return null;
    default:
      return null;
  }
}

// Fully unwrap — walks through every wrapper until we hit a leaf.
export function unwrapAll(schema: AnyZodSchema): AnyZodSchema {
  let current = schema;
  for (let i = 0; i < 32; i++) {
    const next = unwrapOne(current);
    if (!next) return current;
    current = next;
  }
  return current;
}

export interface StringInfo {
  minLength?: number;
  maxLength?: number;
  exactLength?: number;
  regex?: RegExp;
  startsWith?: string;
  endsWith?: string;
  formats: Set<"email" | "url" | "uuid" | "cuid">;
}

export function getStringInfo(schema: AnyZodSchema): StringInfo {
  const formats = new Set<"email" | "url" | "uuid" | "cuid">();
  const info: StringInfo = { formats };

  const v4 = v4Def(schema);
  if (v4 && v4.type === "string") {
    // v4 top-level format subclasses (ZodEmail/ZodURL/ZodUUID) put the format
    // at the def level, not in checks.
    if (v4.format === "email") formats.add("email");
    else if (v4.format === "url") formats.add("url");
    else if (v4.format === "uuid") formats.add("uuid");
    else if (v4.format === "cuid") formats.add("cuid");

    const checks = Array.isArray(v4.checks) ? v4.checks : [];
    for (const c of checks) {
      const cd = c?._zod?.def;
      if (!cd) continue;
      if (cd.check === "min_length") {
        if (typeof cd.minimum === "number") info.minLength = cd.minimum;
      } else if (cd.check === "max_length") {
        if (typeof cd.maximum === "number") info.maxLength = cd.maximum;
      } else if (cd.check === "length_equals") {
        if (typeof cd.length === "number") info.exactLength = cd.length;
      } else if (cd.check === "string_format") {
        if (cd.format === "regex" && cd.pattern instanceof RegExp) {
          info.regex = cd.pattern;
        } else if (cd.format === "email") {
          formats.add("email");
        } else if (cd.format === "url") {
          formats.add("url");
        } else if (cd.format === "uuid") {
          formats.add("uuid");
        } else if (cd.format === "cuid") {
          formats.add("cuid");
        } else if (cd.format === "starts_with" && typeof cd.prefix === "string") {
          info.startsWith = cd.prefix;
        } else if (cd.format === "ends_with" && typeof cd.suffix === "string") {
          info.endsWith = cd.suffix;
        }
      }
    }
    return info;
  }

  const v3 = v3Def(schema);
  if (v3 && v3.typeName === "ZodString") {
    const checks = Array.isArray(v3.checks) ? v3.checks : [];
    for (const c of checks) {
      if (!c || typeof c !== "object") continue;
      switch (c.kind) {
        case "min":
          if (typeof c.value === "number") info.minLength = c.value;
          break;
        case "max":
          if (typeof c.value === "number") info.maxLength = c.value;
          break;
        case "length":
          if (typeof c.value === "number") info.exactLength = c.value;
          break;
        case "regex":
          if (c.regex instanceof RegExp) info.regex = c.regex;
          break;
        case "startsWith":
          if (typeof c.value === "string") info.startsWith = c.value;
          break;
        case "endsWith":
          if (typeof c.value === "string") info.endsWith = c.value;
          break;
        case "email":
          formats.add("email");
          break;
        case "url":
          formats.add("url");
          break;
        case "uuid":
          formats.add("uuid");
          break;
        case "cuid":
          formats.add("cuid");
          break;
      }
    }
    return info;
  }

  return info;
}

export interface NumberInfo {
  min?: number;
  max?: number;
  int?: boolean;
  multipleOf?: number;
  finite?: boolean;
}

export function getNumberInfo(schema: AnyZodSchema): NumberInfo {
  const info: NumberInfo = {};

  const v4 = v4Def(schema);
  if (v4 && v4.type === "number") {
    const checks = Array.isArray(v4.checks) ? v4.checks : [];
    for (const c of checks) {
      const cd = c?._zod?.def;
      if (!cd) continue;
      if (cd.check === "greater_than") {
        if (typeof cd.value === "number") info.min = cd.value;
      } else if (cd.check === "less_than") {
        if (typeof cd.value === "number") info.max = cd.value;
      } else if (cd.check === "number_format") {
        // safeint / int32 / etc. all imply integer; v4 rejects Infinity/NaN
        // by default so there's no explicit "finite" check to detect.
        if (typeof cd.format === "string" && cd.format.includes("int")) {
          info.int = true;
        }
      } else if (cd.check === "multiple_of") {
        if (typeof cd.value === "number") info.multipleOf = cd.value;
      }
    }
    return info;
  }

  const v3 = v3Def(schema);
  if (v3 && v3.typeName === "ZodNumber") {
    const checks = Array.isArray(v3.checks) ? v3.checks : [];
    for (const c of checks) {
      if (!c || typeof c !== "object") continue;
      switch (c.kind) {
        case "min":
          if (typeof c.value === "number") info.min = c.value;
          break;
        case "max":
          if (typeof c.value === "number") info.max = c.value;
          break;
        case "int":
          info.int = true;
          break;
        case "multipleOf":
          if (typeof c.value === "number") info.multipleOf = c.value;
          break;
        case "finite":
          info.finite = true;
          break;
      }
    }
    return info;
  }

  return info;
}

export interface ArrayInfo {
  element: AnyZodSchema | null;
  minLength?: number;
  maxLength?: number;
  exactLength?: number;
}

export function getArrayInfo(schema: AnyZodSchema): ArrayInfo {
  const v4 = v4Def(schema);
  if (v4 && v4.type === "array") {
    const info: ArrayInfo = {
      element: (v4.element as AnyZodSchema | undefined) ?? null,
    };
    const checks = Array.isArray(v4.checks) ? v4.checks : [];
    for (const c of checks) {
      const cd = c?._zod?.def;
      if (!cd) continue;
      if (cd.check === "min_length") {
        if (typeof cd.minimum === "number") info.minLength = cd.minimum;
      } else if (cd.check === "max_length") {
        if (typeof cd.maximum === "number") info.maxLength = cd.maximum;
      } else if (cd.check === "length_equals") {
        if (typeof cd.length === "number") info.exactLength = cd.length;
      }
    }
    return info;
  }

  const v3 = v3Def(schema);
  if (v3 && v3.typeName === "ZodArray") {
    const info: ArrayInfo = {
      element: (v3.type as AnyZodSchema | undefined) ?? null,
    };
    if (v3.minLength && typeof v3.minLength.value === "number") {
      info.minLength = v3.minLength.value;
    }
    if (v3.maxLength && typeof v3.maxLength.value === "number") {
      info.maxLength = v3.maxLength.value;
    }
    if (v3.exactLength && typeof v3.exactLength.value === "number") {
      info.exactLength = v3.exactLength.value;
    }
    return info;
  }

  return { element: null };
}

// Returns the default value for a ZodDefault wrapper. v3 stores it as a
// factory function (`_def.defaultValue()`), v4 stores it directly
// (`_zod.def.defaultValue`). Returns undefined if the schema isn't a default
// or the value can't be resolved.
export function getDefaultValue(schema: AnyZodSchema): unknown {
  if (kindOf(schema) !== "default") return undefined;
  const v4 = v4Def(schema);
  if (v4 && "defaultValue" in v4) return v4.defaultValue;
  const v3 = v3Def(schema);
  if (v3 && typeof v3.defaultValue === "function") {
    try {
      return v3.defaultValue();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// Ordered list of applied checks, preserving the order users added them.
// Consumers like zodToSchemaFields produce constraint labels that mirror how
// the schema was written (e.g. `z.number().int().min(0)` → "int,min:0"),
// which is order-sensitive even though the end schema is equivalent.

export type NumberCheck =
  | { kind: "min"; value: number }
  | { kind: "max"; value: number }
  | { kind: "int" }
  | { kind: "multipleOf"; value: number }
  | { kind: "finite" };

export function listNumberChecks(schema: AnyZodSchema): NumberCheck[] {
  const out: NumberCheck[] = [];

  const v4 = v4Def(schema);
  if (v4 && v4.type === "number") {
    const checks = Array.isArray(v4.checks) ? v4.checks : [];
    for (const c of checks) {
      const cd = c?._zod?.def;
      if (!cd) continue;
      if (cd.check === "number_format") {
        if (typeof cd.format === "string" && cd.format.includes("int")) {
          out.push({ kind: "int" });
        }
      } else if (cd.check === "greater_than") {
        if (typeof cd.value === "number") out.push({ kind: "min", value: cd.value });
      } else if (cd.check === "less_than") {
        if (typeof cd.value === "number") out.push({ kind: "max", value: cd.value });
      } else if (cd.check === "multiple_of") {
        if (typeof cd.value === "number") {
          out.push({ kind: "multipleOf", value: cd.value });
        }
      }
    }
    return out;
  }

  const v3 = v3Def(schema);
  if (v3 && v3.typeName === "ZodNumber") {
    const checks = Array.isArray(v3.checks) ? v3.checks : [];
    for (const c of checks) {
      if (!c || typeof c !== "object") continue;
      switch (c.kind) {
        case "min":
          if (typeof c.value === "number") out.push({ kind: "min", value: c.value });
          break;
        case "max":
          if (typeof c.value === "number") out.push({ kind: "max", value: c.value });
          break;
        case "int":
          out.push({ kind: "int" });
          break;
        case "multipleOf":
          if (typeof c.value === "number") {
            out.push({ kind: "multipleOf", value: c.value });
          }
          break;
        case "finite":
          out.push({ kind: "finite" });
          break;
      }
    }
    return out;
  }

  return out;
}

export type StringCheck =
  | { kind: "min"; value: number }
  | { kind: "max"; value: number }
  | { kind: "length"; value: number }
  | { kind: "regex" }
  | { kind: "startsWith"; value: string }
  | { kind: "endsWith"; value: string }
  | { kind: "email" }
  | { kind: "url" }
  | { kind: "uuid" }
  | { kind: "cuid" };

export function listStringChecks(schema: AnyZodSchema): StringCheck[] {
  const out: StringCheck[] = [];

  const v4 = v4Def(schema);
  if (v4 && v4.type === "string") {
    // Top-level format subclasses (ZodEmail etc.) come before any chained
    // length check, so add them first. Regex doesn't live here.
    if (v4.format === "email") out.push({ kind: "email" });
    else if (v4.format === "url") out.push({ kind: "url" });
    else if (v4.format === "uuid") out.push({ kind: "uuid" });
    else if (v4.format === "cuid") out.push({ kind: "cuid" });

    const checks = Array.isArray(v4.checks) ? v4.checks : [];
    for (const c of checks) {
      const cd = c?._zod?.def;
      if (!cd) continue;
      if (cd.check === "min_length") {
        if (typeof cd.minimum === "number") out.push({ kind: "min", value: cd.minimum });
      } else if (cd.check === "max_length") {
        if (typeof cd.maximum === "number") out.push({ kind: "max", value: cd.maximum });
      } else if (cd.check === "length_equals") {
        if (typeof cd.length === "number") out.push({ kind: "length", value: cd.length });
      } else if (cd.check === "string_format") {
        if (cd.format === "regex") out.push({ kind: "regex" });
        else if (cd.format === "email") out.push({ kind: "email" });
        else if (cd.format === "url") out.push({ kind: "url" });
        else if (cd.format === "uuid") out.push({ kind: "uuid" });
        else if (cd.format === "cuid") out.push({ kind: "cuid" });
        else if (cd.format === "starts_with" && typeof cd.prefix === "string") {
          out.push({ kind: "startsWith", value: cd.prefix });
        } else if (cd.format === "ends_with" && typeof cd.suffix === "string") {
          out.push({ kind: "endsWith", value: cd.suffix });
        }
      }
    }
    return out;
  }

  const v3 = v3Def(schema);
  if (v3 && v3.typeName === "ZodString") {
    const checks = Array.isArray(v3.checks) ? v3.checks : [];
    for (const c of checks) {
      if (!c || typeof c !== "object") continue;
      switch (c.kind) {
        case "min":
          if (typeof c.value === "number") out.push({ kind: "min", value: c.value });
          break;
        case "max":
          if (typeof c.value === "number") out.push({ kind: "max", value: c.value });
          break;
        case "length":
          if (typeof c.value === "number") out.push({ kind: "length", value: c.value });
          break;
        case "regex":
          out.push({ kind: "regex" });
          break;
        case "startsWith":
          if (typeof c.value === "string") out.push({ kind: "startsWith", value: c.value });
          break;
        case "endsWith":
          if (typeof c.value === "string") out.push({ kind: "endsWith", value: c.value });
          break;
        case "email":
          out.push({ kind: "email" });
          break;
        case "url":
          out.push({ kind: "url" });
          break;
        case "uuid":
          out.push({ kind: "uuid" });
          break;
        case "cuid":
          out.push({ kind: "cuid" });
          break;
      }
    }
    return out;
  }

  return out;
}

// Lowercase type tag — bridges v3's PascalCase `typeName` ("ZodBigInt") and
// v4's snake_case `def.type` ("bigint"). Both normalize to lowercase words:
// "string", "number", "object", "bigint", "date", "null", "record", etc.
// Used by consumers (like zodToSchemaFields) that need finer granularity
// than `kindOf` provides.
export function getTypeTag(schema: AnyZodSchema): string {
  const v4 = v4Def(schema);
  if (v4 && typeof v4.type === "string") return v4.type;
  const v3 = v3Def(schema);
  if (v3 && typeof v3.typeName === "string") {
    return v3.typeName.replace(/^Zod/, "").toLowerCase();
  }
  return "unknown";
}

// ── shape / element / options accessors ──────────────────────────────────────

export function getObjectShape(
  schema: AnyZodSchema,
): Record<string, AnyZodSchema> | null {
  if (kindOf(schema) !== "object") return null;
  // Both zod v3 (getter on ZodObject) and v4 (same) expose `.shape`.
  const shape = (schema as { shape?: unknown }).shape;
  if (shape && typeof shape === "object") {
    return shape as Record<string, AnyZodSchema>;
  }
  // Fallback via def (v4 stores it as `def.shape` too).
  const v4 = v4Def(schema);
  if (v4?.shape && typeof v4.shape === "object") {
    return v4.shape as Record<string, AnyZodSchema>;
  }
  const v3 = v3Def(schema);
  if (typeof v3?.shape === "function") {
    const shapeVal = v3.shape();
    if (shapeVal && typeof shapeVal === "object") {
      return shapeVal as Record<string, AnyZodSchema>;
    }
  }
  return null;
}

export function getArrayElement(schema: AnyZodSchema): AnyZodSchema | null {
  if (kindOf(schema) !== "array") return null;
  // v4 ZodArray exposes `.element`; so does v3.
  const el = (schema as { element?: unknown }).element;
  if (el) return el as AnyZodSchema;
  const v4 = v4Def(schema);
  if (v4?.element) return v4.element as AnyZodSchema;
  const v3 = v3Def(schema);
  if (v3?.type) return v3.type as AnyZodSchema;
  return null;
}

export function getEnumOptions(schema: AnyZodSchema): string[] | null {
  if (kindOf(schema) !== "enum") return null;
  // v4 ZodEnum exposes `.options`; v3 ZodEnum also does.
  const opts = (schema as { options?: unknown }).options;
  if (Array.isArray(opts)) return opts.filter((v) => typeof v === "string");
  const v4 = v4Def(schema);
  if (v4?.entries && typeof v4.entries === "object") {
    return Object.values(v4.entries as Record<string, unknown>).filter(
      (v): v is string => typeof v === "string",
    );
  }
  const v3 = v3Def(schema);
  if (Array.isArray(v3?.values)) {
    return v3.values.filter((v: unknown): v is string => typeof v === "string");
  }
  return null;
}

export function getNativeEnumValues(schema: AnyZodSchema): string[] | null {
  // v3 only — v4 unified native enums into ZodEnum.
  if (kindOf(schema) !== "nativeEnum") return null;
  const v3 = v3Def(schema);
  const values = v3?.values;
  if (!values || typeof values !== "object") return null;
  return Object.values(values).filter(
    (v): v is string => typeof v === "string",
  );
}

export function getLiteralValue(schema: AnyZodSchema): unknown {
  if (kindOf(schema) !== "literal") return undefined;
  // v4 ZodLiteral: `.values` is an array of accepted values; v3 has `.value`.
  const v4 = v4Def(schema);
  if (v4?.values && Array.isArray(v4.values) && v4.values.length > 0) {
    return v4.values[0];
  }
  const v3 = v3Def(schema);
  if (v3 && "value" in v3) return v3.value;
  // Direct accessor fallback (v3 has `.value` getter on ZodLiteral).
  if ("value" in (schema as object)) {
    return (schema as { value?: unknown }).value;
  }
  return undefined;
}

export function getUnionOptions(schema: AnyZodSchema): AnyZodSchema[] | null {
  if (kindOf(schema) !== "union") return null;
  // Both expose `.options`.
  const opts = (schema as { options?: unknown }).options;
  if (Array.isArray(opts)) return opts as AnyZodSchema[];
  const v4 = v4Def(schema);
  if (Array.isArray(v4?.options)) return v4.options as AnyZodSchema[];
  const v3 = v3Def(schema);
  if (Array.isArray(v3?.options)) return v3.options as AnyZodSchema[];
  return null;
}

// ── safeParse: convenient wrapper that returns a normalized error shape ─────
// (Engine uses schema.safeParse directly because both v3 and v4 expose it.
// This helper is here for cases where we want a version-agnostic touchpoint.)

export interface SafeParseResult<T> {
  success: boolean;
  data?: T;
  issues?: Array<{ path: Array<string | number>; message: string }>;
}

export function safeParse<T>(
  schema: AnyZodSchema,
  data: unknown,
): SafeParseResult<T> {
  // Both v3 and v4 schemas expose `.safeParse`.
  const result = (
    schema as { safeParse: (d: unknown) => unknown }
  ).safeParse(data);
  if (!result || typeof result !== "object") {
    return { success: false };
  }
  const r = result as {
    success: boolean;
    data?: T;
    error?: { issues?: Array<{ path: Array<string | number>; message: string }> };
  };
  if (r.success) return { success: true, data: r.data };
  return { success: false, issues: r.error?.issues ?? [] };
}

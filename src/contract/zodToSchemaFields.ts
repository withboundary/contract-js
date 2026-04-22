import type { SchemaField } from "./types.js";
import {
  kindOf,
  getObjectShape,
  listStringChecks,
  listNumberChecks,
  getArrayInfo,
  getDefaultValue,
  getEnumOptions,
  getNativeEnumValues,
  getLiteralValue,
  getUnionOptions,
  getTypeTag,
  unwrapOne,
  type AnyZodSchema,
} from "../utils/zodCompat.js";

// Backend ingest caps (keep in sync with apps/api/src/routes/ingest.ts):
//   SchemaField.name       <= 128 chars
//   SchemaField.type       <= 128 chars
//   SchemaField.constraints <= 256 chars
//   schema array           <= 256 items
const MAX_NAME = 128;
const MAX_TYPE = 128;
const MAX_CONSTRAINTS = 256;
const MAX_FIELDS = 256;

// Flatten the top-level fields of a Zod object schema into SchemaField[].
// Non-object schemas produce a single-field array representing the whole
// value ("value" as the field name).
//
// The goal is human-readable metadata for the dashboard — not round-trippable
// JSON Schema. `type` is a short label ("string", "enum", "array<number>")
// and `constraints` packs the remaining info into a compact string.
export function zodToSchemaFields(schema: AnyZodSchema): SchemaField[] {
  if (kindOf(schema) === "object") {
    const shape = getObjectShape(schema) ?? {};
    const fields: SchemaField[] = [];
    for (const [name, child] of Object.entries(shape)) {
      if (fields.length >= MAX_FIELDS) break;
      fields.push(fieldFor(name, child));
    }
    return fields;
  }
  return [fieldFor("value", schema)];
}

function fieldFor(name: string, schema: AnyZodSchema): SchemaField {
  const { type, constraints } = describeZod(schema);
  return {
    name: clamp(name, MAX_NAME),
    type: clamp(type, MAX_TYPE),
    ...(constraints ? { constraints: clamp(constraints, MAX_CONSTRAINTS) } : {}),
  };
}

// Peels wrappers (Optional, Nullable, Default, v3-Effects, v4-Pipe) and
// returns a { type, constraints } pair. Constraints from wrappers (e.g.
// "optional") are merged with inner ones.
function describeZod(schema: AnyZodSchema): {
  type: string;
  constraints?: string;
} {
  const kind = kindOf(schema);

  switch (kind) {
    case "optional": {
      const inner = unwrapOne(schema);
      if (!inner) return { type: "unknown", constraints: "optional" };
      const innerDesc = describeZod(inner);
      return {
        type: innerDesc.type,
        constraints: mergeConstraints(innerDesc.constraints, "optional"),
      };
    }
    case "nullable": {
      const inner = unwrapOne(schema);
      if (!inner) return { type: "unknown", constraints: "nullable" };
      const innerDesc = describeZod(inner);
      return {
        type: innerDesc.type,
        constraints: mergeConstraints(innerDesc.constraints, "nullable"),
      };
    }
    case "default": {
      const inner = unwrapOne(schema);
      const innerDesc = inner ? describeZod(inner) : { type: "unknown" };
      let defaultLabel: string;
      try {
        defaultLabel = `default:${JSON.stringify(getDefaultValue(schema))}`;
      } catch {
        defaultLabel = "default";
      }
      return {
        type: innerDesc.type,
        constraints: mergeConstraints(innerDesc.constraints, defaultLabel),
      };
    }
    case "effects": {
      // v3: .refine() / .transform() wrap the schema. Describe the inner,
      // tag with "refined".
      const inner = unwrapOne(schema);
      if (!inner) return { type: "unknown", constraints: "refined" };
      const innerDesc = describeZod(inner);
      return {
        type: innerDesc.type,
        constraints: mergeConstraints(innerDesc.constraints, "refined"),
      };
    }
    case "pipe": {
      // v4: .transform() produces a ZodPipe. Describe the input side, tag
      // with "transformed" to hint at the post-parse shift.
      const inner = unwrapOne(schema);
      if (!inner) return { type: "unknown", constraints: "transformed" };
      const innerDesc = describeZod(inner);
      return {
        type: innerDesc.type,
        constraints: mergeConstraints(innerDesc.constraints, "transformed"),
      };
    }
    case "string":
      return { type: "string", constraints: stringConstraints(schema) };
    case "number":
      return { type: "number", constraints: numberConstraints(schema) };
    case "boolean":
      return { type: "boolean" };
    case "literal": {
      const value = getLiteralValue(schema);
      return { type: "literal", constraints: `=${JSON.stringify(value)}` };
    }
    case "enum": {
      const values = getEnumOptions(schema) ?? [];
      return { type: "enum", constraints: values.join("|") };
    }
    case "nativeEnum": {
      const values = getNativeEnumValues(schema) ?? [];
      return { type: "enum", constraints: values.join("|") };
    }
    case "array": {
      const info = getArrayInfo(schema);
      const inner = info.element
        ? describeZod(info.element)
        : { type: "unknown", constraints: undefined };
      return {
        type: `array<${inner.type}>`,
        constraints: mergeConstraints(inner.constraints, arrayConstraintsString(info)),
      };
    }
    case "object":
      return { type: "object" };
    case "union": {
      const options = getUnionOptions(schema) ?? [];
      const parts = options.map((opt) => describeZod(opt).type);
      return { type: parts.join("|") };
    }
    default: {
      // Fall through to the raw type tag for less-common zod schemas
      // (bigint, date, record, map, set, tuple, intersection, lazy, null,
      // undefined, void, never, any, unknown, …).
      return { type: getTypeTag(schema) };
    }
  }
}

function stringConstraints(schema: AnyZodSchema): string | undefined {
  const parts = listStringChecks(schema).map((c) => {
    switch (c.kind) {
      case "min":
        return `min:${c.value}`;
      case "max":
        return `max:${c.value}`;
      case "length":
        return `length:${c.value}`;
      case "email":
      case "url":
      case "uuid":
      case "cuid":
      case "regex":
        return c.kind;
      case "startsWith":
        return "startsWith";
      case "endsWith":
        return "endsWith";
    }
  });
  return parts.length > 0 ? parts.join(",") : undefined;
}

function numberConstraints(schema: AnyZodSchema): string | undefined {
  const parts = listNumberChecks(schema).map((c) => {
    switch (c.kind) {
      case "min":
        return `min:${c.value}`;
      case "max":
        return `max:${c.value}`;
      case "int":
        return "int";
      case "multipleOf":
        return `multipleOf:${c.value}`;
      case "finite":
        return "finite";
    }
  });
  return parts.length > 0 ? parts.join(",") : undefined;
}

function arrayConstraintsString(info: {
  minLength?: number;
  maxLength?: number;
  exactLength?: number;
}): string | undefined {
  const parts: string[] = [];
  if (typeof info.minLength === "number") parts.push(`min:${info.minLength}`);
  if (typeof info.maxLength === "number") parts.push(`max:${info.maxLength}`);
  if (typeof info.exactLength === "number") {
    parts.push(`length:${info.exactLength}`);
  }
  return parts.length > 0 ? parts.join(",") : undefined;
}

function mergeConstraints(
  ...parts: Array<string | undefined>
): string | undefined {
  const filtered = parts.filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return filtered.length > 0 ? filtered.join(",") : undefined;
}

function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

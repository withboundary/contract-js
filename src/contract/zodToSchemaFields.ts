import { ZodObject, type ZodType } from "zod";
import type { SchemaField } from "./types.js";

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
export function zodToSchemaFields(schema: ZodType): SchemaField[] {
  if (schema instanceof ZodObject) {
    const shape = schema.shape as Record<string, ZodType>;
    const fields: SchemaField[] = [];
    for (const [name, child] of Object.entries(shape)) {
      if (fields.length >= MAX_FIELDS) break;
      fields.push(fieldFor(name, child));
    }
    return fields;
  }
  return [fieldFor("value", schema)];
}

function fieldFor(name: string, schema: ZodType): SchemaField {
  const { type, constraints } = describeZod(schema);
  return {
    name: clamp(name, MAX_NAME),
    type: clamp(type, MAX_TYPE),
    ...(constraints ? { constraints: clamp(constraints, MAX_CONSTRAINTS) } : {}),
  };
}

// Peels wrappers (Optional, Nullable, Default) and returns a { type, constraints }
// pair. Constraints from wrappers (e.g. "optional") are merged with inner ones.
function describeZod(schema: ZodType): { type: string; constraints?: string } {
  const def = (schema as unknown as { _def: { typeName: string } })._def;
  const typeName = def.typeName;

  switch (typeName) {
    case "ZodOptional": {
      const inner = describeZod((schema as unknown as { _def: { innerType: ZodType } })._def.innerType);
      return { type: inner.type, constraints: mergeConstraints(inner.constraints, "optional") };
    }
    case "ZodNullable": {
      const inner = describeZod((schema as unknown as { _def: { innerType: ZodType } })._def.innerType);
      return { type: inner.type, constraints: mergeConstraints(inner.constraints, "nullable") };
    }
    case "ZodDefault": {
      const innerSchema = (schema as unknown as { _def: { innerType: ZodType; defaultValue: () => unknown } })._def;
      const inner = describeZod(innerSchema.innerType);
      let defaultLabel: string;
      try {
        defaultLabel = `default:${JSON.stringify(innerSchema.defaultValue())}`;
      } catch {
        defaultLabel = "default";
      }
      return { type: inner.type, constraints: mergeConstraints(inner.constraints, defaultLabel) };
    }
    case "ZodString":
      return { type: "string", constraints: stringConstraints(schema) };
    case "ZodNumber":
      return { type: "number", constraints: numberConstraints(schema) };
    case "ZodBigInt":
      return { type: "bigint" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodDate":
      return { type: "date" };
    case "ZodLiteral": {
      const value = (schema as unknown as { _def: { value: unknown } })._def.value;
      return { type: "literal", constraints: `=${JSON.stringify(value)}` };
    }
    case "ZodEnum": {
      const values = (schema as unknown as { _def: { values: readonly string[] } })._def.values;
      return { type: "enum", constraints: values.join("|") };
    }
    case "ZodNativeEnum": {
      const enumObj = (schema as unknown as { _def: { values: Record<string, string | number> } })._def.values;
      const values = Object.values(enumObj).filter((v) => typeof v !== "number" || !Object.prototype.hasOwnProperty.call(enumObj, v));
      return { type: "enum", constraints: values.map(String).join("|") };
    }
    case "ZodArray": {
      const inner = describeZod((schema as unknown as { _def: { type: ZodType } })._def.type);
      const constraints = arrayConstraints(schema);
      return { type: `array<${inner.type}>`, constraints: mergeConstraints(inner.constraints, constraints) };
    }
    case "ZodObject":
      return { type: "object" };
    case "ZodRecord":
      return { type: "record" };
    case "ZodMap":
      return { type: "map" };
    case "ZodSet":
      return { type: "set" };
    case "ZodTuple":
      return { type: "tuple" };
    case "ZodUnion":
    case "ZodDiscriminatedUnion": {
      const options = (schema as unknown as { _def: { options: ZodType[] } })._def.options;
      const parts = options.map((opt) => describeZod(opt).type);
      return { type: parts.join("|") };
    }
    case "ZodIntersection":
      return { type: "intersection" };
    case "ZodLazy":
      return { type: "lazy" };
    case "ZodEffects": {
      const inner = describeZod((schema as unknown as { _def: { schema: ZodType } })._def.schema);
      return { type: inner.type, constraints: mergeConstraints(inner.constraints, "refined") };
    }
    case "ZodAny":
    case "ZodUnknown":
      return { type: "any" };
    case "ZodNull":
      return { type: "null" };
    case "ZodUndefined":
      return { type: "undefined" };
    case "ZodVoid":
      return { type: "void" };
    case "ZodNever":
      return { type: "never" };
    default:
      return { type: typeName.replace(/^Zod/, "").toLowerCase() };
  }
}

function stringConstraints(schema: ZodType): string | undefined {
  const def = (schema as unknown as { _def: { checks?: Array<{ kind: string; value?: number; regex?: RegExp }> } })._def;
  const checks = def.checks ?? [];
  const parts: string[] = [];
  for (const check of checks) {
    switch (check.kind) {
      case "min":
        parts.push(`min:${check.value}`);
        break;
      case "max":
        parts.push(`max:${check.value}`);
        break;
      case "length":
        parts.push(`length:${check.value}`);
        break;
      case "email":
        parts.push("email");
        break;
      case "url":
        parts.push("url");
        break;
      case "uuid":
        parts.push("uuid");
        break;
      case "cuid":
        parts.push("cuid");
        break;
      case "regex":
        parts.push("regex");
        break;
      case "startsWith":
        parts.push("startsWith");
        break;
      case "endsWith":
        parts.push("endsWith");
        break;
    }
  }
  return parts.length > 0 ? parts.join(",") : undefined;
}

function numberConstraints(schema: ZodType): string | undefined {
  const def = (schema as unknown as { _def: { checks?: Array<{ kind: string; value?: number }> } })._def;
  const checks = def.checks ?? [];
  const parts: string[] = [];
  for (const check of checks) {
    switch (check.kind) {
      case "min":
        parts.push(`min:${check.value}`);
        break;
      case "max":
        parts.push(`max:${check.value}`);
        break;
      case "int":
        parts.push("int");
        break;
      case "multipleOf":
        parts.push(`multipleOf:${check.value}`);
        break;
      case "finite":
        parts.push("finite");
        break;
    }
  }
  return parts.length > 0 ? parts.join(",") : undefined;
}

function arrayConstraints(schema: ZodType): string | undefined {
  const def = (schema as unknown as { _def: { minLength?: { value: number }; maxLength?: { value: number }; exactLength?: { value: number } } })._def;
  const parts: string[] = [];
  if (def.minLength) parts.push(`min:${def.minLength.value}`);
  if (def.maxLength) parts.push(`max:${def.maxLength.value}`);
  if (def.exactLength) parts.push(`length:${def.exactLength.value}`);
  return parts.length > 0 ? parts.join(",") : undefined;
}

function mergeConstraints(...parts: Array<string | undefined>): string | undefined {
  const filtered = parts.filter((p): p is string => typeof p === "string" && p.length > 0);
  return filtered.length > 0 ? filtered.join(",") : undefined;
}

function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

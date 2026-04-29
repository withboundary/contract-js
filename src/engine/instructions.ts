import {
  kindOf,
  unwrapOne,
  getStringInfo,
  getNumberInfo,
  getObjectShape,
  getArrayElement,
  getEnumOptions,
  getNativeEnumValues,
  getLiteralValue,
  getUnionOptions,
  type AnyZodSchema,
  type SchemaKind,
} from "../utils/zodCompat.js";

export function instructions(schema: AnyZodSchema): string {
  const shape = describeSchema(schema, 0);
  return [
    "Respond with valid JSON matching this structure exactly.",
    "Include all required fields.",
    "Do not include extra fields.",
    "Enum values must match exactly, including casing.",
    "Do not include any text outside the JSON. No markdown fences, no explanation.",
    "",
    shape,
  ].join("\n");
}

function describeSchema(schema: AnyZodSchema, depth: number): string {
  const indent = "  ".repeat(depth);
  const unwrapped = unwrapAllWrappers(schema);
  const kind = kindOf(unwrapped);

  switch (kind) {
    case "object":
      return describeObject(unwrapped, depth);
    case "array": {
      const element = getArrayElement(unwrapped);
      const itemDesc = element ? describeSchema(element, depth + 1) : `${indent}  any`;
      return `${indent}array of:\n${itemDesc}`;
    }
    case "enum": {
      const values = (getEnumOptions(unwrapped) ?? []).map((v) => `"${v}"`).join(" | ");
      return `${indent}one of: ${values}`;
    }
    case "nativeEnum": {
      const values = (getNativeEnumValues(unwrapped) ?? []).map((v) => `"${v}"`).join(" | ");
      return `${indent}one of: ${values}`;
    }
    case "literal":
      return `${indent}exactly: ${JSON.stringify(getLiteralValue(unwrapped))}`;
    case "union": {
      const opts = getUnionOptions(unwrapped) ?? [];
      return opts.map((o) => describeSchema(o, depth)).join(" | ");
    }
    case "string": {
      const constraints = describeStringConstraints(unwrapped);
      return `${indent}string${constraints ? ` (${constraints})` : ""}`;
    }
    case "number": {
      const constraints = describeNumberConstraints(unwrapped);
      return `${indent}number${constraints ? ` (${constraints})` : ""}`;
    }
    case "boolean":
      return `${indent}boolean`;
    default:
      return `${indent}any`;
  }
}

function describeObject(schema: AnyZodSchema, depth: number): string {
  const indent = "  ".repeat(depth);
  const shape = getObjectShape(schema) ?? {};
  const lines: string[] = [`${indent}{`];

  for (const [key, value] of Object.entries(shape)) {
    const optional = isOptionalLike(value);
    const suffix = optional ? " (optional)" : "";
    const desc = describeSchema(value, 0).trim();
    lines.push(`${indent}  "${key}": ${desc}${suffix}`);
  }

  lines.push(`${indent}}`);
  return lines.join("\n");
}

function describeStringConstraints(schema: AnyZodSchema): string {
  const info = getStringInfo(schema);
  const parts: string[] = [];
  if (typeof info.minLength === "number") {
    parts.push(`min length: ${info.minLength}`);
  }
  if (typeof info.maxLength === "number") {
    parts.push(`max length: ${info.maxLength}`);
  }
  if (info.formats.has("email")) parts.push("email format");
  if (info.formats.has("url")) parts.push("URL format");
  if (info.formats.has("uuid")) parts.push("UUID format");
  if (info.regex) parts.push(`pattern: ${info.regex}`);
  return parts.join(", ");
}

function describeNumberConstraints(schema: AnyZodSchema): string {
  const info = getNumberInfo(schema);
  const parts: string[] = [];
  if (typeof info.min === "number") parts.push(`>= ${info.min}`);
  if (typeof info.max === "number") parts.push(`<= ${info.max}`);
  if (info.int) parts.push("integer");
  return parts.join(", ");
}

// Optional-like = the field can be omitted. Covers Optional and Default
// wrappers (both allow the key to be missing); keeps Nullable out (null is
// a required value, not a missing key).
function isOptionalLike(schema: AnyZodSchema): boolean {
  const kind = kindOf(schema);
  if (kind === "optional" || kind === "default") return true;
  return false;
}

// Peel wrappers that affect only the "is it required" question, so
// describe logic sees the inner shape. Stops at nullable (null IS a value
// we want to describe), at v3-Effects (inner schema is what we describe),
// at v4-Pipe (input-side is what we describe).
function unwrapAllWrappers(schema: AnyZodSchema): AnyZodSchema {
  let current = schema;
  for (let i = 0; i < 32; i++) {
    const kind = kindOf(current);
    if (!isWrapper(kind)) return current;
    const next = unwrapOne(current);
    if (!next) return current;
    current = next;
  }
  return current;
}

function isWrapper(kind: SchemaKind): boolean {
  return (
    kind === "optional" ||
    kind === "nullable" ||
    kind === "default" ||
    kind === "effects" ||
    kind === "pipe"
  );
}

import { kindOf, unwrapOne, getObjectShape, type AnyZodSchema } from "./zodCompat.js";

export function select(
  state: Record<string, unknown>,
  schema: AnyZodSchema,
): Record<string, unknown> {
  const inner = unwrapToObject(schema);
  if (!inner) {
    return {};
  }

  return projectObject(state, inner);
}

function projectObject(
  source: Record<string, unknown>,
  schema: AnyZodSchema,
): Record<string, unknown> {
  const shape = getObjectShape(schema);
  if (!shape) return {};

  const result: Record<string, unknown> = {};

  for (const key of Object.keys(shape)) {
    if (!(key in source)) {
      continue;
    }

    const value = source[key];
    const fieldSchema = unwrapToObject(shape[key]);

    if (
      fieldSchema &&
      value !== null &&
      value !== undefined &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      result[key] = projectObject(value as Record<string, unknown>, fieldSchema);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function unwrapToObject(schema: AnyZodSchema): AnyZodSchema | null {
  if (kindOf(schema) === "object") return schema;
  const inner = unwrapOne(schema);
  if (!inner) return null;
  return unwrapToObject(inner);
}

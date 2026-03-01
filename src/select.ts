import { type ZodType, ZodObject } from "zod";

export function select<T>(
  state: Record<string, unknown>,
  schema: ZodType<T>,
): Record<string, unknown> {
  const inner = unwrapToObject(schema);
  if (!inner) {
    return {};
  }

  return projectObject(state, inner);
}

function projectObject(
  source: Record<string, unknown>,
  schema: ZodObject<any>,
): Record<string, unknown> {
  const shape = schema.shape;
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(shape)) {
    if (!(key in source)) {
      continue;
    }

    const value = source[key];
    const fieldSchema = unwrapToObject(shape[key] as ZodType);

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

function unwrapToObject(schema: ZodType): ZodObject<any> | null {
  if (schema instanceof ZodObject) {
    return schema;
  }

  const def = (schema as any)._def;
  if (def?.innerType) {
    return unwrapToObject(def.innerType);
  }
  if (def?.schema) {
    return unwrapToObject(def.schema);
  }

  return null;
}

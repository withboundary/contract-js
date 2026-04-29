import type { Success } from "../contract/types.js";

export function success<T>(data: T, attempts: number, raw: string, durationMS: number): Success<T> {
  return { ok: true, data, attempts, raw, durationMS };
}

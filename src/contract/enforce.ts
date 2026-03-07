import type { ZodType } from "zod";
import { defineContract } from "./defineContract.js";
import type { EnforceOptions, Result, RunFn } from "./types.js";

export function enforce<T>(
  schema: ZodType<T>,
  runFn: RunFn,
  options?: EnforceOptions<T>,
): Promise<Result<T>> {
  const contract = defineContract({ schema, ...(options ?? {}) });
  return contract.run(runFn);
}

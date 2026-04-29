import { defineContract } from "./defineContract.js";
import type { ContractOptions, ContractResult, ContractSchema, RunFn } from "./types.js";

// Shortcut for one-off contracts. `options.name` is required — every run
// needs identity for logging, tracing, and the dashboard.
export function enforce<T>(
  schema: ContractSchema<T>,
  runFn: RunFn,
  options: ContractOptions<T> & { name: string },
): Promise<ContractResult<T>> {
  const { name, ...rest } = options;
  const contract = defineContract({ name, schema, ...rest });
  return contract.accept(runFn);
}

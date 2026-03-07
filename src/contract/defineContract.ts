import type { Contract, DefineContractInput } from "./types.js";
import { mergeOptions } from "./normalizeOptions.js";
import { runContract } from "./runContract.js";

export function defineContract<T>(input: DefineContractInput<T>): Contract<T> {
  const { schema, ...definitionOptions } = input;

  return {
    run(runFn, runtimeOptions) {
      const options = mergeOptions(definitionOptions, runtimeOptions);
      return runContract(schema, runFn, options);
    },
  };
}

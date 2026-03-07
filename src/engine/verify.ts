import type { ZodError, ZodType } from "zod";
import type { Invariant, Result } from "../contract/types.js";
import { createAttemptDetail, createContractError, failure } from "../result/failure.js";
import { success } from "../result/success.js";

export function verify<T>(
  data: unknown,
  schema: ZodType<T>,
  invariants?: Invariant<T>[],
): Result<T> {
  const parseResult = schema.safeParse(data);

  if (!parseResult.success) {
    const issues = formatZodError(parseResult.error);
    const detail = createAttemptDetail(
      typeof data === "string" ? data : JSON.stringify(data),
      data,
      issues,
      "VALIDATION_ERROR",
    );
    return failure(createContractError([detail]));
  }

  const typed = parseResult.data;

  if (invariants && invariants.length > 0) {
    const invariantIssues: string[] = [];

    for (const invariant of invariants) {
      const result = invariant(typed);
      if (result !== true) {
        invariantIssues.push(result);
      }
    }

    if (invariantIssues.length > 0) {
      const detail = createAttemptDetail(
        typeof data === "string" ? data : JSON.stringify(data),
        data,
        invariantIssues,
        "INVARIANT_ERROR",
      );
      return failure(createContractError([detail]));
    }
  }

  return success(
    typed,
    1,
    typeof data === "string" ? data : JSON.stringify(data),
    0,
  );
}

export function formatZodError(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}

import type {
  ContractResult,
  ContractSchema,
  Rule,
  RuleIssue,
} from "../contract/types.js";
import { safeParse } from "../utils/zodCompat.js";
import { createAttemptDetail, createContractError, failure } from "../result/failure.js";
import { success } from "../result/success.js";

export function verify<T>(
  data: unknown,
  schema: ContractSchema<T>,
  rules?: Rule<T>[],
): ContractResult<T> {
  const parseResult = safeParse<T>(schema, data);

  if (!parseResult.success) {
    const issues = formatIssues(parseResult.issues ?? []);
    const detail = createAttemptDetail(
      typeof data === "string" ? data : JSON.stringify(data),
      data,
      issues,
      "VALIDATION_ERROR",
    );
    return failure(createContractError([detail]));
  }

  const typed = parseResult.data as T;

  if (rules && rules.length > 0) {
    const ruleIssues: RuleIssue[] = [];

    for (const rule of rules) {
      const result = rule.check(typed);
      if (result === true) continue;
      const message =
        typeof result === "string" && result.length > 0
          ? result
          : rule.message ?? "Rule failed";
      ruleIssues.push({
        rule: { name: rule.name, ...(rule.fields ? { fields: rule.fields } : {}) },
        message,
      });
    }

    if (ruleIssues.length > 0) {
      const detail = createAttemptDetail(
        typeof data === "string" ? data : JSON.stringify(data),
        data,
        ruleIssues.map((i) => i.message),
        "RULE_ERROR",
        ruleIssues,
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

// Flatten normalized zod issues (from zodCompat.safeParse) into the dotted-path
// strings that `AttemptDetail.issues` expects. Works for both zod v3 and v4
// because the adapter produces the same shape for each.
export function formatIssues(
  issues: Array<{ path: Array<string | number>; message: string }>,
): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}

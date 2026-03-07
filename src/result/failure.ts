import type {
  AttemptDetail,
  ContractError,
  Failure,
  FailureCategory,
} from "../contract/types.js";

export function failure(error: ContractError): Failure {
  return { ok: false, error };
}

export function createContractError(attempts: AttemptDetail[]): ContractError {
  const lastAttempt = attempts[attempts.length - 1];
  const issuesSummary = lastAttempt
    ? lastAttempt.issues.join("; ")
    : "unknown error";
  const category = lastAttempt?.category ?? "VALIDATION_ERROR";
  return {
    message: `Contract failed after ${attempts.length} attempt(s) [${category}]: ${issuesSummary}`,
    attempts,
  };
}

export function createAttemptDetail(
  raw: string,
  cleaned: unknown,
  issues: string[],
  category: FailureCategory,
): AttemptDetail {
  return { raw, cleaned, issues, category };
}

export class ContractValidationError extends Error {
  public readonly contractError: ContractError;

  constructor(contractError: ContractError) {
    super(contractError.message);
    this.name = "ContractValidationError";
    this.contractError = contractError;
  }
}

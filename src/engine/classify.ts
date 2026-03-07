import type { FailureCategory } from "../contract/types.js";

const REFUSAL_PATTERNS = [
  /i(?:'m| am) sorry/i,
  /i can(?:'t|not) (?:assist|help|provide|do)/i,
  /i apologize/i,
  /as an ai/i,
  /i(?:'m| am) unable to/i,
  /i(?:'m| am) not able to/i,
  /against (?:my|the) (?:guidelines|policy|rules)/i,
  /i must (?:decline|refuse)/i,
];

export function classify(raw: string, cleaned: unknown): FailureCategory {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return "EMPTY_RESPONSE";
  }

  if (cleaned !== null && cleaned !== undefined) {
    return "VALIDATION_ERROR";
  }

  if (isRefusal(trimmed)) {
    return "REFUSAL";
  }

  if (isTruncated(trimmed)) {
    return "TRUNCATED";
  }

  const hasStructure = trimmed.includes("{") || trimmed.includes("[");
  if (hasStructure) {
    return "PARSE_ERROR";
  }

  return "NO_JSON";
}

function isRefusal(text: string): boolean {
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(text));
}

function isTruncated(text: string): boolean {
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      openBraces++;
    }
    if (char === "}") {
      openBraces--;
    }
    if (char === "[") {
      openBrackets++;
    }
    if (char === "]") {
      openBrackets--;
    }
  }

  return openBraces > 0 || openBrackets > 0;
}

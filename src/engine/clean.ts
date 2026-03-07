export function clean(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw !== "string") {
    return raw;
  }

  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }

  const stripped = stripFences(trimmed);
  const extracted = extractJSON(stripped);
  const parsed = parseJSON(extracted);

  if (parsed !== undefined) {
    return coerce(parsed);
  }

  return null;
}

function stripFences(text: string): string {
  const fencePattern = /^```(?:json|JSON|js|javascript)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = text.match(fencePattern);
  if (match) {
    return match[1].trim();
  }

  const innerFencePattern =
    /```(?:json|JSON|js|javascript)?\s*\n?([\s\S]*?)\n?\s*```/;
  const innerMatch = text.match(innerFencePattern);
  if (innerMatch) {
    return innerMatch[1].trim();
  }

  return text;
}

function extractJSON(text: string): string {
  const trimmed = text.trim();

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return trimmed;
  }

  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");

  let start = -1;
  let openChar = "";
  let closeChar = "";

  if (objectStart === -1 && arrayStart === -1) {
    return trimmed;
  }

  if (objectStart === -1) {
    start = arrayStart;
    openChar = "[";
    closeChar = "]";
  } else if (arrayStart === -1) {
    start = objectStart;
    openChar = "{";
    closeChar = "}";
  } else if (objectStart <= arrayStart) {
    start = objectStart;
    openChar = "{";
    closeChar = "}";
  } else {
    start = arrayStart;
    openChar = "[";
    closeChar = "]";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i++) {
    const char = trimmed[i];

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

    if (char === openChar) {
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return trimmed.slice(start, i + 1);
      }
    }
  }

  return trimmed;
}

function parseJSON(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function coerce(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(coerce);
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = coerce(v);
    }
    return result;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    if (value === "null") {
      return null;
    }

    const num = Number(value);
    if (value !== "" && !Number.isNaN(num) && Number.isFinite(num)) {
      return num;
    }
  }

  return value;
}

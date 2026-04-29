import type { ConsoleLoggerOptions } from "./types.js";

const DEFAULT_MAX_STRING_LENGTH = 800;

export function truncateString(value: string, options: ConsoleLoggerOptions): string {
  const maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
  if (value.length <= maxStringLength) {
    return value;
  }
  return `${value.slice(0, maxStringLength)}\n... (truncated ${value.length - maxStringLength} chars)`;
}

export function stringifyUnknown(value: unknown, options: ConsoleLoggerOptions): string {
  if (typeof value === "string") {
    return truncateString(value, options);
  }

  try {
    return truncateString(JSON.stringify(value, null, 2), options);
  } catch {
    return truncateString(String(value), options);
  }
}

export function heading(prefix: string, title: string): string {
  return `${prefix} ${title}`;
}

export function block(title: string, body: string): string[] {
  return [title, body];
}

export function joinLines(lines: string[]): string {
  return lines.join("\n");
}

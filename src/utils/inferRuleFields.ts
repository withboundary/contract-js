// Infer which fields a rule's `check` function reads, so users don't have
// to hand-maintain `Rule.fields` for common cases. Runs once per unique
// `check` function and caches the result via WeakMap — parsing on every
// verify attempt would be wasteful (rules run per-attempt in hot paths).
//
// Heuristic, not a full JS parser. Covers the common 80%:
//   (d) => d.score >= 0         → ["score"]
//   ({ a, b }) => a || b        → ["a", "b"]
//   (d) => d.items.length > 0   → ["items"]   (top-level only)
// Degrades to `undefined` on ambiguous input (helpers, aliasing). See
// the attached test suite for the exact surface.

const cache = new WeakMap<object, string[] | undefined>();

export function inferRuleFields(check: unknown): string[] | undefined {
  if (typeof check !== "function") return undefined;

  const cached = cache.get(check);
  if (cached !== undefined || cache.has(check)) return cached;

  const inferred = computeFields(check);
  cache.set(check, inferred);
  return inferred;
}

function computeFields(check: Function): string[] | undefined {
  let src: string;
  try {
    src = check.toString();
  } catch {
    return undefined;
  }
  if (!src) return undefined;

  // Strip a leading `async` marker so the param-block detectors below don't
  // have to special-case it.
  const withoutAsync = src.replace(/^\s*async\s+/, "");

  const destructured = extractDestructuredKeys(withoutAsync);
  if (destructured) {
    return destructured.length > 0 ? destructured : undefined;
  }

  const paramName = extractParamName(withoutAsync);
  if (!paramName) return undefined;

  return findAccesses(src, paramName);
}

// Matches a destructured first parameter: `({ a, b: alias, c = 1 }) => ...`
// or `function check({ a }) { ... }`. Returns the *source* field names (the
// left side of `:` for renamed bindings, before the `=` for defaults), so
// the wire representation matches the user's object keys rather than any
// local aliases they introduce.
function extractDestructuredKeys(src: string): string[] | null {
  // Arrow form: `({ … }) =>`  |  Function form: `function name?({ … })`
  const arrow = src.match(/^\s*\(\s*\{\s*([^}]*)\}\s*(?:,[^)]*)?\)\s*=>/);
  const fn = src.match(/^\s*function\b[^(]*\(\s*\{\s*([^}]*)\}\s*(?:,[^)]*)?\)/);
  const match = arrow ?? fn;
  if (!match) return null;

  const inside = match[1];
  const keys: string[] = [];
  for (const part of splitTopLevel(inside, ",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Drop a default assignment: `name = expr` → `name`
    const beforeDefault = trimmed.split("=")[0].trim();
    // Rest element `...rest` — not a nameable field on the wire.
    if (beforeDefault.startsWith("...")) continue;
    // Renamed binding: `source: local` → source
    const sourceName = beforeDefault.split(":")[0].trim();
    if (isIdentifier(sourceName)) keys.push(sourceName);
  }
  // Dedupe preserving insertion order.
  return Array.from(new Set(keys));
}

// Matches the first parameter as a single identifier. Handles:
//   (d) => …        d => …        (d, i) => …
//   function check(d) { … }       async (d) => …  (async already stripped)
function extractParamName(src: string): string | null {
  // Arrow with parens: `(d, ...)` → first non-empty name up to `,` or `)`
  const arrowParens = src.match(/^\s*\(\s*([^,)]*)(?:,[^)]*)?\)\s*=>/);
  if (arrowParens) {
    const name = arrowParens[1]
      .trim()
      .replace(/\s*:\s*[^,)]*$/, "")
      .trim();
    return isIdentifier(name) ? name : null;
  }
  // Arrow bare: `d => …`
  const arrowBare = src.match(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=>/);
  if (arrowBare) return arrowBare[1];
  // Classic function: `function [name](d, ...)`
  const fn = src.match(/^\s*function\b[^(]*\(\s*([^,)]*)(?:,[^)]*)?\)/);
  if (fn) {
    const name = fn[1]
      .trim()
      .replace(/\s*:\s*[^,)]*$/, "")
      .trim();
    return isIdentifier(name) ? name : null;
  }
  return null;
}

// Collects unique property accesses on `param` from the source. Handles
// `param.prop` and `param?.prop`. Uses a negative lookbehind to avoid
// false-positive matches inside dotted chains (e.g. `other.d.x` does NOT
// count `d.x`).
function findAccesses(src: string, param: string): string[] | undefined {
  const escaped = param.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // (?<![.\w$]) — not preceded by another identifier char or dot
  // (?:\?\.|\.) — either optional chaining `?.` or plain `.`
  const re = new RegExp(`(?<![.\\w$])${escaped}(?:\\?\\.|\\.)([A-Za-z_$][A-Za-z0-9_$]*)`, "g");
  const fields = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    fields.add(m[1]);
  }
  return fields.size > 0 ? Array.from(fields) : undefined;
}

// Split `inside` by `sep`, respecting nested brackets/braces/parens so a
// nested default like `{ a = { nested: 1 } }` doesn't split mid-expression.
function splitTopLevel(inside: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inside.length; i++) {
    const c = inside[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === sep && depth === 0) {
      out.push(inside.slice(start, i));
      start = i + 1;
    }
  }
  out.push(inside.slice(start));
  return out;
}

function isIdentifier(s: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);
}

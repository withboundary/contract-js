import type {
  ContractConfig,
  DefinedContract,
  Rule,
  RuleDefinition,
  SchemaField,
} from "./types.js";
import { mergeOptions } from "./normalizeOptions.js";
import { runContract } from "./runContract.js";
import { inferRuleFields } from "../utils/inferRuleFields.js";
import { zodToSchemaFields } from "./zodToSchemaFields.js";

// Caps mirror the ingest Zod validators in apps/api/src/routes/ingest.ts.
const MAX_RULE_NAME = 128;
const MAX_RULE_EXPRESSION = 2000;
const MAX_RULE_DESCRIPTION = 1000;
const MAX_RULE_FIELDS = 64;
const MAX_RULE_FIELD = 128;

export function defineContract<T>(config: ContractConfig<T>): DefinedContract<T> {
  const { name, schema, ...definitionOptions } = config;

  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError(
      'defineContract({ name }) is required. Give the contract a human-readable name like "lead-scoring".',
    );
  }

  validateRules(definitionOptions.rules);

  let described: { schema: SchemaField[]; rules: RuleDefinition[] } | null = null;
  const describe = (): { schema: SchemaField[]; rules: RuleDefinition[] } => {
    if (!described) {
      described = {
        schema: zodToSchemaFields(schema),
        rules: rulesToDefinitions(definitionOptions.rules),
      };
    }
    return described;
  };

  return {
    accept(run, runtimeOptions) {
      const options = mergeOptions(definitionOptions, runtimeOptions);
      return runContract(name, schema, run, options, describe);
    },
    describe,
  };
}

function validateRules<T>(rules: Rule<T>[] | undefined): void {
  if (!rules || rules.length === 0) return;
  const seen = new Set<string>();
  for (const rule of rules) {
    if (typeof rule?.name !== "string" || rule.name.trim().length === 0) {
      throw new TypeError(
        "Every rule needs a non-empty `name`. Rules are keyed by name on the backend — make it unique and stable.",
      );
    }
    if (rule.name.length > MAX_RULE_NAME) {
      throw new TypeError(
        `Rule name "${rule.name.slice(0, 40)}…" exceeds ${MAX_RULE_NAME} characters.`,
      );
    }
    if (seen.has(rule.name)) {
      throw new TypeError(
        `Duplicate rule name "${rule.name}". Rule names must be unique within a contract.`,
      );
    }
    seen.add(rule.name);
    if (typeof rule.check !== "function") {
      throw new TypeError(`Rule "${rule.name}" is missing a \`check\` function.`);
    }
  }
}

export function rulesToDefinitions<T>(rules: Rule<T>[] | undefined): RuleDefinition[] {
  if (!rules || rules.length === 0) return [];
  return rules.map((rule) => {
    const def: RuleDefinition = { name: rule.name };
    const expression = stringifyCheck(rule.check);
    if (expression) def.expression = clamp(expression, MAX_RULE_EXPRESSION);
    // Wire description reflects the rule's human-facing label, which is
    // conceptually distinct from `rule.message` (the static failure text).
    // No fallback — users who want a UI label set `description` explicitly.
    if (rule.description) {
      def.description = clamp(rule.description, MAX_RULE_DESCRIPTION);
    }
    const fields = resolveRuleFields(rule);
    if (fields && fields.length > 0) {
      def.fields = fields
        .slice(0, MAX_RULE_FIELDS)
        .map((f) => clamp(f, MAX_RULE_FIELD));
    }
    return def;
  });
}

// Prefer explicit `rule.fields`; fall back to inference from the check source.
// The inference path keeps the common case (`(d) => d.x > 0`) zero-boilerplate
// while still letting users override for rules the parser can't read (helpers,
// minified bundles).
export function resolveRuleFields<T>(rule: Rule<T>): string[] | undefined {
  if (rule.fields && rule.fields.length > 0) return rule.fields;
  return inferRuleFields(rule.check);
}

function stringifyCheck(check: unknown): string | undefined {
  if (typeof check !== "function") return undefined;
  try {
    const src = check.toString();
    return src.length > 0 ? src : undefined;
  } catch {
    return undefined;
  }
}

function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * Using individual primitives: clean, check, fix, select.
 *
 *   npx tsx examples/primitives.ts
 */
import { clean, check, fix, select } from "../src/index.js";
import { z } from "zod";

// --- clean: extract JSON from messy LLM output ---

console.log("=== clean ===");

const fromFences = clean('```json\n{"score": 85}\n```');
console.log("From fences:", fromFences);

const fromProse = clean(
  'Here is the analysis:\n\n{"score": 85}\n\nHope that helps!',
);
console.log("From prose:", fromProse);

const coerced = clean('{"score": "85", "passing": "true"}');
console.log("Coerced:", coerced);

// --- check: validate against a schema ---

console.log("\n=== check ===");

const Schema = z.object({
  name: z.string(),
  age: z.number().min(0).max(150),
});

const valid = check({ name: "Alice", age: 30 }, Schema);
console.log("Valid:", valid);

const invalid = check({ name: "Alice", age: -5 }, Schema);
console.log("Invalid:", invalid);

// --- fix: turn errors into repair messages ---

console.log("\n=== fix ===");

if (!invalid.ok) {
  const lastDetail = invalid.error.attempts[0];
  const repairMessages = fix(lastDetail);
  if (repairMessages !== false) {
    console.log("Repair message:", repairMessages[0].content);
    console.log("Category:", lastDetail.category);
  }
}

// --- select: project state to schema shape ---

console.log("\n=== select ===");

const fullUser = {
  id: "u_123",
  name: "Alice Chen",
  email: "alice@company.com",
  passwordHash: "$2b$10$abc...",
  ssn: "123-45-6789",
};

const ReviewSchema = z.object({
  name: z.string(),
  email: z.string(),
});

const safeSlice = select(fullUser, ReviewSchema);
console.log("Safe for LLM:", safeSlice);
console.log("SSN present?", "ssn" in safeSlice);

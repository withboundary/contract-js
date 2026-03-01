/**
 * Enum classification with custom invariants.
 *
 *   npx tsx examples/classification.ts
 */
import { enforce } from "../src/index.js";
import { z } from "zod";

const TicketSchema = z.object({
  category: z.enum(["bug", "feature", "question", "billing"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  tags: z.array(z.string()).max(5),
  summary: z.string(),
});

async function main() {
  const ticket =
    "My payment was charged twice for the Pro plan last month. Please refund the duplicate charge.";

  const result = await enforce(
    TicketSchema,
    async (attempt) => {
      // Replace with your real LLM call
      return JSON.stringify({
        category: "billing",
        priority: "high",
        tags: ["billing", "refund", "duplicate-charge"],
        summary: "Duplicate charge for Pro plan, requesting refund",
      });
    },
    {
      invariants: [
        (t) =>
          t.summary.length <= 200 ||
          `summary too long: ${t.summary.length} chars (max 200)`,
        (t) =>
          t.tags.length > 0 || "must have at least one tag",
      ],
      onAttempt: (event) => {
        console.log(
          `Attempt ${event.number}: ${event.ok ? "PASS" : "FAIL"} (${event.durationMS}ms)`,
        );
      },
    },
  );

  if (result.ok) {
    console.log("Category:", result.data.category);
    console.log("Priority:", result.data.priority);
    console.log("Tags:", result.data.tags.join(", "));
    console.log("Summary:", result.data.summary);
  } else {
    console.error("Failed:", result.error.message);
  }
}

main();

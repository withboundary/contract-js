/**
 * Lead scoring with tier/score alignment rules.
 *
 * Rules enforce that the scoring decision is internally consistent:
 *   - hot leads need high scores, cold leads need low scores
 *   - closing a deal requires a qualified lead
 *   - every decision needs supporting signals
 *
 * Simulates realistic LLM failures:
 *   Attempt 1 — truncated JSON (cut off mid-response)
 *   Attempt 2 — complete JSON but tier "hot" with score 25 (mismatch)
 *   Attempt 3 — model aligns tier to score after rule feedback
 *
 *   npx tsx examples/scoring.ts
 */
import { defineContract } from "../src/index.js";
import { z } from "zod";

const LeadSchema = z.object({
  company: z.string(),
  score: z.number().int().min(0).max(100),
  tier: z.enum(["hot", "warm", "cold"]),
  qualified: z.boolean(),
  signals: z.array(z.string()),
  nextAction: z.enum(["schedule_call", "send_materials", "nurture", "close"]),
});

type Lead = z.infer<typeof LeadSchema>;

function simulateLLM(attemptNumber: number): string {
  if (attemptNumber === 1) {
    return `{"company":"TechVentures Inc","score":25,"tier":"hot","qualified":true,"signals":["visited pricing page","downloaded whitepaper","att`;
  }

  if (attemptNumber === 2) {
    return JSON.stringify({
      company: "TechVentures Inc",
      score: 25,
      tier: "hot",
      qualified: true,
      signals: ["visited pricing page", "downloaded whitepaper", "attended webinar"],
      nextAction: "close",
    });
  }

  return JSON.stringify({
    company: "TechVentures Inc",
    score: 25,
    tier: "cold",
    qualified: false,
    signals: ["visited pricing page", "downloaded whitepaper", "attended webinar"],
    nextAction: "nurture",
  });
}

async function main() {
  const contract = defineContract({
    name: "lead-scoring",
    schema: LeadSchema,
    rules: [
      {
        name: "hot_requires_high_score",
        description: "Hot leads must have a score of at least 70",
        fields: ["tier", "score"],
        check: (lead: Lead) =>
          lead.tier !== "hot" || lead.score >= 70
            || `tier is "hot" but score is ${lead.score} (minimum 70 for hot)`,
      },
      {
        name: "cold_requires_low_score",
        description: "Cold leads must have a score below 30",
        fields: ["tier", "score"],
        check: (lead: Lead) =>
          lead.tier !== "cold" || lead.score < 30
            || `tier is "cold" but score is ${lead.score} (must be under 30 for cold)`,
      },
      {
        name: "close_requires_qualified",
        description: "Closing a lead requires it to be qualified",
        fields: ["nextAction", "qualified"],
        check: (lead: Lead) =>
          lead.nextAction !== "close" || lead.qualified
            || 'nextAction is "close" but lead is not qualified',
      },
      {
        name: "signals_not_empty",
        description: "Every scoring decision must cite at least one signal",
        fields: ["signals"],
        check: (lead: Lead) =>
          lead.signals.length > 0 || "must cite at least one signal",
      },
    ],
    onAttempt: (event) => {
      const status = event.ok ? "PASS" : `FAIL — ${event.category}`;
      const issues = event.issues.length > 0 ? `\n    ${event.issues.join("\n    ")}` : "";
      console.log(`  Attempt ${event.number}: ${status} (${event.durationMS}ms)${issues}`);
    },
  });

  const result = await contract.accept(async (attempt) => simulateLLM(attempt.attempt));

  console.log();
  if (result.ok) {
    console.log(`Company: ${result.data.company}`);
    console.log(`Score: ${result.data.score} (${result.data.tier})`);
    console.log(`Qualified: ${result.data.qualified}`);
    console.log(`Signals: ${result.data.signals.join(", ")}`);
    console.log(`Next action: ${result.data.nextAction}`);
    console.log(`Attempts: ${result.attempts}`);
  } else {
    console.error("Failed:", result.error.message);
  }
}

main();

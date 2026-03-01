/**
 * Cheap-first fallback: try a fast model, escalate to a stronger one.
 *
 *   npx tsx examples/fallback.ts
 */
import { enforce } from "../src/index.js";
import { z } from "zod";

const AnalysisSchema = z.object({
  summary: z.string(),
  risks: z.array(z.string()),
  recommendation: z.enum(["approve", "reject", "review"]),
});

async function analyzeCheap(): Promise<
  ReturnType<typeof enforce<z.infer<typeof AnalysisSchema>>>
> {
  return enforce(
    AnalysisSchema,
    async (attempt) => {
      // Simulate cheap model returning bad data
      return '{"summary": "Looks fine", "risks": [], "recommendation": "go ahead"}';
    },
    { maxAttempts: 2 },
  );
}

async function analyzeStrong(): Promise<
  ReturnType<typeof enforce<z.infer<typeof AnalysisSchema>>>
> {
  return enforce(AnalysisSchema, async (attempt) => {
    // Simulate strong model getting it right
    return JSON.stringify({
      summary: "Contract review shows standard terms with minor risk areas",
      risks: ["Auto-renewal clause in section 4", "Liability cap below market rate"],
      recommendation: "review",
    });
  });
}

async function main() {
  console.log("Trying cheap model...");
  const cheapResult = await analyzeCheap();

  if (cheapResult.ok) {
    console.log("Cheap model succeeded:", cheapResult.data);
    return;
  }

  console.log("Cheap model failed, escalating to strong model...");
  const strongResult = await analyzeStrong();

  if (strongResult.ok) {
    console.log("Recommendation:", strongResult.data.recommendation);
    console.log("Risks:", strongResult.data.risks);
  } else {
    console.error("Both models failed:", strongResult.error.message);
  }
}

main();

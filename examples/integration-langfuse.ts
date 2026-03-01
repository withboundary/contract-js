/**
 * Langfuse integration example (reference only — requires @langfuse/tracing and an API key)
 *
 * Wire onAttempt into Langfuse to get per-attempt observability:
 * which invariants fired, what category of failure, how many retries.
 */

import { enforce } from "../src/index.js";
import { z } from "zod";
import { startActiveObservation, startObservation } from "@langfuse/tracing";

const schema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
});

async function analyzeSentiment(text: string) {
  return startActiveObservation("enforce-sentiment", async (trace) => {
    trace.update({ input: { text } });

    const result = await enforce(schema, async (attempt) => {
      const gen = startObservation(
        `llm-call-${attempt.number}`,
        { model: "gpt-4o-mini", input: attempt.prompt },
        { asType: "generation" },
      );

      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: attempt.prompt },
          { role: "user", content: text },
          ...attempt.fixes,
        ],
      });

      const output = res.choices[0].message.content ?? "";
      gen.update({ output }).end();
      return output;
    }, {
      invariants: [
        (data) => data.confidence > 0.5 || `confidence too low: ${data.confidence}`,
      ],
      onAttempt: (event) => {
        const span = startObservation(`attempt-${event.number}`, {
          input: { attempt: event.number },
          output: {
            ok: event.ok,
            category: event.category,
            issues: event.issues,
            durationMS: event.durationMS,
          },
        });
        span.end();
      },
    });

    trace.update({
      output: result.ok
        ? { data: result.data, attempts: result.attempts }
        : { error: result.error.message },
    });

    return result;
  });
}

/**
 * What you see in Langfuse:
 *
 * Trace: enforce-sentiment
 *   ├─ Generation: llm-call-1 (gpt-4o-mini)
 *   ├─ Span: attempt-1 ❌ { category: "INVARIANT_ERROR", issues: ["confidence too low: 0.12"] }
 *   ├─ Generation: llm-call-2 (gpt-4o-mini)
 *   └─ Span: attempt-2 ✅ { category: undefined, issues: [] }
 *
 * Filter by category to see which invariants fire most.
 * Compare traces before/after a prompt change to measure impact.
 */

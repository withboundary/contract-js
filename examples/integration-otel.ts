/**
 * OpenTelemetry integration example (reference only — requires @opentelemetry/api)
 *
 * Wire onAttempt into OpenTelemetry spans to get per-attempt tracing.
 * Works with any OTLP backend: Datadog, Grafana, Honeycomb, Jaeger, etc.
 */

import { enforce } from "../src/index.js";
import { z } from "zod";
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("llm-contract");

const schema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
});

async function analyzeSentiment(text: string) {
  return tracer.startActiveSpan("enforce-sentiment", async (rootSpan) => {
    rootSpan.setAttribute("input.text", text.slice(0, 200));

    const result = await enforce(schema, async (attempt) => {
      return tracer.startActiveSpan(`llm-call-${attempt.number}`, async (span) => {
        span.setAttribute("llm.model", "gpt-4o-mini");
        span.setAttribute("attempt.number", attempt.number);

        const res = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: attempt.prompt },
            { role: "user", content: text },
            ...attempt.fixes,
          ],
        });

        const output = res.choices[0].message.content ?? "";
        span.end();
        return output;
      });
    }, {
      invariants: [
        (data) => data.confidence > 0.5 || `confidence too low: ${data.confidence}`,
      ],
      onAttempt: (event) => {
        const span = tracer.startSpan(`attempt-${event.number}`);
        span.setAttribute("attempt.ok", event.ok);
        span.setAttribute("attempt.category", event.category ?? "none");
        span.setAttribute("attempt.issues", event.issues.join("; "));
        span.setAttribute("attempt.durationMS", event.durationMS);
        span.end();
      },
    });

    rootSpan.setAttribute("result.ok", result.ok);
    rootSpan.setAttribute("result.attempts", result.ok ? result.attempts : -1);
    rootSpan.end();
    return result;
  });
}

/**
 * What you see in your tracing backend:
 *
 * Span: enforce-sentiment (result.ok=true, result.attempts=2)
 *   ├─ Span: llm-call-1 (llm.model=gpt-4o-mini)
 *   ├─ Span: attempt-1 (ok=false, category=INVARIANT_ERROR, issues="confidence too low: 0.12")
 *   ├─ Span: llm-call-2 (llm.model=gpt-4o-mini)
 *   └─ Span: attempt-2 (ok=true, category=none)
 *
 * Query by attempt.category to build dashboards:
 * - INVARIANT_ERROR fire rate over time
 * - Average attempts per enforce call
 * - Which schemas need the most retries
 */

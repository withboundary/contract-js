/**
 * Vercel AI SDK integration example (reference only — requires ai and @ai-sdk/openai)
 *
 * Use enforce with Vercel AI SDK's generateText to get invariants and
 * targeted repair on top of your existing setup. This replaces generateObject
 * for cases where you need cross-field validation and automatic repair.
 */

import { enforce } from "../src/index.js";
import { z } from "zod";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const schema = z.object({
  vendor: z.string(),
  invoiceNumber: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
});

async function extractInvoice(pdfText: string) {
  return enforce(schema, async (attempt) => {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages: [
        { role: "system", content: attempt.prompt },
        { role: "user", content: pdfText },
        ...attempt.fixes,
      ],
    });
    return text;
  }, {
    invariants: [
      (d) => Math.abs(d.subtotal + d.tax - d.total) < 0.01
        || `subtotal (${d.subtotal}) + tax (${d.tax}) != total (${d.total})`,
    ],
    onAttempt: (event) => {
      console.log(
        `attempt ${event.number}: ${event.ok ? "pass" : event.category}`,
        event.issues.length > 0 ? event.issues : "",
      );
    },
  });
}

/**
 * Why use enforce instead of generateObject?
 *
 * Vercel AI SDK's generateObject validates against a Zod schema and retries,
 * but it doesn't support:
 *
 * - Invariants (cross-field checks like subtotal + tax = total)
 * - Targeted repair (feeding the exact violation back to the model)
 * - Failure classification (INVARIANT_ERROR vs VALIDATION_ERROR vs REFUSAL)
 * - Per-attempt observability hooks
 *
 * With enforce, each retry tells the model exactly what was wrong.
 * generateObject retries with the same prompt — no new information.
 *
 * Use generateText + enforce when you need invariants or targeted repair.
 * Use generateObject when basic schema validation is enough.
 */

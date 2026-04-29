# Examples

These examples show the public `@withboundary/contract` API as it ships on npm:
named contracts, named rule objects, `attempt.instructions`,
`attempt.repairs`, and `ContractResult` unions.

## 2-Minute Pattern

```ts
import { enforce } from "@withboundary/contract";
import { z } from "zod";

const Ticket = z.object({
  category: z.enum(["bug", "feature", "question", "billing"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  summary: z.string(),
});

const result = await enforce(
  Ticket,
  async (attempt) => {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: attempt.instructions },
        { role: "user", content: "Classify this ticket: ..." },
        ...attempt.repairs,
      ],
    });

    return response.output_text;
  },
  {
    name: "support-ticket-classification",
    rules: [
      {
        name: "critical_requires_high_priority",
        description: "Critical incidents must be routed as high or critical priority",
        fields: ["category", "priority"],
        check: (ticket) =>
          ticket.category !== "bug" ||
          ["high", "critical"].includes(ticket.priority) ||
          "bug tickets must use high or critical priority",
      },
    ],
  },
);

if (result.ok) {
  console.log(result.data.category);
  console.log(result.durationMS);
} else {
  console.error(result.error.message);
}
```

## Reusable Contract

Use `defineContract` when the same boundary runs from multiple call sites.

```ts
import { defineContract } from "@withboundary/contract";
import { z } from "zod";

const Lead = z.object({
  company: z.string(),
  score: z.number().int().min(0).max(100),
  tier: z.enum(["hot", "warm", "cold"]),
  qualified: z.boolean(),
});

const leadScoring = defineContract({
  name: "lead-scoring",
  schema: Lead,
  retry: { maxAttempts: 4, backoff: "linear", baseMs: 250 },
  rules: [
    {
      name: "hot_requires_high_score",
      description: "Hot leads must have a score of at least 70",
      fields: ["tier", "score"],
      check: (lead) =>
        lead.tier !== "hot" ||
        lead.score >= 70 ||
        `tier is "hot" but score is ${lead.score} (minimum 70)`,
    },
    {
      name: "qualified_requires_warm_or_hot",
      description: "Qualified leads must be warm or hot",
      fields: ["qualified", "tier"],
      check: (lead) => !lead.qualified || lead.tier !== "cold" || "qualified leads cannot be cold",
    },
  ],
});

export async function scoreLead(input: string) {
  return leadScoring.accept(
    async (attempt) => {
      const response = await callYourModel({
        instructions: attempt.instructions,
        userInput: input,
        repairs: attempt.repairs,
      });

      return response.text;
    },
    { model: "gpt-4.1-mini" },
  );
}
```

## Invoice Extraction

Rules are useful for financial math and other cross-field checks.

```ts
import { defineContract } from "@withboundary/contract";
import { z } from "zod";

const Invoice = z.object({
  vendor: z.string(),
  invoiceNumber: z.string(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      amount: z.number(),
    }),
  ),
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
});

const invoiceContract = defineContract({
  name: "invoice-extraction",
  schema: Invoice,
  rules: [
    {
      name: "line_items_sum_to_subtotal",
      description: "Line item amounts must sum to the subtotal",
      fields: ["lineItems", "subtotal"],
      check: (invoice) => {
        const sum = invoice.lineItems.reduce((total, item) => total + item.amount, 0);
        return (
          Math.abs(sum - invoice.subtotal) < 0.01 ||
          `line items sum to ${sum}, but subtotal is ${invoice.subtotal}`
        );
      },
    },
    {
      name: "total_matches",
      description: "Subtotal plus tax must equal total",
      fields: ["subtotal", "tax", "total"],
      check: (invoice) =>
        Math.abs(invoice.subtotal + invoice.tax - invoice.total) < 0.01 ||
        `subtotal plus tax must equal total`,
    },
  ],
});
```

Run the full simulation:

```bash
npx tsx examples/extraction.ts
```

## Moderation

Use rules for policy consistency after the schema has validated the shape.

```ts
const moderationContract = defineContract({
  name: "content-moderation",
  schema: Moderation,
  rules: [
    {
      name: "block_requires_high_confidence",
      description: "Blocking decisions must have confidence of at least 0.7",
      fields: ["action", "confidence"],
      check: (decision) =>
        decision.action !== "block" ||
        decision.confidence >= 0.7 ||
        `cannot block with confidence ${decision.confidence}`,
    },
    {
      name: "non_allow_requires_reason",
      description: "Flagged or blocked content must include a reason",
      fields: ["action", "reason"],
      check: (decision) =>
        decision.action === "allow" ||
        decision.reason.length > 10 ||
        "non-allow decisions must include a meaningful reason",
    },
  ],
});
```

Run the full simulation:

```bash
npx tsx examples/moderation.ts
```

## Engine Primitives

Use the lower-level functions when you want to own the loop yourself.

````ts
import { clean, classify, instructions, repair, verify } from "@withboundary/contract";

const promptText = instructions(schema);
const cleaned = clean('```json\n{"score":"85"}\n```');
const checked = verify(cleaned, schema, rules);

if (!checked.ok) {
  const category = classify("raw model text", cleaned);
  const messages = repair(checked.error.attempts[0]);
}
````

Run the primitive demo:

```bash
npx tsx examples/primitives.ts
```

## Observability

`@withboundary/contract` runs locally and never sends network traffic on its
own. Add a logger only when you want local debugging or opt-in telemetry.

```ts
import { createConsoleLogger, defineContract } from "@withboundary/contract";

const contract = defineContract({
  name: "lead-scoring",
  schema,
  logger: createConsoleLogger({ showCleanedOutput: true }),
});
```

For cloud or custom-sink observability, install `@withboundary/sdk` and pass
the logger into the same contract.

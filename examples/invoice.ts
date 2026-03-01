/**
 * Nested schema extraction: invoice parsing.
 *
 *   npx tsx examples/invoice.ts
 */
import { enforce } from "../src/index.js";
import { z } from "zod";

const InvoiceSchema = z.object({
  vendorName: z.string(),
  invoiceNumber: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

async function main() {
  const pdfText = `
    Invoice #INV-2024-001
    Vendor: Acme Corp
    Date: 2024-03-15

    Items:
    1. Widget A - 2 x $50.00 = $100.00
    2. Widget B - 1 x $250.00 = $250.00

    Subtotal: $350.00
    Tax (10%): $35.00
    Total: $385.00
  `;

  const result = await enforce(InvoiceSchema, async (attempt) => {
    // Replace with your real LLM call
    return JSON.stringify({
      vendorName: "Acme Corp",
      invoiceNumber: "INV-2024-001",
      date: "2024-03-15",
      lineItems: [
        { description: "Widget A", quantity: 2, unitPrice: 50, amount: 100 },
        { description: "Widget B", quantity: 1, unitPrice: 250, amount: 250 },
      ],
      subtotal: 350,
      tax: 35,
      total: 385,
    });
  });

  if (result.ok) {
    console.log("Vendor:", result.data.vendorName);
    console.log("Line items:", result.data.lineItems.length);
    console.log("Total:", result.data.total);
  } else {
    console.error("Failed:", result.error.message);
    for (const attempt of result.error.attempts) {
      console.error("  Issues:", attempt.issues);
    }
  }
}

main();

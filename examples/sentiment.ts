/**
 * Simplest enforce example: sentiment analysis.
 *
 * Replace the mock with your real OpenAI/Anthropic call.
 *
 *   npx tsx examples/sentiment.ts
 */
import { enforce } from "../src/index.js";
import { z } from "zod";

const SentimentSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
});

async function main() {
  const result = await enforce(SentimentSchema, async (attempt) => {
    // Replace this with your real LLM call:
    //
    // const res = await openai.chat.completions.create({
    //   model: "gpt-4o-mini",
    //   messages: [
    //     { role: "system", content: attempt.prompt },
    //     { role: "user", content: "I love this product!" },
    //     ...attempt.fixes,
    //   ],
    // });
    // return res.choices[0].message.content;

    return JSON.stringify({ sentiment: "positive", confidence: 0.95 });
  });

  if (result.ok) {
    console.log("Sentiment:", result.data.sentiment);
    console.log("Confidence:", result.data.confidence);
    console.log("Attempts:", result.attempts);
  } else {
    console.error("Failed:", result.error.message);
  }
}

main();

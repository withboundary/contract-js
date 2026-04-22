import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createAnthropicJsonRun } from "../../src/providers/anthropic.js";
import type { ContractAttempt } from "../../src/contract/types.js";

function makeAttempt(overrides: Partial<ContractAttempt> = {}): ContractAttempt {
  return {
    attempt: 1,
    maxAttempts: 3,
    instructions: "",
    repairs: [],
    ...overrides,
  };
}

describe("createAnthropicJsonRun", () => {
  const schema = z.object({
    sentiment: z.enum(["positive", "negative", "neutral"]),
    confidence: z.number().min(0).max(1),
  });

  it("forces tool use with the contract's schema and returns stringified tool input", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "submit",
          input: { sentiment: "positive", confidence: 0.9 },
        },
      ],
    });
    const client = { messages: { create } };

    const run = createAnthropicJsonRun(client, {
      model: "claude-sonnet-4-6",
      schema,
      prompt: "Analyze sentiment for: I love this product",
    });

    const result = await run(makeAttempt());
    expect(result).toBe('{"sentiment":"positive","confidence":0.9}');

    const call = create.mock.calls[0]![0];
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.tool_choice).toEqual({ type: "tool", name: "submit" });
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe("submit");
    expect(call.tools[0].input_schema).toBeDefined();
  });

  it("uses a custom tool name when provided", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", name: "classify", input: { sentiment: "neutral", confidence: 0.5 } }],
    });
    const client = { messages: { create } };

    const run = createAnthropicJsonRun(client, {
      model: "claude-sonnet-4-6",
      schema,
      prompt: "x",
      toolName: "classify",
    });

    await run(makeAttempt());
    const call = create.mock.calls[0]![0];
    expect(call.tool_choice.name).toBe("classify");
    expect(call.tools[0].name).toBe("classify");
  });

  it("returns null when the response has no tool_use block", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Sorry, I cannot comply." }],
    });
    const client = { messages: { create } };

    const run = createAnthropicJsonRun(client, {
      model: "claude-sonnet-4-6",
      schema,
      prompt: "x",
    });

    const result = await run(makeAttempt());
    expect(result).toBeNull();
  });
});

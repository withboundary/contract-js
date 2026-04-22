import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createOpenAIJsonRun } from "../../src/providers/openai.js";
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

describe("createOpenAIJsonRun", () => {
  const schema = z.object({
    category: z.enum(["billing", "technical"]),
    summary: z.string().max(200),
  });

  it("calls chat.completions.create with a JSON schema response_format", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"category":"billing","summary":"refund"}' } }],
    });
    const client = { chat: { completions: { create } } };

    const run = createOpenAIJsonRun(client, {
      model: "gpt-4.1",
      schemaName: "ticket",
      schema,
      input: "Customer charged twice",
    });

    const result = await run(makeAttempt());
    expect(result).toBe('{"category":"billing","summary":"refund"}');

    const call = create.mock.calls[0]![0];
    expect(call.model).toBe("gpt-4.1");
    expect(call.response_format.type).toBe("json_schema");
    expect(call.response_format.json_schema.name).toBe("ticket");
    expect(call.response_format.json_schema.strict).toBe(true);
    expect(call.messages).toEqual([{ role: "user", content: "Customer charged twice" }]);
  });

  it("appends repair messages on retries", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"category":"billing","summary":"x"}' } }],
    });
    const client = { chat: { completions: { create } } };

    const run = createOpenAIJsonRun(client, {
      model: "gpt-4.1",
      schemaName: "ticket",
      schema,
      input: "Classify this",
    });

    await run(makeAttempt({
      attempt: 2,
      repairs: [{ role: "user", content: "summary must be shorter than 200 chars" }],
    }));

    const messages = create.mock.calls[0]![0].messages;
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe("summary must be shorter than 200 chars");
  });

  it("returns null when the model produces no content", async () => {
    const create = vi.fn().mockResolvedValue({ choices: [{ message: {} }] });
    const client = { chat: { completions: { create } } };
    const run = createOpenAIJsonRun(client, {
      model: "gpt-4.1",
      schemaName: "ticket",
      schema,
      input: "x",
    });
    const result = await run(makeAttempt());
    expect(result).toBeNull();
  });
});

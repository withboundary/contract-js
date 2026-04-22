import type { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ContractAttempt, RunFn } from "../contract/types.js";

// Minimal structural view of the OpenAI SDK client surface we touch. Kept
// loose so the helper doesn't force a specific `openai` version on consumers
// — `openai` is an optional peer dep. If their installed types diverge, they
// can still pass their client through.
interface OpenAIClientLike {
  chat: {
    completions: {
      create: (params: OpenAIChatCreateParams) => Promise<OpenAIChatResponse>;
    };
  };
}

interface OpenAIChatResponse {
  choices: Array<{
    message?: { content?: string | null };
  }>;
}

interface OpenAIChatCreateParams {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  response_format?: {
    type: "json_schema";
    json_schema: {
      name: string;
      schema: unknown;
      strict?: boolean;
    };
  };
}

export interface CreateOpenAIJsonRunOptions<T> {
  model: string;
  schemaName: string;
  schema: ZodType<T>;
  input: string | Array<{ role: "system" | "user" | "assistant"; content: string }>;
  // When true (default), repair messages from prior attempts are appended as
  // additional `user` turns so the model sees what went wrong last time.
  includeRepairs?: boolean;
}

// Build a RunFn that calls OpenAI's Chat Completions API with structured
// outputs. The user keeps their native SDK instance and model choice — this
// helper just removes the boilerplate of wiring Zod → JSON Schema and pulling
// the text back out.
export function createOpenAIJsonRun<T>(
  client: OpenAIClientLike,
  options: CreateOpenAIJsonRunOptions<T>,
): RunFn {
  const jsonSchema = zodToJsonSchema(options.schema, { target: "openApi3" });
  const baseMessages = normalizeInput(options.input);
  const includeRepairs = options.includeRepairs !== false;

  return async (attempt: ContractAttempt): Promise<string | null> => {
    const messages = [...baseMessages];
    if (includeRepairs && attempt.repairs.length > 0) {
      for (const repair of attempt.repairs) {
        messages.push({
          role: (repair.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
          content: repair.content,
        });
      }
    }

    const response = await client.chat.completions.create({
      model: options.model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: options.schemaName,
          schema: jsonSchema,
          strict: true,
        },
      },
    });

    return response.choices[0]?.message?.content ?? null;
  };
}

function normalizeInput(
  input: CreateOpenAIJsonRunOptions<unknown>["input"],
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }
  return input;
}

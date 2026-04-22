import type { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ContractAttempt, RunFn } from "../contract/types.js";

// Minimal structural view of the Anthropic SDK client surface we touch.
// Anthropic is an optional peer dep — same reasoning as the openai helper.
interface AnthropicClientLike {
  messages: {
    create: (params: AnthropicMessagesCreateParams) => Promise<AnthropicMessagesResponse>;
  };
}

interface AnthropicMessagesCreateParams {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: Array<{
    name: string;
    description?: string;
    input_schema: unknown;
  }>;
  tool_choice?: { type: "tool"; name: string };
}

interface AnthropicMessagesResponse {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; name: string; input: unknown }
    | { type: string; [key: string]: unknown }
  >;
}

export interface CreateAnthropicJsonRunOptions<T> {
  model: string;
  schema: ZodType<T>;
  // Name of the synthetic tool we force the model to call. Acts as the
  // "schema name" in the same spirit as OpenAI's json_schema.name.
  toolName?: string;
  toolDescription?: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
  includeRepairs?: boolean;
}

// Build a RunFn that uses Anthropic's tool-use mechanism to force structured
// output: we define a synthetic tool whose input schema is the contract's
// Zod schema, force `tool_choice` to that tool, then serialize the returned
// tool input as JSON.
export function createAnthropicJsonRun<T>(
  client: AnthropicClientLike,
  options: CreateAnthropicJsonRunOptions<T>,
): RunFn {
  const jsonSchema = zodToJsonSchema(options.schema, { target: "jsonSchema7" });
  const toolName = options.toolName ?? "submit";
  const includeRepairs = options.includeRepairs !== false;

  return async (attempt: ContractAttempt): Promise<string | null> => {
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: options.prompt },
    ];
    if (includeRepairs && attempt.repairs.length > 0) {
      for (const repair of attempt.repairs) {
        messages.push({
          role: repair.role === "assistant" ? "assistant" : "user",
          content: repair.content,
        });
      }
    }

    const response = await client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      ...(options.system ? { system: options.system } : {}),
      messages,
      tools: [
        {
          name: toolName,
          description: options.toolDescription ?? "Submit the structured response.",
          input_schema: jsonSchema,
        },
      ],
      tool_choice: { type: "tool", name: toolName },
    });

    const toolBlock = response.content.find(
      (block): block is { type: "tool_use"; name: string; input: unknown } =>
        block.type === "tool_use" && (block as { name?: string }).name === toolName,
    );
    if (!toolBlock) return null;
    return JSON.stringify(toolBlock.input);
  };
}

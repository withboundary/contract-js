declare module "ai" {
  export function generateText(input: {
    model: unknown;
    messages: Array<{
      role: string;
      content: string;
    }>;
  }): Promise<{
    text: string;
  }>;
}

declare module "@ai-sdk/anthropic" {
  export function anthropic(modelID: string): unknown;
}

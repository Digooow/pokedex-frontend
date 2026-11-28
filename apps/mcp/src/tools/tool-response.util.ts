import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function toJsonToolResult(payload: unknown): CallToolResult {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text', text }],
    structuredContent:
      typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : { value: payload },
  };
}

export function toToolErrorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

export function runSyncTool<T>(action: () => T): CallToolResult {
  try {
    return toJsonToolResult(action());
  } catch (error) {
    return toToolErrorResult(error);
  }
}

export async function runAsyncTool<T>(action: () => Promise<T>): Promise<CallToolResult> {
  try {
    return toJsonToolResult(await action());
  } catch (error) {
    return toToolErrorResult(error);
  }
}

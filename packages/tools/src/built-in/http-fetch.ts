import { z } from 'zod';
import type { ToolHandler, ToolResult } from '../types.js';

const httpFetchSchema = z.object({
  url: z.string().url().describe('URL to fetch'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  headers: z.record(z.string()).optional().describe('HTTP headers'),
  body: z.string().optional().describe('Request body'),
  maxBytes: z
    .number()
    .int()
    .positive()
    .optional()
    .default(10_000)
    .describe('Max response bytes to return'),
});

export const httpFetchTool: ToolHandler = {
  definition: {
    name: 'http_fetch',
    description: 'Make an HTTP request and return the response',
    parameters: httpFetchSchema,
    group: 'net',
  },

  async execute(input): Promise<ToolResult> {
    const { url, method, headers, body, maxBytes } = httpFetchSchema.parse(input);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? body : undefined,
      });
    } catch (err) {
      return {
        output: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
        error: 'network_error',
        durationMs: 0,
      };
    }

    const text = await response.text();
    const truncated = text.slice(0, maxBytes ?? 10_000);
    const headerLines = [...response.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');

    return {
      output: `HTTP ${response.status} ${response.statusText}\n${headerLines}\n\n${truncated}`,
      durationMs: 0,
    };
  },
};

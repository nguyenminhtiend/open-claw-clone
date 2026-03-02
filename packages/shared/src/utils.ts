export { nanoid } from 'nanoid';

export const isObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null && !Array.isArray(val);

export const isJsonRpcRequest = (val: unknown): val is { jsonrpc: string; method: string } =>
  isObject(val) && 'jsonrpc' in val && 'method' in val;

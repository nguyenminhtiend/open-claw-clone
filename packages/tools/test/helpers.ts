import type { Session } from '@oclaw/shared';
import { defaultSandbox } from '../src/policy/sandbox.js';
import type { ToolContext } from '../src/types.js';

export const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'test-session',
  createdAt: new Date(),
  lastActiveAt: new Date(),
  channelId: 'test-channel',
  agentId: 'test-agent',
  messages: [],
  metadata: {},
  ...overrides,
});

export const makeCtx = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  session: makeSession(),
  workdir: '/tmp',
  env: {},
  sandbox: defaultSandbox,
  signal: new AbortController().signal,
  ...overrides,
});

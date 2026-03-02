import { defaults } from '@oclaw/config';
import { RpcError, RpcErrorCode } from '@oclaw/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { SessionManager } from '../src/sessions/manager.js';
import type { WsConnection } from '../src/ws/connection.js';
import { RpcRouter } from '../src/ws/rpc-router.js';

const mockConn = {
  id: 'test-conn',
  role: 'cli' as const,
  capabilities: [],
  metadata: {},
  socket: {} as WsConnection['socket'],
};

describe('RpcRouter', () => {
  let router: RpcRouter;
  let sessions: SessionManager;

  beforeEach(() => {
    router = new RpcRouter();
    sessions = new SessionManager();
  });

  it('dispatches a registered method', async () => {
    router.register('test.ping', () => ({ pong: true }));
    const res = await router.dispatch(
      mockConn,
      { jsonrpc: '2.0', id: 1, method: 'test.ping' },
      sessions,
      defaults
    );
    expect(res.result).toEqual({ pong: true });
    expect(res.error).toBeUndefined();
  });

  it('returns method not found for unknown methods', async () => {
    const res = await router.dispatch(
      mockConn,
      { jsonrpc: '2.0', id: 1, method: 'nonexistent' },
      sessions,
      defaults
    );
    expect(res.error?.code).toBe(RpcErrorCode.MethodNotFound);
  });

  it('returns internal error when handler throws', async () => {
    router.register('boom', () => {
      throw new Error('kaboom');
    });
    const res = await router.dispatch(
      mockConn,
      { jsonrpc: '2.0', id: 1, method: 'boom' },
      sessions,
      defaults
    );
    expect(res.error?.code).toBe(RpcErrorCode.InternalError);
    expect(res.error?.message).toBe('kaboom');
  });

  it('returns RpcError code when handler throws RpcError', async () => {
    router.register('auth.fail', () => {
      throw new RpcError(RpcErrorCode.Unauthorized, 'Unauthorized');
    });
    const res = await router.dispatch(
      mockConn,
      { jsonrpc: '2.0', id: 1, method: 'auth.fail' },
      sessions,
      defaults
    );
    expect(res.error?.code).toBe(RpcErrorCode.Unauthorized);
  });

  it('passes params to handler', async () => {
    router.register('echo', (params) => params);
    const res = await router.dispatch(
      mockConn,
      { jsonrpc: '2.0', id: 1, method: 'echo', params: { x: 42 } },
      sessions,
      defaults
    );
    expect(res.result).toEqual({ x: 42 });
  });

  it('preserves request id in response', async () => {
    router.register('noop', () => null);
    const res = await router.dispatch(
      mockConn,
      { jsonrpc: '2.0', id: 'abc-123', method: 'noop' },
      sessions,
      defaults
    );
    expect(res.id).toBe('abc-123');
  });
});

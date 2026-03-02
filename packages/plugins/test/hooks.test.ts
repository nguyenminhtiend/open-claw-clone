import { describe, expect, it, vi } from 'vitest';
import { HookSystem } from '../src/hooks.js';
import type { HookEvent } from '../src/types.js';

describe('HookSystem', () => {
  it('calls a registered handler when event is emitted', async () => {
    const hooks = new HookSystem();
    const handler = vi.fn();
    hooks.register('test:event', 'plugin-a', handler);
    await hooks.emit('test:event', { foo: 1 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('passes the correct event shape to handlers', async () => {
    const hooks = new HookSystem();
    let received: HookEvent | null = null;
    hooks.register('test:event', 'plugin-a', async (e) => {
      received = e;
    });
    await hooks.emit('test:event', { bar: 'baz' });
    expect(received).not.toBeNull();
    const r = received as unknown as HookEvent;
    expect(r.name).toBe('test:event');
    expect(r.data).toEqual({ bar: 'baz' });
    expect(r.timestamp).toBeInstanceOf(Date);
  });

  it('calls handlers in priority order (higher first)', async () => {
    const hooks = new HookSystem();
    const order: string[] = [];
    hooks.register(
      'ordered',
      'plugin-a',
      async () => {
        order.push('low');
      },
      0
    );
    hooks.register(
      'ordered',
      'plugin-b',
      async () => {
        order.push('high');
      },
      10
    );
    hooks.register(
      'ordered',
      'plugin-c',
      async () => {
        order.push('mid');
      },
      5
    );
    await hooks.emit('ordered', {});
    expect(order).toEqual(['high', 'mid', 'low']);
  });

  it('does not throw when no handlers are registered for an event', async () => {
    const hooks = new HookSystem();
    await expect(hooks.emit('no:handlers', {})).resolves.toBeUndefined();
  });

  it('continues calling other handlers if one throws', async () => {
    const hooks = new HookSystem();
    const second = vi.fn();
    hooks.register('err:event', 'plugin-a', async () => {
      throw new Error('boom');
    });
    hooks.register('err:event', 'plugin-b', second);
    await hooks.emit('err:event', {});
    expect(second).toHaveBeenCalledOnce();
  });

  it('passes session and messages context', async () => {
    const hooks = new HookSystem();
    let capturedMessages: unknown[] | undefined;
    hooks.register('ctx:event', 'plugin-a', async (e) => {
      capturedMessages = e.messages;
      e.messages?.push({
        id: 'injected',
        role: 'system',
        content: 'injected',
        timestamp: new Date(),
      });
    });
    const messages: HookEvent['messages'] = [];
    await hooks.emit('ctx:event', {}, { messages });
    expect(capturedMessages).toBe(messages);
    expect(messages).toHaveLength(1);
  });

  it('countHandlers returns correct count', () => {
    const hooks = new HookSystem();
    hooks.register('ev', 'a', vi.fn());
    hooks.register('ev', 'b', vi.fn());
    expect(hooks.countHandlers('ev')).toBe(2);
    expect(hooks.countHandlers('other')).toBe(0);
  });

  it('listEvents returns registered event names', () => {
    const hooks = new HookSystem();
    hooks.register('alpha', 'a', vi.fn());
    hooks.register('beta', 'b', vi.fn());
    const events = hooks.listEvents();
    expect(events).toContain('alpha');
    expect(events).toContain('beta');
  });

  it('clear removes all handlers', async () => {
    const hooks = new HookSystem();
    const handler = vi.fn();
    hooks.register('ev', 'a', handler);
    hooks.clear();
    await hooks.emit('ev', {});
    expect(handler).not.toHaveBeenCalled();
  });
});

import { createLogger } from '@oclaw/shared';
import type { Message, Session } from '@oclaw/shared';
import type { HookEvent, HookHandler } from './types.js';

const logger = createLogger('plugins:hooks');

interface RegisteredHook {
  pluginId: string;
  handler: HookHandler;
  priority: number;
}

export class HookSystem {
  private hooks = new Map<string, RegisteredHook[]>();

  register(event: string, pluginId: string, handler: HookHandler, priority = 0): void {
    const existing = this.hooks.get(event) ?? [];
    existing.push({ pluginId, handler, priority });
    existing.sort((a, b) => b.priority - a.priority);
    this.hooks.set(event, existing);
  }

  async emit(
    event: string,
    data: unknown,
    ctx?: { session?: Session; messages?: Message[] }
  ): Promise<void> {
    const handlers = this.hooks.get(event) ?? [];

    const hookEvent: HookEvent = {
      name: event,
      data,
      session: ctx?.session,
      messages: ctx?.messages,
      timestamp: new Date(),
    };

    for (const { pluginId, handler } of handlers) {
      try {
        await handler(hookEvent);
      } catch (err) {
        logger.error({ event, pluginId, err }, 'Hook handler failed');
      }
    }
  }

  listEvents(): string[] {
    return Array.from(this.hooks.keys());
  }

  countHandlers(event: string): number {
    return this.hooks.get(event)?.length ?? 0;
  }

  clear(): void {
    this.hooks.clear();
  }
}

export type { HookEvent, HookHandler };

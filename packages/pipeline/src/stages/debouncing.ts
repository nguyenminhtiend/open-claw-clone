import type { ChannelMessage } from '@oclaw/channels';
import type { PipelineContext, PipelineStage } from '../types.js';

interface PendingEntry {
  messages: ChannelMessage[];
  timer: ReturnType<typeof setTimeout>;
  resolve: (msgs: ChannelMessage[]) => void;
}

export class DebouncingStage implements PipelineStage {
  name = 'debouncing';

  private debounceMs: number;
  private pending = new Map<string, PendingEntry>();

  constructor(debounceMs = 300) {
    this.debounceMs = debounceMs;
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const key = `${ctx.message.channelId}:${ctx.message.conversationId}`;

    const existing = this.pending.get(key);
    if (existing) {
      // Absorb into the existing batch and reset the timer.
      // The first message's promise handles the full batch.
      clearTimeout(existing.timer);
      existing.messages.push(ctx.message);
      existing.timer = setTimeout(() => {
        this.pending.delete(key);
        existing.resolve(existing.messages);
      }, this.debounceMs);

      // This pipeline run is absorbed — let the first one proceed with the full batch.
      ctx.aborted = true;
      ctx.abortReason = 'debounced';
      return ctx;
    }

    // First message for this key — wait for the debounce window.
    const batched = await new Promise<ChannelMessage[]>((resolve) => {
      const entry: PendingEntry = {
        messages: [ctx.message],
        timer: setTimeout(() => {
          this.pending.delete(key);
          resolve(entry.messages);
        }, this.debounceMs),
        resolve,
      };
      this.pending.set(key, entry);
    });

    if (batched.length > 1) {
      const combined = batched
        .map((m) => m.content)
        .filter(Boolean)
        .join('\n');
      ctx.message = { ...batched[batched.length - 1], content: combined };
      ctx.batchedMessages = batched;
    }

    return ctx;
  }
}

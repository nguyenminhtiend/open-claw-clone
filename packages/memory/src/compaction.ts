import type { LlmProvider } from '@oclaw/agent';
import { createLogger } from '@oclaw/shared';
import type { Session } from '@oclaw/shared';
import { nanoid } from 'nanoid';
import type { DailyLog } from './daily-log.js';
import type { MemoryFileStore } from './file-store.js';

const logger = createLogger('memory:compaction');

export interface CompactionOptions {
  /** Token count that triggers flush + compaction */
  softThreshold?: number;
  /** Number of recent messages to keep after compaction */
  keepRecentMessages?: number;
  /** Model to use for flush/summary (should be a fast/cheap model) */
  fastModel?: string;
}

export class CompactionEngine {
  private softThreshold: number;
  private keepRecentMessages: number;
  private fastModel: string;

  constructor(
    private provider: LlmProvider,
    private fileStore: MemoryFileStore,
    private dailyLog: DailyLog,
    opts: CompactionOptions = {}
  ) {
    this.softThreshold = opts.softThreshold ?? 4000;
    this.keepRecentMessages = opts.keepRecentMessages ?? 10;
    this.fastModel = opts.fastModel ?? 'claude-3-haiku-20240307';
  }

  async maybeCompact(session: Session, tokenCount: number): Promise<boolean> {
    if (tokenCount < this.softThreshold) {
      return false;
    }

    logger.info(
      { sessionId: session.id, tokenCount, threshold: this.softThreshold },
      'Token threshold reached — flushing memories and compacting'
    );

    await this.flushMemories(session);
    await this.compactMessages(session);
    return true;
  }

  private async flushMemories(session: Session): Promise<void> {
    const recentMessages = session.messages.slice(-20);
    if (recentMessages.length === 0) {
      return;
    }

    const response = await this.provider.chat({
      model: this.fastModel,
      messages: [
        {
          role: 'user',
          content: recentMessages.map((m) => `[${m.role}]: ${m.content}`).join('\n'),
        },
      ],
      system: `Review this conversation and extract any important facts, decisions, user preferences, 
or project context that should be remembered long-term. Format as bullet points. 
If nothing worth remembering, respond with exactly "NONE".`,
      maxTokens: 500,
    });

    const firstBlock = response.content[0];
    const memories = firstBlock.type === 'text' ? firstBlock.text.trim() : '';

    if (memories && memories !== 'NONE') {
      await this.fileStore.appendToMemory(memories);
      await this.dailyLog.append(`**Auto-flushed memories:**\n${memories}`);
      logger.debug({ sessionId: session.id }, 'Flushed memories to MEMORY.md');
    }
  }

  private async compactMessages(session: Session): Promise<void> {
    const keepRecent = this.keepRecentMessages;
    const older = session.messages.slice(0, -keepRecent);

    if (older.length < 5) {
      return;
    }

    const response = await this.provider.chat({
      model: this.fastModel,
      messages: [
        {
          role: 'user',
          content: older.map((m) => `[${m.role}]: ${m.content}`).join('\n'),
        },
      ],
      system: 'Summarize this conversation concisely, preserving key context and decisions.',
      maxTokens: 800,
    });

    const firstBlock = response.content[0];
    const summary = firstBlock.type === 'text' ? firstBlock.text : '';

    session.messages = [
      {
        id: nanoid(),
        role: 'system',
        content: `[Compacted history]\n${summary}`,
        timestamp: new Date(),
      },
      ...session.messages.slice(-keepRecent),
    ];

    logger.info(
      { sessionId: session.id, removed: older.length, kept: session.messages.length },
      'Context compacted'
    );
  }
}

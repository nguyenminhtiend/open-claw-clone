import type { ChannelAdapter, ChannelManager, ChannelMessage } from '@oclaw/channels';
import type { Config } from '@oclaw/config';
import type { MemoryFileStore } from '@oclaw/memory';
import type { Message, Session } from '@oclaw/shared';

export interface ISessionManager {
  getOrCreate(conversationId: string, channelId: string): Session;
  get(id: string): Session;
  addMessage(sessionId: string, role: Message['role'], content: string): Message;
  addRichMessage(
    sessionId: string,
    msg: Omit<Message, 'id' | 'timestamp'> & {
      toolCalls?: unknown[];
      toolCallId?: string;
    }
  ): Message;
  size(): number;
}

export interface PipelineServices {
  sessions: ISessionManager;
  channels: ChannelManager;
  config: Config;
  memory?: MemoryFileStore;
}

export interface PipelineContext {
  message: ChannelMessage;
  channel?: ChannelAdapter;

  session?: Session;
  authorized?: boolean;
  isCommand?: boolean;
  commandName?: string;
  commandArgs?: string;
  batchedMessages?: ChannelMessage[];

  responded?: boolean;
  aborted?: boolean;
  abortReason?: string;

  services: PipelineServices;
}

export interface PipelineStage {
  name: string;
  execute(ctx: PipelineContext): Promise<PipelineContext>;
}

export interface CommandResult {
  response?: string;
}

export interface CommandHandler {
  name: string;
  aliases?: string[];
  description: string;
  execute(args: string, ctx: PipelineContext): Promise<CommandResult>;
}

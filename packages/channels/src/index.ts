export type {
  Attachment,
  ChannelAdapter,
  ChannelConfig,
  ChannelMessage,
  OutboundMessage,
} from './types.js';

export { ChannelManager } from './manager.js';
export { AccessController } from './access-control.js';
export { formatForPlatform, markdownToTelegramHtml } from './formatter.js';
export { RateLimiter } from './util/rate-limiter.js';

export { TelegramAdapter } from './adapters/telegram.js';
export type { TelegramAdapterConfig } from './adapters/telegram.js';

export { DiscordAdapter } from './adapters/discord.js';
export type { DiscordAdapterConfig } from './adapters/discord.js';

export { WebChatAdapter } from './adapters/webchat.js';
export type { WebChatGateway } from './adapters/webchat.js';

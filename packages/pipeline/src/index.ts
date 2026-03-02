export { Pipeline } from './pipeline.js';
export { createAutoReplyPipeline } from './factory.js';

export type {
  PipelineContext,
  PipelineStage,
  PipelineServices,
  ISessionManager,
  CommandHandler,
  CommandResult,
} from './types.js';

export { IngestionStage } from './stages/ingestion.js';
export { AuthorizationStage } from './stages/authorization.js';
export { DebouncingStage } from './stages/debouncing.js';
export { SessionResolutionStage } from './stages/session.js';
export { CommandDetectionStage } from './stages/commands.js';
export { AgentDispatchStage } from './stages/agent.js';
export type { StreamBlock } from './stages/agent.js';
export { BlockStreamingStage } from './stages/streaming.js';

export { ResetCommand } from './commands/reset.js';
export { ModelCommand } from './commands/model.js';
export { StatusCommand } from './commands/status.js';
export { MemoryCommand } from './commands/memory.js';
export { HelpCommand } from './commands/help.js';
export { StopCommand } from './commands/stop.js';

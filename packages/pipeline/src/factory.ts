import { Pipeline } from './pipeline.js';
import { AgentDispatchStage } from './stages/agent.js';
import { AuthorizationStage } from './stages/authorization.js';
import { CommandDetectionStage } from './stages/commands.js';
import { DebouncingStage } from './stages/debouncing.js';
import { IngestionStage } from './stages/ingestion.js';
import { SessionResolutionStage } from './stages/session.js';
import { BlockStreamingStage } from './stages/streaming.js';

export function createAutoReplyPipeline(): Pipeline {
  return new Pipeline()
    .use(new IngestionStage())
    .use(new AuthorizationStage())
    .use(new DebouncingStage())
    .use(new SessionResolutionStage())
    .use(new CommandDetectionStage())
    .use(new AgentDispatchStage())
    .use(new BlockStreamingStage());
}

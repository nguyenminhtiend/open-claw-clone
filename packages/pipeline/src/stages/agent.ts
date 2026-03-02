import { ProviderRegistry, StreamingAgentLoop } from '@oclaw/agent';
import type { PipelineContext, PipelineStage } from '../types.js';

export interface StreamBlock {
  type: 'text' | 'tool_start' | 'tool_result';
  data: unknown;
}

export class AgentDispatchStage implements PipelineStage {
  name = 'agent';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.session) {
      ctx.aborted = true;
      ctx.abortReason = 'No session resolved';
      return ctx;
    }

    const agentConfig = ctx.services.config.agents.defaults;
    const sessionModel = (ctx.session.metadata as Record<string, unknown>).model as
      | string
      | undefined;

    const effectiveConfig = sessionModel
      ? { ...agentConfig, provider: { ...agentConfig.provider, model: sessionModel } }
      : agentConfig;

    const provider = ProviderRegistry.fromConfig(effectiveConfig.provider);
    const agent = new StreamingAgentLoop(provider, effectiveConfig);

    let fullResponse = '';
    const streamBlocks: StreamBlock[] = [];

    agent.on('stream:text', (text) => {
      fullResponse += text;
      streamBlocks.push({ type: 'text', data: text });
    });

    agent.on('stream:tool_start', (data) => {
      streamBlocks.push({ type: 'tool_start', data });
    });

    agent.on('stream:tool_result', (data) => {
      streamBlocks.push({ type: 'tool_result', data });
    });

    await agent.runStreaming(ctx.services.sessions, ctx.session.id, ctx.message.content);

    // Store on session metadata so the streaming stage can pick them up.
    const meta = ctx.session.metadata as Record<string, unknown>;
    meta._lastAgentResponse = fullResponse;
    meta._streamBlocks = streamBlocks;

    return ctx;
  }
}

import { createLogger } from '@oclaw/shared';
import type { PipelineContext, PipelineStage } from './types.js';

const logger = createLogger('pipeline');

export class Pipeline {
  private stages: PipelineStage[] = [];

  use(stage: PipelineStage): this {
    this.stages.push(stage);
    return this;
  }

  async run(initialCtx: PipelineContext): Promise<PipelineContext> {
    let ctx = initialCtx;

    for (const stage of this.stages) {
      const start = Date.now();

      try {
        ctx = await stage.execute(ctx);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ stage: stage.name, err }, 'Pipeline stage failed');
        ctx.aborted = true;
        ctx.abortReason = `Stage "${stage.name}" failed: ${message}`;
      }

      const duration = Date.now() - start;
      logger.debug(
        { stage: stage.name, duration, aborted: ctx.aborted },
        'Pipeline stage complete'
      );

      if (ctx.aborted || ctx.responded) {
        break;
      }
    }

    return ctx;
  }
}

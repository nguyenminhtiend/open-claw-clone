import { HelpCommand } from '../commands/help.js';
import { MemoryCommand } from '../commands/memory.js';
import { ModelCommand } from '../commands/model.js';
import { ResetCommand } from '../commands/reset.js';
import { StatusCommand } from '../commands/status.js';
import { StopCommand } from '../commands/stop.js';
import type { CommandHandler, PipelineContext, PipelineStage } from '../types.js';

export class CommandDetectionStage implements PipelineStage {
  name = 'commands';

  private commands = new Map<string, CommandHandler>();

  constructor() {
    this.register(new ResetCommand());
    this.register(new ModelCommand());
    this.register(new StatusCommand());
    this.register(new MemoryCommand());
    this.register(new HelpCommand());
    this.register(new StopCommand());
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const text = ctx.message.content;

    if (!text.startsWith('/')) {
      return ctx;
    }

    const spaceIdx = text.indexOf(' ');
    const commandName = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx);
    const commandArgs = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim();

    const handler = this.commands.get(commandName);
    if (!handler) {
      return ctx;
    }

    ctx.isCommand = true;
    ctx.commandName = commandName;
    ctx.commandArgs = commandArgs;

    const result = await handler.execute(commandArgs, ctx);

    if (result.response) {
      await ctx.services.channels.sendToChannel(ctx.message.channelId, ctx.message.conversationId, {
        text: result.response,
        format: 'markdown',
      });
      ctx.responded = true;
    }

    return ctx;
  }

  register(handler: CommandHandler): void {
    this.commands.set(handler.name, handler);
    for (const alias of handler.aliases ?? []) {
      this.commands.set(alias, handler);
    }
  }
}

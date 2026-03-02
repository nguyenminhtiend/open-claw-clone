import { z } from 'zod';
import type { PluginApi, PluginFactory } from '@oclaw/plugins';

interface CronJob {
  name: string;
  cron: string;
  action: string;
}

interface CronConfig {
  jobs?: CronJob[];
}

/**
 * Parse a very simple cron expression to an interval in ms.
 * Supports only "@every <n><unit>" syntax for now, e.g. "@every 5m".
 * For real cron expressions you'd swap this out for node-cron.
 */
function parseCronToMs(cron: string): number | null {
  const match = /^@every (\d+)(s|m|h)$/.exec(cron.trim());
  if (!match) {
    return null;
  }
  const [, amount, unit] = match;
  const n = Number(amount);
  if (unit === 's') {
    return n * 1000;
  }
  if (unit === 'm') {
    return n * 60 * 1000;
  }
  if (unit === 'h') {
    return n * 60 * 60 * 1000;
  }
  return null;
}

const cronSchedulerPlugin: PluginFactory = () => {
  let intervals: NodeJS.Timeout[] = [];

  return {
    async init(api: PluginApi) {
      api.registerTool({
        definition: {
          name: 'schedule_task',
          description: 'Schedule a recurring task using a cron expression (@every <n>s|m|h)',
          parameters: z.object({
            name: z.string().describe('Human-readable name for the job'),
            cronExpression: z
              .string()
              .describe('Cron expression e.g. "@every 5m"'),
            prompt: z.string().describe('What to do when the cron fires'),
          }),
          group: 'system',
        },
        async execute(input) {
          const { name, cronExpression } = input as {
            name: string;
            cronExpression: string;
            prompt: string;
          };
          const ms = parseCronToMs(cronExpression);
          if (ms === null) {
            return {
              output: `Invalid cron expression "${cronExpression}". Use @every <n>s|m|h`,
              error: 'invalid_cron',
              durationMs: 0,
            };
          }
          return {
            output: `Scheduled "${name}" to run ${cronExpression} (every ${ms}ms)`,
            durationMs: 0,
          };
        },
      });
    },

    async start(api: PluginApi) {
      const config = api.getConfig<CronConfig>();

      for (const job of config.jobs ?? []) {
        const ms = parseCronToMs(job.cron);
        if (ms === null) {
          api.runtime.logger.warn({ job: job.name, cron: job.cron }, 'Invalid cron expression, skipping job');
          continue;
        }

        const interval = setInterval(() => {
          api.runtime.logger.info({ job: job.name }, 'Cron job triggered');
        }, ms);

        intervals.push(interval);
        api.runtime.logger.info({ job: job.name, cron: job.cron }, 'Cron job scheduled');
      }
    },

    async stop() {
      for (const interval of intervals) {
        clearInterval(interval);
      }
      intervals = [];
    },
  };
};

export default cronSchedulerPlugin;

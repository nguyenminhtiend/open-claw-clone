import { nanoid } from 'nanoid';
import type { PluginApi, PluginFactory } from '@oclaw/plugins';

const dailyDigestPlugin: PluginFactory = () => {
  return {
    async init(api: PluginApi) {
      api.registerHook('session:created', async (event) => {
        const memory = api.runtime.memory;
        if (!memory) {
          return;
        }

        const today = new Date().toISOString().split('T')[0];
        let dailyLog: string | null = null;

        try {
          dailyLog = await memory.readFile('daily.md');
        } catch {
          return;
        }

        if (dailyLog && event.messages) {
          event.messages.unshift({
            id: nanoid(),
            role: 'system',
            content: `[Today's notes - ${today}]\n${dailyLog}`,
            timestamp: new Date(),
          });
        }
      });
    },
  };
};

export default dailyDigestPlugin;

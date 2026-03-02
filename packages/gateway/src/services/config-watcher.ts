import type { FSWatcher } from 'node:fs';
import { watchConfig } from '@oclaw/config';
import type { Config } from '@oclaw/config';
import type { Logger } from '@oclaw/shared';

export interface ConfigWatcherOptions {
  workspaceDir: string;
  logger: Logger;
  onChange: (config: Config) => void;
}

export function startConfigWatcher(opts: ConfigWatcherOptions): FSWatcher | null {
  const { workspaceDir, logger, onChange } = opts;

  return watchConfig(workspaceDir, (newConfig) => {
    logger.info('Config reloaded');
    onChange(newConfig);
  });
}

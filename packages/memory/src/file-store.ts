import fs from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createLogger } from '@oclaw/shared';

const logger = createLogger('memory:file-store');

export type MemoryFileName = 'MEMORY.md' | 'SOUL.md' | 'AGENTS.md' | 'USER.md';

export class MemoryFileStore {
  constructor(private basePath: string) {}

  async readFile(filename: string): Promise<string | null> {
    try {
      return await readFile(resolve(this.basePath, filename), 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async writeFile(filename: string, content: string): Promise<void> {
    const fullPath = resolve(this.basePath, filename);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }

  async readMemory(): Promise<string | null> {
    return this.readFile('MEMORY.md');
  }

  async writeMemory(content: string): Promise<void> {
    await this.writeFile('MEMORY.md', content);
  }

  async appendToMemory(entry: string): Promise<void> {
    const existing = (await this.readMemory()) ?? '';
    const timestamp = new Date().toISOString();
    await this.writeMemory(`${existing}\n\n## ${timestamp}\n${entry}`);
  }

  async getSoul(): Promise<string | null> {
    return this.readFile('SOUL.md');
  }

  async getAgents(): Promise<string | null> {
    return this.readFile('AGENTS.md');
  }

  async getUser(): Promise<string | null> {
    return this.readFile('USER.md');
  }

  getBasePath(): string {
    return this.basePath;
  }

  watch(callback: (file: string) => void): fs.FSWatcher {
    const watcher = fs.watch(this.basePath, { recursive: true });
    let debounceTimer: ReturnType<typeof setTimeout>;
    watcher.on('change', (_, filename) => {
      if (typeof filename !== 'string' || !filename.endsWith('.md')) {
        return;
      }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => callback(filename), 500);
    });
    watcher.on('error', (err) => {
      logger.warn({ err }, 'File watcher error');
    });
    return watcher;
  }
}

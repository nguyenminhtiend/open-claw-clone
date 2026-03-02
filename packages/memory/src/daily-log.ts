import { glob } from 'glob';
import type { MemoryFileStore } from './file-store.js';

function datestamp(date: Date): string {
  return date.toISOString().split('T')[0];
}

function logFilename(date: Date): string {
  return `memory/${datestamp(date)}.md`;
}

export class DailyLog {
  constructor(private store: MemoryFileStore) {}

  async get(date?: Date): Promise<string | null> {
    return this.store.readFile(logFilename(date ?? new Date()));
  }

  async append(entry: string, date?: Date): Promise<void> {
    const d = date ?? new Date();
    const filename = logFilename(d);
    const existing = (await this.store.readFile(filename)) ?? `# ${d.toDateString()}\n`;
    const timestamp = d.toLocaleTimeString();
    await this.store.writeFile(filename, `${existing}\n\n### ${timestamp}\n${entry}`);
  }

  async listAll(): Promise<string[]> {
    const files = await glob('memory/*.md', { cwd: this.store.getBasePath() });
    return files.sort();
  }
}

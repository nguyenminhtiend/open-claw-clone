import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLogger } from '@oclaw/shared';
import { glob } from 'glob';
import type { MemoryFileStore } from '../file-store.js';
import { MarkdownChunker } from './chunker.js';
import type { VectorStore } from './store.js';

const logger = createLogger('memory:indexer');

const STATIC_FILES = ['MEMORY.md', 'SOUL.md', 'USER.md', 'AGENTS.md'];

export class MemoryIndexer {
  private chunker: MarkdownChunker;

  constructor(
    private fileStore: MemoryFileStore,
    private vectorStore: VectorStore
  ) {
    this.chunker = new MarkdownChunker();
  }

  async indexAll(): Promise<void> {
    const dailyLogs = await glob('memory/*.md', { cwd: this.fileStore.getBasePath() });
    const files = [...STATIC_FILES, ...dailyLogs];

    for (const file of files) {
      await this.indexFile(file);
    }

    logger.info({ count: files.length }, 'Indexed all memory files');
  }

  async indexFile(file: string): Promise<void> {
    const fullPath = resolve(this.fileStore.getBasePath(), file);
    let content: string;

    try {
      content = await readFile(fullPath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw err;
    }

    const chunks = this.chunker.chunk(content, file);
    this.vectorStore.removeBySource(file);

    if (chunks.length > 0) {
      await this.vectorStore.index(chunks);
    }

    logger.debug({ file, chunks: chunks.length }, 'Indexed memory file');
  }

  startWatching(): void {
    this.fileStore.watch(async (filename) => {
      logger.debug({ filename }, 'Memory file changed — re-indexing');
      await this.indexFile(filename);
    });
  }
}

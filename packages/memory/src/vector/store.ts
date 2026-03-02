import Database from 'better-sqlite3';
import type { MemoryChunk } from './chunker.js';
import { cosineSimilarity } from './embeddings.js';
import type { EmbeddingProvider } from './embeddings.js';

interface ChunkRow {
  id: string;
  source: string;
  content: string;
  embedding: Buffer;
  metadata: string;
  updated_at: string;
}

export type ScoredChunk = MemoryChunk & { score: number };

export class VectorStore {
  private db: Database.Database;

  constructor(
    dbPath: string,
    private embeddingProvider: EmbeddingProvider
  ) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        metadata TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_source ON chunks(source);
    `);
  }

  async index(chunks: MemoryChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const texts = chunks.map((c) => c.content);
    const embeddings = await this.embeddingProvider.embed(texts);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunks (id, source, content, embedding, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction(
      (items: Array<{ chunk: MemoryChunk; embedding: number[] }>) => {
        for (const { chunk, embedding } of items) {
          stmt.run(
            chunk.id,
            chunk.source,
            chunk.content,
            Buffer.from(new Float32Array(embedding).buffer),
            JSON.stringify(chunk.metadata)
          );
        }
      }
    );

    insertMany(chunks.map((chunk, i) => ({ chunk, embedding: embeddings[i] })));
  }

  async search(query: string, topK = 5): Promise<ScoredChunk[]> {
    const [queryEmbedding] = await this.embeddingProvider.embed([query]);
    const allRows = this.db.prepare('SELECT * FROM chunks').all() as ChunkRow[];

    const scored = allRows.map((row) => {
      const floats = new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        row.embedding.byteLength / 4
      );
      const score = cosineSimilarity(queryEmbedding, Array.from(floats));
      return {
        id: row.id,
        source: row.source,
        content: row.content,
        metadata: JSON.parse(row.metadata) as MemoryChunk['metadata'],
        score,
      };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  removeBySource(source: string): void {
    this.db.prepare('DELETE FROM chunks WHERE source = ?').run(source);
  }

  close(): void {
    this.db.close();
  }
}

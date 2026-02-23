# Phase 4: Memory & Persistence

> Build the Markdown-based memory system, vector search, session persistence, and context compaction with memory flush.

## Learning Goals

- Embedding generation (Voyage, Gemini, or local models)
- Vector similarity search (cosine distance)
- Markdown-as-database pattern (why OpenClaw chose this)
- File-based vs. SQLite persistence trade-offs
- Automatic memory compaction and flush

## Why This Matters

Memory is what makes OpenClaw a *persistent* agent rather than a stateless chatbot. It remembers your preferences, past decisions, project context, and daily logs. The vector search lets it recall relevant memories semantically — not just by keyword match. This is the "soul" of the system.

---

## Architecture

```
Memory System
├── File Store
│   ├── MEMORY.md              # Long-lived curated memories
│   ├── memory/YYYY-MM-DD.md   # Daily working logs
│   ├── SOUL.md                # Personality & values
│   ├── AGENTS.md              # Behavioral instructions
│   └── USER.md                # User preferences
├── Vector Index
│   ├── Embedding provider (Voyage / Gemini / Ollama)
│   ├── Index store (SQLite or flat file)
│   ├── Chunking & indexing pipeline
│   └── Similarity search (cosine)
├── Session Store
│   ├── SQLite-backed session history
│   └── Session serialization/deserialization
└── Compaction Engine
    ├── Token threshold monitor
    ├── Memory flush (write durable notes before compacting)
    └── Context summarization
```

---

## Step-by-Step Implementation

### 4.1 — Memory File Store

**Files:**

```
packages/memory/
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts
      ├── file-store.ts        # Read/write/watch memory markdown files
      ├── daily-log.ts         # Daily log management (YYYY-MM-DD.md)
      ├── vector/
      │   ├── embeddings.ts    # Embedding provider abstraction
      │   ├── index.ts         # Vector index (store + search)
      │   ├── chunker.ts       # Split markdown into searchable chunks
      │   └── store.ts         # SQLite-backed vector store
      ├── session-store.ts     # Persistent session history
      ├── compaction.ts        # Context compaction + memory flush
      └── tools/
          ├── memory-get.ts    # memory_get tool
          └── memory-search.ts # memory_search tool
```

**Memory file store:**

```typescript
class MemoryFileStore {
  private basePath: string;  // ~/.openclaw-clone/ or workspace root

  async readMemory(): Promise<string | null> {
    return this.readFile("MEMORY.md");
  }

  async writeMemory(content: string): Promise<void> {
    await this.writeFile("MEMORY.md", content);
  }

  async appendToMemory(entry: string): Promise<void> {
    const existing = await this.readMemory() ?? "";
    const timestamp = new Date().toISOString();
    await this.writeMemory(`${existing}\n\n## ${timestamp}\n${entry}`);
  }

  async getDailyLog(date?: Date): Promise<string | null> {
    const d = date ?? new Date();
    const filename = `memory/${d.toISOString().split("T")[0]}.md`;
    return this.readFile(filename);
  }

  async appendToDailyLog(entry: string): Promise<void> {
    const filename = `memory/${new Date().toISOString().split("T")[0]}.md`;
    const existing = await this.readFile(filename) ?? `# ${new Date().toDateString()}\n`;
    const timestamp = new Date().toLocaleTimeString();
    await this.writeFile(filename, `${existing}\n\n### ${timestamp}\n${entry}`);
  }

  async getSoul(): Promise<string | null> {
    return this.readFile("SOUL.md");
  }

  async getAgents(): Promise<string | null> {
    return this.readFile("AGENTS.md");
  }

  async getUser(): Promise<string | null> {
    return this.readFile("USER.md");
  }

  // Watch for file changes (debounced)
  watch(callback: (file: string) => void): void {
    const watcher = fs.watch(this.basePath, { recursive: true });
    let debounceTimer: NodeJS.Timeout;
    watcher.on("change", (_, filename) => {
      if (!filename?.endsWith(".md")) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => callback(filename), 500);
    });
  }
}
```

### 4.2 — Embedding Provider Abstraction

```typescript
interface EmbeddingProvider {
  id: string;
  embed(texts: string[]): Promise<number[][]>;
  dimensions: number;
}

class VoyageEmbeddings implements EmbeddingProvider {
  id = "voyage";
  dimensions = 1024;

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "voyage-3-lite", input: texts }),
    });
    const data = await response.json();
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  }
}

class OllamaEmbeddings implements EmbeddingProvider {
  id = "ollama";
  dimensions = 768;

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
      });
      const data = await response.json();
      results.push(data.embedding);
    }
    return results;
  }
}

// Auto-select: use Ollama if available locally, otherwise Voyage/Gemini
async function createEmbeddingProvider(config: Config): Promise<EmbeddingProvider> {
  if (config.agents.defaults.provider.name === "ollama") {
    return new OllamaEmbeddings(config);
  }
  if (config.voyageApiKey) return new VoyageEmbeddings(config);
  // Fallback: simple TF-IDF based similarity (no API needed)
  return new LocalTfIdfEmbeddings();
}
```

### 4.3 — Vector Index & Search

**Chunking markdown into searchable segments:**

```typescript
interface MemoryChunk {
  id: string;
  source: string;       // File path
  content: string;      // Chunk text
  embedding?: number[]; // Vector
  metadata: {
    lineStart: number;
    lineEnd: number;
    heading?: string;
    date?: string;
  };
}

class MarkdownChunker {
  private maxChunkTokens = 500;

  chunk(content: string, source: string): MemoryChunk[] {
    const chunks: MemoryChunk[] = [];
    const sections = this.splitBySections(content);

    for (const section of sections) {
      if (this.estimateTokens(section.content) <= this.maxChunkTokens) {
        chunks.push({
          id: nanoid(),
          source,
          content: section.content,
          metadata: {
            lineStart: section.lineStart,
            lineEnd: section.lineEnd,
            heading: section.heading,
          },
        });
      } else {
        // Split large sections by paragraphs
        const subChunks = this.splitByParagraphs(section);
        chunks.push(...subChunks);
      }
    }

    return chunks;
  }

  private splitBySections(content: string) {
    // Split on ## headings, preserving line numbers
    const lines = content.split("\n");
    const sections: Array<{ heading?: string; content: string; lineStart: number; lineEnd: number }> = [];
    let current = { heading: undefined as string | undefined, lines: [] as string[], lineStart: 0 };

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("## ")) {
        if (current.lines.length) {
          sections.push({
            heading: current.heading,
            content: current.lines.join("\n"),
            lineStart: current.lineStart,
            lineEnd: i - 1,
          });
        }
        current = { heading: lines[i], lines: [lines[i]], lineStart: i };
      } else {
        current.lines.push(lines[i]);
      }
    }

    if (current.lines.length) {
      sections.push({
        heading: current.heading,
        content: current.lines.join("\n"),
        lineStart: current.lineStart,
        lineEnd: lines.length - 1,
      });
    }

    return sections;
  }
}
```

**SQLite-backed vector store:**

```typescript
import Database from "better-sqlite3";

class VectorStore {
  private db: Database.Database;
  private embeddingProvider: EmbeddingProvider;

  constructor(dbPath: string, embeddingProvider: EmbeddingProvider) {
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
    this.embeddingProvider = embeddingProvider;
  }

  async index(chunks: MemoryChunk[]): Promise<void> {
    const texts = chunks.map(c => c.content);
    const embeddings = await this.embeddingProvider.embed(texts);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunks (id, source, content, embedding, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items: Array<{ chunk: MemoryChunk; embedding: number[] }>) => {
      for (const { chunk, embedding } of items) {
        stmt.run(
          chunk.id,
          chunk.source,
          chunk.content,
          Buffer.from(new Float32Array(embedding).buffer),
          JSON.stringify(chunk.metadata),
        );
      }
    });

    insertMany(chunks.map((chunk, i) => ({ chunk, embedding: embeddings[i] })));
  }

  async search(query: string, topK = 5): Promise<Array<MemoryChunk & { score: number }>> {
    const [queryEmbedding] = await this.embeddingProvider.embed([query]);
    const allRows = this.db.prepare("SELECT * FROM chunks").all() as any[];

    const scored = allRows.map(row => {
      const embedding = new Float32Array(row.embedding.buffer);
      const score = cosineSimilarity(queryEmbedding, Array.from(embedding));
      return {
        id: row.id,
        source: row.source,
        content: row.content,
        metadata: JSON.parse(row.metadata),
        score,
      };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  removeBySource(source: string): void {
    this.db.prepare("DELETE FROM chunks WHERE source = ?").run(source);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

### 4.4 — Session Persistence

Store session history in SQLite so sessions survive restarts.

```typescript
class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        channel_id TEXT,
        agent_id TEXT,
        created_at TEXT,
        last_active_at TEXT,
        metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT REFERENCES sessions(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        tool_calls TEXT,
        tool_call_id TEXT,
        channel_meta TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_session_messages ON messages(session_id, timestamp);
    `);
  }

  saveSession(session: Session): void { /* upsert session + messages */ }
  loadSession(id: string): Session | null { /* load session + messages */ }
  listSessions(limit?: number): SessionSummary[] { /* list recent sessions */ }
  deleteSession(id: string): void { /* cascade delete */ }
}
```

### 4.5 — Memory Flush & Compaction

Before compacting context, flush important notes to durable memory:

```typescript
class CompactionEngine {
  private softThreshold = 4000; // tokens before flush triggers

  async maybeCompact(session: Session, tokenCount: number): Promise<void> {
    if (tokenCount < this.softThreshold) return;

    // Step 1: Memory flush — ask LLM to extract durable memories
    await this.flushMemories(session);

    // Step 2: Summarize and compact older messages
    await this.compactMessages(session);
  }

  private async flushMemories(session: Session): Promise<void> {
    const response = await this.provider.chat({
      model: "fast-model",
      messages: [
        {
          role: "system",
          content: `Review this conversation and extract any important facts, decisions, 
                    user preferences, or project context that should be remembered long-term.
                    Format as bullet points. If nothing worth remembering, respond with "NONE".`,
        },
        ...session.messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
      ],
      maxTokens: 500,
    });

    const memories = response.content[0].text;
    if (memories.trim() !== "NONE") {
      await this.memoryStore.appendToMemory(memories);
      await this.memoryStore.appendToDailyLog(`**Auto-flushed memories:**\n${memories}`);
    }
  }

  private async compactMessages(session: Session): Promise<void> {
    const keepRecent = 10;
    const older = session.messages.slice(0, -keepRecent);
    if (older.length < 5) return;

    const summary = await this.provider.chat({
      model: "fast-model",
      messages: [
        { role: "system", content: "Summarize this conversation concisely, preserving key context." },
        { role: "user", content: older.map(m => `[${m.role}]: ${m.content}`).join("\n") },
      ],
      maxTokens: 800,
    });

    session.messages = [
      { id: nanoid(), role: "system", content: `[Compacted history]\n${summary.content[0].text}`, timestamp: new Date() },
      ...session.messages.slice(-keepRecent),
    ];
  }
}
```

### 4.6 — Memory Tools (for LLM use)

```typescript
const memoryGetTool: ToolHandler = {
  definition: {
    name: "memory_get",
    description: "Read specific memory files or line ranges",
    parameters: z.object({
      file: z.enum(["MEMORY.md", "SOUL.md", "AGENTS.md", "USER.md", "daily"]),
      date: z.string().optional().describe("Date for daily log (YYYY-MM-DD)"),
      startLine: z.number().optional(),
      endLine: z.number().optional(),
    }),
    group: "memory",
  },
  async execute(input, context) {
    // Read the specified file and return content
  },
};

const memorySearchTool: ToolHandler = {
  definition: {
    name: "memory_search",
    description: "Semantically search through memory for relevant past context",
    parameters: z.object({
      query: z.string().describe("What to search for"),
      topK: z.number().optional().default(5),
    }),
    group: "memory",
  },
  async execute(input, context) {
    const results = await vectorStore.search(input.query, input.topK);
    return {
      output: results.map(r =>
        `[${r.source}:${r.metadata.lineStart}-${r.metadata.lineEnd}] (score: ${r.score.toFixed(3)})\n${r.content}`
      ).join("\n\n---\n\n"),
      durationMs: 0,
    };
  },
};
```

---

## Memory File Indexing Pipeline

On startup and file change, re-index memory files:

```typescript
class MemoryIndexer {
  private watcher: MemoryFileStore;
  private chunker: MarkdownChunker;
  private vectorStore: VectorStore;

  async indexAll(): Promise<void> {
    const files = ["MEMORY.md", "SOUL.md", "USER.md"];
    // Also index all daily logs
    const dailyLogs = await glob("memory/*.md", { cwd: this.basePath });
    files.push(...dailyLogs);

    for (const file of files) {
      await this.indexFile(file);
    }
  }

  async indexFile(file: string): Promise<void> {
    const content = await readFile(resolve(this.basePath, file), "utf-8");
    const chunks = this.chunker.chunk(content, file);
    this.vectorStore.removeBySource(file);
    await this.vectorStore.index(chunks);
  }

  startWatching(): void {
    this.watcher.watch(async (file) => {
      await this.indexFile(file);
    });
  }
}
```

---

## Testing Strategy

Key test scenarios:
- Memory files are read/written correctly
- Daily logs are created with correct date filenames
- Chunks are generated from markdown with correct line numbers
- Embeddings are generated and stored in SQLite
- Vector search returns relevant results ranked by similarity
- Session persistence survives process restart
- Memory flush extracts meaningful notes
- Context compaction reduces message count while preserving context
- File watcher triggers re-indexing on changes

---

## Checkpoint — You're Done When

- [ ] MEMORY.md, daily logs, SOUL.md are read/written/watched
- [ ] Memory files are chunked and indexed with embeddings
- [ ] `memory_search` returns relevant results from vector store
- [ ] `memory_get` reads specific files and line ranges
- [ ] Sessions persist to SQLite and survive restart
- [ ] Context compaction triggers at token threshold
- [ ] Memory flush writes durable notes before compaction
- [ ] File changes trigger re-indexing (debounced)

---

## Dependencies (additional)

```json
{
  "dependencies": {
    "better-sqlite3": "^11.x"
  }
}
```

---

## Next Phase

→ **[Phase 5: Channels & Messaging](phase-05-channels.md)**

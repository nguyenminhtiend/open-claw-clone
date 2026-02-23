---
name: phase-04-memory-persistence
description: Builds the Markdown-based memory system, vector search with embeddings, session persistence in SQLite, and context compaction. Use when implementing the memory store, embedding pipeline, session persistence, or compaction logic after Phase 3 is complete.
---

# Phase 4: Memory & Persistence

Build the Markdown-based memory system, vector search with embeddings, session persistence in SQLite, and context compaction with memory flush.

## Prerequisites

- Phase 3 completed (Tools engine working)
- `better-sqlite3` installed
- Embedding provider available (Ollama `nomic-embed-text` recommended for free local)

## Steps

Copy this checklist and mark off items as you complete them:

```
Progress:
- [ ] 1. Create packages/memory
- [ ] 2. Build Memory File Store
- [ ] 3. Build Embedding Provider Abstraction
- [ ] 4. Build Markdown Chunker
- [ ] 5. Build SQLite Vector Store
- [ ] 6. Build Session Persistence
- [ ] 7. Build Compaction Engine
- [ ] 8. Build Memory Tools
- [ ] 9. Build Memory Indexer
- [ ] 10. Install Dependencies
- [ ] 11. Write Tests ✅ all passing
```

### 1. Create `packages/memory`

See [creating-package](../creating-package/SKILL.md) for the standard package scaffold.

```bash
# turbo
mkdir -p packages/memory/src/{vector,tools}
```

### 2. Build Memory File Store

`src/file-store.ts` — Read/write/watch markdown memory files:

| File                   | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `MEMORY.md`            | Long-lived curated memories (facts, preferences, decisions) |
| `memory/YYYY-MM-DD.md` | Daily working logs, append-only                             |
| `SOUL.md`              | Agent personality & values (injected into system prompt)    |
| `AGENTS.md`            | Behavioral instructions (injected into system prompt)       |
| `USER.md`              | User preferences and profile info                           |

Key methods: `readMemory()`, `appendToMemory()`, `getDailyLog()`, `appendToDailyLog()`, `getSoul()`, `getAgents()`

File watcher: `fs.watch` with debounced callback for re-indexing.

### 3. Build Embedding Provider Abstraction

`src/vector/embeddings.ts`:

- `EmbeddingProvider` interface: `embed(texts: string[]) → number[][]`
- `OllamaEmbeddings` — Uses `nomic-embed-text` via local API
- `VoyageEmbeddings` — Uses Voyage AI API
- `LocalTfIdfEmbeddings` — Fallback, no API needed
- Auto-select: Ollama if available, then Voyage, then TF-IDF

### 4. Build Markdown Chunker

`src/vector/chunker.ts`:

- Split markdown by `##` headings into searchable chunks
- Each chunk has: id, source file, content, line range, heading
- Large sections split by paragraphs
- Max chunk size: ~500 tokens

### 5. Build SQLite Vector Store

`src/vector/store.ts` using `better-sqlite3`:

- Table: `chunks (id, source, content, embedding BLOB, metadata, updated_at)`
- `index(chunks)` — Embed and store chunks
- `search(query, topK)` — Cosine similarity search
- `removeBySource(source)` — Re-index per file

### 6. Build Session Persistence

`src/session-store.ts` using SQLite:

- Tables: `sessions`, `messages`
- `saveSession()`, `loadSession()`, `listSessions()`, `deleteSession()`
- Sessions and messages survive gateway restarts

### 7. Build Compaction Engine

`src/compaction.ts`:

1. **Memory flush** — Ask LLM to extract durable facts → append to MEMORY.md + daily log
2. **Context compaction** — Summarize older messages, keep recent N messages

Triggers at configurable token threshold (default 80% of max context).

### 8. Build Memory Tools

`src/tools/memory-get.ts` — `memory_get` tool for LLM to read specific memory files
`src/tools/memory-search.ts` — `memory_search` tool for semantic search over memory

### 9. Build Memory Indexer

- On startup: index all memory files (MEMORY.md, SOUL.md, USER.md, daily logs)
- On file change: re-index changed file
- Pipeline: read file → chunk → embed → store in SQLite

### 10. Install Dependencies

```bash
# turbo
pnpm --filter @oclaw/memory add better-sqlite3@^11
pnpm --filter @oclaw/memory add -D @types/better-sqlite3
```

### 11. Write Tests

```bash
# turbo
pnpm --filter @oclaw/memory test
```

See [testing-patterns](../testing-patterns/SKILL.md) for mock strategies.

Key tests:

- Memory files read/written correctly
- Daily logs created with correct date filenames
- Chunks generated from markdown with correct line numbers
- Vector search returns relevant results ranked by similarity
- Session persistence survives simulated restart
- Memory flush extracts meaningful notes
- Context compaction reduces message count
- File watcher triggers re-indexing

**Feedback loop**: After implementing the SQLite vector store (Step 5), run a smoke test: index a sample MEMORY.md and verify `search()` returns the correct chunk. Fix any embedding or similarity issues before building the compaction engine. Re-run tests after each step; only proceed when all pass.

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

## Dependencies

| Package              | Purpose                                  |
| -------------------- | ---------------------------------------- |
| better-sqlite3 `^11` | SQLite database for vectors and sessions |

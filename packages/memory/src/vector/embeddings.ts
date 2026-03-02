import { createLogger } from '@oclaw/shared';

const logger = createLogger('memory:embeddings');

export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

// ── Voyage ──────────────────────────────────────────────────────────────────

export class VoyageEmbeddings implements EmbeddingProvider {
  readonly id = 'voyage';
  readonly dimensions = 1024;

  constructor(private apiKey: string) {}

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'voyage-3-lite', input: texts }),
    });

    if (!response.ok) {
      throw new Error(`Voyage API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }
}

// ── Ollama ───────────────────────────────────────────────────────────────────

export class OllamaEmbeddings implements EmbeddingProvider {
  readonly id = 'ollama';
  readonly dimensions = 768;

  constructor(
    private baseUrl: string,
    private model = 'nomic-embed-text'
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });

      if (!response.ok) {
        throw new Error(`Ollama embed error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { embedding: number[] };
      results.push(data.embedding);
    }
    return results;
  }
}

// ── TF-IDF fallback (no API required) ────────────────────────────────────────

export class TfIdfEmbeddings implements EmbeddingProvider {
  readonly id = 'tfidf';
  readonly dimensions = 512;

  private vocabulary: Map<string, number> = new Map();
  private docFrequency: Map<string, number> = new Map();
  private docCount = 0;

  embed(texts: string[]): Promise<number[][]> {
    this.buildVocabulary(texts);
    return Promise.resolve(texts.map((t) => this.vectorize(t)));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private buildVocabulary(texts: string[]): void {
    this.docCount += texts.length;
    for (const text of texts) {
      const tokens = new Set(this.tokenize(text));
      for (const token of tokens) {
        this.docFrequency.set(token, (this.docFrequency.get(token) ?? 0) + 1);
        if (!this.vocabulary.has(token) && this.vocabulary.size < this.dimensions) {
          this.vocabulary.set(token, this.vocabulary.size);
        }
      }
    }
  }

  private vectorize(text: string): number[] {
    const tokens = this.tokenize(text);
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }

    const vec = new Array<number>(this.dimensions).fill(0);
    for (const [token, count] of tf) {
      const idx = this.vocabulary.get(token);
      if (idx === undefined) {
        continue;
      }
      const tfScore = count / tokens.length;
      const df = this.docFrequency.get(token) ?? 1;
      const idfScore = Math.log((this.docCount + 1) / (df + 1)) + 1;
      vec[idx] = tfScore * idfScore;
    }

    return normalize(vec);
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export interface EmbeddingConfig {
  providerName: string;
  providerBaseUrl?: string;
  voyageApiKey?: string;
}

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  if (config.providerName === 'ollama') {
    const baseUrl = config.providerBaseUrl ?? 'http://localhost:11434';
    logger.info({ baseUrl }, 'Using Ollama embeddings');
    return new OllamaEmbeddings(baseUrl);
  }

  if (config.voyageApiKey) {
    logger.info('Using Voyage embeddings');
    return new VoyageEmbeddings(config.voyageApiKey);
  }

  logger.info('No embedding API configured — using TF-IDF fallback');
  return new TfIdfEmbeddings();
}

// ── Cosine similarity ────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? vec : vec.map((v) => v / norm);
}

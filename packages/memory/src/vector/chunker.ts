import { nanoid } from 'nanoid';

export interface MemoryChunk {
  id: string;
  source: string;
  content: string;
  embedding?: number[];
  metadata: {
    lineStart: number;
    lineEnd: number;
    heading?: string;
    date?: string;
  };
}

interface Section {
  heading?: string;
  content: string;
  lineStart: number;
  lineEnd: number;
}

export class MarkdownChunker {
  private maxChunkTokens: number;

  constructor(maxChunkTokens = 500) {
    this.maxChunkTokens = maxChunkTokens;
  }

  chunk(content: string, source: string): MemoryChunk[] {
    const chunks: MemoryChunk[] = [];
    const sections = this.splitBySections(content);

    for (const section of sections) {
      if (this.estimateTokens(section.content) <= this.maxChunkTokens) {
        if (section.content.trim().length === 0) {
          continue;
        }
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
        chunks.push(...this.splitByParagraphs(section, source));
      }
    }

    return chunks;
  }

  private splitBySections(content: string): Section[] {
    const lines = content.split('\n');
    const sections: Section[] = [];
    let current: { heading?: string; lines: string[]; lineStart: number } = {
      heading: undefined,
      lines: [],
      lineStart: 0,
    };

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        if (current.lines.length > 0) {
          sections.push({
            heading: current.heading,
            content: current.lines.join('\n'),
            lineStart: current.lineStart,
            lineEnd: i - 1,
          });
        }
        current = { heading: lines[i].slice(3).trim(), lines: [lines[i]], lineStart: i };
      } else {
        current.lines.push(lines[i]);
      }
    }

    if (current.lines.length > 0) {
      sections.push({
        heading: current.heading,
        content: current.lines.join('\n'),
        lineStart: current.lineStart,
        lineEnd: lines.length - 1,
      });
    }

    return sections;
  }

  private splitByParagraphs(section: Section, source: string): MemoryChunk[] {
    const paragraphs = section.content.split(/\n\n+/);
    const chunks: MemoryChunk[] = [];
    let lineOffset = section.lineStart;

    for (const para of paragraphs) {
      if (para.trim().length === 0) {
        lineOffset += para.split('\n').length + 1;
        continue;
      }

      const paraLines = para.split('\n').length;

      if (this.estimateTokens(para) <= this.maxChunkTokens) {
        chunks.push({
          id: nanoid(),
          source,
          content: para,
          metadata: {
            lineStart: lineOffset,
            lineEnd: lineOffset + paraLines - 1,
            heading: section.heading,
          },
        });
      } else {
        // Still too large — split by sentences with overlap
        const sentences = para.match(/[^.!?\n]+[.!?\n]*/g) ?? [para];
        let current = '';
        let sentLineStart = lineOffset;

        for (const sentence of sentences) {
          if (this.estimateTokens(current + sentence) > this.maxChunkTokens && current.length > 0) {
            chunks.push({
              id: nanoid(),
              source,
              content: current.trim(),
              metadata: {
                lineStart: sentLineStart,
                lineEnd: sentLineStart + current.split('\n').length - 1,
                heading: section.heading,
              },
            });
            sentLineStart += current.split('\n').length;
            current = sentence;
          } else {
            current += sentence;
          }
        }

        if (current.trim().length > 0) {
          chunks.push({
            id: nanoid(),
            source,
            content: current.trim(),
            metadata: {
              lineStart: sentLineStart,
              lineEnd: sentLineStart + current.split('\n').length - 1,
              heading: section.heading,
            },
          });
        }
      }

      lineOffset += paraLines + 1;
    }

    return chunks;
  }

  /** Rough token estimate: ~4 chars per token */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

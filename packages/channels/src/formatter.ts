import type { OutboundMessage } from './types.js';

/**
 * Convert a unified OutboundMessage to platform-specific text.
 */
export function formatForPlatform(platformType: string, content: OutboundMessage): OutboundMessage {
  if (content.format === 'plain') {
    return content;
  }

  switch (platformType) {
    case 'telegram':
      return { ...content, text: markdownToTelegramHtml(content.text), format: 'html' };

    case 'discord':
      // Discord renders markdown natively — pass through unchanged
      return content;

    default:
      return content;
  }
}

/**
 * Convert a subset of Markdown to Telegram HTML.
 * Telegram supports: <b>, <i>, <u>, <s>, <code>, <pre>, <a href="">
 */
export function markdownToTelegramHtml(text: string): string {
  return (
    text
      // Fenced code blocks (must come before inline code)
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      // Inline code
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      // Bold (**text** or __text__)
      .replace(/\*\*(.*?)\*\*/gs, '<b>$1</b>')
      .replace(/__(.*?)__/gs, '<b>$1</b>')
      // Italic (*text* or _text_) — avoid matching ** already consumed
      .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/gs, '<i>$1</i>')
      .replace(/(?<!_)_(?!_)(.*?)(?<!_)_(?!_)/gs, '<i>$1</i>')
      // Strikethrough
      .replace(/~~(.*?)~~/gs, '<s>$1</s>')
    // Escape remaining raw < > & that aren't our tags
    // (only outside of already-replaced tags — simple approach: skip)
  );
}

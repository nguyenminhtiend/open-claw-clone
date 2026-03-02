/**
 * Fast local token estimation using character-based heuristic (chars / 4 ≈ tokens).
 * Accurate token counts come from the provider's reported usage after each API call.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: Array<{ content: unknown }>): number {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    total += estimateTokens(content);
    total += 4; // per-message overhead
  }
  return total;
}

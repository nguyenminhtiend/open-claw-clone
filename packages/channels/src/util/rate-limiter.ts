export class RateLimiter {
  private windows = new Map<string, number[]>();

  constructor(private messagesPerMinute: number) {}

  /**
   * Returns true if the sender is allowed to send, false if rate-limited.
   * Tracks a sliding 60-second window per key.
   */
  check(key: string): boolean {
    const now = Date.now();
    const windowStart = now - 60_000;

    const timestamps = (this.windows.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= this.messagesPerMinute) {
      return false;
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);
    return true;
  }

  clear(key: string): void {
    this.windows.delete(key);
  }
}

import type { EventIdempotencyStore } from "./types.js";

export class SignalDeduplicator implements EventIdempotencyStore {
  private readonly maxEntries: number;
  private readonly seenEventIds = new Map<string, string>();

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  hasSeen(eventId: string): boolean {
    return this.seenEventIds.has(eventId);
  }

  remember(eventId: string, seenAtUtc = new Date().toISOString()): void {
    this.seenEventIds.set(eventId, seenAtUtc);
    if (this.seenEventIds.size <= this.maxEntries) {
      return;
    }

    const oldestEventId = this.seenEventIds.keys().next().value;
    if (typeof oldestEventId === "string") {
      this.seenEventIds.delete(oldestEventId);
    }
  }

  async markIfFirstSeen(_stream: string, eventId: string): Promise<boolean> {
    if (this.hasSeen(eventId)) {
      return false;
    }
    this.remember(eventId);
    return true;
  }

  async clear(_stream: string, eventId: string): Promise<void> {
    this.seenEventIds.delete(eventId);
  }
}

import type { RawExternalSignal, SignalSource } from "../types.js";

export class ManualSimulationSource implements SignalSource {
  private readonly queue: RawExternalSignal[];

  constructor(seedEvents: RawExternalSignal[] = []) {
    this.queue = [...seedEvents];
  }

  enqueue(event: RawExternalSignal): void {
    this.queue.push(event);
  }

  async poll(): Promise<RawExternalSignal[]> {
    if (this.queue.length === 0) {
      return [];
    }
    const events = [...this.queue];
    this.queue.length = 0;
    return events;
  }
}

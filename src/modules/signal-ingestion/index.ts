export { SignalIngestionService } from "./service.js";
export { SignalDeduplicator } from "./deduplicator.js";
export { SignalIngestionWorker } from "./worker.js";
export { ManualSimulationSource } from "./sources/manual-simulation-source.js";
export { SourceTypes } from "./constants.js";
export type {
  EventIdempotencyStore,
  ExternalSignal,
  IngestionSummary,
  Logger,
  RawExternalSignal,
  SignalSource
} from "./types.js";

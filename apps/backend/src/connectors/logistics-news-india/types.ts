import type { RawExternalSignal } from "../../modules/signal-ingestion/types.js";

export interface LogisticsNewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  publishedAt: string;
  source: string;
}

export interface FetchLogisticsNewsResult {
  items: LogisticsNewsItem[];
}

export interface LogisticsNewsClientOptions {
  baseUrl: string;
  query: string;
  language?: string;
  country?: string;
  requestTimeoutMs: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

export interface LogisticsNewsProvider {
  fetchLatest(maxItems: number): Promise<FetchLogisticsNewsResult>;
}

export interface LogisticsNewsConnectorPollSummary {
  fetched: number;
  published: number;
  skipped_unchanged: number;
  failed: number;
}

export type LogisticsRawSignal = RawExternalSignal;

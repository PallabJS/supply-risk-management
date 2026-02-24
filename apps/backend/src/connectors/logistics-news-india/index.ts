import { UniversalPollingConnector } from "../framework/universal-polling-connector.js";
import type { ConnectorFactoryOptions } from "../framework/connector-factory.js";
import type { ConnectorConfig, PollingConnector } from "../framework/types.js";
import type { RawExternalSignal } from "../../modules/signal-ingestion/types.js";
import { LogisticsNewsIndiaClient } from "./client.js";
import { buildItemVersion, toRawSignal } from "./schema.js";
import type { LogisticsNewsItem } from "./types.js";

interface LogisticsNewsProviderConfig extends Record<string, unknown> {
  baseUrl: string;
  query: string;
  language?: string;
  country?: string;
  userAgent?: string;
  maxItemsPerPoll?: number;
}

export function createIndiaLogisticsNewsConnector(
  name: string,
  config: ConnectorConfig,
  options: ConnectorFactoryOptions
): PollingConnector {
  const providerConfig = config.providerConfig as LogisticsNewsProviderConfig;

  if (!providerConfig.baseUrl || typeof providerConfig.baseUrl !== "string") {
    throw new Error(
      `India logistics news connector ${name}: baseUrl is required and must be a string`
    );
  }
  if (!providerConfig.query || typeof providerConfig.query !== "string") {
    throw new Error(
      `India logistics news connector ${name}: query is required and must be a string`
    );
  }

  const client = new LogisticsNewsIndiaClient({
    baseUrl: providerConfig.baseUrl,
    query: providerConfig.query,
    requestTimeoutMs: config.requestTimeoutMs,
    language: (providerConfig.language as string) || "en-IN",
    country: (providerConfig.country as string) || "IN",
    userAgent: (providerConfig.userAgent as string) || "swarm-risk-management/0.1"
  });

  return new UniversalPollingConnector<
    LogisticsNewsIndiaClient,
    LogisticsNewsItem,
    RawExternalSignal
  >({
    name,
    config,
    provider: client,
    fetcher: async (provider) => {
      const result = await provider.fetchLatest(
        (providerConfig.maxItemsPerPoll as number) || 20
      );
      return { items: result.items || [] };
    },
    transformer: toRawSignal,
    changeDetector: buildItemVersion,
    eventPublisher: options.eventBus,
    stateStore: options.stateStore,
    logger: options.logger
  });
}

export { LogisticsNewsIndiaClient } from "./client.js";
export { toRawSignal, buildItemVersion } from "./schema.js";
export type {
  LogisticsNewsClientOptions,
  LogisticsNewsItem,
  LogisticsNewsProvider,
  FetchLogisticsNewsResult,
  LogisticsNewsConnectorPollSummary
} from "./types.js";

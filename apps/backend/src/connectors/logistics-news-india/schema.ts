import { createHash } from "node:crypto";
import type { RawExternalSignal } from "../../modules/signal-ingestion/types.js";
import type { LogisticsNewsItem } from "./types.js";

function inferSourceType(item: LogisticsNewsItem): "NEWS" | "TRAFFIC" {
  const text = `${item.title} ${item.description}`.toLowerCase();
  if (
    text.includes("traffic") ||
    text.includes("road closure") ||
    text.includes("highway") ||
    text.includes("congestion")
  ) {
    return "TRAFFIC";
  }
  return "NEWS";
}

function inferGeographicScope(item: LogisticsNewsItem): string {
  const text = `${item.title} ${item.description}`.toLowerCase();
  if (text.includes("mumbai")) return "Mumbai";
  if (text.includes("bangalore") || text.includes("bengaluru")) return "Bangalore";
  if (text.includes("maharashtra")) return "Maharashtra";
  if (text.includes("karnataka")) return "Karnataka";
  if (text.includes("india")) return "India";
  return "India";
}

function computeConfidence(item: LogisticsNewsItem): number {
  const text = `${item.title} ${item.description}`.toLowerCase();
  if (
    text.includes("shutdown") ||
    text.includes("port closure") ||
    text.includes("flood") ||
    text.includes("strike")
  ) {
    return 0.9;
  }
  if (text.includes("delay") || text.includes("disruption") || text.includes("congestion")) {
    return 0.78;
  }
  return 0.65;
}

function deterministicEventId(item: LogisticsNewsItem): string {
  const digest = createHash("sha1")
    .update(`${item.id}:${item.publishedAt}`)
    .digest("hex")
    .slice(0, 24);
  return `news-india:${digest}`;
}

export function toRawSignal(item: LogisticsNewsItem): RawExternalSignal {
  return {
    event_id: deterministicEventId(item),
    source_type: inferSourceType(item),
    raw_content: JSON.stringify({
      title: item.title,
      description: item.description,
      source: item.source,
      link: item.link
    }),
    source_reference: item.link || `news-india:${item.id}`,
    geographic_scope: inferGeographicScope(item),
    timestamp_utc: item.publishedAt,
    signal_confidence: computeConfidence(item)
  };
}

export function buildItemVersion(item: LogisticsNewsItem): string {
  return `${item.id}:${item.publishedAt}`;
}

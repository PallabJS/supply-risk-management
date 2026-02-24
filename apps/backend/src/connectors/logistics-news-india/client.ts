import { createHash } from "node:crypto";
import type {
  FetchLogisticsNewsResult,
  LogisticsNewsClientOptions,
  LogisticsNewsItem,
  LogisticsNewsProvider,
} from "./types.js";

function assertPositiveInt(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTagValue(input: string, tagName: string): string | undefined {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = input.match(regex);
  if (!match || !match[1]) {
    return undefined;
  }
  return decodeXmlEntities(match[1]).trim();
}

function sanitizeText(value: string | undefined, fallback: string): string {
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeadline(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*[-|]\s*[^-|]+$/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

const DISRUPTION_KEYWORDS = [
  "strike",
  "trucker",
  "truckers",
  "lorry",
  "shutdown",
  "disrupt",
  "disruption",
  "congestion",
  "delay",
  "shortage",
  "blocked",
  "closure",
  "flood",
  "storm",
  "cyclone",
  "port closure",
  "supply hit",
  "outage",
  "dues",
];

const NON_DISRUPTION_KEYWORDS = [
  "mou",
  "mo u",
  "sign mo u",
  "signed an mou",
  "appointed",
  "appoints",
  "conference",
  "education hub",
  "launches",
  "launch",
  "invest",
  "investment",
  "leases",
  "pledges",
  "margin boost",
  "quality & innovation",
];

function includesAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function isDisruptionCandidate(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  const hasDisruption = includesAnyKeyword(text, DISRUPTION_KEYWORDS);
  if (!hasDisruption) return false;
  const isClearlyPositive = includesAnyKeyword(text, NON_DISRUPTION_KEYWORDS);
  if (isClearlyPositive && !text.includes("strike") && !text.includes("disrupt")) {
    return false;
  }
  return true;
}

function parseRssItems(xml: string, maxItems: number): LogisticsNewsItem[] {
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const items: LogisticsNewsItem[] = [];
  const seen = new Set<string>();
  const seenTokenSets: Set<string>[] = [];

  for (const itemXml of itemMatches) {
    if (items.length >= maxItems) {
      break;
    }

    const title = sanitizeText(
      extractTagValue(itemXml, "title"),
      "Logistics update",
    );
    const description = sanitizeText(
      extractTagValue(itemXml, "description"),
      "",
    );
    if (!isDisruptionCandidate(title, description)) {
      continue;
    }
    const link = sanitizeText(extractTagValue(itemXml, "link"), "");
    const guid = sanitizeText(extractTagValue(itemXml, "guid"), link || title);
    const pubDate = extractTagValue(itemXml, "pubDate");
    const source = sanitizeText(
      extractTagValue(itemXml, "source"),
      "news-feed",
    );
    const publishedAt = Number.isFinite(Date.parse(pubDate ?? ""))
      ? new Date(pubDate as string).toISOString()
      : new Date().toISOString();
    const dedupeKey = `${normalizeHeadline(title)}:${publishedAt.slice(0, 13)}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    const titleTokens = tokenize(normalizeHeadline(title));
    const hasNearDuplicate = seenTokenSets.some(
      (tokens) => jaccardSimilarity(tokens, titleTokens) >= 0.8,
    );
    if (hasNearDuplicate) {
      continue;
    }
    seen.add(dedupeKey);
    seenTokenSets.push(titleTokens);

    const itemId = createHash("sha1")
      .update(`${guid}:${publishedAt}`)
      .digest("hex")
      .slice(0, 24);

    items.push({
      id: itemId,
      title,
      description,
      link,
      publishedAt,
      source,
    });
  }

  return items;
}

export class LogisticsNewsIndiaClient implements LogisticsNewsProvider {
  private readonly baseUrl: string;
  private readonly query: string;
  private readonly language: string;
  private readonly country: string;
  private readonly requestTimeoutMs: number;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LogisticsNewsClientOptions) {
    if (!options.baseUrl || options.baseUrl.trim() === "") {
      throw new Error("LogisticsNewsIndiaClient requires a non-empty baseUrl");
    }
    if (!options.query || options.query.trim() === "") {
      throw new Error("LogisticsNewsIndiaClient requires a non-empty query");
    }

    assertPositiveInt(options.requestTimeoutMs, "requestTimeoutMs");

    this.baseUrl = stripTrailingSlash(options.baseUrl.trim());
    this.query = options.query.trim();
    this.language = (options.language || "en-IN").trim();
    this.country = (options.country || "IN").trim();
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.userAgent = (options.userAgent || "swarm-risk-management/0.1").trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchLatest(maxItems: number): Promise<FetchLogisticsNewsResult> {
    assertPositiveInt(maxItems, "maxItems");

    const url = new URL(this.baseUrl);
    url.searchParams.set("q", this.query);
    url.searchParams.set("hl", this.language);
    url.searchParams.set("gl", this.country);
    url.searchParams.set("ceid", `${this.country}:${this.language}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
          "user-agent": this.userAgent,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `News RSS request failed (${response.status}): ${body}`,
        );
      }

      const xml = await response.text();
      return {
        items: parseRssItems(xml, maxItems),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `News RSS request timed out after ${this.requestTimeoutMs}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

import assert from "node:assert/strict";
import test from "node:test";

import { LogisticsNewsIndiaClient } from "../../src/connectors/logistics-news-india/client.js";
import { buildItemVersion, toRawSignal } from "../../src/connectors/logistics-news-india/schema.js";

const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Google News - Logistics</title>
    <item>
      <title>Mumbai port congestion delays cargo movement</title>
      <link>https://example.com/news-1</link>
      <guid>news-1</guid>
      <pubDate>Mon, 24 Feb 2026 10:00:00 GMT</pubDate>
      <description>Heavy congestion at Mumbai port impacts dispatch schedules.</description>
      <source>Example News</source>
    </item>
  </channel>
</rss>`;

const sampleRssWithHtmlEntities = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Google News - Logistics</title>
    <item>
      <title><![CDATA[News Indian shippers and retailers suffer in a wave of supply chain disruption - The Loadstar]]></title>
      <link>https://example.com/news-2</link>
      <guid>news-2</guid>
      <pubDate>Mon, 24 Feb 2026 11:00:00 GMT</pubDate>
      <description><![CDATA[News Indian shippers and retailers suffer in a wave of supply chain disruption &nbsp;&nbsp; The Loadstar]]></description>
      <source>Example News</source>
    </item>
  </channel>
</rss>`;

test("parses logistics rss and transforms to raw signal", async () => {
  const client = new LogisticsNewsIndiaClient({
    baseUrl: "https://news.google.com/rss/search",
    query: "mumbai logistics",
    requestTimeoutMs: 10_000,
    fetchImpl: async () =>
      new Response(sampleRss, {
        status: 200,
        headers: {
          "content-type": "application/rss+xml"
        }
      })
  });

  const result = await client.fetchLatest(10);
  assert.equal(result.items.length, 1);

  const first = result.items[0];
  assert.ok(first);
  const signal = toRawSignal(first);
  assert.equal(signal.source_type, "TRAFFIC");
  assert.equal(signal.geographic_scope, "Mumbai");
  assert.equal(signal.source_reference, "https://example.com/news-1");
  assert.ok(String(signal.event_id).startsWith("news-india:"));
  assert.ok(buildItemVersion(first).length > 0);
});

test("cleans html entities from rss description text", async () => {
  const client = new LogisticsNewsIndiaClient({
    baseUrl: "https://news.google.com/rss/search",
    query: "india logistics disruption",
    requestTimeoutMs: 10_000,
    fetchImpl: async () =>
      new Response(sampleRssWithHtmlEntities, {
        status: 200,
        headers: {
          "content-type": "application/rss+xml"
        }
      })
  });

  const result = await client.fetchLatest(10);
  assert.equal(result.items.length, 1);

  const first = result.items[0];
  assert.ok(first);
  assert.equal(first.description.includes("&nbsp;"), false);
  assert.match(first.description, /The Loadstar/);
});

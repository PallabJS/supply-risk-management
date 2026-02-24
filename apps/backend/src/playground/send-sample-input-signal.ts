import { randomUUID } from "node:crypto";

const gatewayBaseUrl =
  process.env.SIGNAL_INGESTION_GATEWAY_URL ?? "http://127.0.0.1:8090/signals";
const authToken = process.env.SIGNAL_INGESTION_GATEWAY_AUTH_TOKEN;

async function main(): Promise<void> {
  const payload = {
    event_id: randomUUID(),
    source_type: "NEWS",
    raw_content: "Severe weather alert near coastal supplier port",
    source_reference: "demo://sample-signal",
    geographic_scope: "US-GA",
    timestamp_utc: new Date().toISOString(),
    signal_confidence: 0.82
  };

  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (authToken && authToken.trim() !== "") {
    headers.authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(gatewayBaseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Gateway request failed (${response.status}): ${text}`);
  }

  console.log("Sample signal submitted.");
  console.log(text);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

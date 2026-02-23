import assert from "node:assert/strict";
import test from "node:test";

import { decodeEventMessage, encodeEventMessage } from "../../src/infrastructure/event-bus/codec.js";

test("encodes and decodes event payload", () => {
  const payload = {
    event_id: "evt-1",
    source_type: "NEWS"
  };

  const encoded = encodeEventMessage(payload);
  const decoded = decodeEventMessage<typeof payload>("external-signals", "1-0", encoded);

  assert.equal(decoded.ok, true);
  if (!decoded.ok) {
    return;
  }

  assert.equal(decoded.record.id, "1-0");
  assert.equal(decoded.record.stream, "external-signals");
  assert.deepEqual(decoded.record.message, payload);
  assert.equal(decoded.record.published_at_utc, encoded.published_at_utc);
});

test("decode fails when payload field is missing", () => {
  const decoded = decodeEventMessage("external-signals", "1-0", {
    published_at_utc: new Date().toISOString()
  });

  assert.equal(decoded.ok, false);
  if (decoded.ok) {
    return;
  }
  assert.match(decoded.error, /Missing "payload" field/);
});

test("decode fails for malformed json payload", () => {
  const decoded = decodeEventMessage("external-signals", "1-0", {
    payload: "{not-valid-json",
    published_at_utc: new Date().toISOString()
  });

  assert.equal(decoded.ok, false);
  if (decoded.ok) {
    return;
  }
  assert.match(decoded.error, /Invalid JSON payload/);
});

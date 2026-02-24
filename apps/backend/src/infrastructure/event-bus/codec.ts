import type { EventRecord } from "./types.js";

export interface EncodedEventFields {
  payload: string;
  published_at_utc: string;
}

export interface CodecDecodeSuccess<TMessage> {
  ok: true;
  record: EventRecord<TMessage>;
}

export interface CodecDecodeFailure {
  ok: false;
  error: string;
  rawFields: Record<string, string>;
}

type CodecDecodeResult<TMessage> = CodecDecodeSuccess<TMessage> | CodecDecodeFailure;

function normalizeFields(rawFields: unknown): Record<string, string> {
  if (!rawFields || typeof rawFields !== "object") {
    return {};
  }

  const fieldsObject = rawFields as Record<string, unknown>;
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(fieldsObject)) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function encodeEventMessage(message: unknown): EncodedEventFields {
  return {
    payload: JSON.stringify(message),
    published_at_utc: new Date().toISOString()
  };
}

export function decodeEventMessage<TMessage>(
  stream: string,
  id: string,
  rawFields: unknown
): CodecDecodeResult<TMessage> {
  const fields = normalizeFields(rawFields);
  const payload = fields.payload;
  const publishedAt = fields.published_at_utc;

  if (!payload) {
    return {
      ok: false,
      error: 'Missing "payload" field',
      rawFields: fields
    };
  }

  if (!publishedAt) {
    return {
      ok: false,
      error: 'Missing "published_at_utc" field',
      rawFields: fields
    };
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(payload);
  } catch (error) {
    return {
      ok: false,
      error: `Invalid JSON payload: ${error instanceof Error ? error.message : String(error)}`,
      rawFields: fields
    };
  }

  return {
    ok: true,
    record: {
      id,
      stream,
      message: parsedPayload as TMessage,
      published_at_utc: publishedAt
    }
  };
}

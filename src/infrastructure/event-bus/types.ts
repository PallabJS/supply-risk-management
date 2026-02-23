export interface EventRecord<TMessage = unknown> {
  id: string;
  stream: string;
  message: TMessage;
  published_at_utc: string;
}

export interface PublishOptions {
  maxLen?: number;
}

export interface EventPublisher {
  publish<TMessage>(
    stream: string,
    message: TMessage,
    options?: PublishOptions
  ): Promise<EventRecord<TMessage>>;
}

export interface EventStreamReader {
  readRecent<TMessage>(
    stream: string,
    limit: number
  ): Promise<EventRecord<TMessage>[]>;
}

export interface ConsumeGroupParams {
  stream: string;
  group: string;
  consumer: string;
  count: number;
  blockMs: number;
}

export interface MoveToDlqParams {
  sourceStream: string;
  sourceMessageId: string;
  reason: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}

export interface ConsumerMessage<TMessage = unknown> extends EventRecord<TMessage> {
  deliveryCount: number;
}

export interface EventConsumer {
  ensureGroup(stream: string, group: string, startId?: string): Promise<void>;
  consumeGroup<TMessage>(params: ConsumeGroupParams): Promise<ConsumerMessage<TMessage>[]>;
  ack(stream: string, group: string, ids: string[]): Promise<number>;
  moveToDlq(params: MoveToDlqParams): Promise<string>;
  close(): Promise<void>;
}

export type EventBus = EventPublisher & EventStreamReader & EventConsumer;

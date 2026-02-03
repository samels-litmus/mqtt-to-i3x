import { MappingEngine, MatchResult } from '../mapping/engine.js';
import { extract } from '../extraction/byte-extractor.js';
import { codecRegistry } from '../codecs/registry.js';
import { SchemaMapper, MappedResult } from '../mapping/schema-mapper.js';
import { ObjectStore } from '../store/object-store.js';
import { MqttClientWrapper } from './client.js';

export interface MessageHandlerDeps {
  mappingEngine: MappingEngine;
  schemaMapper: SchemaMapper;
  objectStore: ObjectStore;
}

export interface ProcessedMessage {
  topic: string;
  matchResult: MatchResult;
  mapped: MappedResult;
}

export interface MessageStats {
  received: number;
  matched: number;
  processed: number;
  errors: number;
}

export class MessageHandler {
  private mappingEngine: MappingEngine;
  private schemaMapper: SchemaMapper;
  private objectStore: ObjectStore;
  private stats: MessageStats = {
    received: 0,
    matched: 0,
    processed: 0,
    errors: 0,
  };

  constructor(deps: MessageHandlerDeps) {
    this.mappingEngine = deps.mappingEngine;
    this.schemaMapper = deps.schemaMapper;
    this.objectStore = deps.objectStore;
  }

  handle(topic: string, payload: Buffer): ProcessedMessage | null {
    this.stats.received++;
    const receiveTime = new Date();

    const matchResult = this.mappingEngine.match(topic);
    if (!matchResult) {
      return null;
    }
    this.stats.matched++;

    const { rule, captures } = matchResult;

    try {
      const extracted = extract(payload, rule.extraction);
      const decoded = codecRegistry.decode(rule.codec, extracted, rule.codecOptions);

      if (decoded === undefined) {
        this.stats.errors++;
        return null;
      }

      const mapped = this.schemaMapper.map(rule, topic, captures, decoded, receiveTime);
      this.objectStore.upsert(mapped.elementId, mapped.value, mapped.instance);

      this.stats.processed++;
      return { topic, matchResult, mapped };
    } catch {
      this.stats.errors++;
      return null;
    }
  }

  getStats(): MessageStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      received: 0,
      matched: 0,
      processed: 0,
      errors: 0,
    };
  }
}

export function attachHandler(
  client: MqttClientWrapper,
  handler: MessageHandler
): void {
  client.on('message', (topic, payload) => {
    handler.handle(topic, payload);
  });
}

export function createMessageHandler(deps: MessageHandlerDeps): MessageHandler {
  return new MessageHandler(deps);
}

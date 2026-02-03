import { MappingEngine, MatchResult } from '../mapping/engine.js';
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
export declare class MessageHandler {
    private mappingEngine;
    private schemaMapper;
    private objectStore;
    private stats;
    constructor(deps: MessageHandlerDeps);
    handle(topic: string, payload: Buffer): ProcessedMessage | null;
    getStats(): MessageStats;
    resetStats(): void;
}
export declare function attachHandler(client: MqttClientWrapper, handler: MessageHandler): void;
export declare function createMessageHandler(deps: MessageHandlerDeps): MessageHandler;

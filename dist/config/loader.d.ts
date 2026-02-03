import { ByteExtraction } from '../extraction/byte-extractor.js';
export interface MqttConfig {
    brokerUrl: string;
    clientId?: string;
    username?: string;
    password?: string;
    clean?: boolean;
    keepalive?: number;
    reconnectPeriod?: number;
    protocolVersion?: 4 | 5;
    ca?: string;
    cert?: string;
    key?: string;
}
export interface NamespaceConfig {
    uri: string;
    displayName: string;
}
export interface ObjectTypeConfig {
    elementId: string;
    displayName: string;
    namespaceUri: string;
    schema?: object;
}
export interface MappingRule {
    id: string;
    topicPattern: string;
    extraction?: ByteExtraction;
    codec: string;
    codecOptions?: Record<string, unknown>;
    namespaceUri?: string;
    objectTypeId?: string;
    elementIdTemplate?: string;
    displayNameTemplate?: string;
    valueExtractor?: string;
    timestampExtractor?: string;
    qualityExtractor?: string;
}
export interface CustomCodecConfig {
    name: string;
    module: string;
}
export interface AppConfig {
    server: {
        port: number;
        host: string;
        tls?: {
            key: string;
            cert: string;
            ca?: string;
        };
    };
    auth: {
        apiKeys: string[];
    };
    mqtt: MqttConfig;
    namespaces: NamespaceConfig[];
    objectTypes: ObjectTypeConfig[];
    codecs?: {
        custom?: CustomCodecConfig[];
    };
    mappings: MappingRule[];
}
export declare function loadConfig(path: string): AppConfig;

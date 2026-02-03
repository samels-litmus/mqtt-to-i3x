import { FastifyInstance } from 'fastify';
import { ObjectStore } from '../store/object-store.js';
import { SubscriptionManager } from '../subscriptions/manager.js';
import { MappingEngine } from '../mapping/engine.js';
import { MqttClientWrapper } from '../mqtt/client.js';
export interface ServerConfig {
    port: number;
    host: string;
    tls?: {
        key: string;
        cert: string;
        ca?: string;
    };
}
export interface AuthConfig {
    apiKeys: string[];
}
export interface ApiContext {
    store: ObjectStore;
    subscriptionManager: SubscriptionManager;
    mappingEngine: MappingEngine;
    mqttClient?: MqttClientWrapper;
}
declare module 'fastify' {
    interface FastifyRequest {
        apiContext: ApiContext;
    }
}
export declare function createServer(config: ServerConfig, authConfig: AuthConfig, store: ObjectStore, subscriptionManager: SubscriptionManager, mappingEngine: MappingEngine, mqttClient?: MqttClientWrapper): Promise<FastifyInstance>;
export declare function startServer(fastify: FastifyInstance, config: ServerConfig): Promise<void>;

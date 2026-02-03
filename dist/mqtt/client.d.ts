import { MqttConfig } from '../config/loader.js';
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export interface MqttClientEvents {
    connect: () => void;
    disconnect: () => void;
    reconnect: () => void;
    error: (err: Error) => void;
    message: (topic: string, payload: Buffer) => void;
}
export declare class MqttClientWrapper {
    private client;
    private config;
    private subscriptions;
    private state;
    private eventHandlers;
    constructor(config: MqttConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    subscribe(topic: string): void;
    subscribeMany(topics: string[]): void;
    unsubscribe(topic: string): void;
    on<K extends keyof MqttClientEvents>(event: K, handler: MqttClientEvents[K]): void;
    getState(): ConnectionState;
    getSubscriptions(): string[];
    private buildOptions;
    private resubscribe;
}
export declare function createMqttClient(config: MqttConfig): MqttClientWrapper;

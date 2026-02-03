import { FastifyReply } from 'fastify';
import { ObjectValue } from '../mapping/schema-mapper.js';
export interface Subscription {
    subscriptionId: string;
    createdAt: string;
    monitoredItems: Set<string>;
    maxDepth: number;
    pendingQueue: ObjectValue[];
    queueHighWaterMark: number;
}
export interface SubscriptionInfo {
    subscriptionId: string;
    createdAt: string;
    monitoredItems: string[];
    maxDepth: number;
    pendingCount: number;
}
export interface CreateSubscriptionOptions {
    monitoredItems?: string[];
    maxDepth?: number;
    queueHighWaterMark?: number;
}
export declare class SubscriptionManager {
    private subscriptions;
    private sseConnections;
    create(options?: CreateSubscriptionOptions): Subscription;
    get(subscriptionId: string): Subscription | undefined;
    getAll(): Subscription[];
    delete(subscriptionId: string): boolean;
    register(subscriptionId: string, elementIds: string[]): boolean;
    unregister(subscriptionId: string, elementIds: string[]): boolean;
    notifyChange(elementId: string, value: ObjectValue): void;
    sync(subscriptionId: string): ObjectValue[] | undefined;
    attachSse(subscriptionId: string, reply: FastifyReply): boolean;
    detachSse(subscriptionId: string): void;
    hasSseConnection(subscriptionId: string): boolean;
    toInfo(sub: Subscription): SubscriptionInfo;
    stats(): {
        subscriptions: number;
        sseConnections: number;
    };
}
export declare const subscriptionManager: SubscriptionManager;

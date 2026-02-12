import { FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
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

const DEFAULT_QUEUE_HIGH_WATER_MARK = 10000;
const DEFAULT_MAX_DEPTH = 0;

export class SubscriptionManager {
  private subscriptions = new Map<string, Subscription>();
  private sseConnections = new Map<string, FastifyReply>();

  create(options: CreateSubscriptionOptions = {}): Subscription {
    const subscriptionId = randomUUID();
    const subscription: Subscription = {
      subscriptionId,
      createdAt: new Date().toISOString(),
      monitoredItems: new Set(options.monitoredItems ?? []),
      maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
      pendingQueue: [],
      queueHighWaterMark: options.queueHighWaterMark ?? DEFAULT_QUEUE_HIGH_WATER_MARK,
    };
    this.subscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  get(subscriptionId: string): Subscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  getAll(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  delete(subscriptionId: string): boolean {
    const sse = this.sseConnections.get(subscriptionId);
    if (sse) {
      try {
        sse.raw.end();
      } catch {
        // Ignore close errors
      }
      this.sseConnections.delete(subscriptionId);
    }
    return this.subscriptions.delete(subscriptionId);
  }

  register(subscriptionId: string, elementIds: string[]): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;
    for (const id of elementIds) {
      sub.monitoredItems.add(id);
    }
    return true;
  }

  unregister(subscriptionId: string, elementIds: string[]): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;
    for (const id of elementIds) {
      sub.monitoredItems.delete(id);
    }
    return true;
  }

  notifyChange(elementId: string, value: ObjectValue): void {
    for (const [id, sub] of this.subscriptions) {
      if (sub.monitoredItems.has(elementId)) {
        // Enforce queue high water mark - drop oldest if exceeded
        if (sub.pendingQueue.length >= sub.queueHighWaterMark) {
          sub.pendingQueue.shift();
        }
        sub.pendingQueue.push(value);

        // Push to SSE if connected (best-effort real-time)
        // Format matches /objects/value spec: array of { elementId: { data: [VQT] } }
        const sse = this.sseConnections.get(id);
        if (sse) {
          try {
            const ssePayload = [
              {
                [value.elementId]: {
                  data: [
                    {
                      value: value.value,
                      quality: value.quality ?? 'Good',
                      timestamp: value.timestamp,
                    },
                  ],
                },
              },
            ];
            sse.raw.write(`data: ${JSON.stringify(ssePayload)}\n\n`);
          } catch {
            // Connection may have closed
            this.sseConnections.delete(id);
          }
        }
      }
    }
  }

  sync(subscriptionId: string): ObjectValue[] | undefined {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return undefined;
    // Drain and return the queue (at-least-once delivery)
    const pending = sub.pendingQueue.splice(0);
    return pending;
  }

  attachSse(subscriptionId: string, reply: FastifyReply): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;

    // Close existing connection if any
    const existing = this.sseConnections.get(subscriptionId);
    if (existing) {
      try {
        existing.raw.end();
      } catch {
        // Ignore
      }
    }

    this.sseConnections.set(subscriptionId, reply);
    return true;
  }

  detachSse(subscriptionId: string): void {
    this.sseConnections.delete(subscriptionId);
  }

  hasSseConnection(subscriptionId: string): boolean {
    return this.sseConnections.has(subscriptionId);
  }

  toInfo(sub: Subscription): SubscriptionInfo {
    return {
      subscriptionId: sub.subscriptionId,
      createdAt: sub.createdAt,
      monitoredItems: Array.from(sub.monitoredItems),
      maxDepth: sub.maxDepth,
      pendingCount: sub.pendingQueue.length,
    };
  }

  stats(): { subscriptions: number; sseConnections: number } {
    return {
      subscriptions: this.subscriptions.size,
      sseConnections: this.sseConnections.size,
    };
  }
}

export const subscriptionManager = new SubscriptionManager();

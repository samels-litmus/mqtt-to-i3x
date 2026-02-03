import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { MqttConfig } from '../config/loader.js';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface MqttClientEvents {
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  error: (err: Error) => void;
  message: (topic: string, payload: Buffer) => void;
}

export class MqttClientWrapper {
  private client: MqttClient | null = null;
  private config: MqttConfig;
  private subscriptions = new Set<string>();
  private state: ConnectionState = 'disconnected';
  private eventHandlers: Partial<MqttClientEvents> = {};

  constructor(config: MqttConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    this.state = 'connecting';
    const options = this.buildOptions();

    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this.config.brokerUrl, options);

      this.client.on('connect', () => {
        this.state = 'connected';
        this.resubscribe();
        this.eventHandlers.connect?.();
        resolve();
      });

      this.client.on('reconnect', () => {
        this.state = 'reconnecting';
        this.eventHandlers.reconnect?.();
      });

      this.client.on('close', () => {
        this.state = 'disconnected';
        this.eventHandlers.disconnect?.();
      });

      this.client.on('error', (err) => {
        this.eventHandlers.error?.(err);
        if (this.state === 'connecting') {
          reject(err);
        }
      });

      this.client.on('message', (topic, payload) => {
        this.eventHandlers.message?.(topic, payload);
      });
    });
  }

  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve();
        return;
      }

      this.client.end(false, {}, () => {
        this.client = null;
        this.state = 'disconnected';
        resolve();
      });
    });
  }

  subscribe(topic: string): void {
    this.subscriptions.add(topic);
    if (this.client && this.state === 'connected') {
      this.client.subscribe(topic);
    }
  }

  subscribeMany(topics: string[]): void {
    for (const topic of topics) {
      this.subscriptions.add(topic);
    }
    if (this.client && this.state === 'connected' && topics.length > 0) {
      this.client.subscribe(topics);
    }
  }

  unsubscribe(topic: string): void {
    this.subscriptions.delete(topic);
    if (this.client && this.state === 'connected') {
      this.client.unsubscribe(topic);
    }
  }

  on<K extends keyof MqttClientEvents>(event: K, handler: MqttClientEvents[K]): void {
    this.eventHandlers[event] = handler;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }

  private buildOptions(): IClientOptions {
    const options: IClientOptions = {
      clientId: this.config.clientId ?? `i3x-mqtt-${Date.now()}`,
      clean: this.config.clean ?? true,
      keepalive: this.config.keepalive ?? 60,
      reconnectPeriod: this.config.reconnectPeriod ?? 5000,
      protocolVersion: this.config.protocolVersion ?? 5,
    };

    if (this.config.username) {
      options.username = this.config.username;
    }
    if (this.config.password) {
      options.password = this.config.password;
    }
    if (this.config.ca) {
      options.ca = this.config.ca;
    }
    if (this.config.cert) {
      options.cert = this.config.cert;
    }
    if (this.config.key) {
      options.key = this.config.key;
    }

    return options;
  }

  private resubscribe(): void {
    if (this.client && this.subscriptions.size > 0) {
      this.client.subscribe(Array.from(this.subscriptions));
    }
  }
}

export function createMqttClient(config: MqttConfig): MqttClientWrapper {
  return new MqttClientWrapper(config);
}

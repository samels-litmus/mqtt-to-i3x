import mqtt from 'mqtt';
export class MqttClientWrapper {
    client = null;
    config;
    subscriptions = new Set();
    state = 'disconnected';
    eventHandlers = {};
    constructor(config) {
        this.config = config;
    }
    async connect() {
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
    disconnect() {
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
    subscribe(topic) {
        this.subscriptions.add(topic);
        if (this.client && this.state === 'connected') {
            this.client.subscribe(topic);
        }
    }
    subscribeMany(topics) {
        for (const topic of topics) {
            this.subscriptions.add(topic);
        }
        if (this.client && this.state === 'connected' && topics.length > 0) {
            this.client.subscribe(topics);
        }
    }
    unsubscribe(topic) {
        this.subscriptions.delete(topic);
        if (this.client && this.state === 'connected') {
            this.client.unsubscribe(topic);
        }
    }
    on(event, handler) {
        this.eventHandlers[event] = handler;
    }
    getState() {
        return this.state;
    }
    getSubscriptions() {
        return Array.from(this.subscriptions);
    }
    buildOptions() {
        const options = {
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
    resubscribe() {
        if (this.client && this.subscriptions.size > 0) {
            this.client.subscribe(Array.from(this.subscriptions));
        }
    }
}
export function createMqttClient(config) {
    return new MqttClientWrapper(config);
}

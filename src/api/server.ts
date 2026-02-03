import { readFileSync } from 'fs';
import Fastify, { FastifyInstance } from 'fastify';
import { ObjectStore } from '../store/object-store.js';
import { SubscriptionManager } from '../subscriptions/manager.js';
import { MappingEngine } from '../mapping/engine.js';
import { MqttClientWrapper } from '../mqtt/client.js';
import { createAuthHook } from './middleware/auth.js';
import { registerNamespacesRoutes } from './routes/namespaces.js';
import { registerObjectTypesRoutes } from './routes/object-types.js';
import { registerObjectsRoutes } from './routes/objects.js';
import { registerValuesRoutes } from './routes/values.js';
import { registerSubscriptionsRoutes } from './routes/subscriptions.js';
import { registerAdminTypesRoutes } from './routes/admin-types.js';
import { registerAdminMappingsRoutes } from './routes/admin-mappings.js';

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

export async function createServer(
  config: ServerConfig,
  authConfig: AuthConfig,
  store: ObjectStore,
  subscriptionManager: SubscriptionManager,
  mappingEngine: MappingEngine,
  mqttClient?: MqttClientWrapper
): Promise<FastifyInstance> {
  const httpsOptions = config.tls ? {
    https: {
      key: readFileSync(config.tls.key),
      cert: readFileSync(config.tls.cert),
      ...(config.tls.ca && { ca: readFileSync(config.tls.ca) }),
    },
  } : {};

  const fastify = Fastify({
    logger: true,
    ...httpsOptions,
  });

  const context: ApiContext = { store, subscriptionManager, mappingEngine, mqttClient };

  fastify.decorateRequest('apiContext', null as unknown as ApiContext);

  fastify.addHook('onRequest', async (request) => {
    request.apiContext = context;
  });

  if (authConfig.apiKeys.length > 0) {
    fastify.addHook('onRequest', createAuthHook(authConfig.apiKeys));
  }

  await fastify.register(registerNamespacesRoutes, { prefix: '' });
  await fastify.register(registerObjectTypesRoutes, { prefix: '' });
  await fastify.register(registerObjectsRoutes, { prefix: '' });
  await fastify.register(registerValuesRoutes, { prefix: '' });
  await fastify.register(registerSubscriptionsRoutes, { prefix: '' });
  await fastify.register(registerAdminTypesRoutes, { prefix: '' });
  await fastify.register(registerAdminMappingsRoutes, { prefix: '' });

  return fastify;
}

export async function startServer(
  fastify: FastifyInstance,
  config: ServerConfig
): Promise<void> {
  await fastify.listen({ port: config.port, host: config.host });
}

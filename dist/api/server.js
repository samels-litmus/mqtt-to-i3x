import { readFileSync } from 'fs';
import Fastify from 'fastify';
import { createAuthHook } from './middleware/auth.js';
import { registerNamespacesRoutes } from './routes/namespaces.js';
import { registerObjectTypesRoutes } from './routes/object-types.js';
import { registerObjectsRoutes } from './routes/objects.js';
import { registerValuesRoutes } from './routes/values.js';
import { registerSubscriptionsRoutes } from './routes/subscriptions.js';
import { registerAdminTypesRoutes } from './routes/admin-types.js';
import { registerAdminMappingsRoutes } from './routes/admin-mappings.js';
export async function createServer(config, authConfig, store, subscriptionManager, mappingEngine, mqttClient) {
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
    const context = { store, subscriptionManager, mappingEngine, mqttClient };
    fastify.decorateRequest('apiContext', null);
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
export async function startServer(fastify, config) {
    await fastify.listen({ port: config.port, host: config.host });
}

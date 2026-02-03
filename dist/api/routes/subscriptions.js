export async function registerSubscriptionsRoutes(fastify, _opts) {
    // GET /subscriptions - List all subscriptions
    fastify.get('/subscriptions', async (request) => {
        const manager = request.apiContext.subscriptionManager;
        const subscriptions = manager.getAll();
        return {
            subscriptions: subscriptions.map((sub) => manager.toInfo(sub)),
        };
    });
    // POST /subscriptions - Create a new subscription
    fastify.post('/subscriptions', async (request, reply) => {
        const manager = request.apiContext.subscriptionManager;
        const { monitoredItems, maxDepth, queueHighWaterMark } = request.body ?? {};
        const subscription = manager.create({
            monitoredItems,
            maxDepth,
            queueHighWaterMark,
        });
        return reply.code(201).send(manager.toInfo(subscription));
    });
    // GET /subscriptions/:id - Get subscription details
    fastify.get('/subscriptions/:id', async (request, reply) => {
        const manager = request.apiContext.subscriptionManager;
        const subscription = manager.get(request.params.id);
        if (!subscription) {
            return reply.code(404).send({ error: 'Subscription not found' });
        }
        return manager.toInfo(subscription);
    });
    // DELETE /subscriptions/:id - Delete a subscription
    fastify.delete('/subscriptions/:id', async (request, reply) => {
        const manager = request.apiContext.subscriptionManager;
        const deleted = manager.delete(request.params.id);
        if (!deleted) {
            return reply.code(404).send({ error: 'Subscription not found' });
        }
        return reply.code(204).send();
    });
    // POST /subscriptions/:id/register - Add monitored items
    fastify.post('/subscriptions/:id/register', async (request, reply) => {
        const manager = request.apiContext.subscriptionManager;
        const { elementIds } = request.body;
        if (!Array.isArray(elementIds)) {
            return reply.code(400).send({ error: 'elementIds must be an array' });
        }
        const success = manager.register(request.params.id, elementIds);
        if (!success) {
            return reply.code(404).send({ error: 'Subscription not found' });
        }
        const subscription = manager.get(request.params.id);
        return manager.toInfo(subscription);
    });
    // POST /subscriptions/:id/unregister - Remove monitored items
    fastify.post('/subscriptions/:id/unregister', async (request, reply) => {
        const manager = request.apiContext.subscriptionManager;
        const { elementIds } = request.body;
        if (!Array.isArray(elementIds)) {
            return reply.code(400).send({ error: 'elementIds must be an array' });
        }
        const success = manager.unregister(request.params.id, elementIds);
        if (!success) {
            return reply.code(404).send({ error: 'Subscription not found' });
        }
        const subscription = manager.get(request.params.id);
        return manager.toInfo(subscription);
    });
    // GET /subscriptions/:id/stream - SSE real-time stream
    fastify.get('/subscriptions/:id/stream', async (request, reply) => {
        const manager = request.apiContext.subscriptionManager;
        const subscriptionId = request.params.id;
        const subscription = manager.get(subscriptionId);
        if (!subscription) {
            return reply.code(404).send({ error: 'Subscription not found' });
        }
        // Set SSE headers
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
        });
        // Send initial comment to establish connection
        reply.raw.write(': connected\n\n');
        // Attach this connection to the subscription
        manager.attachSse(subscriptionId, reply);
        // Handle client disconnect
        request.raw.on('close', () => {
            manager.detachSse(subscriptionId);
        });
        // Keep the connection open (don't return)
        // The response will be ended when the client disconnects or subscription is deleted
    });
    // POST /subscriptions/:id/sync - Drain pending queue (at-least-once delivery)
    fastify.post('/subscriptions/:id/sync', async (request, reply) => {
        const manager = request.apiContext.subscriptionManager;
        const pending = manager.sync(request.params.id);
        if (pending === undefined) {
            return reply.code(404).send({ error: 'Subscription not found' });
        }
        return {
            values: pending.map((v) => ({
                elementId: v.elementId,
                value: v.value,
                timestamp: v.timestamp,
                quality: v.quality,
            })),
        };
    });
}

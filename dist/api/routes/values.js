export async function registerValuesRoutes(fastify, _opts) {
    // POST /objects/value - Get last-known values for specified elementIds
    fastify.post('/objects/value', async (request, reply) => {
        const store = request.apiContext.store;
        const { elementIds } = request.body;
        if (!Array.isArray(elementIds)) {
            return reply.code(400).send({ error: 'elementIds must be an array' });
        }
        const values = store.getValues(elementIds);
        return {
            values: values.map((v) => ({
                elementId: v.elementId,
                value: v.value,
                timestamp: v.timestamp,
                quality: v.quality,
            })),
        };
    });
    // POST /objects/history - Not implemented (read-only bridge with no history)
    fastify.post('/objects/history', async (_request, reply) => {
        return reply.code(501).send({
            error: 'Not Implemented',
            message: 'History endpoint not supported. This bridge provides last-known-value only.',
        });
    });
}

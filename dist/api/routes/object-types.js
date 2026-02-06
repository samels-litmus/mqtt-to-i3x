export async function registerObjectTypesRoutes(fastify, _opts) {
    fastify.get('/objecttypes', async (request) => {
        const store = request.apiContext.store;
        const { namespaceUri } = request.query;
        const types = namespaceUri
            ? store.getTypesByNamespace(namespaceUri)
            : store.getAllTypes();
        return types.map((t) => ({
            elementId: t.elementId,
            displayName: t.displayName,
            namespaceUri: t.namespaceUri,
            schema: t.schema,
        }));
    });
    fastify.post('/objecttypes/query', async (request, reply) => {
        const store = request.apiContext.store;
        const { elementIds } = request.body;
        if (!Array.isArray(elementIds)) {
            return reply.code(400).send({ error: 'elementIds must be an array' });
        }
        const types = elementIds
            .map((id) => store.getType(id))
            .filter((t) => t !== undefined);
        return types.map((t) => ({
            elementId: t.elementId,
            displayName: t.displayName,
            namespaceUri: t.namespaceUri,
            schema: t.schema,
        }));
    });
}

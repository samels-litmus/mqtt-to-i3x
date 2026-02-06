export async function registerRelationshipTypesRoutes(fastify, _opts) {
    // GET /relationshiptypes — list all relationship types (Section 4.1.4)
    fastify.get('/relationshiptypes', async (request) => {
        const store = request.apiContext.store;
        const { namespaceUri } = request.query;
        const types = namespaceUri
            ? store.getRelationshipTypesByNamespace(namespaceUri)
            : store.getAllRelationshipTypes();
        return { relationshipTypes: types };
    });
    // POST /relationshiptypes/query — batch query by elementIds
    fastify.post('/relationshiptypes/query', async (request, reply) => {
        const store = request.apiContext.store;
        const { elementIds } = request.body;
        if (!Array.isArray(elementIds)) {
            return reply.code(400).send({ error: 'elementIds must be an array' });
        }
        const types = elementIds
            .map((id) => store.getRelationshipType(id))
            .filter((rt) => rt != null);
        return { relationshipTypes: types };
    });
}

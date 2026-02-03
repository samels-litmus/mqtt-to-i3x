export async function registerObjectsRoutes(fastify, _opts) {
    fastify.get('/objects', async (request) => {
        const store = request.apiContext.store;
        const { namespaceUri, typeId } = request.query;
        let instances;
        if (typeId) {
            instances = store.getInstancesByType(typeId);
        }
        else if (namespaceUri) {
            instances = store.getInstancesByNamespace(namespaceUri);
        }
        else {
            instances = store.getAllInstances();
        }
        return {
            objects: instances.map((inst) => ({
                elementId: inst.elementId,
                displayName: inst.displayName,
                typeId: inst.typeId,
                parentId: inst.parentId,
                isComposition: inst.isComposition,
                namespaceUri: inst.namespaceUri,
            })),
        };
    });
    fastify.post('/objects/list', async (request, reply) => {
        const store = request.apiContext.store;
        const { elementIds } = request.body;
        if (!Array.isArray(elementIds)) {
            return reply.code(400).send({ error: 'elementIds must be an array' });
        }
        const instances = store.getInstances(elementIds);
        return {
            objects: instances.map((inst) => ({
                elementId: inst.elementId,
                displayName: inst.displayName,
                typeId: inst.typeId,
                parentId: inst.parentId,
                isComposition: inst.isComposition,
                namespaceUri: inst.namespaceUri,
            })),
        };
    });
    fastify.post('/objects/related', async (request, reply) => {
        const { elementId } = request.body;
        if (!elementId || typeof elementId !== 'string') {
            return reply.code(400).send({ error: 'elementId is required' });
        }
        // For this read-only bridge, we don't track relationships.
        // Return empty array since we only have flat object instances.
        return {
            objects: [],
        };
    });
}

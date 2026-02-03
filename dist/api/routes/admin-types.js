export async function registerAdminTypesRoutes(fastify, _opts) {
    // POST /admin/objecttypes - Create a new object type
    fastify.post('/admin/objecttypes', async (request, reply) => {
        const store = request.apiContext.store;
        const { elementId, displayName, namespaceUri, schema } = request.body;
        if (!elementId || typeof elementId !== 'string') {
            return reply.code(400).send({ error: 'elementId is required and must be a string' });
        }
        if (!displayName || typeof displayName !== 'string') {
            return reply.code(400).send({ error: 'displayName is required and must be a string' });
        }
        if (!namespaceUri || typeof namespaceUri !== 'string') {
            return reply.code(400).send({ error: 'namespaceUri is required and must be a string' });
        }
        const existing = store.getType(elementId);
        if (existing) {
            return reply.code(409).send({ error: `ObjectType '${elementId}' already exists` });
        }
        const namespace = store.getNamespace(namespaceUri);
        if (!namespace) {
            return reply.code(400).send({ error: `Namespace '${namespaceUri}' does not exist` });
        }
        const objectType = {
            elementId,
            displayName,
            namespaceUri,
            schema,
        };
        store.registerType(objectType);
        return reply.code(201).send({
            objectType: {
                elementId: objectType.elementId,
                displayName: objectType.displayName,
                namespaceUri: objectType.namespaceUri,
                schema: objectType.schema,
            },
        });
    });
    // GET /admin/objecttypes/:elementId - Get a specific object type
    fastify.get('/admin/objecttypes/:elementId', async (request, reply) => {
        const store = request.apiContext.store;
        const { elementId } = request.params;
        const objectType = store.getType(elementId);
        if (!objectType) {
            return reply.code(404).send({ error: `ObjectType '${elementId}' not found` });
        }
        return {
            objectType: {
                elementId: objectType.elementId,
                displayName: objectType.displayName,
                namespaceUri: objectType.namespaceUri,
                schema: objectType.schema,
            },
        };
    });
    // PUT /admin/objecttypes/:elementId - Update an object type
    fastify.put('/admin/objecttypes/:elementId', async (request, reply) => {
        const store = request.apiContext.store;
        const { elementId } = request.params;
        const { displayName, namespaceUri, schema } = request.body;
        const existing = store.getType(elementId);
        if (!existing) {
            return reply.code(404).send({ error: `ObjectType '${elementId}' not found` });
        }
        if (namespaceUri !== undefined) {
            const namespace = store.getNamespace(namespaceUri);
            if (!namespace) {
                return reply.code(400).send({ error: `Namespace '${namespaceUri}' does not exist` });
            }
        }
        const updated = {
            elementId,
            displayName: displayName ?? existing.displayName,
            namespaceUri: namespaceUri ?? existing.namespaceUri,
            schema: schema !== undefined ? schema : existing.schema,
        };
        store.registerType(updated);
        return {
            objectType: {
                elementId: updated.elementId,
                displayName: updated.displayName,
                namespaceUri: updated.namespaceUri,
                schema: updated.schema,
            },
        };
    });
    // DELETE /admin/objecttypes/:elementId - Delete an object type
    fastify.delete('/admin/objecttypes/:elementId', async (request, reply) => {
        const store = request.apiContext.store;
        const { elementId } = request.params;
        const existing = store.getType(elementId);
        if (!existing) {
            return reply.code(404).send({ error: `ObjectType '${elementId}' not found` });
        }
        // Check if any instances reference this type
        const instances = store.getInstancesByType(elementId);
        if (instances.length > 0) {
            return reply.code(409).send({
                error: `Cannot delete ObjectType '${elementId}': ${instances.length} instance(s) reference it`,
            });
        }
        store.deleteType(elementId);
        return reply.code(204).send();
    });
}

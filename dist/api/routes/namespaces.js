export async function registerNamespacesRoutes(fastify, _opts) {
    fastify.get('/namespaces', async (request) => {
        const store = request.apiContext.store;
        const namespaces = store.getAllNamespaces();
        return namespaces.map((ns) => ({
            uri: ns.uri,
            displayName: ns.displayName,
        }));
    });
}

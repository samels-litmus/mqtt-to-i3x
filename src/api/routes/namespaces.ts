import { FastifyInstance, FastifyPluginOptions } from 'fastify';

export async function registerNamespacesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.get('/namespaces', async (request) => {
    const store = request.apiContext.store;
    const namespaces = store.getAllNamespaces();

    return {
      namespaces: namespaces.map((ns) => ({
        uri: ns.uri,
        displayName: ns.displayName,
      })),
    };
  });
}

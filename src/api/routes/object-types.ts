import { FastifyInstance, FastifyPluginOptions } from 'fastify';

interface ObjectTypesQuerystring {
  namespaceUri?: string;
}

interface ObjectTypesQueryBody {
  elementIds: string[];
}

export async function registerObjectTypesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.get<{ Querystring: ObjectTypesQuerystring }>(
    '/objecttypes',
    async (request) => {
      const store = request.apiContext.store;
      const { namespaceUri } = request.query;

      const types = namespaceUri
        ? store.getTypesByNamespace(namespaceUri)
        : store.getAllTypes();

      return {
        objectTypes: types.map((t) => ({
          elementId: t.elementId,
          displayName: t.displayName,
          namespaceUri: t.namespaceUri,
          schema: t.schema,
        })),
      };
    }
  );

  fastify.post<{ Body: ObjectTypesQueryBody }>(
    '/objecttypes/query',
    async (request, reply) => {
      const store = request.apiContext.store;
      const { elementIds } = request.body;

      if (!Array.isArray(elementIds)) {
        return reply.code(400).send({ error: 'elementIds must be an array' });
      }

      const types = elementIds
        .map((id) => store.getType(id))
        .filter((t) => t !== undefined);

      return {
        objectTypes: types.map((t) => ({
          elementId: t.elementId,
          displayName: t.displayName,
          namespaceUri: t.namespaceUri,
          schema: t.schema,
        })),
      };
    }
  );
}

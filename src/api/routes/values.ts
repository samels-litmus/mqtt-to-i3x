import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ObjectStore } from '../../store/object-store.js';

interface ObjectsValueBody {
  elementIds: string[];
  maxDepth?: number;
}

export async function registerValuesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // POST /objects/value - Get last-known values for specified elementIds
  // Per RFC 4.2.1.1, maxDepth controls composition value recursion:
  //   maxDepth=1 (default): direct value only
  //   maxDepth=0: infinite recursion through HasComponent relationships
  //   maxDepth=N (N>1): recurse up to N levels
  fastify.post<{ Body: ObjectsValueBody }>(
    '/objects/value',
    async (request, reply) => {
      const store = request.apiContext.store;
      const { elementIds, maxDepth = 1 } = request.body;

      if (!Array.isArray(elementIds)) {
        return reply.code(400).send({ error: 'elementIds must be an array' });
      }

      return elementIds.map((id) => {
        const value = store.getValue(id);
        if (!value) return null;

        const instance = store.getInstance(id);
        const base = {
          elementId: value.elementId,
          value: value.value,
          timestamp: value.timestamp,
          quality: value.quality,
        };

        // For composition elements with maxDepth !== 1, include component values
        if (instance?.isComposition && maxDepth !== 1) {
          const components = buildComposedValue(store, id, maxDepth, 0);
          return { ...base, components };
        }

        return base;
      }).filter(Boolean);
    }
  );

  // POST /objects/history - Not implemented (read-only bridge with no history)
  fastify.post('/objects/history', async (_request, reply) => {
    return reply.code(501).send({
      error: 'Not Implemented',
      message: 'History endpoint not supported. This bridge provides last-known-value only.',
    });
  });
}

/**
 * Recursively build composed values by traversing HasComponent relationships.
 * maxDepth=0: infinite recursion
 * maxDepth=N (N>1): recurse up to N levels
 */
function buildComposedValue(
  store: ObjectStore,
  elementId: string,
  maxDepth: number,
  currentDepth: number
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  const components = store.getRelationships(elementId, 'HasComponent');
  for (const comp of components) {
    const childValue = store.getValue(comp.targetElementId);
    const childInstance = store.getInstance(comp.targetElementId);

    // Should we recurse into this child?
    const shouldRecurse =
      childInstance?.isComposition &&
      (maxDepth === 0 || currentDepth + 1 < maxDepth - 1);

    if (shouldRecurse) {
      const nested = buildComposedValue(store, comp.targetElementId, maxDepth, currentDepth + 1);
      result[comp.targetElementId] = {
        value: childValue?.value ?? null,
        components: nested,
      };
    } else if (childValue) {
      result[comp.targetElementId] = childValue.value;
    }
  }

  return result;
}

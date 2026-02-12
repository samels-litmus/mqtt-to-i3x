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
  // Response is a nested object tree keyed by elementId.
  // Each node has a "data" array and nested children keyed by their elementId.
  // maxDepth controls composition recursion:
  //   maxDepth=0: infinite recursion through HasComponent relationships
  //   maxDepth=1 (default): direct value only, no children
  //   maxDepth=N (N>1): recurse up to N levels (root is level 0)
  fastify.post<{ Body: ObjectsValueBody }>(
    '/objects/value',
    async (request, reply) => {
      const store = request.apiContext.store;
      const { elementIds, maxDepth = 1 } = request.body;

      if (!Array.isArray(elementIds)) {
        return reply.code(400).send({ error: 'elementIds must be an array' });
      }

      const result: Record<string, unknown> = {};

      for (const id of elementIds) {
        result[id] = buildValueNode(store, id, maxDepth, 0);
      }

      return result;
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
 * Build a value node for an elementId in the spec format:
 * {
 *   "data": [{ "value": ..., "quality": "...", "timestamp": "..." }],
 *   "child-id": { "data": [...], ... }
 * }
 *
 * Depth logic:
 *   maxDepth=0  -> infinite (always recurse)
 *   maxDepth=1  -> root only (currentDepth 0, no children)
 *   maxDepth=N  -> recurse while currentDepth < maxDepth - 1
 *                  e.g. maxDepth=100 means levels 0..99
 */
function buildValueNode(
  store: ObjectStore,
  elementId: string,
  maxDepth: number,
  currentDepth: number
): Record<string, unknown> {
  const node: Record<string, unknown> = {};

  // Add data array (last-known-value only, so 0 or 1 entries)
  const value = store.getValue(elementId);
  if (value) {
    node.data = [
      {
        value: value.value,
        quality: value.quality,
        timestamp: value.timestamp,
      },
    ];
  } else {
    node.data = [];
  }

  // Recurse into HasComponent children if depth budget remains
  const shouldRecurse = maxDepth === 0 || currentDepth < maxDepth - 1;
  if (shouldRecurse) {
    const children = store.getRelationships(elementId, 'HasComponent');
    for (const child of children) {
      node[child.targetElementId] = buildValueNode(
        store,
        child.targetElementId,
        maxDepth,
        currentDepth + 1
      );
    }
  }

  return node;
}

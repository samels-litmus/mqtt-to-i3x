import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ObjectStore } from '../../store/object-store.js';

interface ObjectsQuerystring {
  namespaceUri?: string;
  typeId?: string;
}

interface ObjectsListBody {
  elementIds: string[];
}

interface ObjectsRelatedBody {
  elementId?: string;
  elementIds?: string[];
  relationshipTypeId?: string;
  depth?: number;
  includeMetadata?: boolean;
}

export async function registerObjectsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.get<{ Querystring: ObjectsQuerystring }>(
    '/objects',
    async (request) => {
      const store = request.apiContext.store;
      const { namespaceUri, typeId } = request.query;

      let instances;
      if (typeId) {
        instances = store.getInstancesByType(typeId);
      } else if (namespaceUri) {
        instances = store.getInstancesByNamespace(namespaceUri);
      } else {
        instances = store.getAllInstances();
      }

      return instances.map((inst) => {
        const children = store.hasChildren(inst.elementId);
        return {
          elementId: inst.elementId,
          displayName: inst.displayName,
          typeId: inst.typeId,
          parentId: store.getParentId(inst.elementId),
          hasChildren: children,
          isComposition: children,
          namespaceUri: inst.namespaceUri,
        };
      });
    }
  );

  fastify.post<{ Body: ObjectsListBody }>(
    '/objects/list',
    async (request, reply) => {
      const store = request.apiContext.store;
      const { elementIds } = request.body;

      if (!Array.isArray(elementIds)) {
        return reply.code(400).send({ error: 'elementIds must be an array' });
      }

      const instances = store.getInstances(elementIds);

      return instances.map((inst) => {
        const children = store.hasChildren(inst.elementId);
        return {
          elementId: inst.elementId,
          displayName: inst.displayName,
          typeId: inst.typeId,
          parentId: store.getParentId(inst.elementId),
          hasChildren: children,
          isComposition: children,
          namespaceUri: inst.namespaceUri,
        };
      });
    }
  );

  fastify.post<{ Body: ObjectsRelatedBody }>(
    '/objects/related',
    async (request, reply) => {
      const store = request.apiContext.store;
      const body = request.body || {};
      const { depth = 0, includeMetadata = false } = body;

      // Accept both singular elementId (per spec) and plural elementIds (client compat)
      const elementId = body.elementId ?? (Array.isArray(body.elementIds) ? body.elementIds[0] : undefined);

      if (!elementId || typeof elementId !== 'string') {
        return reply.code(400).send({ error: 'elementId (or elementIds) is required' });
      }
      const { relationshipTypeId } = body;

      // Collect related element IDs, respecting depth
      // If no relationshipTypeId provided, return relations across all types
      const visited = new Set<string>();
      const relatedIds = collectRelated(store, elementId, relationshipTypeId, depth, 0, visited);

      // Build response with required metadata (Section 3.1.1)
      const objects = relatedIds
        .map((targetId) => {
          const inst = store.getInstance(targetId);
          if (!inst) return null;

          const children = store.hasChildren(inst.elementId);
          const obj: Record<string, unknown> = {
            elementId: inst.elementId,
            displayName: inst.displayName,
            parentId: store.getParentId(inst.elementId),
            hasChildren: children,
            namespaceUri: inst.namespaceUri,
          };

          if (includeMetadata) {
            obj.typeId = inst.typeId;
            obj.isComposition = children;
          }

          return obj;
        })
        .filter(Boolean);

      return objects;
    }
  );
}

/**
 * Recursively collect related element IDs via a given relationship type.
 * depth=0 means no recursion (direct relatives only).
 * depth=N means recurse up to N levels.
 */
function collectRelated(
  store: ObjectStore,
  elementId: string,
  typeId: string | undefined,
  maxDepth: number,
  currentDepth: number,
  visited: Set<string>
): string[] {
  if (visited.has(elementId)) return [];
  visited.add(elementId);

  const directRels = store.getRelationships(elementId, typeId);
  const targetIds = directRels.map((r) => r.targetElementId);

  if (maxDepth === 0 || currentDepth >= maxDepth) {
    return targetIds;
  }

  // Recurse into each direct target
  const allIds = [...targetIds];
  for (const tid of targetIds) {
    const deeper = collectRelated(store, tid, typeId, maxDepth, currentDepth + 1, visited);
    allIds.push(...deeper);
  }
  return allIds;
}

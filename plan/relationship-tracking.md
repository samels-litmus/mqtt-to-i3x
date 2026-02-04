# Implementation Plan: Relationship Tracking for i3x API

## Current State Analysis

### i3x API Spec (`/objects/related`)
- **Request:** `{ elementIds: string[], relationshiptype?: string, includeMetadata?: boolean }`
- **Response:** Object mapping `elementId → relationships[]`
- **RelationshipType schema:** `elementId`, `displayName`, `namespaceUri`, `reverseOf`

### Current Codebase
- `ObjectInstance` has `parentId` and `isComposition` but no `relationships` field
- Store tracks instances by namespace and type, but not relationships
- Mapping rules don't support relationship definitions
- No `/relationshiptypes` endpoint exists

### Key Insight
The i3x spec treats relationships as first-class entities stored in `ObjectInstance.relationships`, not just parent-child. Relationships are typed (e.g., "HasComponent", "Organizes", "References") and bidirectional (`reverseOf`).

---

## Implementation Plan

### Phase 1: Data Model Updates

#### 1.1 Add RelationshipType to ObjectStore
**File:** `src/store/object-store.ts`

```typescript
export interface RelationshipType {
  elementId: string;
  displayName: string;
  namespaceUri: string;
  reverseOf: string;
}
```

Add to ObjectStore class:
- `private relationshipTypes = new Map<string, RelationshipType>()`
- `registerRelationshipType(type: RelationshipType): void`
- `getRelationshipType(elementId: string): RelationshipType | undefined`
- `getAllRelationshipTypes(): RelationshipType[]`
- `getRelationshipTypesByNamespace(namespaceUri: string): RelationshipType[]`

#### 1.2 Add Relationship Storage
**File:** `src/store/object-store.ts`

```typescript
export interface Relationship {
  targetElementId: string;
  relationshipTypeId: string;
}
```

Add to ObjectStore class:
- `private relationships = new Map<string, Relationship[]>()` (sourceId → relationships)
- `addRelationship(sourceId: string, targetId: string, typeId: string): void`
- `getRelationships(elementId: string, typeId?: string): Relationship[]`
- `getRelatedElementIds(elementId: string, typeId?: string): string[]`
- `removeRelationship(sourceId: string, targetId: string, typeId?: string): boolean`
- `clearRelationships(elementId: string): void`

#### 1.3 Update ObjectInstance Interface
**File:** `src/mapping/schema-mapper.ts`

```typescript
export interface ObjectInstance {
  elementId: string;
  displayName: string;
  typeId: string;
  parentId?: string;
  isComposition: boolean;
  namespaceUri: string;
  relationships?: Record<string, string[]>; // typeId → targetElementIds
}
```

---

### Phase 2: Built-in Relationship Types

#### 2.1 Seed Default Relationship Types
**File:** `src/store/object-store.ts` (in constructor or init method)

| elementId | displayName | namespaceUri | reverseOf |
|-----------|-------------|--------------|-----------|
| `HasComponent` | Has Component | `urn:i3x:relationships` | `ComponentOf` |
| `ComponentOf` | Component Of | `urn:i3x:relationships` | `HasComponent` |
| `HasProperty` | Has Property | `urn:i3x:relationships` | `PropertyOf` |
| `PropertyOf` | Property Of | `urn:i3x:relationships` | `HasProperty` |
| `Organizes` | Organizes | `urn:i3x:relationships` | `OrganizedBy` |
| `OrganizedBy` | Organized By | `urn:i3x:relationships` | `Organizes` |
| `References` | References | `urn:i3x:relationships` | `ReferencedBy` |
| `ReferencedBy` | Referenced By | `urn:i3x:relationships` | `References` |

```typescript
private seedBuiltInRelationshipTypes(): void {
  const builtIn: RelationshipType[] = [
    { elementId: 'HasComponent', displayName: 'Has Component', namespaceUri: 'urn:i3x:relationships', reverseOf: 'ComponentOf' },
    { elementId: 'ComponentOf', displayName: 'Component Of', namespaceUri: 'urn:i3x:relationships', reverseOf: 'HasComponent' },
    { elementId: 'HasProperty', displayName: 'Has Property', namespaceUri: 'urn:i3x:relationships', reverseOf: 'PropertyOf' },
    { elementId: 'PropertyOf', displayName: 'Property Of', namespaceUri: 'urn:i3x:relationships', reverseOf: 'HasProperty' },
    { elementId: 'Organizes', displayName: 'Organizes', namespaceUri: 'urn:i3x:relationships', reverseOf: 'OrganizedBy' },
    { elementId: 'OrganizedBy', displayName: 'Organized By', namespaceUri: 'urn:i3x:relationships', reverseOf: 'Organizes' },
    { elementId: 'References', displayName: 'References', namespaceUri: 'urn:i3x:relationships', reverseOf: 'ReferencedBy' },
    { elementId: 'ReferencedBy', displayName: 'Referenced By', namespaceUri: 'urn:i3x:relationships', reverseOf: 'References' },
  ];
  for (const rt of builtIn) {
    this.relationshipTypes.set(rt.elementId, rt);
  }
}
```

---

### Phase 3: Relationship Inference from Data

#### 3.1 Auto-create Relationships on Upsert
**File:** `src/store/object-store.ts` (modify `upsert` method)

When an ObjectInstance is upserted with a `parentId`:
1. Determine relationship type based on `isComposition`:
   - `isComposition: true` → `ComponentOf` (child→parent) and `HasComponent` (parent→child)
   - `isComposition: false` → `PropertyOf` (child→parent) and `HasProperty` (parent→child)
2. Create bidirectional relationships automatically

```typescript
upsert(elementId: string, value: ObjectValue, instance?: ObjectInstance): void {
  // ... existing code ...

  if (instance?.parentId) {
    const childToParentType = instance.isComposition ? 'ComponentOf' : 'PropertyOf';
    const parentToChildType = instance.isComposition ? 'HasComponent' : 'HasProperty';

    // Add child → parent relationship
    this.addRelationship(elementId, instance.parentId, childToParentType);

    // Add parent → child relationship (reverse)
    this.addRelationship(instance.parentId, elementId, parentToChildType);
  }
}
```

#### 3.2 Hierarchical Relationships from Topic Structure
**File:** `src/mapping/schema-mapper.ts`

Infer `parentId` from elementId hierarchy:
- `factory.building.floor.sensor` → parentId = `factory.building.floor`
- Set `isComposition: true` for hierarchical containment

```typescript
// In SchemaMapper.map() method
const elementIdParts = elementId.split('.');
const parentId = elementIdParts.length > 1
  ? elementIdParts.slice(0, -1).join('.')
  : undefined;

return {
  // ...
  instance: {
    elementId,
    displayName,
    typeId,
    namespaceUri,
    parentId,
    isComposition: true, // Hierarchical topics imply composition
  },
};
```

---

### Phase 4: API Endpoints

#### 4.1 Update `/objects/related`
**File:** `src/api/routes/objects.ts`

```typescript
fastify.post<{ Body: ObjectsRelatedBody }>(
  '/objects/related',
  async (request, reply) => {
    const store = request.apiContext.store;
    const { elementIds, relationshiptype, includeMetadata = false } = request.body;

    if (!Array.isArray(elementIds) || elementIds.length === 0) {
      return reply.code(400).send({ error: 'elementIds must be a non-empty array' });
    }

    const result: Record<string, Array<{
      elementId: string;
      displayName: string;
      typeId: string;
      parentId?: string;
      isComposition?: boolean;
      namespaceUri?: string;
      relationshipType: string;
    }>> = {};

    for (const sourceId of elementIds) {
      const relationships = store.getRelationships(sourceId, relationshiptype);
      const related = [];

      for (const rel of relationships) {
        const targetInstance = store.getInstance(rel.targetElementId);
        if (targetInstance) {
          const relatedObj: any = {
            elementId: targetInstance.elementId,
            displayName: targetInstance.displayName,
            typeId: targetInstance.typeId,
            relationshipType: rel.relationshipTypeId,
          };

          if (includeMetadata) {
            relatedObj.parentId = targetInstance.parentId;
            relatedObj.isComposition = targetInstance.isComposition;
            relatedObj.namespaceUri = targetInstance.namespaceUri;
          }

          related.push(relatedObj);
        }
      }

      result[sourceId] = related;
    }

    return result;
  }
);
```

#### 4.2 Add `/relationshiptypes` Endpoints
**File:** `src/api/routes/relationship-types.ts` (NEW)

```typescript
import { FastifyInstance, FastifyPluginOptions } from 'fastify';

interface RelationshipTypesQuerystring {
  namespaceUri?: string;
}

interface RelationshipTypesQueryBody {
  elementIds: string[];
}

export async function registerRelationshipTypesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /relationshiptypes - List all relationship types
  fastify.get<{ Querystring: RelationshipTypesQuerystring }>(
    '/relationshiptypes',
    async (request) => {
      const store = request.apiContext.store;
      const { namespaceUri } = request.query;

      if (namespaceUri) {
        return store.getRelationshipTypesByNamespace(namespaceUri);
      }
      return store.getAllRelationshipTypes();
    }
  );

  // POST /relationshiptypes/query - Query by elementIds
  fastify.post<{ Body: RelationshipTypesQueryBody }>(
    '/relationshiptypes/query',
    async (request, reply) => {
      const store = request.apiContext.store;
      const { elementIds } = request.body;

      if (!Array.isArray(elementIds)) {
        return reply.code(400).send({ error: 'elementIds must be an array' });
      }

      const results = [];
      for (const id of elementIds) {
        const rt = store.getRelationshipType(id);
        if (rt) results.push(rt);
      }
      return results;
    }
  );
}
```

#### 4.3 Register Routes
**File:** `src/api/server.ts`

```typescript
import { registerRelationshipTypesRoutes } from './routes/relationship-types.js';

// In createServer or route registration:
await fastify.register(registerRelationshipTypesRoutes);
```

---

### Phase 5: Config-driven Relationships (Optional Future Enhancement)

#### 5.1 Add Relationships to Mapping Rules
**File:** `src/config/loader.ts`

```typescript
export interface RelationshipConfig {
  targetPattern: string;      // Template for target elementId
  relationshipType: string;   // e.g., "ComponentOf", "References"
}

export interface MappingRule {
  // ... existing fields ...
  relationships?: RelationshipConfig[];
}
```

#### 5.2 Example Config
**File:** `config.yaml`

```yaml
mappings:
  - id: "sensor"
    topicPattern: "{site}/{building}/{floor}/{sensor}"
    codec: "json"
    elementIdTemplate: "{site}.{building}.{floor}.{sensor}"
    relationships:
      - targetPattern: "{site}.{building}.{floor}"
        relationshipType: "ComponentOf"
      - targetPattern: "{site}.{building}"
        relationshipType: "OrganizedBy"
```

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/store/object-store.ts` | MODIFY | Add RelationshipType, Relationship storage, methods, auto-creation |
| `src/mapping/schema-mapper.ts` | MODIFY | Add parentId inference, relationships field |
| `src/api/routes/objects.ts` | MODIFY | Implement `/objects/related` properly |
| `src/api/routes/relationship-types.ts` | CREATE | New `/relationshiptypes` endpoints |
| `src/api/server.ts` | MODIFY | Register relationship-types routes |
| `src/config/loader.ts` | MODIFY (optional) | Add relationship config to mapping rules |

---

## Testing Checklist

- [ ] Built-in relationship types are seeded on startup
- [ ] Parent-child relationships auto-created on upsert
- [ ] `/objects/related` returns correct relationships for single elementId
- [ ] `/objects/related` returns correct relationships for multiple elementIds
- [ ] `relationshiptype` filter works correctly
- [ ] `includeMetadata` flag includes/excludes metadata
- [ ] `/relationshiptypes` returns all relationship types
- [ ] `/relationshiptypes?namespaceUri=...` filters correctly
- [ ] `/relationshiptypes/query` returns requested types
- [ ] Bidirectional relationships work (A→B and B→A)
- [ ] Relationship cleanup on instance delete

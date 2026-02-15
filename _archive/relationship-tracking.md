# Implementation Plan: Relationship Tracking for i3x API

> **Revision 2** — revised against CESMII i3X RFC (Sections 3.1–3.2, 4.1.4, 4.1.6, 4.2.1.1)
> and the assessment covering spec conformance, data model, and scale concerns.

## Current State Analysis

### i3x RFC Requirements (normative)

| Requirement | RFC Section | Level |
|-------------|-------------|-------|
| `hasChildren: boolean` on every object | 3.1.1 | MUST |
| `parentId` on every object | 3.1.1 | MUST |
| HasParent / HasChildren relationship types | 3.2.2, 4.1.4 | MUST |
| HasComponent / ComponentOf relationship types | 3.2.3, 4.1.4 | MAY (if supported, MUST use these names) |
| `/objects/related` — singular `elementId` + relationship type name | 4.1.6 | MUST |
| `/objects/related` — optional `depth` parameter | 4.1.6 | MAY |
| `/relationshiptypes` — returns array of type definitions | 4.1.4 | MUST |
| `maxDepth` on value queries for composition elements | 4.2.1.1 | MUST (when composition supported) |
| Each relationship type definition: `elementId`, `displayName`, `namespaceUri`, `reverseOf` | 4.1.4 | MUST |

### Current Codebase

- `ObjectInstance` has `parentId` and `isComposition` but **not** `hasChildren`
- Store tracks instances by namespace and type, but not relationships
- `/objects/related` exists as a stub returning `[]`
- Compliance test at `test-i3x-compliance.ts:188` sends `{ elementId, relationshipTypeId }` (singular) — correct per spec
- No `/relationshiptypes` endpoint
- Mapping rules don't support relationship definitions

### What the original plan got wrong

1. **`/objects/related` request schema** — proposed `{ elementIds: string[] }` (plural array). Spec requires singular `elementId` + relationship type name. The compliance test already uses the correct form.
2. **Missing `hasChildren`** — spec Section 3.1.1 requires `hasChildren: boolean` on every object. Not addressed.
3. **Wrong built-in types** — proposed HasProperty/PropertyOf, Organizes/OrganizedBy, References/ReferencedBy as built-ins. None of these are in the spec. The only MUST pair is HasParent/HasChildren. HasComponent/ComponentOf is MAY.
4. **Missing `maxDepth`** — spec Section 4.2.1.1 mandates `maxDepth` for composition value queries. Section 4.1.6 has an optional `depth` parameter for relationship traversal. Neither addressed.
5. **Dual storage** — storing `parentId` on ObjectInstance AND in a separate relationship map AND in a reverse relationship entry = same fact in 3 places with no defined reconciliation.
6. **Auto-inference hardcodes `isComposition: true`** — dot-separated MQTT topic hierarchy represents organizational containment, not value composition. Should default to HasParent/HasChildren (organizational), not HasComponent/ComponentOf (compositional).
7. **No placeholder parent strategy** — child elements can arrive before parents via MQTT. "Create placeholder parent" was chosen but no behavior defined.
8. **No reverse index** — at tens-of-thousands scale, target→source lookups are O(n) without one.
9. **No cascade delete** — testing checklist mentions cleanup but implementation plan omits it.

---

## Revised Implementation Plan

### Design Decisions

**Single source of truth:** The relationship map is the source of truth for all relationships. `parentId` and `hasChildren` are **computed** from the relationship map on read, not stored independently on `ObjectInstance`. This eliminates the dual-storage consistency problem.

**Reverse index:** Maintain a `targetIndex: Map<string, Set<string>>` mapping targetId → sourceIds. This makes reverse lookups O(1) instead of O(n) at scale.

**Default inference = organizational, not compositional:** Topic-hierarchy-inferred relationships use HasParent/HasChildren. Composition (HasComponent/ComponentOf) is only established via explicit config rules.

**Placeholder parents:** When a child arrives before its parent, create a placeholder `ObjectInstance` with `displayName` derived from the last segment of the elementId, `typeId: "Placeholder"`, and `namespaceUri` inherited from the child. When the real parent arrives via MQTT upsert, the placeholder is replaced — the upsert already overwrites the instance.

---

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

#### 1.2 Add Relationship Storage with Reverse Index
**File:** `src/store/object-store.ts`

```typescript
export interface Relationship {
  targetElementId: string;
  relationshipTypeId: string;
}
```

Add to ObjectStore class:
- `private relationships = new Map<string, Relationship[]>()` — sourceId → relationships
- `private targetIndex = new Map<string, Set<string>>()` — targetId → set of sourceIds (reverse index)

Methods:
- `addRelationship(sourceId: string, targetId: string, typeId: string): void`
  - Adds to `relationships[sourceId]`
  - Adds sourceId to `targetIndex[targetId]`
  - Checks for duplicates before adding (same source+target+type = no-op)
- `getRelationships(elementId: string, typeId?: string): Relationship[]`
- `getRelatedElementIds(elementId: string, typeId?: string): string[]`
- `getSourcesForTarget(targetId: string): string[]` — uses reverse index, O(1)
- `removeRelationship(sourceId: string, targetId: string, typeId?: string): boolean`
  - Removes from `relationships[sourceId]`
  - If no more relationships point to targetId, removes from `targetIndex`
- `clearRelationships(elementId: string): void`
  - Removes all relationships where elementId is source
  - Removes all relationships where elementId is target (via `targetIndex`)
  - Also removes reverse entries for the counterpart side

#### 1.3 Update ObjectInstance Interface
**File:** `src/mapping/schema-mapper.ts`

```typescript
export interface ObjectInstance {
  elementId: string;
  displayName: string;
  typeId: string;
  namespaceUri: string;
  isComposition: boolean;
  // parentId and hasChildren are NOT stored here.
  // They are computed from the relationship map on read.
}
```

**Note:** The existing `parentId` field is removed from the stored interface. It becomes a computed property on the API response (see Phase 4).

#### 1.4 Add Computed Property Helpers to ObjectStore
**File:** `src/store/object-store.ts`

```typescript
getParentId(elementId: string): string | undefined {
  // Look for a HasParent relationship from this element
  const rels = this.getRelationships(elementId, 'HasParent');
  return rels.length > 0 ? rels[0].targetElementId : undefined;
}

hasChildren(elementId: string): boolean {
  // Check if any element has a HasParent relationship pointing to this element
  // i.e., this element appears as a target in any HasParent relationship
  const sources = this.targetIndex.get(elementId);
  if (!sources || sources.size === 0) return false;
  // Verify at least one source actually has a HasParent rel pointing here
  for (const sourceId of sources) {
    const rels = this.getRelationships(sourceId, 'HasParent');
    if (rels.some(r => r.targetElementId === elementId)) return true;
  }
  return false;
}
```

---

### Phase 2: Built-in Relationship Types

#### 2.1 Seed Required + Supported Relationship Types
**File:** `src/store/object-store.ts` (in constructor or init method)

**Required (MUST per RFC 4.1.4):**

| elementId | displayName | namespaceUri | reverseOf |
|-----------|-------------|--------------|-----------|
| `HasParent` | Has Parent | `urn:i3x:relationships` | `HasChildren` |
| `HasChildren` | Has Children | `urn:i3x:relationships` | `HasParent` |

**Supported (MAY per RFC 4.1.4 — we choose to support composition):**

| elementId | displayName | namespaceUri | reverseOf |
|-----------|-------------|--------------|-----------|
| `HasComponent` | Has Component | `urn:i3x:relationships` | `ComponentOf` |
| `ComponentOf` | Component Of | `urn:i3x:relationships` | `HasComponent` |

```typescript
private seedBuiltInRelationshipTypes(): void {
  const builtIn: RelationshipType[] = [
    // Required (MUST)
    { elementId: 'HasParent', displayName: 'Has Parent', namespaceUri: 'urn:i3x:relationships', reverseOf: 'HasChildren' },
    { elementId: 'HasChildren', displayName: 'Has Children', namespaceUri: 'urn:i3x:relationships', reverseOf: 'HasParent' },
    // Supported (MAY — composition)
    { elementId: 'HasComponent', displayName: 'Has Component', namespaceUri: 'urn:i3x:relationships', reverseOf: 'ComponentOf' },
    { elementId: 'ComponentOf', displayName: 'Component Of', namespaceUri: 'urn:i3x:relationships', reverseOf: 'HasComponent' },
  ];
  for (const rt of builtIn) {
    this.relationshipTypes.set(rt.elementId, rt);
  }
}
```

**Dropped from the original plan:** HasProperty/PropertyOf, Organizes/OrganizedBy, References/ReferencedBy — not in the spec and not needed. Can be added later via config if needed.

---

### Phase 3: Relationship Inference from Data

#### 3.1 Auto-create Organizational Relationships on Upsert
**File:** `src/store/object-store.ts` (modify `upsert` method)

When an ObjectInstance is upserted, determine the parent from the elementId hierarchy and create **organizational** (not compositional) relationships:

```typescript
upsert(elementId: string, value: ObjectValue, instance?: ObjectInstance): void {
  // ... existing value/instance storage code ...

  if (instance) {
    // Infer parent from elementId hierarchy
    const parentId = this.inferParentId(elementId);

    if (parentId) {
      // Ensure parent exists (create placeholder if needed)
      this.ensureParentExists(parentId, instance.namespaceUri);

      // Clear old organizational relationships for this element
      this.removeRelationshipsByType(elementId, 'HasParent');

      // Create bidirectional organizational relationships
      this.addRelationship(elementId, parentId, 'HasParent');
      this.addRelationship(parentId, elementId, 'HasChildren');
    }

    // If this element has isComposition: true AND was created via explicit config rule,
    // also create HasComponent/ComponentOf relationships.
    // (This is NOT done for auto-inferred hierarchy — see Design Decisions above.)
  }
}
```

#### 3.2 Parent Inference from ElementId Hierarchy
**File:** `src/store/object-store.ts`

```typescript
private inferParentId(elementId: string): string | undefined {
  const parts = elementId.split('.');
  if (parts.length <= 1) return undefined;
  return parts.slice(0, -1).join('.');
}
```

**Semantics:** This infers **organizational** hierarchy (HasParent/HasChildren), NOT composition. The assumption is that `enterprise.system.tag` means the tag is *organized under* the system, not that the tag's value is *part of* the system's value.

#### 3.3 Placeholder Parent Creation
**File:** `src/store/object-store.ts`

```typescript
private ensureParentExists(parentId: string, childNamespaceUri: string): void {
  if (this.instances.has(parentId)) return;

  // Create a placeholder instance
  const segments = parentId.split('.');
  const displayName = segments[segments.length - 1];

  const placeholder: ObjectInstance = {
    elementId: parentId,
    displayName,
    typeId: 'Placeholder',
    namespaceUri: childNamespaceUri,
    isComposition: false,
  };

  // Use a default ObjectValue for the placeholder
  const placeholderValue: ObjectValue = {
    elementId: parentId,
    value: null,
    timestamp: new Date().toISOString(),
    quality: 'uncertain',
  };

  // Store directly (don't recurse through upsert to avoid infinite loop)
  this.values.set(parentId, placeholderValue);
  this.instances.set(parentId, placeholder);
  this.addToIndex(this.byNamespace, placeholder.namespaceUri, parentId);
  this.addToIndex(this.byType, placeholder.typeId, parentId);

  // Recurse: the placeholder itself may have a parent
  const grandparentId = this.inferParentId(parentId);
  if (grandparentId) {
    this.ensureParentExists(grandparentId, childNamespaceUri);
    this.addRelationship(parentId, grandparentId, 'HasParent');
    this.addRelationship(grandparentId, parentId, 'HasChildren');
  }
}
```

**When a real MQTT message arrives for a placeholder parent:** The standard `upsert()` path overwrites the placeholder's instance and value with the real data. The organizational relationships created during placeholder creation remain valid — they were already correct (they pointed to the right parent).

#### 3.4 Cascade Delete
**File:** `src/store/object-store.ts` (modify `delete` method)

```typescript
delete(elementId: string): boolean {
  const instance = this.instances.get(elementId);
  if (instance) {
    this.removeFromIndex(this.byNamespace, instance.namespaceUri, elementId);
    this.removeFromIndex(this.byType, instance.typeId, elementId);
    this.instances.delete(elementId);
  }

  // Clean up all relationships involving this element
  this.clearRelationships(elementId);

  return this.values.delete(elementId);
}
```

Also update `clear()` to clear relationship storage:

```typescript
clear(): void {
  this.values.clear();
  this.instances.clear();
  this.byNamespace.clear();
  this.byType.clear();
  this.relationships.clear();
  this.targetIndex.clear();
}
```

---

### Phase 4: API Endpoints

#### 4.1 Fix `/objects/related` to Match Spec
**File:** `src/api/routes/objects.ts`

The spec (Section 4.1.6) requires: a single `elementId` + a relationship type name. Returns an array of related objects with required metadata (Section 3.1.1: displayName, parentId, hasChildren, namespaceUri).

```typescript
interface ObjectsRelatedBody {
  elementId: string;
  relationshipTypeId: string;
  depth?: number;           // Optional: 0 = no recursion (default per spec), N = N levels
  includeMetadata?: boolean; // Optional: include 3.1.2 metadata
}

fastify.post<{ Body: ObjectsRelatedBody }>(
  '/objects/related',
  async (request, reply) => {
    const store = request.apiContext.store;
    const { elementId, relationshipTypeId, depth = 0, includeMetadata = false } = request.body;

    if (!elementId || typeof elementId !== 'string') {
      return reply.code(400).send({ error: 'elementId is required and must be a string' });
    }
    if (!relationshipTypeId || typeof relationshipTypeId !== 'string') {
      return reply.code(400).send({ error: 'relationshipTypeId is required and must be a string' });
    }

    // Collect related objects, respecting depth
    const visited = new Set<string>();
    const relatedObjects = collectRelated(store, elementId, relationshipTypeId, depth, 0, visited);

    // Build response with required metadata (Section 3.1.1)
    const objects = relatedObjects.map(targetId => {
      const inst = store.getInstance(targetId);
      if (!inst) return null;

      const obj: Record<string, unknown> = {
        elementId: inst.elementId,
        displayName: inst.displayName,
        parentId: store.getParentId(inst.elementId),
        hasChildren: store.hasChildren(inst.elementId),
        namespaceUri: inst.namespaceUri,
      };

      if (includeMetadata) {
        obj.typeId = inst.typeId;
        obj.isComposition = inst.isComposition;
      }

      return obj;
    }).filter(Boolean);

    return { objects };
  }
);

function collectRelated(
  store: ObjectStore,
  elementId: string,
  typeId: string,
  maxDepth: number,
  currentDepth: number,
  visited: Set<string>
): string[] {
  if (visited.has(elementId)) return [];
  visited.add(elementId);

  const directRels = store.getRelationships(elementId, typeId);
  const targetIds = directRels.map(r => r.targetElementId);

  if (maxDepth === 0 || currentDepth >= maxDepth) {
    return targetIds;
  }

  // Recurse
  const allIds = [...targetIds];
  for (const tid of targetIds) {
    const deeper = collectRelated(store, tid, typeId, maxDepth, currentDepth + 1, visited);
    allIds.push(...deeper);
  }
  return allIds;
}
```

**Note:** The spec says depth=0 means "no recursion" (return only direct relatives). The `depth` parameter is optional; if omitted, default is 0 (no recursion). The spec says "if the depth parameter is omitted, the depth SHALL be interpreted as zero."

#### 4.2 Update `/objects` Response to Include `hasChildren` and `parentId`
**File:** `src/api/routes/objects.ts`

All object-returning endpoints must include `hasChildren` (Section 3.1.1):

```typescript
// In GET /objects, POST /objects/list responses:
return instances.map((inst) => ({
  elementId: inst.elementId,
  displayName: inst.displayName,
  typeId: inst.typeId,
  parentId: store.getParentId(inst.elementId),
  hasChildren: store.hasChildren(inst.elementId),
  isComposition: inst.isComposition,
  namespaceUri: inst.namespaceUri,
}));
```

#### 4.3 Add `/relationshiptypes` Endpoints
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
  // GET /relationshiptypes — list all relationship types (Section 4.1.4)
  fastify.get<{ Querystring: RelationshipTypesQuerystring }>(
    '/relationshiptypes',
    async (request) => {
      const store = request.apiContext.store;
      const { namespaceUri } = request.query;

      const types = namespaceUri
        ? store.getRelationshipTypesByNamespace(namespaceUri)
        : store.getAllRelationshipTypes();

      return { relationshipTypes: types };
    }
  );

  // POST /relationshiptypes/query — batch query by elementIds
  fastify.post<{ Body: RelationshipTypesQueryBody }>(
    '/relationshiptypes/query',
    async (request, reply) => {
      const store = request.apiContext.store;
      const { elementIds } = request.body;

      if (!Array.isArray(elementIds)) {
        return reply.code(400).send({ error: 'elementIds must be an array' });
      }

      const types = elementIds
        .map(id => store.getRelationshipType(id))
        .filter((rt): rt is NonNullable<typeof rt> => rt != null);

      return { relationshipTypes: types };
    }
  );
}
```

#### 4.4 Register Routes
**File:** `src/api/server.ts`

```typescript
import { registerRelationshipTypesRoutes } from './routes/relationship-types.js';

// In createServer, alongside existing route registrations:
await fastify.register(registerRelationshipTypesRoutes, { prefix: '' });
```

---

### Phase 5: `maxDepth` Support for Composition Value Queries

**File:** `src/api/routes/values.ts`

Per RFC Section 4.2.1.1, when an element has `isComposition: true`, value queries MUST support `maxDepth`:
- `maxDepth=1` (default): return only this element's direct value
- `maxDepth=0`: infinite recursion — include all nested component values
- `maxDepth=N` (N>1): recurse up to N levels through HasComponent relationships

```typescript
// In POST /objects/value handler, after retrieving the base value:
if (instance?.isComposition && maxDepth !== 1) {
  const composedValue = buildComposedValue(store, elementId, maxDepth, 0);
  // Return { value: directValue, ...componentValues }
}

function buildComposedValue(
  store: ObjectStore,
  elementId: string,
  maxDepth: number,
  currentDepth: number
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const directValue = store.getValue(elementId);
  if (directValue) {
    result.value = directValue.value;
  }

  // Should we recurse?
  if (maxDepth === 0 || (maxDepth > 1 && currentDepth < maxDepth - 1)) {
    const components = store.getRelationships(elementId, 'HasComponent');
    for (const comp of components) {
      const childValue = store.getValue(comp.targetElementId);
      const childInstance = store.getInstance(comp.targetElementId);

      if (childInstance?.isComposition) {
        result[comp.targetElementId] = buildComposedValue(
          store, comp.targetElementId, maxDepth, currentDepth + 1
        );
      } else if (childValue) {
        result[comp.targetElementId] = childValue.value;
      }
    }
  }

  return result;
}
```

---

### Phase 6: Config-driven Relationships

#### 6.1 Add Relationships to Mapping Rules
**File:** `src/config/loader.ts`

```typescript
export interface RelationshipConfig {
  targetPattern: string;        // Template for target elementId
  relationshipType: string;     // e.g., "HasParent", "ComponentOf"
}

export interface MappingRule {
  // ... existing fields ...
  relationships?: RelationshipConfig[];
}
```

#### 6.2 Process Config Relationships on Upsert
**File:** `src/store/object-store.ts` or `src/mapping/schema-mapper.ts`

When a mapping rule includes explicit `relationships`, those are created **in addition to** the auto-inferred organizational relationship. If a config rule specifies `ComponentOf`, that element gets both:
- auto-inferred: `HasParent` → organizational parent (from elementId hierarchy)
- config-explicit: `ComponentOf` → specified target (composition relationship)

This also sets `isComposition: true` on the child when a `ComponentOf` relationship is explicitly configured.

#### 6.3 Example Config
**File:** `config.yaml`

```yaml
mappings:
  - id: "sensor"
    topicPattern: "{enterprise}/{system}/{sensor}"
    codec: "json"
    elementIdTemplate: "{enterprise}.{system}.{sensor}"
    relationships:
      - targetPattern: "{enterprise}.{system}"
        relationshipType: "HasParent"        # organizational (default — same as auto-inferred)
      - targetPattern: "{enterprise}.{system}"
        relationshipType: "ComponentOf"       # composition — explicitly opted in
```

---

## Updated `stats()` Method

```typescript
stats(): {
  values: number;
  instances: number;
  types: number;
  namespaces: number;
  relationshipTypes: number;
  relationships: number;
} {
  let totalRelationships = 0;
  for (const rels of this.relationships.values()) {
    totalRelationships += rels.length;
  }
  return {
    values: this.values.size,
    instances: this.instances.size,
    types: this.types.size,
    namespaces: this.namespaces.size,
    relationshipTypes: this.relationshipTypes.size,
    relationships: totalRelationships,
  };
}
```

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/store/object-store.ts` | MODIFY | Add RelationshipType, Relationship storage + reverse index, computed `parentId`/`hasChildren`, placeholder parent creation, cascade delete, `clearRelationships` |
| `src/mapping/schema-mapper.ts` | MODIFY | Remove `parentId` from stored ObjectInstance (computed from relationships now) |
| `src/api/routes/objects.ts` | MODIFY | Fix `/objects/related` to singular elementId + relationshipTypeId per spec. Add `hasChildren`/`parentId` to all object responses. Add depth traversal. |
| `src/api/routes/relationship-types.ts` | CREATE | New `/relationshiptypes` and `/relationshiptypes/query` endpoints |
| `src/api/routes/values.ts` | MODIFY | Add `maxDepth` support for composition elements |
| `src/api/server.ts` | MODIFY | Register relationship-types routes |
| `src/config/loader.ts` | MODIFY | Add `RelationshipConfig` to `MappingRule` |
| `test-i3x-compliance.ts` | MODIFY | Update tests to validate `hasChildren`, relationship types, depth traversal |

---

## Testing Checklist

- [ ] **Built-in types:** HasParent/HasChildren seeded on startup (MUST). HasComponent/ComponentOf seeded (MAY — we support).
- [ ] **No extra types:** HasProperty/PropertyOf, Organizes/OrganizedBy, References/ReferencedBy NOT seeded (not in spec).
- [ ] **Auto-inferred relationships:** Upsert of `a.b.c` creates HasParent(c→b) + HasChildren(b→c), NOT HasComponent/ComponentOf.
- [ ] **Placeholder parents:** Upsert of `a.b.c` when `a.b` doesn't exist creates placeholder `a.b` with typeId=Placeholder, quality=uncertain.
- [ ] **Placeholder overwrite:** When real `a.b` arrives via MQTT, placeholder is cleanly replaced. Relationships remain intact.
- [ ] **`hasChildren` computed correctly:** Parent element returns `hasChildren: true`, leaf returns `false`.
- [ ] **`parentId` computed correctly:** Derived from HasParent relationship, not stored on ObjectInstance.
- [ ] **`/objects/related`:** Accepts `{ elementId, relationshipTypeId }` (singular). Returns `{ objects: [...] }` with Section 3.1.1 fields.
- [ ] **`/objects/related` depth=0:** Returns only direct relatives (default).
- [ ] **`/objects/related` depth=N:** Recurses N levels.
- [ ] **`/relationshiptypes`:** Returns all 4 built-in types with elementId, displayName, namespaceUri, reverseOf.
- [ ] **`/relationshiptypes?namespaceUri=...`:** Filters correctly.
- [ ] **`/relationshiptypes/query`:** Batch lookup by elementIds works.
- [ ] **Reverse index:** `getSourcesForTarget()` returns correct results in O(1).
- [ ] **Cascade delete:** `delete(elementId)` removes all relationships where element is source OR target. Reverse entries cleaned up.
- [ ] **`clear()`:** Clears relationships and targetIndex.
- [ ] **Config-driven composition:** Mapping rule with `relationshipType: "ComponentOf"` creates composition relationship and sets `isComposition: true`.
- [ ] **`maxDepth` on value queries:** `isComposition: true` elements support maxDepth=0 (infinite), maxDepth=1 (direct only, default), maxDepth=N.
- [ ] **Bidirectional consistency:** Adding HasParent(A→B) also adds HasChildren(B→A). Deleting one direction cleans up the other.
- [ ] **Scale:** 10,000+ relationships — no O(n) scans for basic lookups.

---

## Implementation Order

1. **Phase 1** — Data model: interfaces, relationship storage, reverse index, computed helpers
2. **Phase 2** — Seed built-in types (4 types, not 8)
3. **Phase 3** — Inference + placeholder + cascade delete (heaviest engineering)
4. **Phase 4** — API endpoints (fix `/objects/related`, add `hasChildren`, add `/relationshiptypes`)
5. **Phase 5** — `maxDepth` for composition value queries
6. **Phase 6** — Config-driven relationships (optional, can ship without)

Each phase is independently testable. Phases 1–4 are required for spec conformance. Phase 5 is required if composition is supported (and we chose to support it). Phase 6 is an enhancement.

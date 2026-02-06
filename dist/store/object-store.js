export class ObjectStore {
    values = new Map();
    instances = new Map();
    types = new Map();
    namespaces = new Map();
    byNamespace = new Map();
    byType = new Map();
    relationshipTypes = new Map();
    relationships = new Map();
    targetIndex = new Map();
    listeners = [];
    constructor() {
        this.seedBuiltInRelationshipTypes();
    }
    seedBuiltInRelationshipTypes() {
        const builtIn = [
            { elementId: 'HasParent', displayName: 'Has Parent', namespaceUri: 'urn:i3x:relationships', reverseOf: 'HasChildren' },
            { elementId: 'HasChildren', displayName: 'Has Children', namespaceUri: 'urn:i3x:relationships', reverseOf: 'HasParent' },
            { elementId: 'HasComponent', displayName: 'Has Component', namespaceUri: 'urn:i3x:relationships', reverseOf: 'ComponentOf' },
            { elementId: 'ComponentOf', displayName: 'Component Of', namespaceUri: 'urn:i3x:relationships', reverseOf: 'HasComponent' },
        ];
        for (const rt of builtIn) {
            this.relationshipTypes.set(rt.elementId, rt);
        }
    }
    upsert(elementId, value, instance) {
        this.values.set(elementId, value);
        if (instance) {
            const existing = this.instances.get(elementId);
            if (existing) {
                this.removeFromIndex(this.byNamespace, existing.namespaceUri, elementId);
                this.removeFromIndex(this.byType, existing.typeId, elementId);
            }
            this.instances.set(elementId, instance);
            this.addToIndex(this.byNamespace, instance.namespaceUri, elementId);
            this.addToIndex(this.byType, instance.typeId, elementId);
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
        }
        for (const listener of this.listeners) {
            try {
                listener(elementId, value, instance);
            }
            catch {
                // Ignore listener errors
            }
        }
    }
    getValue(elementId) {
        return this.values.get(elementId);
    }
    getValues(elementIds) {
        const results = [];
        for (const id of elementIds) {
            const value = this.values.get(id);
            if (value)
                results.push(value);
        }
        return results;
    }
    getAllValues() {
        return Array.from(this.values.values());
    }
    getInstance(elementId) {
        return this.instances.get(elementId);
    }
    getInstances(elementIds) {
        const results = [];
        for (const id of elementIds) {
            const instance = this.instances.get(id);
            if (instance)
                results.push(instance);
        }
        return results;
    }
    getAllInstances() {
        return Array.from(this.instances.values());
    }
    getInstancesByNamespace(namespaceUri) {
        const ids = this.byNamespace.get(namespaceUri);
        if (!ids)
            return [];
        return this.getInstances(Array.from(ids));
    }
    getInstancesByType(typeId) {
        const ids = this.byType.get(typeId);
        if (!ids)
            return [];
        return this.getInstances(Array.from(ids));
    }
    registerType(type) {
        this.types.set(type.elementId, type);
    }
    getType(elementId) {
        return this.types.get(elementId);
    }
    getAllTypes() {
        return Array.from(this.types.values());
    }
    getTypesByNamespace(namespaceUri) {
        return Array.from(this.types.values()).filter((t) => t.namespaceUri === namespaceUri);
    }
    deleteType(elementId) {
        return this.types.delete(elementId);
    }
    registerNamespace(namespace) {
        this.namespaces.set(namespace.uri, namespace);
    }
    getNamespace(uri) {
        return this.namespaces.get(uri);
    }
    getAllNamespaces() {
        return Array.from(this.namespaces.values());
    }
    // --- Relationship Type methods ---
    registerRelationshipType(type) {
        this.relationshipTypes.set(type.elementId, type);
    }
    getRelationshipType(elementId) {
        return this.relationshipTypes.get(elementId);
    }
    getAllRelationshipTypes() {
        return Array.from(this.relationshipTypes.values());
    }
    getRelationshipTypesByNamespace(namespaceUri) {
        return Array.from(this.relationshipTypes.values()).filter((rt) => rt.namespaceUri === namespaceUri);
    }
    // --- Relationship storage methods ---
    addRelationship(sourceId, targetId, typeId) {
        let rels = this.relationships.get(sourceId);
        if (!rels) {
            rels = [];
            this.relationships.set(sourceId, rels);
        }
        // Deduplicate: same source+target+type = no-op
        if (rels.some(r => r.targetElementId === targetId && r.relationshipTypeId === typeId)) {
            return;
        }
        rels.push({ targetElementId: targetId, relationshipTypeId: typeId });
        // Update reverse index
        let sources = this.targetIndex.get(targetId);
        if (!sources) {
            sources = new Set();
            this.targetIndex.set(targetId, sources);
        }
        sources.add(sourceId);
    }
    getRelationships(elementId, typeId) {
        const rels = this.relationships.get(elementId);
        if (!rels)
            return [];
        if (!typeId)
            return rels;
        return rels.filter(r => r.relationshipTypeId === typeId);
    }
    getRelatedElementIds(elementId, typeId) {
        return this.getRelationships(elementId, typeId).map(r => r.targetElementId);
    }
    getSourcesForTarget(targetId) {
        const sources = this.targetIndex.get(targetId);
        return sources ? Array.from(sources) : [];
    }
    removeRelationship(sourceId, targetId, typeId) {
        const rels = this.relationships.get(sourceId);
        if (!rels)
            return false;
        const before = rels.length;
        const filtered = typeId
            ? rels.filter(r => !(r.targetElementId === targetId && r.relationshipTypeId === typeId))
            : rels.filter(r => r.targetElementId !== targetId);
        if (filtered.length === before)
            return false;
        if (filtered.length === 0) {
            this.relationships.delete(sourceId);
        }
        else {
            this.relationships.set(sourceId, filtered);
        }
        // Update reverse index: check if sourceId still has any rel pointing to targetId
        const stillPoints = filtered.some(r => r.targetElementId === targetId);
        if (!stillPoints) {
            const sources = this.targetIndex.get(targetId);
            if (sources) {
                sources.delete(sourceId);
                if (sources.size === 0)
                    this.targetIndex.delete(targetId);
            }
        }
        return true;
    }
    removeRelationshipsByType(elementId, typeId) {
        const rels = this.relationships.get(elementId);
        if (!rels)
            return;
        const toRemove = rels.filter(r => r.relationshipTypeId === typeId);
        if (toRemove.length === 0)
            return;
        const remaining = rels.filter(r => r.relationshipTypeId !== typeId);
        if (remaining.length === 0) {
            this.relationships.delete(elementId);
        }
        else {
            this.relationships.set(elementId, remaining);
        }
        // Clean up reverse index for each removed relationship
        for (const rel of toRemove) {
            const stillPoints = remaining.some(r => r.targetElementId === rel.targetElementId);
            if (!stillPoints) {
                const sources = this.targetIndex.get(rel.targetElementId);
                if (sources) {
                    sources.delete(elementId);
                    if (sources.size === 0)
                        this.targetIndex.delete(rel.targetElementId);
                }
            }
        }
    }
    clearRelationships(elementId) {
        // Remove all relationships where elementId is source
        const outgoing = this.relationships.get(elementId);
        if (outgoing) {
            for (const rel of outgoing) {
                const sources = this.targetIndex.get(rel.targetElementId);
                if (sources) {
                    sources.delete(elementId);
                    if (sources.size === 0)
                        this.targetIndex.delete(rel.targetElementId);
                }
            }
            this.relationships.delete(elementId);
        }
        // Remove all relationships where elementId is target (via reverse index)
        const incomingSources = this.targetIndex.get(elementId);
        if (incomingSources) {
            for (const sourceId of incomingSources) {
                const rels = this.relationships.get(sourceId);
                if (rels) {
                    const filtered = rels.filter(r => r.targetElementId !== elementId);
                    if (filtered.length === 0) {
                        this.relationships.delete(sourceId);
                    }
                    else {
                        this.relationships.set(sourceId, filtered);
                    }
                }
            }
            this.targetIndex.delete(elementId);
        }
    }
    // --- Computed property helpers (derived from relationship map) ---
    getParentId(elementId) {
        const rels = this.getRelationships(elementId, 'HasParent');
        return rels.length > 0 ? rels[0].targetElementId : undefined;
    }
    hasChildren(elementId) {
        const sources = this.targetIndex.get(elementId);
        if (!sources || sources.size === 0)
            return false;
        for (const sourceId of sources) {
            const rels = this.getRelationships(sourceId, 'HasParent');
            if (rels.some(r => r.targetElementId === elementId))
                return true;
        }
        return false;
    }
    addChangeListener(listener) {
        this.listeners.push(listener);
    }
    removeChangeListener(listener) {
        const index = this.listeners.indexOf(listener);
        if (index === -1)
            return false;
        this.listeners.splice(index, 1);
        return true;
    }
    delete(elementId) {
        const instance = this.instances.get(elementId);
        if (instance) {
            this.removeFromIndex(this.byNamespace, instance.namespaceUri, elementId);
            this.removeFromIndex(this.byType, instance.typeId, elementId);
            this.instances.delete(elementId);
        }
        this.clearRelationships(elementId);
        return this.values.delete(elementId);
    }
    clear() {
        this.values.clear();
        this.instances.clear();
        this.byNamespace.clear();
        this.byType.clear();
        this.relationships.clear();
        this.targetIndex.clear();
    }
    stats() {
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
    ensureParentExists(parentId, childNamespaceUri) {
        if (this.instances.has(parentId))
            return;
        // Create a placeholder instance
        const segments = parentId.split('.');
        const displayName = segments[segments.length - 1];
        const placeholder = {
            elementId: parentId,
            displayName,
            typeId: 'Placeholder',
            namespaceUri: childNamespaceUri,
            isComposition: false,
        };
        const placeholderValue = {
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
    inferParentId(elementId) {
        const parts = elementId.split('.');
        if (parts.length <= 1)
            return undefined;
        return parts.slice(0, -1).join('.');
    }
    addToIndex(index, key, elementId) {
        let set = index.get(key);
        if (!set) {
            set = new Set();
            index.set(key, set);
        }
        set.add(elementId);
    }
    removeFromIndex(index, key, elementId) {
        const set = index.get(key);
        if (set) {
            set.delete(elementId);
            if (set.size === 0) {
                index.delete(key);
            }
        }
    }
}
export const objectStore = new ObjectStore();

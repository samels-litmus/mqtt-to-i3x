export class ObjectStore {
    values = new Map();
    instances = new Map();
    types = new Map();
    namespaces = new Map();
    byNamespace = new Map();
    byType = new Map();
    listeners = [];
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
        return this.values.delete(elementId);
    }
    clear() {
        this.values.clear();
        this.instances.clear();
        this.byNamespace.clear();
        this.byType.clear();
    }
    stats() {
        return {
            values: this.values.size,
            instances: this.instances.size,
            types: this.types.size,
            namespaces: this.namespaces.size,
        };
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

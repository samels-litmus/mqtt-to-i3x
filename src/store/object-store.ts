import { ObjectValue, ObjectInstance } from '../mapping/schema-mapper.js';

export interface ObjectType {
  elementId: string;
  displayName: string;
  namespaceUri: string;
  schema?: object;
}

export interface Namespace {
  uri: string;
  displayName: string;
}

export type ValueChangeListener = (
  elementId: string,
  value: ObjectValue,
  instance?: ObjectInstance
) => void;

export class ObjectStore {
  private values = new Map<string, ObjectValue>();
  private instances = new Map<string, ObjectInstance>();
  private types = new Map<string, ObjectType>();
  private namespaces = new Map<string, Namespace>();

  private byNamespace = new Map<string, Set<string>>();
  private byType = new Map<string, Set<string>>();

  private listeners: ValueChangeListener[] = [];

  upsert(elementId: string, value: ObjectValue, instance?: ObjectInstance): void {
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
      } catch {
        // Ignore listener errors
      }
    }
  }

  getValue(elementId: string): ObjectValue | undefined {
    return this.values.get(elementId);
  }

  getValues(elementIds: string[]): ObjectValue[] {
    const results: ObjectValue[] = [];
    for (const id of elementIds) {
      const value = this.values.get(id);
      if (value) results.push(value);
    }
    return results;
  }

  getAllValues(): ObjectValue[] {
    return Array.from(this.values.values());
  }

  getInstance(elementId: string): ObjectInstance | undefined {
    return this.instances.get(elementId);
  }

  getInstances(elementIds: string[]): ObjectInstance[] {
    const results: ObjectInstance[] = [];
    for (const id of elementIds) {
      const instance = this.instances.get(id);
      if (instance) results.push(instance);
    }
    return results;
  }

  getAllInstances(): ObjectInstance[] {
    return Array.from(this.instances.values());
  }

  getInstancesByNamespace(namespaceUri: string): ObjectInstance[] {
    const ids = this.byNamespace.get(namespaceUri);
    if (!ids) return [];
    return this.getInstances(Array.from(ids));
  }

  getInstancesByType(typeId: string): ObjectInstance[] {
    const ids = this.byType.get(typeId);
    if (!ids) return [];
    return this.getInstances(Array.from(ids));
  }

  registerType(type: ObjectType): void {
    this.types.set(type.elementId, type);
  }

  getType(elementId: string): ObjectType | undefined {
    return this.types.get(elementId);
  }

  getAllTypes(): ObjectType[] {
    return Array.from(this.types.values());
  }

  getTypesByNamespace(namespaceUri: string): ObjectType[] {
    return Array.from(this.types.values()).filter(
      (t) => t.namespaceUri === namespaceUri
    );
  }

  deleteType(elementId: string): boolean {
    return this.types.delete(elementId);
  }

  registerNamespace(namespace: Namespace): void {
    this.namespaces.set(namespace.uri, namespace);
  }

  getNamespace(uri: string): Namespace | undefined {
    return this.namespaces.get(uri);
  }

  getAllNamespaces(): Namespace[] {
    return Array.from(this.namespaces.values());
  }

  addChangeListener(listener: ValueChangeListener): void {
    this.listeners.push(listener);
  }

  removeChangeListener(listener: ValueChangeListener): boolean {
    const index = this.listeners.indexOf(listener);
    if (index === -1) return false;
    this.listeners.splice(index, 1);
    return true;
  }

  delete(elementId: string): boolean {
    const instance = this.instances.get(elementId);
    if (instance) {
      this.removeFromIndex(this.byNamespace, instance.namespaceUri, elementId);
      this.removeFromIndex(this.byType, instance.typeId, elementId);
      this.instances.delete(elementId);
    }
    return this.values.delete(elementId);
  }

  clear(): void {
    this.values.clear();
    this.instances.clear();
    this.byNamespace.clear();
    this.byType.clear();
  }

  stats(): { values: number; instances: number; types: number; namespaces: number } {
    return {
      values: this.values.size,
      instances: this.instances.size,
      types: this.types.size,
      namespaces: this.namespaces.size,
    };
  }

  private addToIndex(index: Map<string, Set<string>>, key: string, elementId: string): void {
    let set = index.get(key);
    if (!set) {
      set = new Set();
      index.set(key, set);
    }
    set.add(elementId);
  }

  private removeFromIndex(index: Map<string, Set<string>>, key: string, elementId: string): void {
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

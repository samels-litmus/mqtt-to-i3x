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
export interface RelationshipType {
    elementId: string;
    displayName: string;
    namespaceUri: string;
    reverseOf: string;
}
export interface Relationship {
    targetElementId: string;
    relationshipTypeId: string;
}
export type ValueChangeListener = (elementId: string, value: ObjectValue, instance?: ObjectInstance) => void;
export declare class ObjectStore {
    private values;
    private instances;
    private types;
    private namespaces;
    private byNamespace;
    private byType;
    private relationshipTypes;
    private relationships;
    private targetIndex;
    private listeners;
    constructor();
    private seedBuiltInRelationshipTypes;
    upsert(elementId: string, value: ObjectValue, instance?: ObjectInstance): void;
    getValue(elementId: string): ObjectValue | undefined;
    getValues(elementIds: string[]): ObjectValue[];
    getAllValues(): ObjectValue[];
    getInstance(elementId: string): ObjectInstance | undefined;
    getInstances(elementIds: string[]): ObjectInstance[];
    getAllInstances(): ObjectInstance[];
    getInstancesByNamespace(namespaceUri: string): ObjectInstance[];
    getInstancesByType(typeId: string): ObjectInstance[];
    registerType(type: ObjectType): void;
    getType(elementId: string): ObjectType | undefined;
    getAllTypes(): ObjectType[];
    getTypesByNamespace(namespaceUri: string): ObjectType[];
    deleteType(elementId: string): boolean;
    registerNamespace(namespace: Namespace): void;
    getNamespace(uri: string): Namespace | undefined;
    getAllNamespaces(): Namespace[];
    registerRelationshipType(type: RelationshipType): void;
    getRelationshipType(elementId: string): RelationshipType | undefined;
    getAllRelationshipTypes(): RelationshipType[];
    getRelationshipTypesByNamespace(namespaceUri: string): RelationshipType[];
    addRelationship(sourceId: string, targetId: string, typeId: string): void;
    getRelationships(elementId: string, typeId?: string): Relationship[];
    getRelatedElementIds(elementId: string, typeId?: string): string[];
    getSourcesForTarget(targetId: string): string[];
    removeRelationship(sourceId: string, targetId: string, typeId?: string): boolean;
    removeRelationshipsByType(elementId: string, typeId: string): void;
    clearRelationships(elementId: string): void;
    getParentId(elementId: string): string | undefined;
    hasChildren(elementId: string): boolean;
    addChangeListener(listener: ValueChangeListener): void;
    removeChangeListener(listener: ValueChangeListener): boolean;
    delete(elementId: string): boolean;
    clear(): void;
    stats(): {
        values: number;
        instances: number;
        types: number;
        namespaces: number;
        relationshipTypes: number;
        relationships: number;
    };
    private ensureParentExists;
    private inferParentId;
    private addToIndex;
    private removeFromIndex;
}
export declare const objectStore: ObjectStore;

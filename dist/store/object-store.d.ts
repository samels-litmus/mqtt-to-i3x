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
export type ValueChangeListener = (elementId: string, value: ObjectValue, instance?: ObjectInstance) => void;
export declare class ObjectStore {
    private values;
    private instances;
    private types;
    private namespaces;
    private byNamespace;
    private byType;
    private listeners;
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
    addChangeListener(listener: ValueChangeListener): void;
    removeChangeListener(listener: ValueChangeListener): boolean;
    delete(elementId: string): boolean;
    clear(): void;
    stats(): {
        values: number;
        instances: number;
        types: number;
        namespaces: number;
    };
    private addToIndex;
    private removeFromIndex;
}
export declare const objectStore: ObjectStore;

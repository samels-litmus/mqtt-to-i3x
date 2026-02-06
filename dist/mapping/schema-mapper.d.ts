import { MappingRule } from '../config/loader.js';
import { TemplateCapture } from './template.js';
export interface ObjectValue {
    elementId: string;
    value: unknown;
    timestamp: string;
    quality?: string;
}
export interface ObjectInstance {
    elementId: string;
    displayName: string;
    typeId: string;
    isComposition: boolean;
    namespaceUri: string;
}
export interface MappedResult {
    elementId: string;
    value: ObjectValue;
    instance: ObjectInstance;
}
export declare class SchemaMapper {
    map(rule: MappingRule, topic: string, captures: TemplateCapture, decoded: unknown, receiveTime?: Date): MappedResult;
    private extractValue;
    private extractTimestamp;
    private extractQuality;
    private jsonPathExtract;
}
export declare const schemaMapper: SchemaMapper;

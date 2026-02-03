import { MappingRule } from '../config/loader.js';
import { CompiledTemplate, TemplateCapture } from './template.js';
export interface CompiledRule {
    rule: MappingRule;
    compiled: CompiledTemplate;
}
export interface MatchResult {
    rule: MappingRule;
    captures: TemplateCapture;
}
export declare class MappingEngine {
    private rules;
    addRule(rule: MappingRule): void;
    addRules(rules: MappingRule[]): void;
    removeRule(id: string): boolean;
    match(topic: string): MatchResult | null;
    matchAll(topic: string): MatchResult[];
    getRule(id: string): MappingRule | undefined;
    listRules(): MappingRule[];
    getTopicPatterns(): string[];
    clear(): void;
}
export declare const mappingEngine: MappingEngine;

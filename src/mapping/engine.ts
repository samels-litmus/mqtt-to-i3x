import { MappingRule } from '../config/loader.js';
import {
  CompiledTemplate,
  TemplateCapture,
  compileTopicPattern,
  matchTopic,
} from './template.js';

export interface CompiledRule {
  rule: MappingRule;
  compiled: CompiledTemplate;
}

export interface MatchResult {
  rule: MappingRule;
  captures: TemplateCapture;
}

export class MappingEngine {
  private rules: CompiledRule[] = [];

  addRule(rule: MappingRule): void {
    this.rules.push({
      rule,
      compiled: compileTopicPattern(rule.topicPattern),
    });
  }

  addRules(rules: MappingRule[]): void {
    for (const rule of rules) {
      this.addRule(rule);
    }
  }

  removeRule(id: string): boolean {
    const index = this.rules.findIndex((r) => r.rule.id === id);
    if (index === -1) return false;
    this.rules.splice(index, 1);
    return true;
  }

  match(topic: string): MatchResult | null {
    for (const { rule, compiled } of this.rules) {
      const captures = matchTopic(topic, compiled);
      if (captures) {
        return { rule, captures };
      }
    }
    return null;
  }

  matchAll(topic: string): MatchResult[] {
    const results: MatchResult[] = [];
    for (const { rule, compiled } of this.rules) {
      const captures = matchTopic(topic, compiled);
      if (captures) {
        results.push({ rule, captures });
      }
    }
    return results;
  }

  getRule(id: string): MappingRule | undefined {
    return this.rules.find((r) => r.rule.id === id)?.rule;
  }

  listRules(): MappingRule[] {
    return this.rules.map((r) => r.rule);
  }

  getTopicPatterns(): string[] {
    return this.rules.map((r) => r.rule.topicPattern);
  }

  clear(): void {
    this.rules = [];
  }
}

export const mappingEngine = new MappingEngine();

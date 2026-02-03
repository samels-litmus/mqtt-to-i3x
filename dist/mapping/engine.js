import { compileTopicPattern, matchTopic, } from './template.js';
export class MappingEngine {
    rules = [];
    addRule(rule) {
        this.rules.push({
            rule,
            compiled: compileTopicPattern(rule.topicPattern),
        });
    }
    addRules(rules) {
        for (const rule of rules) {
            this.addRule(rule);
        }
    }
    removeRule(id) {
        const index = this.rules.findIndex((r) => r.rule.id === id);
        if (index === -1)
            return false;
        this.rules.splice(index, 1);
        return true;
    }
    match(topic) {
        for (const { rule, compiled } of this.rules) {
            const captures = matchTopic(topic, compiled);
            if (captures) {
                return { rule, captures };
            }
        }
        return null;
    }
    matchAll(topic) {
        const results = [];
        for (const { rule, compiled } of this.rules) {
            const captures = matchTopic(topic, compiled);
            if (captures) {
                results.push({ rule, captures });
            }
        }
        return results;
    }
    getRule(id) {
        return this.rules.find((r) => r.rule.id === id)?.rule;
    }
    listRules() {
        return this.rules.map((r) => r.rule);
    }
    getTopicPatterns() {
        return this.rules.map((r) => r.rule.topicPattern);
    }
    clear() {
        this.rules = [];
    }
}
export const mappingEngine = new MappingEngine();

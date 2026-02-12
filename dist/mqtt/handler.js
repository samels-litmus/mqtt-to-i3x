import { extract } from '../extraction/byte-extractor.js';
import { codecRegistry } from '../codecs/registry.js';
import { PayloadDecomposer } from '../mapping/decomposer.js';
export class MessageHandler {
    mappingEngine;
    schemaMapper;
    objectStore;
    decomposer = new PayloadDecomposer();
    stats = {
        received: 0,
        matched: 0,
        processed: 0,
        decomposed: 0,
        errors: 0,
    };
    constructor(deps) {
        this.mappingEngine = deps.mappingEngine;
        this.schemaMapper = deps.schemaMapper;
        this.objectStore = deps.objectStore;
    }
    handle(topic, payload) {
        this.stats.received++;
        const receiveTime = new Date();
        const matchResult = this.mappingEngine.match(topic);
        if (!matchResult) {
            return null;
        }
        this.stats.matched++;
        const { rule, captures } = matchResult;
        try {
            const extracted = extract(payload, rule.extraction);
            const decoded = codecRegistry.decode(rule.codec, extracted, rule.codecOptions);
            if (decoded === undefined) {
                this.stats.errors++;
                return null;
            }
            const mapped = this.schemaMapper.map(rule, topic, captures, decoded, receiveTime);
            this.objectStore.upsert(mapped.elementId, mapped.value, mapped.instance);
            // Decompose rich payloads into child objects if configured
            if (rule.decompose?.enabled) {
                const children = this.decomposer.decompose(decoded, mapped, rule.decompose);
                for (const { result: child, parentComponentId } of children) {
                    this.objectStore.upsert(child.elementId, child.value, child.instance);
                    this.objectStore.addRelationship(parentComponentId, child.elementId, 'HasComponent');
                    this.objectStore.addRelationship(child.elementId, parentComponentId, 'ComponentOf');
                }
                this.stats.decomposed += children.length;
            }
            this.stats.processed++;
            return { topic, matchResult, mapped };
        }
        catch {
            this.stats.errors++;
            return null;
        }
    }
    getStats() {
        return { ...this.stats };
    }
    resetStats() {
        this.stats = {
            received: 0,
            matched: 0,
            processed: 0,
            decomposed: 0,
            errors: 0,
        };
    }
}
export function attachHandler(client, handler) {
    client.on('message', (topic, payload) => {
        handler.handle(topic, payload);
    });
}
export function createMessageHandler(deps) {
    return new MessageHandler(deps);
}

import { renderTemplate } from './template.js';
export class SchemaMapper {
    map(rule, topic, captures, decoded, receiveTime) {
        const elementId = rule.elementIdTemplate
            ? renderTemplate(rule.elementIdTemplate, captures)
            : topic.replace(/\//g, '.');
        const value = this.extractValue(decoded, rule.valueExtractor);
        const timestamp = this.extractTimestamp(decoded, rule.timestampExtractor, receiveTime);
        const quality = this.extractQuality(decoded, rule.qualityExtractor);
        const namespaceUri = rule.namespaceUri
            ? renderTemplate(rule.namespaceUri, captures)
            : captures['namespace'] ?? 'urn:default';
        const typeId = rule.objectTypeId
            ? renderTemplate(rule.objectTypeId, captures)
            : 'GenericObject';
        const displayName = rule.displayNameTemplate
            ? renderTemplate(rule.displayNameTemplate, captures)
            : elementId;
        return {
            elementId,
            value: {
                elementId,
                value,
                timestamp,
                quality,
            },
            instance: {
                elementId,
                displayName,
                typeId,
                namespaceUri,
                isComposition: false,
            },
        };
    }
    extractValue(decoded, extractor) {
        if (!extractor)
            return decoded;
        return this.jsonPathExtract(decoded, extractor) ?? decoded;
    }
    extractTimestamp(decoded, extractor, receiveTime) {
        if (extractor) {
            const extracted = this.jsonPathExtract(decoded, extractor);
            if (typeof extracted === 'string')
                return extracted;
            if (typeof extracted === 'number')
                return new Date(extracted).toISOString();
        }
        return (receiveTime ?? new Date()).toISOString();
    }
    extractQuality(decoded, extractor) {
        if (!extractor)
            return undefined;
        const extracted = this.jsonPathExtract(decoded, extractor);
        return typeof extracted === 'string' ? extracted : undefined;
    }
    jsonPathExtract(obj, path) {
        if (typeof obj !== 'object' || obj === null)
            return undefined;
        const normalized = path.startsWith('$.') ? path.slice(2) : path;
        const parts = normalized.split('.');
        let current = obj;
        for (const part of parts) {
            if (current === null || current === undefined)
                return undefined;
            if (typeof current !== 'object')
                return undefined;
            const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
            if (arrayMatch) {
                const key = arrayMatch[1];
                const index = parseInt(arrayMatch[2], 10);
                const arr = current[key];
                if (!Array.isArray(arr))
                    return undefined;
                current = arr[index];
            }
            else {
                current = current[part];
            }
        }
        return current;
    }
}
export const schemaMapper = new SchemaMapper();

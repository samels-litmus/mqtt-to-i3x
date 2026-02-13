import { MappingRule } from '../config/loader.js';
import { TemplateCapture, renderTemplate } from './template.js';

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

export class SchemaMapper {
  map(
    rule: MappingRule,
    topic: string,
    captures: TemplateCapture,
    decoded: unknown,
    receiveTime?: Date
  ): MappedResult {
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
      : 'GenericTag';

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

  private extractValue(decoded: unknown, extractor?: string): unknown {
    if (!extractor) return decoded;
    return this.jsonPathExtract(decoded, extractor) ?? decoded;
  }

  private extractTimestamp(
    decoded: unknown,
    extractor?: string,
    receiveTime?: Date
  ): string {
    if (extractor) {
      const extracted = this.jsonPathExtract(decoded, extractor);
      if (typeof extracted === 'string') return extracted;
      if (typeof extracted === 'number') return new Date(extracted).toISOString();
    }
    return (receiveTime ?? new Date()).toISOString();
  }

  private extractQuality(decoded: unknown, extractor?: string): string | undefined {
    if (!extractor) return undefined;
    const extracted = this.jsonPathExtract(decoded, extractor);
    return typeof extracted === 'string' ? extracted : undefined;
  }

  private jsonPathExtract(obj: unknown, path: string): unknown {
    if (typeof obj !== 'object' || obj === null) return undefined;

    const normalized = path.startsWith('$.') ? path.slice(2) : path;
    const parts = normalized.split('.');

    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;

      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const key = arrayMatch[1];
        const index = parseInt(arrayMatch[2], 10);
        const arr = (current as Record<string, unknown>)[key];
        if (!Array.isArray(arr)) return undefined;
        current = arr[index];
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }
    return current;
  }
}

export const schemaMapper = new SchemaMapper();

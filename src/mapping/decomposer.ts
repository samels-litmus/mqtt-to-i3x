import { DecomposeConfig } from '../config/loader.js';
import { MappedResult, ObjectValue, ObjectInstance } from './schema-mapper.js';

export interface DecomposedEntry {
  result: MappedResult;
  parentComponentId: string;
}

const ABELARA_META = new Set(['_model', '_name', '_path']);

export class PayloadDecomposer {
  decompose(
    decoded: unknown,
    primary: MappedResult,
    config: DecomposeConfig
  ): DecomposedEntry[] {
    if (!config.enabled) return [];
    if (typeof decoded !== 'object' || decoded === null) return [];

    const root = config.root
      ? jsonPathExtract(decoded, config.root)
      : decoded;

    if (typeof root !== 'object' || root === null || Array.isArray(root)) return [];

    const entries: DecomposedEntry[] = [];
    const maxDepth = config.maxDepth ?? 10;
    const exclude = new Set(config.excludeFields ?? []);

    this.walk(
      root as Record<string, unknown>,
      primary.elementId,
      primary.instance.namespaceUri,
      primary.value.timestamp,
      primary.value.quality,
      config,
      exclude,
      entries,
      0,
      maxDepth
    );

    return entries;
  }

  private walk(
    obj: Record<string, unknown>,
    parentId: string,
    ns: string,
    timestamp: string,
    quality: string | undefined,
    config: DecomposeConfig,
    exclude: Set<string>,
    out: DecomposedEntry[],
    depth: number,
    maxDepth: number
  ): void {
    if (maxDepth !== 0 && depth >= maxDepth) return;

    for (const [key, value] of Object.entries(obj)) {
      if (exclude.has(key)) continue;
      if (ABELARA_META.has(key)) continue;

      const isObj =
        typeof value === 'object' && value !== null && !Array.isArray(value);

      if (isObj && this.isChild(value as Record<string, unknown>, config.strategy)) {
        // Nested component — create instance and recurse
        const child = value as Record<string, unknown>;
        const childId = this.childId(parentId, key, child, config.childIdStrategy);
        const displayName = this.displayName(key, child, config.strategy);
        const typeId = this.typeId(child, config.strategy);

        const instance: ObjectInstance = {
          elementId: childId,
          displayName,
          typeId,
          isComposition: false,
          namespaceUri: ns,
        };

        const scalars = this.scalars(child, exclude);

        const val: ObjectValue = {
          elementId: childId,
          value: Object.keys(scalars).length > 0 ? scalars : null,
          timestamp,
          quality,
        };

        out.push({ result: { elementId: childId, value: val, instance }, parentComponentId: parentId });

        // Recurse into nested children
        this.walk(child, childId, ns, timestamp, quality, config, exclude, out, depth + 1, maxDepth);
      } else {
        // Scalar (or array) property — create leaf child
        const childId = `${parentId}.${sanitize(key)}`;

        const instance: ObjectInstance = {
          elementId: childId,
          displayName: key,
          typeId: 'ScalarProperty',
          isComposition: false,
          namespaceUri: ns,
        };

        const val: ObjectValue = {
          elementId: childId,
          value,
          timestamp,
          quality,
        };

        out.push({ result: { elementId: childId, value: val, instance }, parentComponentId: parentId });
      }
    }
  }

  private isChild(obj: Record<string, unknown>, strategy: DecomposeConfig['strategy']): boolean {
    if (strategy === 'abelara') {
      return typeof obj._name === 'string' || typeof obj._model === 'string';
    }
    if (strategy === 'flat') {
      return Object.keys(obj).length > 0;
    }
    // auto: abelara markers first, then flat
    return (typeof obj._name === 'string' || typeof obj._model === 'string') ||
      Object.keys(obj).length > 0;
  }

  private childId(
    parentId: string,
    key: string,
    obj: Record<string, unknown>,
    strategy?: DecomposeConfig['childIdStrategy']
  ): string {
    if (strategy === 'path' && typeof obj._path === 'string') {
      return (obj._path as string).replace(/\//g, '.');
    }
    return `${parentId}.${sanitize(key)}`;
  }

  private displayName(
    key: string,
    obj: Record<string, unknown>,
    strategy: DecomposeConfig['strategy']
  ): string {
    if (
      (strategy === 'abelara' || strategy === 'auto') &&
      typeof obj._name === 'string'
    ) {
      return obj._name as string;
    }
    return key;
  }

  private typeId(obj: Record<string, unknown>, strategy: DecomposeConfig['strategy']): string {
    if (
      (strategy === 'abelara' || strategy === 'auto') &&
      typeof obj._model === 'string'
    ) {
      const segments = (obj._model as string).split('/');
      return segments[segments.length - 1];
    }
    return 'DecomposedComponent';
  }

  private scalars(
    obj: Record<string, unknown>,
    exclude: Set<string>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (exclude.has(k) || ABELARA_META.has(k)) continue;
      if (typeof v !== 'object' || v === null || Array.isArray(v)) {
        result[k] = v;
      }
    }
    return result;
  }
}

function sanitize(key: string): string {
  return key.replace(/[./]/g, '_');
}

function jsonPathExtract(obj: unknown, path: string): unknown {
  if (typeof obj !== 'object' || obj === null) return undefined;
  const normalized = path.startsWith('$.') ? path.slice(2) : path;
  let current: unknown = obj;
  for (const part of normalized.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export const payloadDecomposer = new PayloadDecomposer();

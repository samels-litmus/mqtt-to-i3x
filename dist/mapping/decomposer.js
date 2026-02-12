const ABELARA_META = new Set(['_model', '_name', '_path']);
export class PayloadDecomposer {
    decompose(decoded, primary, config) {
        if (!config.enabled)
            return [];
        if (typeof decoded !== 'object' || decoded === null)
            return [];
        const root = config.root
            ? jsonPathExtract(decoded, config.root)
            : decoded;
        if (typeof root !== 'object' || root === null || Array.isArray(root))
            return [];
        const entries = [];
        const maxDepth = config.maxDepth ?? 10;
        const exclude = new Set(config.excludeFields ?? []);
        this.walk(root, primary.elementId, primary.instance.namespaceUri, primary.value.timestamp, primary.value.quality, config, exclude, entries, 0, maxDepth);
        return entries;
    }
    walk(obj, parentId, ns, timestamp, quality, config, exclude, out, depth, maxDepth) {
        if (maxDepth !== 0 && depth >= maxDepth)
            return;
        for (const [key, value] of Object.entries(obj)) {
            if (exclude.has(key))
                continue;
            if (ABELARA_META.has(key))
                continue;
            const isObj = typeof value === 'object' && value !== null && !Array.isArray(value);
            if (isObj && this.isChild(value, config.strategy)) {
                // Nested component — create instance and recurse
                const child = value;
                const childId = this.childId(parentId, key, child, config.childIdStrategy);
                const displayName = this.displayName(key, child, config.strategy);
                const typeId = this.typeId(child, config.strategy);
                const instance = {
                    elementId: childId,
                    displayName,
                    typeId,
                    isComposition: false,
                    namespaceUri: ns,
                };
                const scalars = this.scalars(child, exclude);
                const val = {
                    elementId: childId,
                    value: Object.keys(scalars).length > 0 ? scalars : null,
                    timestamp,
                    quality,
                };
                out.push({ result: { elementId: childId, value: val, instance }, parentComponentId: parentId });
                // Recurse into nested children
                this.walk(child, childId, ns, timestamp, quality, config, exclude, out, depth + 1, maxDepth);
            }
            else {
                // Scalar (or array) property — create leaf child
                const childId = `${parentId}.${sanitize(key)}`;
                const instance = {
                    elementId: childId,
                    displayName: key,
                    typeId: 'ScalarProperty',
                    isComposition: false,
                    namespaceUri: ns,
                };
                const val = {
                    elementId: childId,
                    value,
                    timestamp,
                    quality,
                };
                out.push({ result: { elementId: childId, value: val, instance }, parentComponentId: parentId });
            }
        }
    }
    isChild(obj, strategy) {
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
    childId(parentId, key, obj, strategy) {
        if (strategy === 'path' && typeof obj._path === 'string') {
            return obj._path.replace(/\//g, '.');
        }
        return `${parentId}.${sanitize(key)}`;
    }
    displayName(key, obj, strategy) {
        if ((strategy === 'abelara' || strategy === 'auto') &&
            typeof obj._name === 'string') {
            return obj._name;
        }
        return key;
    }
    typeId(obj, strategy) {
        if ((strategy === 'abelara' || strategy === 'auto') &&
            typeof obj._model === 'string') {
            const segments = obj._model.split('/');
            return segments[segments.length - 1];
        }
        return 'DecomposedComponent';
    }
    scalars(obj, exclude) {
        const result = {};
        for (const [k, v] of Object.entries(obj)) {
            if (exclude.has(k) || ABELARA_META.has(k))
                continue;
            if (typeof v !== 'object' || v === null || Array.isArray(v)) {
                result[k] = v;
            }
        }
        return result;
    }
}
function sanitize(key) {
    return key.replace(/[./]/g, '_');
}
function jsonPathExtract(obj, path) {
    if (typeof obj !== 'object' || obj === null)
        return undefined;
    const normalized = path.startsWith('$.') ? path.slice(2) : path;
    let current = obj;
    for (const part of normalized.split('.')) {
        if (current === null || current === undefined || typeof current !== 'object')
            return undefined;
        current = current[part];
    }
    return current;
}
export const payloadDecomposer = new PayloadDecomposer();

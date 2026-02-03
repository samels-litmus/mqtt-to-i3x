import { readFileSync } from 'fs';
import { parse } from 'yaml';
export function loadConfig(path) {
    const content = readFileSync(path, 'utf8');
    return parse(content);
}

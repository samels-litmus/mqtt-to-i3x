import { DecomposeConfig } from '../config/loader.js';
import { MappedResult } from './schema-mapper.js';
export interface DecomposedEntry {
    result: MappedResult;
    parentComponentId: string;
}
export declare class PayloadDecomposer {
    decompose(decoded: unknown, primary: MappedResult, config: DecomposeConfig): DecomposedEntry[];
    private walk;
    private isChild;
    private childId;
    private displayName;
    private typeId;
    private scalars;
}
export declare const payloadDecomposer: PayloadDecomposer;

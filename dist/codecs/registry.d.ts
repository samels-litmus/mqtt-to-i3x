import { Codec } from './types.js';
declare class CodecRegistry {
    private codecs;
    register(codec: Codec): void;
    get(name: string): Codec | undefined;
    decode(name: string, input: Buffer, options?: Record<string, unknown>): unknown;
    has(name: string): boolean;
    list(): string[];
}
export declare const codecRegistry: CodecRegistry;
export {};

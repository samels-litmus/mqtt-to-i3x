export interface Codec {
    name: string;
    decode(input: Buffer, options?: Record<string, unknown>): unknown;
    schema?: unknown;
}
export type Endian = 'big' | 'little';

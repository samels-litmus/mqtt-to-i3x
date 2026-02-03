export interface ByteExtraction {
    bitOffset?: number;
    bitLength?: number;
    byteOffset?: number;
    byteLength?: number;
    endian?: 'big' | 'little';
}
export declare function extract(payload: Buffer, spec?: ByteExtraction): Buffer;

export interface ByteExtraction {
  bitOffset?: number;
  bitLength?: number;
  byteOffset?: number;
  byteLength?: number;
  endian?: 'big' | 'little';
}

export function extract(payload: Buffer, spec?: ByteExtraction): Buffer {
  if (!spec || (spec.bitOffset === undefined && spec.byteOffset === undefined)) {
    return payload;
  }

  if (spec.bitOffset !== undefined && spec.bitLength !== undefined) {
    return extractBits(payload, spec.bitOffset, spec.bitLength);
  }

  if (spec.byteOffset !== undefined) {
    const start = spec.byteOffset;
    const length = spec.byteLength ?? (payload.length - start);
    const end = start + length;
    if (start < 0 || end > payload.length) return Buffer.alloc(0);
    return payload.subarray(start, end);
  }

  return payload;
}

function extractBits(payload: Buffer, bitOffset: number, bitLength: number): Buffer {
  if (bitLength <= 0 || bitOffset < 0) return Buffer.alloc(0);

  const totalBits = payload.length * 8;
  if (bitOffset >= totalBits) return Buffer.alloc(0);

  const effectiveLength = Math.min(bitLength, totalBits - bitOffset);
  const resultBytes = Math.ceil(effectiveLength / 8);
  const result = Buffer.alloc(resultBytes);

  for (let i = 0; i < effectiveLength; i++) {
    const srcBitIndex = bitOffset + i;
    const srcByteIndex = Math.floor(srcBitIndex / 8);
    const srcBitPos = 7 - (srcBitIndex % 8);

    const bit = (payload[srcByteIndex] >> srcBitPos) & 1;

    const dstBitIndex = (resultBytes * 8 - effectiveLength) + i;
    const dstByteIndex = Math.floor(dstBitIndex / 8);
    const dstBitPos = 7 - (dstBitIndex % 8);

    if (bit) {
      result[dstByteIndex] |= (1 << dstBitPos);
    }
  }

  return result;
}

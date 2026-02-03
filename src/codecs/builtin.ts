import { Codec, Endian } from './types.js';
import { codecRegistry } from './registry.js';

function getEndian(options?: Record<string, unknown>): Endian {
  return (options?.endian as Endian) ?? 'big';
}

const raw: Codec = {
  name: 'raw',
  decode: (input) => input,
};

const utf8: Codec = {
  name: 'utf8',
  decode: (input) => input.toString('utf8'),
};

const json: Codec = {
  name: 'json',
  decode: (input) => {
    try {
      return JSON.parse(input.toString('utf8'));
    } catch {
      return undefined;
    }
  },
};

const base64: Codec = {
  name: 'base64',
  decode: (input) => Buffer.from(input.toString('utf8'), 'base64'),
};

const uint8: Codec = {
  name: 'uint8',
  decode: (input) => (input.length >= 1 ? input[0] : undefined),
};

const int8: Codec = {
  name: 'int8',
  decode: (input) => (input.length >= 1 ? input.readInt8(0) : undefined),
};

const uint16: Codec = {
  name: 'uint16',
  decode: (input, options) => {
    if (input.length < 2) return undefined;
    return getEndian(options) === 'big' ? input.readUInt16BE(0) : input.readUInt16LE(0);
  },
};

const int16: Codec = {
  name: 'int16',
  decode: (input, options) => {
    if (input.length < 2) return undefined;
    return getEndian(options) === 'big' ? input.readInt16BE(0) : input.readInt16LE(0);
  },
};

const uint32: Codec = {
  name: 'uint32',
  decode: (input, options) => {
    if (input.length < 4) return undefined;
    return getEndian(options) === 'big' ? input.readUInt32BE(0) : input.readUInt32LE(0);
  },
};

const int32: Codec = {
  name: 'int32',
  decode: (input, options) => {
    if (input.length < 4) return undefined;
    return getEndian(options) === 'big' ? input.readInt32BE(0) : input.readInt32LE(0);
  },
};

const float32: Codec = {
  name: 'float32',
  decode: (input, options) => {
    if (input.length < 4) return undefined;
    return getEndian(options) === 'big' ? input.readFloatBE(0) : input.readFloatLE(0);
  },
};

const float64: Codec = {
  name: 'float64',
  decode: (input, options) => {
    if (input.length < 8) return undefined;
    return getEndian(options) === 'big' ? input.readDoubleBE(0) : input.readDoubleLE(0);
  },
};

const protobuf: Codec = {
  name: 'protobuf',
  decode: (_input, _options) => {
    // Stub: requires protobufjs and schema loading
    return undefined;
  },
};

const msgpack: Codec = {
  name: 'msgpack',
  decode: (_input, _options) => {
    // Stub: requires @msgpack/msgpack
    return undefined;
  },
};

export function registerBuiltinCodecs(): void {
  [raw, utf8, json, base64, uint8, int8, uint16, int16, uint32, int32, float32, float64, protobuf, msgpack]
    .forEach((codec) => codecRegistry.register(codec));
}

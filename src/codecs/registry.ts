import { Codec } from './types.js';

class CodecRegistry {
  private codecs = new Map<string, Codec>();

  register(codec: Codec): void {
    this.codecs.set(codec.name, codec);
  }

  get(name: string): Codec | undefined {
    return this.codecs.get(name);
  }

  decode(name: string, input: Buffer, options?: Record<string, unknown>): unknown {
    const codec = this.codecs.get(name);
    if (!codec) return undefined;
    try {
      return codec.decode(input, options);
    } catch {
      return undefined;
    }
  }

  has(name: string): boolean {
    return this.codecs.has(name);
  }

  list(): string[] {
    return Array.from(this.codecs.keys());
  }
}

export const codecRegistry = new CodecRegistry();

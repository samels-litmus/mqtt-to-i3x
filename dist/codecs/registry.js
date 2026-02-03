class CodecRegistry {
    codecs = new Map();
    register(codec) {
        this.codecs.set(codec.name, codec);
    }
    get(name) {
        return this.codecs.get(name);
    }
    decode(name, input, options) {
        const codec = this.codecs.get(name);
        if (!codec)
            return undefined;
        try {
            return codec.decode(input, options);
        }
        catch {
            return undefined;
        }
    }
    has(name) {
        return this.codecs.has(name);
    }
    list() {
        return Array.from(this.codecs.keys());
    }
}
export const codecRegistry = new CodecRegistry();

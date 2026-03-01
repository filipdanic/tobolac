export interface Serializer {
  serialize(value: unknown): Buffer;
  deserialize<T>(value: Buffer): T;
}

export const jsonSerializer: Serializer = {
  serialize(value: unknown) {
    return Buffer.from(JSON.stringify(value));
  },
  deserialize<T>(value: Buffer) {
    return JSON.parse(value.toString("utf8")) as T;
  }
};

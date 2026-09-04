export type FileSystem = {
  readBytes(path: string): Promise<Uint8Array | null>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
};

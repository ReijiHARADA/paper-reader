import { gunzipSync, gzipSync } from "fflate";

export function gzipJson(value: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(value));
  return gzipSync(json, { level: 6 });
}

export function gunzipJson<T>(bytes: Uint8Array): T {
  const raw = gunzipSync(bytes);
  return JSON.parse(new TextDecoder().decode(raw)) as T;
}

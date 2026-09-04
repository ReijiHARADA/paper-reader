/**
 * 翻訳サーバーが起動するまでポーリングする
 * Tauri アプリ環境でのみ実行（Web ブラウザ直接アクセスは無視）
 */
import { resolveMadladServerUrl } from "../services/translation/madladEngine";

export const SERVER_URL = resolveMadladServerUrl();
const HEALTH_ENDPOINT = `${SERVER_URL}/health`;

export function isTauriApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function waitForServer(
  onProgress?: (attempt: number) => void,
  maxAttempts = 90,
  intervalMs = 1000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(HEALTH_ENDPOINT, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    onProgress?.(i + 1);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Translation server did not start in time.");
}

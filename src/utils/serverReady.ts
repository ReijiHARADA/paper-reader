/**
 * 翻訳サーバーが起動するまでポーリングする
 * Tauri アプリ環境でのみ実行（Web ブラウザ直接アクセスは無視）
 */
import { resolveMadladServerUrl } from "../services/translation/madladEngine";

export const SERVER_URL = resolveMadladServerUrl();
const HEALTH_ENDPOINT = `${SERVER_URL}/health`;

type ReadyListener = () => void;

const readyListeners = new Set<ReadyListener>();
let translationServerReady = false;

/** Test-only: clear ready flag and listeners between cases. */
export function resetTranslationServerReadyForTests(): void {
  translationServerReady = false;
  readyListeners.clear();
}

export function isTauriApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isTranslationServerReady(): boolean {
  // Browser `npm run dev` does not manage the sidecar; treat as ready and rely
  // on per-request /health checks when importing.
  if (!isTauriApp()) return true;
  return translationServerReady;
}

/** Notify importers / readers that MADLAD is reachable. */
export function markTranslationServerReady(): void {
  if (translationServerReady) return;
  translationServerReady = true;
  for (const listener of [...readyListeners]) {
    try {
      listener();
    } catch (error) {
      console.error("Translation server ready listener failed:", error);
    }
  }
}

export function subscribeTranslationServerReady(listener: ReadyListener): () => void {
  readyListeners.add(listener);
  if (isTranslationServerReady()) {
    queueMicrotask(listener);
  }
  return () => {
    readyListeners.delete(listener);
  };
}

export async function waitForServer(
  onProgress?: (attempt: number) => void,
  maxAttempts = 90,
  intervalMs = 1000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(HEALTH_ENDPOINT, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { model_loaded?: boolean } | null;
        // Prefer model_loaded when the payload includes it; older health bodies may omit it.
        if (!data || data.model_loaded !== false) {
          markTranslationServerReady();
          return;
        }
      }
    } catch {
      // not ready yet
    }
    onProgress?.(i + 1);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Translation server did not start in time.");
}

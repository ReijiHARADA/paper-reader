import { isTauriApp } from "../utils/serverReady";

export async function openExternalUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("http(s) の URL だけ開けます");
  }
  if (isTauriApp()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external_url", { url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

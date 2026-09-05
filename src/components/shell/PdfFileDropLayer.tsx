import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Upload } from "lucide-react";
import {
  fileFromDroppedPath,
  firstPdfPath,
  importWorkspaceNodeIdFromLocation,
  tryStartPdfImport,
} from "../../services/pdfImport";
import { showToast } from "../../stores/toastStore";
import { isTauriApp } from "../../utils/serverReady";
import styles from "./PdfFileDropLayer.module.css";

function dragHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export function PdfFileDropLayer() {
  const location = useLocation();
  const [hovering, setHovering] = useState(false);
  const [acceptedName, setAcceptedName] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const locationRef = useRef(location);
  locationRef.current = location;

  const importDroppedFile = useCallback(async (file: File) => {
    const loc = locationRef.current;
    if (loc.pathname.startsWith("/import")) return;
    const workspaceNodeId = importWorkspaceNodeIdFromLocation(loc.pathname, loc.search);
    setAcceptedName(file.name);
    window.setTimeout(() => setAcceptedName(null), 1600);
    await tryStartPdfImport(file, { workspaceNodeId });
  }, []);

  useEffect(() => {
    if (!isTauriApp()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const stop = await getCurrentWebview().onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setHovering(true);
          return;
        }
        if (payload.type === "leave") {
          setHovering(false);
          return;
        }
        setHovering(false);
        const path = firstPdfPath(payload.paths);
        if (!path) {
          showToast({ kind: "error", message: "PDF形式ではありません" });
          return;
        }
        void fileFromDroppedPath(path)
          .then((file) => importDroppedFile(file))
          .catch((error: unknown) => {
            console.error("Failed to read dropped PDF:", error);
            showToast({ kind: "error", message: "読み込みに失敗しました" });
          });
      });
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [importDroppedFile]);

  useEffect(() => {
    if (isTauriApp()) return;

    const onEnter = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setHovering(true);
    };
    const onOver = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
    };
    const onLeave = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setHovering(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setHovering(false);
      const file = event.dataTransfer?.files[0];
      if (file) void importDroppedFile(file);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [importDroppedFile]);

  if (location.pathname.startsWith("/import")) return null;
  if (!hovering && !acceptedName) return null;

  return (
    <div className={styles.overlay} role="status">
      <Upload size={64} />
      <p>{acceptedName ? `受け取りました: ${acceptedName}` : "PDFをドロップしてインポート"}</p>
    </div>
  );
}

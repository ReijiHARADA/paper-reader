import { useCallback, useState } from "react";
import { useAppStore, usePaperDataStore } from "../stores/appStore";
import { useProjectStore } from "../stores/projectStore";
import { deletePaperEverywhere } from "../services/paperDelete";

export function useDeletePaper() {
  const removePaper = useAppStore((s) => s.removePaper);
  const removePaperData = usePaperDataStore((s) => s.removePaperData);
  const removeMembershipsForPaper = useProjectStore((s) => s.removeMembershipsForPaper);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestDelete = useCallback((event: React.MouseEvent, paperId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    setPendingId(paperId);
  }, []);

  const cancelDelete = useCallback((event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    setPendingId(null);
    setError(null);
  }, []);

  const confirmDelete = useCallback(
    async (event: React.MouseEvent, paperId: string) => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await deletePaperEverywhere(paperId);
        removePaper(paperId);
        removePaperData(paperId);
        removeMembershipsForPaper(paperId);
        setPendingId(null);
      } catch (err) {
        console.error("Failed to delete paper:", err);
        setError("削除に失敗しました。もう一度試してください。");
      } finally {
        setBusy(false);
      }
    },
    [busy, removePaper, removePaperData, removeMembershipsForPaper]
  );

  return { pendingId, error, busy, requestDelete, cancelDelete, confirmDelete };
}

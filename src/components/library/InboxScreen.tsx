import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Plus, Inbox } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useProjectStore } from "../../stores/projectStore";
import { checkMADLADAvailability } from "../../services/importServiceV2";
import { setPendingImportFile } from "../../services/pendingImport";
import { PaperDeleteControls } from "./PaperDeleteControls";
import { PaperCard } from "./PaperCard";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import type { Paper } from "../../types/paper";
import styles from "./LibraryScreen.module.css";

export function InboxScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const papers = useAppStore((s) => s.papers);
  const setCurrentPaper = useAppStore((s) => s.setCurrentPaper);
  const memberships = useProjectStore((s) => s.memberships);
  const { pendingId, error, busy, requestDelete, cancelDelete, confirmDelete } =
    useDeletePaper();

  const assigned = new Set(memberships.map((m) => m.paperId));
  const inboxPapers = papers.filter((p) => !assigned.has(p.id));

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.includes("pdf")) { alert("PDFファイルのみ対応しています"); return; }
    const madladStatus = await checkMADLADAvailability();
    if (!madladStatus.available) {
      alert("翻訳サーバーに接続できません。\ntranslation-server で `python server.py` を実行してください。");
      return;
    }
    setPendingImportFile(file);
    navigate("/import");
  }, [navigate]);

  const handleOpen = (paper: Paper) => {
    if (pendingId === paper.id) return;
    setCurrentPaper(paper.id);
    navigate(`/reader/${paper.id}`);
  };

  return (
    <div className={styles.container}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className={styles.hiddenInput}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
      />

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Inbox size={20} style={{ color: "var(--color-accent)" }} />
          <h1 className={styles.title}>Inbox</h1>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.settingsButton} onClick={() => fileInputRef.current?.click()} title="PDFを追加">
            <Plus size={20} />
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {inboxPapers.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Upload size={64} strokeWidth={1} /></div>
            <h2 className={styles.emptyTitle}>Inboxは空です</h2>
            <p className={styles.emptyDescription}>
              どのプロジェクトにも属さない論文がここに入ります。カードをサイドバーのプロジェクトへドラッグすると追加できます。プロジェクトから戻すときは、この Inbox へドロップします。
            </p>
            <div className={styles.emptyActions}>
              <button className={styles.primaryButton} onClick={() => fileInputRef.current?.click()}>
                <Plus size={20} />PDFを追加
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.toolbar}>
              <button className={styles.addButton} onClick={() => fileInputRef.current?.click()}>
                <Plus size={20} />PDFを追加
              </button>
            </div>
            <div className={styles.paperList}>
              {inboxPapers.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  enabled={pendingId !== paper.id}
                  onOpen={() => handleOpen(paper)}
                  actions={
                    <PaperDeleteControls
                      paperId={paper.id}
                      pendingId={pendingId}
                      error={error}
                      busy={busy}
                      onRequest={requestDelete}
                      onConfirm={confirmDelete}
                      onCancel={cancelDelete}
                    />
                  }
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

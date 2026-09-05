import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, FolderX, Loader2, Plus } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { useImportJobStore, visibleImportJobs } from "../../stores/importJobStore";
import { filterPapersByLibraryQuery } from "../../domain/librarySearch";
import { derivePaperReadiness } from "../../domain/paperReadiness";
import { listPapersForWorkspace, removePaperFromWorkspace } from "../../services/projectService";
import { tryStartPdfImport } from "../../services/pdfImport";
import { PaperCard } from "../library/PaperCard";
import { PaperMenu } from "../library/PaperMenu";
import { ImportJobCard } from "../library/ImportJobCard";
import type { Paper } from "../../types/paper";
import styles from "./ProjectScreen.module.css";

/** Compatibility route component for /project/:id; every id is a WorkspaceNode. */
export function ProjectScreen() {
  const { projectId: nodeId } = useParams<{ projectId: string }>(); const navigate = useNavigate(); const setCurrentPaper = useAppStore((state) => state.setCurrentPaper);
  const storePapers = useLibraryCache((state) => state.papers); const blocks = useLibraryCache((state) => state.blocks); const searchQuery = useProjectStore((state) => state.searchQuery); const workspaceNodes = useProjectStore((state) => state.workspaceNodes); const memberships = useProjectStore((state) => state.memberships); const removeMembershipLocal = useProjectStore((state) => state.removeMembershipLocal);
  const importJobs = useImportJobStore((state) => state.jobs); const jobs = useMemo(() => visibleImportJobs(importJobs, { workspaceNodeId: nodeId }), [importJobs, nodeId]); const node = workspaceNodes.find((item) => item.id === nodeId);
  const [nodePapers, setNodePapers] = useState<Paper[]>([]); const [loading, setLoading] = useState(true); const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!nodeId) return; setLoading(true); void listPapersForWorkspace(nodeId).then(setNodePapers).finally(() => setLoading(false)); }, [nodeId, memberships]);
  const merged = useMemo(() => filterPapersByLibraryQuery(nodePapers.map((paper) => storePapers.find((item) => item.id === paper.id) ?? paper), searchQuery), [nodePapers, searchQuery, storePapers]);
  const file = useCallback(async (selected: File) => { if (nodeId) await tryStartPdfImport(selected, { workspaceNodeId: nodeId }); }, [nodeId]);
  if (!node && !loading) return <div className={styles.empty}><FolderX size={48} strokeWidth={1} /><p>ワークスペースが見つかりません</p></div>;
  return <div className={styles.container}><input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className={styles.hiddenInput} onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void file(selected); event.target.value = ""; }} /><header className={styles.header}><div><h1 className={styles.title}>{node?.name ?? "…"}</h1>{node?.description && <p className={styles.description}>{node.description}</p>}</div><div className={styles.headerActions}><button type="button" className={styles.addButton} onClick={() => fileInputRef.current?.click()}><Plus size={18} />論文を追加</button></div></header>
    {loading ? <div className={styles.loadingWrap}><Loader2 size={28} className={styles.spin} /><p>読み込み中...</p></div> : merged.length === 0 && jobs.length === 0 ? <div className={styles.emptyState}><FileText size={48} strokeWidth={1} /><p>{searchQuery.trim() ? "一致する論文がありません" : "まだ論文がありません"}</p><p className={styles.hint}>このフォルダと子フォルダ内の論文を表示します。</p></div> : <div className={styles.list}>{jobs.map((job) => <ImportJobCard key={job.id} job={job} />)}{merged.map((paper) => <PaperCard key={paper.id} paper={paper} onOpen={() => { const state = derivePaperReadiness({ processingStatus: paper.processingStatus, blocks: blocks[paper.id] }); if (state.canOpen) { setCurrentPaper(paper.id); navigate(`/reader/${paper.id}?workspace=${nodeId}`); } }} actions={<PaperMenu paper={paper} variant="workspace" onRemoveFromWorkspace={(paperId) => { if (nodeId) void removePaperFromWorkspace(nodeId, paperId).then(() => removeMembershipLocal(nodeId, paperId)); }} />} />)}</div>}
  </div>;
}

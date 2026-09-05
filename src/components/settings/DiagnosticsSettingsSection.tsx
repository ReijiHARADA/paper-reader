import { ChevronDown, RefreshCw } from "lucide-react";
import type { TranslationSettingsV2 } from "../../utils/translationSettings";
import type { ServiceStatus } from "./settingsTypes";
import styles from "./SettingsScreen.module.css";

type Props = { settings: TranslationSettingsV2; onChange: (patch: Partial<TranslationSettingsV2>) => void; madladStatus: ServiceStatus; ollamaStatus: ServiceStatus; onRecheck: () => void; sampleAlreadyAdded: boolean; isAddingSample: boolean; sampleMessage: string | null; onAddSample: () => void };
const state = (status: ServiceStatus) => status.checking ? "確認中" : status.available ? "正常" : "接続できません";
export function DiagnosticsSettingsSection({ settings, onChange, madladStatus, ollamaStatus, onRecheck, sampleAlreadyAdded, isAddingSample, sampleMessage, onAddSample }: Props) {
 const checking = madladStatus.checking || ollamaStatus.checking;
 return <><h2 className={styles.sectionTitle}>詳細設定</h2><div className={styles.surface}>
   <div className={styles.statusRows}><div><span>翻訳エンジン</span><small>MADLAD</small></div><b className={madladStatus.available ? styles.okDot : styles.errorDot}>● {state(madladStatus)}</b><div><span>用語解析</span><small>Ollama</small></div><b className={ollamaStatus.available ? styles.okDot : styles.errorDot}>● {state(ollamaStatus)}</b></div>
   <button type="button" className={styles.sectionButton} onClick={onRecheck} disabled={checking}><RefreshCw size={14} className={checking ? styles.spinning : ""}/>接続を再確認</button>
   <details className={styles.details}><summary className={styles.detailsSummary}>開発者向け <ChevronDown size={14}/></summary><div className={styles.devFields}>
     <label className={styles.label}>MADLAD Server URL<input className={styles.input} value={settings.madladServerUrl} onChange={(e) => onChange({ madladServerUrl: e.target.value })}/></label>
     <label className={styles.label}>Ollama Server URL<input className={styles.input} value={settings.ollamaServerUrl} onChange={(e) => onChange({ ollamaServerUrl: e.target.value })}/></label>
     <label className={styles.label}>Ollama Model<input className={styles.input} value={settings.ollamaModel} onChange={(e) => onChange({ ollamaModel: e.target.value })}/></label>
     <label className={styles.label}>Translation concurrency<input className={styles.input} type="number" min="1" max="8" value={settings.translationConcurrency} onChange={(e) => onChange({ translationConcurrency: Number(e.target.value) })}/></label>
     <button type="button" className={styles.sectionButton} onClick={onAddSample} disabled={sampleAlreadyAdded || isAddingSample}>{sampleAlreadyAdded ? "サンプル論文は追加済み" : isAddingSample ? "追加中..." : "サンプル論文を追加"}</button>{sampleMessage && <p className={styles.sectionStatus}>{sampleMessage}</p>}
   </div></details>
 </div></>;
}

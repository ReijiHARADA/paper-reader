import type { TranslationSettingsV2 } from "../../utils/translationSettings";
import type { ServiceStatus } from "./settingsTypes";
import styles from "./SettingsScreen.module.css";

type Props = { settings: TranslationSettingsV2; onChange: (patch: Partial<TranslationSettingsV2>) => void; madladStatus: ServiceStatus };
const speed = (value: number) => value <= 2 ? "stable" : value >= 8 ? "fast" : "standard";
const speedInfo = { stable: "負荷を抑えやすい / 翻訳はゆっくり", standard: "速度と負荷のバランスがよい設定です。", fast: "翻訳が速い / PCへの負荷が高め" };

export function TranslationSettingsSection({ settings, onChange, madladStatus }: Props) {
  const selected = speed(settings.translationConcurrency);
  return <>
    <h2 className={styles.sectionTitle}>翻訳</h2>
    <div className={styles.surface}>
      <div className={styles.settingBlock}>
        <label className={styles.toggleRow}><span><strong>用語集を自動生成</strong><small>論文内の専門用語を抽出し、訳し方を揃えます。</small></span><input aria-label="用語集を自動生成" type="checkbox" checked={settings.generateGlossary} onChange={(e) => onChange({ generateGlossary: e.target.checked })} /></label>
      </div>
      <div className={styles.settingBlock}>
        <h3 className={styles.surfaceTitle}>翻訳速度</h3>
        <p className={styles.sectionDescription}>翻訳の速さとPCへの負荷を選びます。</p>
        <div className={styles.segmented} role="radiogroup" aria-label="翻訳速度">
          {(["stable", "standard", "fast"] as const).map((id) => <button key={id} type="button" role="radio" aria-checked={selected === id} className={selected === id ? styles.selected : ""} onClick={() => onChange({ translationConcurrency: id === "stable" ? 2 : id === "standard" ? 4 : 8 })}>{id === "stable" ? "安定" : id === "standard" ? "標準" : "高速"}</button>)}
        </div>
        <p className={styles.speedHint}>{speedInfo[selected]}</p>
      </div>
      {!madladStatus.checking && !madladStatus.available && <p className={styles.connectionWarning}>翻訳エンジンに接続できません。詳細設定で確認してください。</p>}
    </div>
  </>;
}

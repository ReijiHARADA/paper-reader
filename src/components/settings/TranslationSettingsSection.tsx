import { AlertCircle, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import type { TranslationSettingsV2 } from "../../utils/translationSettings";
import type { ServiceStatus } from "./settingsTypes";
import styles from "./SettingsScreen.module.css";

type TranslationSettingsSectionProps = {
  settings: TranslationSettingsV2;
  onChange: (patch: Partial<TranslationSettingsV2>) => void;
  madladStatus: ServiceStatus;
  ollamaStatus: ServiceStatus;
  onCheckMadlad: () => void;
  onCheckOllama: () => void;
};

export function TranslationSettingsSection({
  settings,
  onChange,
  madladStatus,
  ollamaStatus,
  onCheckMadlad,
  onCheckOllama,
}: TranslationSettingsSectionProps) {
  return (
    <>
      <h2 className={styles.sectionTitle}>翻訳</h2>
      <div className={styles.surface}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={settings.generateGlossary}
            onChange={(e) => onChange({ generateGlossary: e.target.checked })}
          />
          <span>インポート時に用語集を自動生成</span>
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={settings.useCache}
            onChange={(e) => onChange({ useCache: e.target.checked })}
          />
          <span>翻訳結果をキャッシュ（再インポート時に高速化）</span>
        </label>
      </div>

      <details className={styles.details}>
        <summary className={styles.detailsSummary}>詳細設定</summary>
        <div className={styles.surface}>
          <h3 className={styles.surfaceTitle}>MADLAD</h3>
          <p className={styles.sectionDescription}>
            ローカルで動作する翻訳エンジン。英語→日本語の論文翻訳に使用します。
          </p>
          <div className={styles.field}>
            <label className={styles.label}>MADLAD Server URL</label>
            <input
              type="text"
              className={styles.input}
              value={settings.madladServerUrl}
              onChange={(e) => onChange({ madladServerUrl: e.target.value })}
              placeholder="http://127.0.0.1:8765"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              MADLAD 接続状態
              <button
                type="button"
                className={styles.refreshButton}
                onClick={onCheckMadlad}
                disabled={madladStatus.checking}
              >
                <RefreshCw
                  size={12}
                  className={madladStatus.checking ? styles.spinning : ""}
                />
              </button>
            </label>
            <StatusLine status={madladStatus} kind="madlad" />
          </div>
          {!madladStatus.available && !madladStatus.checking && (
            <div className={styles.installGuide}>
              <p className={styles.installTitle}>翻訳サーバーの起動方法</p>
              <ol className={styles.installSteps}>
                <li>
                  <code>cd translation-server</code>
                </li>
                <li>
                  <code>python3 -m venv venv && source venv/bin/activate</code>
                </li>
                <li>
                  <code>pip install -r requirements.txt</code>
                </li>
                <li>
                  <code>python server.py</code>
                </li>
              </ol>
            </div>
          )}
        </div>

        <div className={styles.surface}>
          <h3 className={styles.surfaceTitle}>Ollama</h3>
          <p className={styles.sectionDescription}>
            用語集の生成に使用します。翻訳には使用しません。
          </p>
          <div className={styles.field}>
            <label className={styles.label}>Ollama Server URL</label>
            <input
              type="text"
              className={styles.input}
              value={settings.ollamaServerUrl}
              onChange={(e) => onChange({ ollamaServerUrl: e.target.value })}
              placeholder="http://localhost:11434"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Ollama 接続状態
              <button
                type="button"
                className={styles.refreshButton}
                onClick={onCheckOllama}
                disabled={ollamaStatus.checking}
              >
                <RefreshCw
                  size={12}
                  className={ollamaStatus.checking ? styles.spinning : ""}
                />
              </button>
            </label>
            <StatusLine status={ollamaStatus} kind="ollama" />
          </div>
          {ollamaStatus.available &&
            ollamaStatus.models &&
            ollamaStatus.models.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label}>Ollama Model</label>
                <select
                  className={styles.select}
                  value={settings.ollamaModel}
                  onChange={(e) => onChange({ ollamaModel: e.target.value })}
                >
                  {ollamaStatus.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
        </div>

        <div className={styles.surface}>
          <h3 className={styles.surfaceTitle}>Translation concurrency</h3>
          <div className={styles.field}>
            <select
              className={styles.select}
              value={settings.translationConcurrency}
              onChange={(e) =>
                onChange({ translationConcurrency: parseInt(e.target.value, 10) })
              }
            >
              <option value={1}>1（逐次）</option>
              <option value={2}>2</option>
              <option value={4}>4</option>
              <option value={8}>8（推奨）</option>
            </select>
            <p className={styles.hint}>
              複数段落をサーバー側で1回の generate にまとめます。MPS 上の generate
              自体は1本のままです。
            </p>
          </div>
        </div>
      </details>
    </>
  );
}

function StatusLine({
  status,
  kind,
}: {
  status: ServiceStatus;
  kind: "madlad" | "ollama";
}) {
  if (status.checking) {
    return (
      <div className={styles.statusChecking}>
        <Loader2 size={16} className={styles.spinning} />
        <span>確認中...</span>
      </div>
    );
  }
  if (status.available) {
    return (
      <div className={styles.statusOk}>
        <CheckCircle size={16} />
        <span>
          {kind === "madlad"
            ? `接続OK${status.modelLoaded ? " - モデル読み込み済み" : " - モデル未読み込み"}`
            : `接続OK - ${status.models?.length || 0}個のモデル`}
        </span>
      </div>
    );
  }
  return (
    <div className={styles.statusError}>
      <AlertCircle size={16} />
      <span>{status.error || "接続できません"}</span>
    </div>
  );
}

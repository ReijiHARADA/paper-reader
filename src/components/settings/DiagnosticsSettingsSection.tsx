import { AlertCircle, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import type { ServiceStatus } from "./settingsTypes";
import styles from "./SettingsScreen.module.css";

type DiagnosticsSettingsSectionProps = {
  madladStatus: ServiceStatus;
  ollamaStatus: ServiceStatus;
  onRecheck: () => void;
};

export function DiagnosticsSettingsSection({
  madladStatus,
  ollamaStatus,
  onRecheck,
}: DiagnosticsSettingsSectionProps) {
  const checking = madladStatus.checking || ollamaStatus.checking;

  return (
    <>
      <h2 className={styles.sectionTitle}>診断</h2>
      <div className={styles.surface}>
        <div className={styles.diagHeader}>
          <h3 className={styles.surfaceTitle}>接続</h3>
          <button
            type="button"
            className={styles.sectionButton}
            onClick={onRecheck}
            disabled={checking}
          >
            <RefreshCw size={14} className={checking ? styles.spinning : ""} />
            再確認
          </button>
        </div>
        <dl className={styles.diagList}>
          <div className={styles.diagRow}>
            <dt>MADLAD 接続状態</dt>
            <dd>
              <DiagValue
                checking={madladStatus.checking}
                ok={madladStatus.available}
                okText="接続OK"
                error={madladStatus.error}
              />
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>MADLAD Model 読み込み状態</dt>
            <dd>
              <DiagValue
                checking={madladStatus.checking}
                ok={Boolean(madladStatus.available && madladStatus.modelLoaded)}
                okText="読み込み済み"
                error={
                  madladStatus.available
                    ? madladStatus.modelLoaded
                      ? undefined
                      : "未読み込み"
                    : madladStatus.error || "未接続"
                }
              />
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Ollama 接続状態</dt>
            <dd>
              <DiagValue
                checking={ollamaStatus.checking}
                ok={ollamaStatus.available}
                okText="接続OK"
                error={ollamaStatus.error}
              />
            </dd>
          </div>
        </dl>
      </div>
    </>
  );
}

function DiagValue({
  checking,
  ok,
  okText,
  error,
}: {
  checking: boolean;
  ok: boolean;
  okText: string;
  error?: string;
}) {
  if (checking) {
    return (
      <span className={styles.diagChecking}>
        <Loader2 size={14} className={styles.spinning} />
        確認中...
      </span>
    );
  }
  if (ok) {
    return (
      <span className={styles.diagOk}>
        <CheckCircle size={14} />
        {okText}
      </span>
    );
  }
  return (
    <span className={styles.diagError}>
      <AlertCircle size={14} />
      {error || "接続できません"}
    </span>
  );
}

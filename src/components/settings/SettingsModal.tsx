import { useState, useEffect } from "react";
import { X, AlertCircle, CheckCircle, Loader2, RefreshCw, Server, Brain } from "lucide-react";
import { getSetting, saveSetting } from "../../services/database";
import { checkMADLADServer } from "../../services/translation/madladEngine";
import { checkOllamaAvailability } from "../../services/llm/ollamaProvider";
import styles from "./SettingsModal.module.css";

type SettingsModalProps = {
  onClose: () => void;
};

type ServiceStatus = {
  checking: boolean;
  available: boolean;
  modelLoaded?: boolean;
  models?: string[];
  error?: string;
};

type TranslationSettings = {
  madladServerUrl: string;
  ollamaServerUrl: string;
  ollamaModel: string;
  generateGlossary: boolean;
  translationConcurrency: number;
  useCache: boolean;
};

const DEFAULT_SETTINGS: TranslationSettings = {
  madladServerUrl: "http://127.0.0.1:8765",
  ollamaServerUrl: "http://localhost:11434",
  ollamaModel: "gemma2:9b",
  generateGlossary: true,
  translationConcurrency: 1,
  useCache: true,
};

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<TranslationSettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [madladStatus, setMadladStatus] = useState<ServiceStatus>({
    checking: false,
    available: false,
  });

  const [ollamaStatus, setOllamaStatus] = useState<ServiceStatus>({
    checking: false,
    available: false,
    models: [],
  });

  useEffect(() => {
    async function loadSettings() {
      const saved = await getSetting<TranslationSettings>("translationSettingsV2");
      if (saved) {
        setSettings({ ...DEFAULT_SETTINGS, ...saved });
      }
    }
    loadSettings();
  }, []);

  useEffect(() => {
    checkMadlad();
    checkOllama();
  }, []);

  const checkMadlad = async () => {
    setMadladStatus((prev) => ({ ...prev, checking: true }));
    const status = await checkMADLADServer(settings.madladServerUrl);
    setMadladStatus({
      checking: false,
      available: status.available,
      modelLoaded: status.modelLoaded,
      error: status.error,
    });
  };

  const checkOllama = async () => {
    setOllamaStatus((prev) => ({ ...prev, checking: true }));
    const status = await checkOllamaAvailability(settings.ollamaServerUrl);
    setOllamaStatus({
      checking: false,
      available: status.available,
      models: status.models,
      error: status.error,
    });

    // Auto-select first model if current is not available
    if (status.available && status.models.length > 0 && !status.models.includes(settings.ollamaModel)) {
      setSettings((prev) => ({ ...prev, ollamaModel: status.models[0] }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      await saveSetting("translationSettingsV2", settings);
      setMessage({ type: "success", text: "設定を保存しました" });
      setTimeout(() => onClose(), 1000);
    } catch (e) {
      setMessage({ type: "error", text: "保存に失敗しました" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>設定</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          {/* MADLAD Translation Engine */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <Server size={16} />
              翻訳エンジン（MADLAD-400）
            </h3>
            <p className={styles.sectionDescription}>
              ローカルで動作する高速翻訳エンジン。英語→日本語の論文翻訳に使用します。
            </p>

            <div className={styles.field}>
              <label className={styles.label}>サーバーURL</label>
              <input
                type="text"
                className={styles.input}
                value={settings.madladServerUrl}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, madladServerUrl: e.target.value }))
                }
                placeholder="http://127.0.0.1:8765"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                接続状態
                <button
                  type="button"
                  className={styles.refreshButton}
                  onClick={checkMadlad}
                  disabled={madladStatus.checking}
                >
                  <RefreshCw size={12} className={madladStatus.checking ? styles.spinning : ""} />
                </button>
              </label>
              {madladStatus.checking ? (
                <div className={styles.statusChecking}>
                  <Loader2 size={16} className={styles.spinning} />
                  <span>確認中...</span>
                </div>
              ) : madladStatus.available ? (
                <div className={styles.statusOk}>
                  <CheckCircle size={16} />
                  <span>
                    接続OK
                    {madladStatus.modelLoaded ? " - モデル読み込み済み" : " - モデル未読み込み"}
                  </span>
                </div>
              ) : (
                <div className={styles.statusError}>
                  <AlertCircle size={16} />
                  <span>{madladStatus.error || "接続できません"}</span>
                </div>
              )}
            </div>

            {!madladStatus.available && (
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
          </section>

          {/* Ollama LLM */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <Brain size={16} />
              LLM分析（Ollama）
            </h3>
            <p className={styles.sectionDescription}>
              論文の要約、用語集生成、質問応答に使用します。翻訳には使用しません。
            </p>

            <div className={styles.field}>
              <label className={styles.label}>サーバーURL</label>
              <input
                type="text"
                className={styles.input}
                value={settings.ollamaServerUrl}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, ollamaServerUrl: e.target.value }))
                }
                placeholder="http://localhost:11434"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                接続状態
                <button
                  type="button"
                  className={styles.refreshButton}
                  onClick={checkOllama}
                  disabled={ollamaStatus.checking}
                >
                  <RefreshCw size={12} className={ollamaStatus.checking ? styles.spinning : ""} />
                </button>
              </label>
              {ollamaStatus.checking ? (
                <div className={styles.statusChecking}>
                  <Loader2 size={16} className={styles.spinning} />
                  <span>確認中...</span>
                </div>
              ) : ollamaStatus.available ? (
                <div className={styles.statusOk}>
                  <CheckCircle size={16} />
                  <span>接続OK - {ollamaStatus.models?.length || 0}個のモデル</span>
                </div>
              ) : (
                <div className={styles.statusError}>
                  <AlertCircle size={16} />
                  <span>{ollamaStatus.error || "接続できません"}</span>
                </div>
              )}
            </div>

            {ollamaStatus.available && ollamaStatus.models && ollamaStatus.models.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label}>モデル</label>
                <select
                  className={styles.select}
                  value={settings.ollamaModel}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, ollamaModel: e.target.value }))
                  }
                >
                  {ollamaStatus.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={settings.generateGlossary}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, generateGlossary: e.target.checked }))
                  }
                />
                <span>インポート時に用語集を自動生成</span>
              </label>
            </div>
          </section>

          {/* Advanced Settings */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>詳細設定</h3>

            <div className={styles.field}>
              <label className={styles.label}>翻訳並列数</label>
              <select
                className={styles.select}
                value={settings.translationConcurrency}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    translationConcurrency: parseInt(e.target.value),
                  }))
                }
              >
                <option value={1}>1（安定）</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
              <p className={styles.hint}>
                並列数を上げると翻訳速度が向上しますが、メモリ使用量が増加します。
              </p>
            </div>

            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={settings.useCache}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, useCache: e.target.checked }))
                  }
                />
                <span>翻訳結果をキャッシュ（再インポート時に高速化）</span>
              </label>
            </div>
          </section>
        </div>

        <div className={styles.footer}>
          {message && (
            <p className={`${styles.message} ${styles[message.type]}`}>
              {message.text}
            </p>
          )}
          <div className={styles.actions}>
            <button className={styles.cancelButton} onClick={onClose}>
              キャンセル
            </button>
            <button
              className={styles.saveButton}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { getSetting, saveSetting, clearTranslationCache } from "../../services/database";
import { checkMADLADServer } from "../../services/translation/madladEngine";
import { checkOllamaAvailability } from "../../services/llm/ollamaProvider";
import { addSamplePaper } from "../../services/samplePaper";
import { useLibraryCache } from "../../stores/libraryCache";
import { samplePaper } from "../../data/samplePaper";
import {
  mergeTranslationSettingsV2,
  type TranslationSettingsV2,
} from "../../utils/translationSettings";
import {
  SETTINGS_SECTIONS,
  settingsSectionElementId,
  type SettingsSectionId,
} from "../../utils/settingsToc";
import { SettingsToc } from "./SettingsToc";
import { TranslationSettingsSection } from "./TranslationSettingsSection";
import { ReadingSettingsSection } from "./ReadingSettingsSection";
import { StorageSettingsSection } from "./StorageSettingsSection";
import { DiagnosticsSettingsSection } from "./DiagnosticsSettingsSection";
import type { ServiceStatus } from "./settingsTypes";
import styles from "./SettingsScreen.module.css";

const IDLE_STATUS: ServiceStatus = { checking: false, available: false };

export function SettingsScreen() {
  const sampleAlreadyAdded = useLibraryCache((state) =>
    state.papers.some((paper) => paper.id === samplePaper.id)
  );
  const [settings, setSettings] = useState<TranslationSettingsV2>(
    mergeTranslationSettingsV2(null)
  );
  const [loaded, setLoaded] = useState(false);
  const [isAddingSample, setIsAddingSample] = useState(false);
  const [sampleMessage, setSampleMessage] = useState<string | null>(null);
  const [madladStatus, setMadladStatus] = useState<ServiceStatus>(IDLE_STATUS);
  const [ollamaStatus, setOllamaStatus] = useState<ServiceStatus>({
    ...IDLE_STATUS,
    models: [],
  });
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("reading");
  const [confirmClearCache, setConfirmClearCache] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const contentRef = useRef<HTMLElement>(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    async function loadSettings() {
      const saved = await getSetting<TranslationSettingsV2>("translationSettingsV2");
      setSettings(mergeTranslationSettingsV2(saved));
      setLoaded(true);
    }
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const handle = window.setTimeout(() => {
      void saveSetting("translationSettingsV2", settings);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [loaded, settings]);

  useEffect(() => {
    return () => {
      if (!loaded) return;
      void saveSetting("translationSettingsV2", settingsRef.current);
    };
  }, [loaded]);

  const checkMadlad = useCallback(async (url = settingsRef.current.madladServerUrl) => {
    setMadladStatus((prev) => ({ ...prev, checking: true }));
    const status = await checkMADLADServer(url);
    setMadladStatus({
      checking: false,
      available: status.available,
      modelLoaded: status.modelLoaded,
      error: status.error,
    });
  }, []);

  const checkOllama = useCallback(async (url = settingsRef.current.ollamaServerUrl) => {
    setOllamaStatus((prev) => ({ ...prev, checking: true }));
    const status = await checkOllamaAvailability(url);
    setOllamaStatus({
      checking: false,
      available: status.available,
      models: status.models,
      error: status.error,
    });
    if (
      status.available &&
      status.models.length > 0 &&
      !status.models.includes(settingsRef.current.ollamaModel)
    ) {
      setSettings((prev) => ({ ...prev, ollamaModel: status.models[0] }));
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    void checkMadlad();
    void checkOllama();
  }, [loaded, checkMadlad, checkOllama]);

  const updateSettings = (patch: Partial<TranslationSettingsV2>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleAddSample = async () => {
    if (isAddingSample) return;
    setIsAddingSample(true);
    setSampleMessage(null);
    try {
      const result = await addSamplePaper();
      if (result === "exists") {
        setSampleMessage("すでにライブラリにあります");
      } else {
        setSampleMessage("ライブラリに追加しました");
      }
    } catch (error) {
      console.error("Failed to add sample paper:", error);
      setSampleMessage("追加に失敗しました");
    } finally {
      setIsAddingSample(false);
    }
  };

  const handleConfirmClearCache = async () => {
    setClearingCache(true);
    setCacheMessage(null);
    try {
      const count = await clearTranslationCache();
      setConfirmClearCache(false);
      setCacheMessage(
        count > 0
          ? `翻訳キャッシュを削除しました（${count}件）`
          : "削除するキャッシュはありませんでした"
      );
    } catch (error) {
      console.error("Failed to clear translation cache:", error);
      setCacheMessage("削除に失敗しました");
    } finally {
      setClearingCache(false);
    }
  };

  const handleSelectSection = (id: SettingsSectionId) => {
    setActiveSection(id);
    const element = document.getElementById(settingsSectionElementId(id));
    if (element && contentRef.current) contentRef.current.scrollTo({ top: element.offsetTop - 24, behavior: "smooth" });
  };

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    let frame = 0;
    const update = () => { frame = 0; const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 8; const next = atBottom ? SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id : SETTINGS_SECTIONS.filter((section) => (document.getElementById(settingsSectionElementId(section.id))?.offsetTop ?? Infinity) <= root.scrollTop + 80).at(-1)?.id ?? SETTINGS_SECTIONS[0].id; setActiveSection((current) => current === next ? current : next); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    root.addEventListener("scroll", onScroll, { passive: true }); update();
    return () => { root.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Settings size={20} className={styles.logo} />
          <h1 className={styles.title}>設定</h1>
        </div>
      </header>

      <div className={styles.main}>
        <aside className={styles.sidebar}>
          <SettingsToc activeId={activeSection} onSelect={handleSelectSection} />
        </aside>
        <main ref={contentRef} className={styles.content}>
          <section id={settingsSectionElementId("reading")} className={styles.section}><ReadingSettingsSection /></section>
          <section
            id={settingsSectionElementId("translation")}
            className={styles.section}
          >
            <TranslationSettingsSection
              settings={settings}
              onChange={updateSettings}
              madladStatus={madladStatus}
            />
          </section>
          <section
            id={settingsSectionElementId("data")}
            className={styles.section}
          >
            <StorageSettingsSection
              confirming={confirmClearCache}
              busy={clearingCache}
              message={cacheMessage}
              onRequestClear={() => {
                setCacheMessage(null);
                setConfirmClearCache(true);
              }}
              onConfirmClear={() => void handleConfirmClearCache()}
              onCancelClear={() => setConfirmClearCache(false)}
            />
          </section>
          <section
            id={settingsSectionElementId("advanced")}
            className={styles.section}
          >
            <DiagnosticsSettingsSection
              madladStatus={madladStatus}
              ollamaStatus={ollamaStatus}
              settings={settings}
              onChange={updateSettings}
              onRecheck={() => {
                void checkMadlad();
                void checkOllama();
              }}
              sampleAlreadyAdded={sampleAlreadyAdded}
              isAddingSample={isAddingSample}
              sampleMessage={sampleMessage}
              onAddSample={() => void handleAddSample()}
            />
          </section>
        </main>
      </div>
    </div>
  );
}

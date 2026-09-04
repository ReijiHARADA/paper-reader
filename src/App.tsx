import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell";
import { LibraryScreen } from "./components/library/LibraryScreen";
import { ProjectScreen } from "./components/project/ProjectScreen";
import { InboxScreen } from "./components/library/InboxScreen";
import { FavoritesScreen } from "./components/library/FavoritesScreen";
import { RecentScreen } from "./components/library/RecentScreen";
import { ReaderScreen } from "./components/reader/ReaderScreen";
import { ImportScreen } from "./components/import/ImportScreen";
import { SettingsScreen } from "./components/settings/SettingsScreen";
import { PdfFileDropLayer } from "./components/shell/PdfFileDropLayer";
import { useAppStore } from "./stores/appStore";
import { isTauriApp, waitForServer } from "./utils/serverReady";

function App() {
  const { displaySettings } = useAppStore();
  const [serverReady, setServerReady] = useState(!isTauriApp());
  const [serverError, setServerError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const applyTheme = () => {
      if (displaySettings.theme === "system") {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;
        document.documentElement.setAttribute(
          "data-theme",
          prefersDark ? "dark" : "light"
        );
      } else {
        document.documentElement.setAttribute("data-theme", displaySettings.theme);
      }
    };

    applyTheme();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (displaySettings.theme === "system") {
        applyTheme();
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [displaySettings.theme]);

  // Tauri アプリとして起動した場合のみサーバー待機
  useEffect(() => {
    if (!isTauriApp()) return;
    setServerError(false);
    waitForServer((n) => setAttempt(n), 90) // 最大90秒待機
      .then(() => setServerReady(true))
      .catch(() => setServerError(true));
  }, []);

  const handleRetry = () => {
    setServerError(false);
    setServerReady(false);
    setAttempt(0);
    waitForServer((n) => setAttempt(n), 90)
      .then(() => setServerReady(true))
      .catch(() => setServerError(true));
  };

  return (
    <HashRouter>
      {!serverReady && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "10px 16px",
            background: "#1a365d",
            color: "#ffffff",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif',
            fontSize: 13,
          }}
        >
          {serverError ? (
            <>
              <span>翻訳サーバーの起動に時間がかかっています</span>
              <button
                type="button"
                onClick={handleRetry}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  border: "1px solid #ffffff",
                  background: "transparent",
                  color: "#ffffff",
                  cursor: "pointer",
                }}
              >
                再試行
              </button>
            </>
          ) : (
            <span>
              翻訳モデルを読み込んでいます
              {attempt > 5 ? `（${attempt}秒）` : ""}
            </span>
          )}
        </div>
      )}
      <PdfFileDropLayer />
      <div style={{ paddingTop: !serverReady ? 40 : 0, minHeight: "100%" }}>
      <Routes>
        {/* Import は shell の外（フルスクリーン） */}
        <Route path="/import" element={<ImportScreen />} />

        {/* AppShell が常設サイドバーを提供する */}
        <Route element={<AppShell />}>
          <Route path="/" element={<LibraryScreen />} />
          <Route path="/inbox" element={<InboxScreen />} />
          <Route path="/favorites" element={<FavoritesScreen />} />
          <Route path="/recent" element={<RecentScreen />} />
          <Route path="/project/:projectId" element={<ProjectScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/reader/:paperId" element={<ReaderScreen />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </div>
    </HashRouter>
  );
}

export default App;

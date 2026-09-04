import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell";
import { LibraryScreen } from "./components/library/LibraryScreen";
import { ProjectScreen } from "./components/project/ProjectScreen";
import { InboxScreen } from "./components/library/InboxScreen";
import { FavoritesScreen } from "./components/library/FavoritesScreen";
import { RecentScreen } from "./components/library/RecentScreen";
import { ReaderScreen } from "./components/reader/ReaderScreen";
import { ImportScreen } from "./components/import/ImportScreen";
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

  if (!serverReady) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100vh", gap: 12,
        background: "var(--color-bg)", color: "var(--color-text-secondary)",
        fontFamily: "var(--font-family-sans)",
      }}>
        {serverError ? (
          <>
            <p style={{ fontSize: "1rem", color: "var(--color-text)" }}>翻訳サーバーの起動に時間がかかっています</p>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)", maxWidth: 360, textAlign: "center" }}>
              モデルのロード中の場合は、そのまましばらくお待ちください。
            </p>
            <button
              onClick={handleRetry}
              style={{
                marginTop: 8, padding: "8px 20px", borderRadius: 8,
                border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)",
                color: "var(--color-text)", cursor: "pointer", fontSize: "0.875rem",
              }}
            >
              再試行
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: "1rem", color: "var(--color-text)" }}>起動中...</p>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)" }}>
              翻訳モデルを読み込んでいます
              {attempt > 5 ? `（${attempt}秒）` : ""}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <BrowserRouter>
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
          <Route path="/reader/:paperId" element={<ReaderScreen />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

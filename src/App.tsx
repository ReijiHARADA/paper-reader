import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LibraryScreen } from "./components/library/LibraryScreen";
import { ReaderScreen } from "./components/reader/ReaderScreen";
import { ImportScreen } from "./components/import/ImportScreen";
import { useAppStore } from "./stores/appStore";

function App() {
  const { displaySettings } = useAppStore();

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

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryScreen />} />
        <Route path="/import" element={<ImportScreen />} />
        <Route path="/reader/:paperId" element={<ReaderScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

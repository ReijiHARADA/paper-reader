import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./polyfills/pdfjsCompat";
import "./styles/variables.css";
import App from "./App";

function showBootError(error: unknown) {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  const root = document.getElementById("root");
  if (root) {
    root.style.padding = "24px";
    root.style.fontFamily = "sans-serif";
    root.style.whiteSpace = "pre-wrap";
    root.textContent = `起動に失敗しました。\n\n${message}`;
  }
}

window.addEventListener("error", (event) => {
  showBootError(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  showBootError(event.reason);
});

try {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("root element is missing");
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} catch (error) {
  showBootError(error);
}

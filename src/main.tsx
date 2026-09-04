import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./polyfills/pdfjsCompat";
import "./styles/variables.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

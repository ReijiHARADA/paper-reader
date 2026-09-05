import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { pdfjsCmapsPlugin } from "./vite.pdfjsCmaps.ts";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const cmapSrc = path.join(projectRoot, "node_modules/pdfjs-dist/cmaps");

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: "strip-crossorigin",
      transformIndexHtml(html) {
        return html.replace(/ crossorigin(="[^"]*")?/g, "");
      },
    },
    pdfjsCmapsPlugin(projectRoot, cmapSrc),
  ],
  base: "./",
  build: {
    target: ["es2020", "safari15"],
  },
  server: {
    watch: {
      ignored: ["**/src-tauri/target/**", "**/translation-server/**"],
    },
    proxy: {
      "/api/madlad": {
        target: "http://127.0.0.1:8765",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/madlad/, ""),
      },
    },
  },
})

import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export function pdfjsCmapsPlugin(projectRoot: string, cmapSrc: string): Plugin {
  return {
    name: "pdfjs-cmaps",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/cmaps/")) {
          next();
          return;
        }
        const relative = decodeURIComponent(url.slice("/cmaps/".length));
        const file = path.resolve(cmapSrc, relative);
        const root = path.resolve(cmapSrc);
        if (file !== root && !file.startsWith(root + path.sep)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/octet-stream");
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      fs.cpSync(cmapSrc, path.join(projectRoot, "dist/cmaps"), { recursive: true });
    },
  };
}

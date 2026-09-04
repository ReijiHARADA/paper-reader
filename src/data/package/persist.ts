import type { FileSystem } from "../fs/types";
import type { LayoutFile } from "../types/layout";
import type { PaperJson, PaperPackage } from "../types/package";
import type { StructureFile } from "../types/structure";
import { gunzipJson, gzipJson } from "./gzip";
import { validatePaperPackage } from "./validate";

export const persistMetrics = {
  fullPackageWrites: 0,
  mutableFileWrites: 0,
  sourcePdfWrites: 0,
  assetWrites: 0,
  layoutWrites: 0,
  sqliteExports: 0,
};

export function resetPersistMetrics(): void {
  persistMetrics.fullPackageWrites = 0;
  persistMetrics.mutableFileWrites = 0;
  persistMetrics.sourcePdfWrites = 0;
  persistMetrics.assetWrites = 0;
  persistMetrics.layoutWrites = 0;
  persistMetrics.sqliteExports = 0;
}

export function paperDir(paperId: string): string {
  return `papers/${paperId}`;
}

async function writeTextAtomic(fs: FileSystem, path: string, text: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await fs.writeText(tmp, text);
  await fs.rename(tmp, path);
}

async function writeTree(fs: FileSystem, root: string, pkg: PaperPackage): Promise<void> {
  await fs.writeText(`${root}/paper.json`, JSON.stringify(pkg.paper, null, 2));
  await fs.writeText(`${root}/original.md`, pkg.originalMarkdown);
  await fs.writeText(`${root}/ja.md`, pkg.translatedMarkdown);
  await fs.writeText(`${root}/structure.json`, JSON.stringify(pkg.structure, null, 2));
  if (pkg.layout) {
    persistMetrics.layoutWrites += 1;
    await fs.writeBytes(`${root}/layout.json.gz`, gzipJson(pkg.layout));
  }
  for (const asset of pkg.assets) {
    persistMetrics.assetWrites += 1;
    const path = asset.path.startsWith("assets/")
      ? `${root}/${asset.path}`
      : `${root}/assets/${asset.path}`;
    await fs.writeBytes(path, asset.bytes);
  }
  if (pkg.sourcePdf) {
    persistMetrics.sourcePdfWrites += 1;
    await fs.writeBytes(`${root}/source.pdf`, pkg.sourcePdf);
  }
}

export async function persistMutablePaperFiles(
  fs: FileSystem,
  paperId: string,
  files: {
    jaMarkdown?: string;
    paperJson?: PaperJson;
    structure?: StructureFile;
  }
): Promise<void> {
  const root = paperDir(paperId);
  persistMetrics.mutableFileWrites += 1;
  if (files.jaMarkdown != null) {
    await writeTextAtomic(fs, `${root}/ja.md`, files.jaMarkdown);
  }
  if (files.paperJson) {
    await writeTextAtomic(fs, `${root}/paper.json`, JSON.stringify(files.paperJson, null, 2));
  }
  if (files.structure) {
    await writeTextAtomic(fs, `${root}/structure.json`, JSON.stringify(files.structure, null, 2));
  }
}

export async function persistPaperPackage(
  fs: FileSystem,
  pkg: PaperPackage
): Promise<{ revision: number; diagnostics: ReturnType<typeof validatePaperPackage> }> {
  const validation = validatePaperPackage(pkg);
  if (!validation.ok) {
    throw new Error(
      `Paper Package validation failed: ${validation.diagnostics
        .filter((item) => item.level === "error")
        .map((item) => item.message)
        .join("; ")}`
    );
  }

  const paperId = pkg.paper.paperId;
  const dest = paperDir(paperId);
  const tmp = `papers/${paperId}.tmp`;
  const bak = `papers/${paperId}.bak`;
  const next: PaperPackage = {
    ...pkg,
    paper: { ...pkg.paper, revision: (pkg.paper.revision ?? 0) + 1 },
  };

  persistMetrics.fullPackageWrites += 1;
  await fs.remove(tmp);
  await writeTree(fs, tmp, next);

  const loaded = await loadPaperPackage(fs, paperId, tmp);
  const recheck = validatePaperPackage(loaded);
  if (!recheck.ok) {
    await fs.remove(tmp);
    throw new Error("Paper Package tmp validation failed");
  }

  if (await fs.exists(dest)) {
    await fs.remove(bak);
    await fs.rename(dest, bak);
  }
  await fs.rename(tmp, dest);
  await fs.remove(bak);
  return { revision: next.paper.revision, diagnostics: recheck };
}

export async function loadPaperPackage(
  fs: FileSystem,
  paperId: string,
  root = paperDir(paperId)
): Promise<PaperPackage> {
  const paperText = await fs.readText(`${root}/paper.json`);
  const originalMarkdown = await fs.readText(`${root}/original.md`);
  const translatedMarkdown = await fs.readText(`${root}/ja.md`);
  const structureText = await fs.readText(`${root}/structure.json`);
  if (!paperText || !originalMarkdown || !translatedMarkdown || !structureText) {
    throw new Error(`Paper Package が不完全です: ${paperId}`);
  }
  const paper = JSON.parse(paperText) as PaperJson;
  const structure = JSON.parse(structureText) as StructureFile;
  const layoutBytes = await fs.readBytes(`${root}/layout.json.gz`);
  const layout = layoutBytes ? gunzipJson<LayoutFile>(layoutBytes) : undefined;
  const sourcePdf = (await fs.readBytes(`${root}/source.pdf`)) ?? undefined;
  const files = await fs.list(`${root}/assets`);
  const assets = [];
  for (const path of files) {
    const bytes = await fs.readBytes(path);
    if (!bytes) continue;
    assets.push({
      path: path.replace(`${root}/`, ""),
      bytes,
    });
  }
  return {
    paper,
    originalMarkdown,
    translatedMarkdown,
    structure,
    layout,
    assets,
    sourcePdf,
  };
}

export async function paperPackageExists(fs: FileSystem, paperId: string): Promise<boolean> {
  return fs.exists(`${paperDir(paperId)}/paper.json`);
}

export async function updateTranslatedMarkdown(
  fs: FileSystem,
  paperId: string,
  translatedMarkdown: string
): Promise<void> {
  await persistMutablePaperFiles(fs, paperId, { jaMarkdown: translatedMarkdown });
}

import type { FileSystem } from "../fs/types";
import type { LayoutFile } from "../types/layout";
import type { PaperJson, PaperPackage } from "../types/package";
import type { StructureFile } from "../types/structure";
import { gunzipJson, gzipJson } from "./gzip";
import { validatePaperPackage } from "./validate";

export function paperDir(paperId: string): string {
  return `papers/${paperId}`;
}

async function writeTree(fs: FileSystem, root: string, pkg: PaperPackage): Promise<void> {
  await fs.writeText(`${root}/paper.json`, JSON.stringify(pkg.paper, null, 2));
  await fs.writeText(`${root}/original.md`, pkg.originalMarkdown);
  await fs.writeText(`${root}/ja.md`, pkg.translatedMarkdown);
  await fs.writeText(`${root}/structure.json`, JSON.stringify(pkg.structure, null, 2));
  if (pkg.layout) {
    await fs.writeBytes(`${root}/layout.json.gz`, gzipJson(pkg.layout));
  }
  for (const asset of pkg.assets) {
    const path = asset.path.startsWith("assets/")
      ? `${root}/${asset.path}`
      : `${root}/assets/${asset.path}`;
    await fs.writeBytes(path, asset.bytes);
  }
  if (pkg.sourcePdf) {
    await fs.writeBytes(`${root}/source.pdf`, pkg.sourcePdf);
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
  const pkg = await loadPaperPackage(fs, paperId);
  pkg.translatedMarkdown = translatedMarkdown;
  pkg.paper.updatedAt = new Date().toISOString();
  await persistPaperPackage(fs, pkg);
}

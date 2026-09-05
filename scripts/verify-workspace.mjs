import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const base = process.env.PAPER_READER_URL ?? "http://127.0.0.1:5173";
const out = new URL("../test-results/browser-verify/", import.meta.url); mkdirSync(out, { recursive: true });
try {
  await page.goto(base); await page.getByRole("heading", { name: "すべての論文" }).waitFor();
  await page.locator("aside").hover();
  await expect(page.getByRole("button", { name: "新規フォルダ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新規プロジェクト" })).toHaveCount(0);
  const ids = await page.evaluate(async () => {
    const service = await import("/src/services/projectService.ts"); const { useProjectStore } = await import("/src/stores/projectStore.ts"); const { useLibraryCache } = await import("/src/stores/libraryCache.ts"); const { addSamplePaper } = await import("/src/services/samplePaper.ts"); const { getAllPapers, getAllWorkspacePapers } = await import("/src/services/database.ts");
    const a = await service.createWorkspaceNode({ name: "A", parentId: null }); const b = await service.createWorkspaceNode({ name: "B", parentId: a.id }); const c = await service.createWorkspaceNode({ name: "C", parentId: b.id }); await addSamplePaper(); const paper = (await getAllPapers())[0]; await service.addPaperToWorkspace(c.id, paper.id); useProjectStore.getState().setWorkspaceNodes(await service.listWorkspace()); useProjectStore.getState().setMemberships(await getAllWorkspacePapers()); useLibraryCache.getState().setPapers(await getAllPapers()); return { a: a.id, b: b.id, c: c.id, paper: paper.id };
  });
  const row = (id) => page.locator(`[data-workspace-id="${id}"]`);
  const parent = (id) => page.evaluate(async (value) => (await (await import("/src/services/projectService.ts")).listWorkspace()).find((node) => node.id === value)?.parentId, id);
  await row(ids.a).getByRole("button", { name: "「A」のメニュー" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["サブフォルダーを追加", "名称を変更", "論文ファイルを追加", "削除"]);
  await page.getByRole("menuitem", { name: "サブフォルダーを追加" }).click(); await page.getByRole("textbox", { name: "フォルダ名" }).fill("D"); await page.getByRole("button", { name: "作成" }).click(); await expect(page.getByRole("link", { name: "D" })).toBeVisible();
  await row(ids.a).getByRole("button", { name: "Aを展開" }).click(); await expect(row(ids.b)).toBeVisible(); await row(ids.a).getByRole("button", { name: "Aを折りたたむ" }).click(); await expect(row(ids.b)).toHaveCount(0); await page.getByRole("button", { name: "Aを展開" }).click();
  async function drag(source, target) { const from = await source.boundingBox(); const to = await target.boundingBox(); await page.mouse.move(from.x + 45, from.y + from.height / 2); await page.mouse.down(); await page.mouse.move(to.x + 75, to.y + to.height / 2, { steps: 10 }); await page.mouse.up(); }
  await drag(row(ids.c).getByRole("link"), row(ids.a)); await expect.poll(() => parent(ids.c)).toBe(ids.a); await drag(row(ids.a).getByRole("link"), row(ids.c)); await expect(page.getByText(/自分の子/)).toBeVisible(); expect(await parent(ids.a)).toBeNull();
  const paperLink = page.locator(`aside a[href="#/reader/${ids.paper}"]`); await drag(paperLink, row(ids.a)); await expect.poll(async () => page.evaluate(async ({ nodeId, paperId }) => Boolean(await (await import("/src/services/database.ts")).getWorkspacePaperLink(nodeId, paperId)), { nodeId: ids.a, paperId: ids.paper })).toBe(true);
  await page.evaluate(async () => { const { getStorage } = await import("/src/data/runtime.ts"); await (await getStorage()).db.persist(); }); await page.reload(); await expect(row(ids.c)).toBeAttached(); await expect(page.locator(`aside a[href="#/reader/${ids.paper}"]`)).toBeAttached();
  await page.screenshot({ path: new URL("workspace-unified.png", out).pathname }); console.log("ok unified workspace creation, deep nesting, DnD, cycle rejection, paper placement and reload");
} finally { await browser.close(); }

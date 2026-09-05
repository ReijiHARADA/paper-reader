import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const base = process.env.PAPER_READER_URL ?? "http://127.0.0.1:5173";
const out = new URL("../test-results/browser-verify/", import.meta.url);
mkdirSync(out, { recursive: true });
try {
  await page.goto(base);
  await page.getByRole("heading", { name: "すべての論文" }).waitFor();
  const ids = await page.evaluate(async () => {
    const service = await import("/src/services/projectService.ts");
    const { useProjectStore } = await import("/src/stores/projectStore.ts");
    const { addSamplePaper } = await import("/src/services/samplePaper.ts");
    const { getAllPapers, getAllProjectPapers } = await import("/src/services/database.ts");
    const { useLibraryCache } = await import("/src/stores/libraryCache.ts");
    const p = await service.createProject({ name: "Project A" });
    const q = await service.createProject({ name: "Project B" });
    const a = await service.createFolder("Folder A");
    const b = await service.createFolder("Folder B");
    const x = await service.createFolder("Folder X", p.id);
    await addSamplePaper();
    const papers = await getAllPapers();
    await service.placePaperInWorkspace(papers[0].id, p.id);
    useProjectStore.getState().setProjects(await service.listProjects());
    useProjectStore.getState().setWorkspaceNodes(await service.listWorkspace());
    useProjectStore.getState().setMemberships(await getAllProjectPapers());
    useLibraryCache.getState().setPapers(papers);
    return { p: p.id, q: q.id, a: a.id, b: b.id, x: x.id, paper: papers[0].id };
  });
  const row = (id) => page.locator(`[data-workspace-id="${id}"]`);
  const parent = (id) => page.evaluate(async (id) => {
    const { listWorkspace } = await import("/src/services/projectService.ts");
    return (await listWorkspace()).find((node) => node.id === id)?.parentId;
  }, id);
  const placement = () => page.evaluate(async ({ p, paper }) => {
    const { getProjectPaper } = await import("/src/services/database.ts");
    return (await getProjectPaper(p, paper)).folderId;
  }, ids);
  async function drag(source, target, fraction = 0.5, invalid = false) {
    await page.locator("aside").hover();
    await page.waitForTimeout(250);
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    await page.mouse.move(from.x + Math.min(55, from.width / 2), from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + Math.min(80, to.width / 2), to.y + to.height * fraction, { steps: 12 });
    if (invalid) await expect(target).toHaveClass(/invalidDrop/);
    await page.mouse.up();
  }
  await page.locator("aside").hover();
  // Check actual hit testing where the menu overlaps later tree rows.
  for (const [id, name] of [[ids.p, "Project A"], [ids.a, "Folder A"]]) {
    await page.locator("aside").hover();
    await page.waitForTimeout(250);
    await row(id).getByRole("button", { name: `「${name}」のメニュー` }).click();
    const menu = page.getByRole("menu");
    for (const item of await menu.getByRole("menuitem").all()) {
      expect(await item.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })).toBe(true);
    }
    await page.screenshot({ path: new URL(`workspace-menu-${name.replaceAll(" ", "-")}.png`, out).pathname });
    if (id === ids.p) {
      await menu.getByRole("menuitem", { name: "名称を変更" }).click();
      await page.getByRole("textbox", { name: "名称", exact: true }).fill(name);
      await page.getByRole("textbox", { name: "名称", exact: true }).press("Enter");
    } else {
      await menu.getByRole("menuitem", { name: "削除", exact: true }).click();
      await menu.getByRole("menuitem", { name: "キャンセル" }).click();
      await page.keyboard.press("Escape");
      await expect(row(id)).toBeAttached();
    }
  }
  console.log("ok project/folder menus above subsequent rows and clickable");
  await page.getByRole("button", { name: "Project Aを折りたたむ" }).click();
  await expect(row(ids.x)).toHaveCount(0);
  await page.getByRole("button", { name: "Project Aを展開" }).click();
  await expect(row(ids.x)).toBeVisible();
  console.log("ok project expand/collapse without navigation");

  await drag(row(ids.b).getByRole("button", { name: "Folder B", exact: true }), row(ids.a));
  await expect.poll(() => parent(ids.b)).toBe(ids.a);
  await page.getByRole("button", { name: "Folder Aを折りたたむ" }).click();
  await expect(row(ids.b)).toHaveCount(0);
  await page.getByRole("button", { name: "Folder Aを展開" }).click();
  await expect(row(ids.b)).toBeVisible();
  console.log("ok folder nesting and expand/collapse");

  await drag(row(ids.q).getByRole("link"), row(ids.p), 0.5, true);
  await expect(page.getByText("プロジェクトの中に別のプロジェクトを移動することはできません。", { exact: true })).toBeVisible();
  expect(await parent(ids.q)).toBeNull();
  await drag(row(ids.q).getByRole("link"), row(ids.x), 0.5, true);
  expect(await parent(ids.q)).toBeNull();
  console.log("ok direct and indirect project nesting rejected with toast");

  await drag(row(ids.q).getByRole("link"), row(ids.b));
  await expect.poll(() => parent(ids.q)).toBe(ids.b);
  await drag(row(ids.a).getByRole("button", { name: "Folder A", exact: true }), row(ids.p), 0.5, true);
  expect(await parent(ids.a)).toBeNull();
  console.log("ok project into folder; project-containing folder rejected");

  await drag(row(ids.x).getByRole("button", { name: "Folder X", exact: true }), row(ids.p), 0.95);
  await expect.poll(() => parent(ids.x)).toBeNull();
  const order = await page.evaluate(async () => {
    const { listWorkspace } = await import("/src/services/projectService.ts");
    return (await listWorkspace()).filter((n) => n.parentId === null).sort((a,b) => a.order-b.order).map((n) => n.name);
  });
  expect(order).toEqual(["Project A", "Folder X", "Folder A"]);
  await drag(row(ids.x).getByRole("button", { name: "Folder X", exact: true }), row(ids.p));
  await expect.poll(() => parent(ids.x)).toBe(ids.p);
  console.log("ok mixed sibling reorder and folder into project");

  const paperLink = () => page.locator(`aside a[href="#/reader/${ids.paper}"]`);
  await drag(paperLink(), row(ids.x));
  await expect.poll(placement).toBe(ids.x);
  await page.getByRole("button", { name: "Folder Xを折りたたむ" }).click();
  await expect(paperLink()).toHaveCount(0);
  await page.getByRole("button", { name: "Folder Xを展開" }).click();
  await drag(paperLink(), row(ids.p));
  await expect.poll(placement).toBeNull();
  console.log("ok paper folder placement and return to project root");

  await page.locator("aside").hover();
  await page.screenshot({ path: new URL("workspace-tree.png", out).pathname });
  await row(ids.p).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/project/${ids.p}`));
  await page.evaluate(async () => { const { getStorage } = await import("/src/data/runtime.ts"); await (await getStorage()).db.persist(); });
  await page.reload();
  await expect(row(ids.x)).toBeAttached();
  expect(await parent(ids.q)).toBe(ids.b);
  console.log("ok project navigation and persisted tree after reload");
  // Exercise inline editing, sidebar collapse and actual subtree deletion without native confirm.
  for (const [id, original] of [[ids.p, "Project A"], [ids.a, "Folder A"]]) {
    await page.locator("aside").hover();
    await page.waitForTimeout(250);
    await row(id).getByRole("button", { name: "「" + original + "」のメニュー" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["名称を変更", "論文ファイルを追加", "削除"]);
    await page.mouse.move(700, 450);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.waitForTimeout(250);
    expect((await page.locator("aside").boundingBox()).width).toBeLessThan(70);
    await page.locator("aside").hover();
    await page.waitForTimeout(250);
    await row(id).getByRole("button", { name: "「" + original + "」のメニュー" }).click();
    await page.getByRole("menuitem", { name: "名称を変更" }).click();
    const input = page.getByRole("textbox", { name: "名称", exact: true });
    await input.fill(original + " renamed");
    await page.mouse.move(700, 450);
    expect((await page.locator("aside").boundingBox()).width).toBeGreaterThan(200);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await input.press("Enter");
    await expect(row(id)).toContainText(original + " renamed");
    await page.locator("aside").hover();
    await page.waitForTimeout(250);
    await row(id).getByRole("button", { name: "「" + original + " renamed」のメニュー" }).click();
    await page.getByRole("menuitem", { name: "名称を変更" }).click();
    await input.fill("cancelled");
    await input.press("Escape");
    await expect(row(id)).toContainText(original + " renamed");
    await row(id).getByRole("button", { name: "「" + original + " renamed」のメニュー" }).click();
    await page.getByRole("menuitem", { name: "削除", exact: true }).click();
    await page.getByRole("menuitem", { name: "削除する", exact: true }).click();
    await expect(row(id)).toHaveCount(0);
  }
  await expect.poll(() => page.evaluate(async () => {
    const { getAllPapers } = await import("/src/services/database.ts");
    return (await getAllPapers()).length;
  })).toBe(1);
  await expect(row(ids.q)).toHaveCount(0);
  console.log("ok unified menus, collapse dismissal, inline rename/cancel and project/folder deletion preserving paper");

} finally {
  await browser.close();
}

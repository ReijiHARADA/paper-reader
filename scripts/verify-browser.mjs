import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.PAPER_READER_URL ?? "http://localhost:5173";
const outDir = new URL("../test-results/browser-verify/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const failures = [];
const verifyProjectName = `Browser Verify Project ${Date.now()}`;
const renamedProjectName = `${verifyProjectName} Renamed`;

async function shot(name) {
  await page.screenshot({
    path: new URL(`${name}.png`, outDir).pathname,
    fullPage: true,
  });
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`fail ${name}: ${error instanceof Error ? error.message : String(error)}`);
    await shot(`fail-${name.replace(/\s+/g, "-")}`);
  }
}

try {
  await page.goto(`${base}/#/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);

  await check("library heading", async () => {
    await page.getByRole("heading", { name: "すべての論文" }).waitFor({ timeout: 10_000 });
  });
  await check("library search", async () => {
    const search = page.locator("#library-search");
    await page.locator("aside").first().hover();
    await search.waitFor({ state: "visible", timeout: 10_000 });
  });
  await shot("library");

  await check("project action menu", async () => {
    await page.locator("aside").first().hover();
    await page.getByRole("button", { name: "新規フォルダ" }).click();
    await page.getByLabel("フォルダ名").fill(verifyProjectName);
    await page.getByRole("button", { name: "作成", exact: true }).click();
    await page.locator("aside").first().hover();
    if (await page.locator("header").getByTitle("プロジェクトを削除").count()) {
      throw new Error("project header still contains a delete button");
    }

    const menuButton = page.getByRole("button", {
      name: `「${verifyProjectName}」のメニュー`,
    });
    await menuButton.click();
    await page.getByRole("menuitem", { name: "名称を変更" }).waitFor();
    await page.getByRole("menuitem", { name: "論文ファイルを追加" }).waitFor();
    await page.getByRole("menuitem", { name: "削除", exact: true }).waitFor();

    await page.getByRole("menuitem", { name: "名称を変更" }).click();
    await page.getByRole("textbox", { name: "名称", exact: true }).fill(renamedProjectName);
    await page.getByRole("textbox", { name: "名称", exact: true }).press("Enter");
    await page.getByRole("link", { name: renamedProjectName }).waitFor();
    await page.locator("aside").first().hover();

    await page.getByRole("button", {
      name: `「${renamedProjectName}」のメニュー`,
    }).click();
    await page.getByRole("menuitem", { name: "削除", exact: true }).click();
    await page.getByRole("menuitem", { name: "削除する", exact: true }).click();
    await page.getByRole("link", { name: renamedProjectName }).waitFor({
      state: "detached",
    });
  });
  await shot("project-action-menu");

  const parentFolderName = `Browser Verify Parent ${Date.now()}`;
  const childFolderName = `${parentFolderName} Child`;
  await check("workspace child folders in main view", async () => {
    await page.locator("aside").first().hover();
    await page.getByRole("button", { name: "新規フォルダ" }).click();
    await page.getByLabel("フォルダ名").fill(parentFolderName);
    await page.getByRole("button", { name: "作成", exact: true }).click();
    await page.locator("aside").first().hover();
    await page.getByRole("link", { name: parentFolderName, exact: true }).click();
    await page.getByRole("heading", { name: parentFolderName, exact: true }).waitFor();

    await page.getByRole("button", {
      name: `「${parentFolderName}」のメニュー`,
    }).click();
    await page.getByRole("menuitem", { name: "サブフォルダーを追加" }).click();
    await page.getByLabel("フォルダ名").fill(childFolderName);
    await page.getByRole("button", { name: "作成", exact: true }).click();

    await page.getByRole("heading", { name: parentFolderName, exact: true }).waitFor();
    const folderCard = page.locator("article").filter({ hasText: childFolderName });
    await folderCard.getByRole("heading", { name: childFolderName, exact: true }).waitFor();
    await folderCard.getByText("フォルダ").waitFor();
  });
  await shot("workspace-child-folders");

  await page.getByRole("link", { name: "設定" }).click();
  await check("settings reading preview", async () => {
    await page.getByRole("button", { name: "読書" }).click();
    await page.getByLabel("本文プレビュー").waitFor({ timeout: 10_000 });
    await page.getByText("プレビュー").first().waitFor();
  });
  await shot("settings-reading");

  const addSample = page.getByRole("button", { name: /サンプル論文/ });
  if (await addSample.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "一般" }).click();
    await addSample.click();
    await page.waitForTimeout(500);
  }

  await page.getByRole("link", { name: "すべての論文" }).click();
  await page.waitForTimeout(400);
  await shot("library-after-sample");

  const sampleCard = page.getByText("Attention機構があれば十分である").first();
  if (await sampleCard.isVisible().catch(() => false)) {
    await sampleCard.click();
    await check("reader title", async () => {
      await page.getByRole("heading", { name: /Attention/ }).first().waitFor({ timeout: 10_000 });
    });
    await check("reader outline", async () => {
      await page.locator("aside").first().waitFor();
    });
    await shot("reader");

    await page.getByRole("link", { name: "すべての論文" }).click();
    await page.waitForTimeout(400);
    await check("favorite mark on paper card", async () => {
      const card = page.locator("article").filter({ hasText: "Attention" }).first();
      await card.getByRole("button", { name: "論文の操作" }).click();
      await page.getByRole("menuitem", { name: "お気に入り" }).click();
      await card.getByLabel("お気に入り").waitFor();
    });
    await shot("library-favorite");
    await sampleCard.click();

    await check("inline memo popover stays on reader", async () => {
      const translation = page.locator("[data-text-role='translation']").first();
      await translation.waitFor({ timeout: 10_000 });
      const box = await translation.boundingBox();
      if (!box) throw new Error("translation box missing");
      await page.mouse.move(box.x + 24, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(box.x + Math.min(box.width - 12, 180), box.y + 10);
      await page.mouse.up();
      const dialog = page.getByRole("dialog", { name: "メモを追加" });
      await dialog.waitFor({ state: "visible", timeout: 5_000 });
      if (await page.getByLabel("メモ一覧").count()) {
        throw new Error("Notes inspector opened from a body selection");
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
    });

    await check("markdown export dialog", async () => {
      await page.getByRole("button", { name: "書き出す" }).click();
      const dialog = page.getByRole("dialog", { name: "書き出す" });
      await dialog.waitFor({ state: "visible" });
      const bounds = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      });
      if (
        bounds.top < 0 ||
        bounds.left < 0 ||
        bounds.right > bounds.viewportWidth ||
        bounds.bottom > bounds.viewportHeight
      ) {
        throw new Error(`export dialog is outside the viewport: ${JSON.stringify(bounds)}`);
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
    });
    await page.getByRole("button", { name: "書き出す" }).click();
    await shot("reader-export-dialog");
    await page.keyboard.press("Escape");
  } else {
    console.log("skip reader (sample paper not visible)");
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error("\nBrowser verify failed:");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`\nBrowser verify passed. Screenshots: ${outDir.pathname}`);

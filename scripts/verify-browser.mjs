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
    await page.getByRole("button", { name: "新規プロジェクト" }).click();
    await page.getByLabel("研究テーマ").fill(verifyProjectName);
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
    await page.getByRole("menuitem", { name: "プロジェクトを削除" }).waitFor();

    await page.getByRole("menuitem", { name: "名称を変更" }).click();
    await page.getByRole("textbox", { name: "プロジェクト名", exact: true }).fill(renamedProjectName);
    await page.getByRole("button", { name: "変更を保存" }).click();
    await page.getByRole("link", { name: renamedProjectName }).waitFor();
    await page.locator("aside").first().hover();

    await page.getByRole("button", {
      name: `「${renamedProjectName}」のメニュー`,
    }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("menuitem", { name: "プロジェクトを削除" }).click();
    await page.getByRole("link", { name: renamedProjectName }).waitFor({
      state: "detached",
    });
  });
  await shot("project-action-menu");

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

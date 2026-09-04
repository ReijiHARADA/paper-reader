export const SETTINGS_SECTIONS = [
  { id: "general", label: "一般" },
  { id: "translation", label: "翻訳" },
  { id: "reading", label: "読書" },
  { id: "storage", label: "ストレージ" },
  { id: "diagnostics", label: "診断" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

export function settingsSectionElementId(id: SettingsSectionId): string {
  return `section-${id}`;
}

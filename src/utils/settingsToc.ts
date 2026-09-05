export const SETTINGS_SECTIONS = [
  { id: "reading", label: "読書" },
  { id: "translation", label: "翻訳" },
  { id: "data", label: "データ" },
  { id: "advanced", label: "詳細設定" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

export function settingsSectionElementId(id: SettingsSectionId): string {
  return `section-${id}`;
}

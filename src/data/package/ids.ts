export function normalizeBlockText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function fingerprintText(text: string): string {
  const normalized = normalizeBlockText(text);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function stableBlockId(parts: {
  type: string;
  page: number;
  text: string;
  order?: number;
}): string {
  const raw = `${parts.type}|${parts.page}|${normalizeBlockText(parts.text)}|${parts.order ?? 0}`;
  return `b-${fingerprintText(raw)}`;
}

export function slugReferenceId(rawText: string, number: string): string {
  const year = rawText.match(/\b(19|20)\d{2}\b/)?.[0];
  const name = rawText
    .replace(/^\s*\[?\d+\]?\.?\s*/, "")
    .replace(/["“”]/g, "")
    .split(/[,.(]/)[0]
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  if (name && year) return `ref-${name}-${year}`;
  if (name) return `ref-${name}-${number}`;
  return `ref-${number}`;
}

export function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  while (used.has(`${base}-${i}`)) i += 1;
  const next = `${base}-${i}`;
  used.add(next);
  return next;
}

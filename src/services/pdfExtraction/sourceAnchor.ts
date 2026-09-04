export function djb2Hash(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function normalizedTextHash(text: string, page: number, x: number, y: number): string {
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
  return djb2Hash(`${page}|${Math.round(x)}|${Math.round(y)}|${norm}`);
}

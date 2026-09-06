/** Keep a Figure/Table label out of its accompanying caption text. */
export function splitCaptionLabel(
  caption: string,
  fallbackLabel: string
): { label: string; text: string } {
  const trimmed = caption.trim();
  const match = trimmed.match(
    /^(Figure|Fig\.?|Table|図|表)\s*([\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)\s*[:.：]?\s*/i
  );
  if (!match) return { label: fallbackLabel, text: trimmed };

  const label = `${match[1]} ${match[2]}`.replace(/^図\s+/, "図 ").replace(/^表\s+/, "表 ");
  return { label, text: trimmed.slice(match[0].length).trimStart() };
}

import { parseGrobidHeaderTei } from "./tei";
import type { GrobidHeader } from "../types";

/**
 * Optional local GROBID client. Never defaults to a public cloud host.
 * Set GROBID_URL (e.g. http://127.0.0.1:8070) to enable live calls.
 */
export function grobidBaseUrl(): string | null {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.GROBID_URL;
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  if (/openai|anthropic|googleapis|adobe\.com/i.test(trimmed)) {
    throw new Error("GROBID_URL must be a local service, not a cloud parser");
  }
  return trimmed;
}

export async function processHeaderDocument(
  pdfBytes: Uint8Array,
  filename = "paper.pdf"
): Promise<GrobidHeader> {
  const base = grobidBaseUrl();
  if (!base) {
    throw new Error("GROBID_URL is not set; live GROBID is skipped");
  }

  const form = new FormData();
  const copy = Uint8Array.from(pdfBytes);
  form.append(
    "input",
    new Blob([copy], { type: "application/pdf" }),
    filename
  );
  form.append("consolidateHeader", "0");

  const response = await fetch(`${base}/api/processHeaderDocument`, {
    method: "POST",
    headers: { Accept: "application/xml" },
    body: form,
  });
  if (!response.ok) {
    throw new Error(`GROBID ${response.status}`);
  }
  const xml = await response.text();
  return parseGrobidHeaderTei(xml);
}

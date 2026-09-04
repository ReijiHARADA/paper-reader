import type { GrobidHeader } from "../types";

function stripTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function firstMatch(xml: string, re: RegExp): string | null {
  const match = xml.match(re);
  return match?.[1] ? stripTags(match[1]) : null;
}

function allMatches(xml: string, re: RegExp): string[] {
  return [...xml.matchAll(re)].map((m) => stripTags(m[1] ?? "")).filter(Boolean);
}

function personName(authorXml: string): string | null {
  const surname = firstMatch(authorXml, /<surname[^>]*>([\s\S]*?)<\/surname>/i);
  const forenames = allMatches(authorXml, /<forename[^>]*>([\s\S]*?)<\/forename>/gi);
  const parts = [...forenames, surname].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function affiliationText(authorXml: string): string | null {
  const org = firstMatch(authorXml, /<orgName[^>]*>([\s\S]*?)<\/orgName>/i);
  if (org) return org;
  return firstMatch(authorXml, /<affiliation[^>]*>([\s\S]*?)<\/affiliation>/i);
}

/**
 * Minimal TEI header parser for PoC. Not a full GROBID client.
 */
export function parseGrobidHeaderTei(xml: string): GrobidHeader {
  const title =
    firstMatch(xml, /<title[^>]*type="main"[^>]*>([\s\S]*?)<\/title>/i) ??
    firstMatch(xml, /<titleStmt>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i);

  const authorBlocks = [...xml.matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/gi)].map(
    (m) => m[1] ?? ""
  );
  const authors: string[] = [];
  const affiliations: string[] = [];
  const links: GrobidHeader["links"] = [];

  for (const block of authorBlocks) {
    const name = personName(block);
    const affiliation = affiliationText(block);
    if (name) authors.push(name);
    if (affiliation && !affiliations.includes(affiliation)) affiliations.push(affiliation);
    if (name && affiliation) links.push({ author: name, affiliation });
  }

  const abstract = firstMatch(xml, /<abstract\b[^>]*>([\s\S]*?)<\/abstract>/i);

  return {
    title,
    authors,
    affiliations,
    links,
    abstract,
  };
}

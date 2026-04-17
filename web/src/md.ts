import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true });

const WIKI_LINK_RE = /\[\[([^\]]+)]]/g;

/** Targets inside `[[...]]` wiki links (trimmed), in document order. */
export function extractWikiLinkTargets(md: string): string[] {
  const out: string[] = [];
  const text = md || "";
  WIKI_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKI_LINK_RE.exec(text)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

/** Resolve `[[Note title]]` to in-app note links when title matches (case-insensitive). */
export function mdToHtml(md: string, wikiIndex?: { id: string; title: string }[]): string {
  WIKI_LINK_RE.lastIndex = 0;
  let text = md || "";
  if (wikiIndex?.length) {
    text = text.replace(WIKI_LINK_RE, (_, raw: string) => {
      const t = raw.trim();
      const hit = wikiIndex.find(n => n.title.trim().toLowerCase() === t.toLowerCase());
      if (hit) return `[${t}](#brain-note-${hit.id})`;
      return `**${t}** (no note titled)`;
    });
  }
  const html = marked.parse(text, { async: false }) as string;
  const clean = DOMPurify.sanitize(html);
  return clean.replace(
    /href="#brain-note-([^"]+)"/g,
    'href="#" class="wiki-link" data-note-target="$1"'
  );
}

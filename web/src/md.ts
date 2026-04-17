import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true });

/** Resolve `[[Note title]]` to in-app note links when title matches (case-insensitive). */
export function mdToHtml(md: string, wikiIndex?: { id: string; title: string }[]): string {
  let text = md || "";
  if (wikiIndex?.length) {
    text = text.replace(/\[\[([^\]]+)]]/g, (_, raw: string) => {
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

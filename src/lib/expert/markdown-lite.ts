import { isInAppHref } from "./nav";

export type InlinePart =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "link"; text: string; href: string };

export type BlockPart =
  | { type: "p"; parts: InlinePart[] }
  | { type: "ul"; items: InlinePart[][] }
  | { type: "ol"; items: InlinePart[][] };

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  const re = new RegExp(INLINE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push({ type: "text", text: text.slice(last, match.index) });
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push({ type: "bold", text: token.slice(2, -2) });
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link && isInAppHref(link[2])) {
        parts.push({ type: "link", text: link[1], href: link[2] });
      } else {
        parts.push({ type: "text", text: token });
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts.length ? parts : [{ type: "text", text }];
}

export function parseMarkdownLite(text: string): BlockPart[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: BlockPart[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === "") {
      i += 1;
      continue;
    }
    if (/^[-*] /.test(lines[i])) {
      const items: InlinePart[][] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^[-*] /, "")));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\d+\. /.test(lines[i])) {
      const items: InlinePart[][] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\d+\. /, "")));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^[-*] /.test(lines[i]) && !/^\d+\. /.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "p", parts: parseInline(para.join(" ")) });
  }
  return blocks;
}

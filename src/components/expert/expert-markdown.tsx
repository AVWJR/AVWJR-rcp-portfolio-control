import Link from "next/link";
import { parseMarkdownLite, type InlinePart } from "@/lib/expert/markdown-lite";

function Inline({ parts }: { parts: InlinePart[] }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "bold") {
          return (
            <strong key={i} className="font-semibold text-navy-900">
              {part.text}
            </strong>
          );
        }
        if (part.type === "link") {
          return (
            <Link
              key={i}
              href={part.href}
              className="font-medium text-navy-700 underline decoration-gold-500 underline-offset-2 hover:text-navy-900"
            >
              {part.text}
            </Link>
          );
        }
        return <span key={i}>{part.text}</span>;
      })}
    </>
  );
}

export function ExpertMarkdown({ text }: { text: string }) {
  const blocks = parseMarkdownLite(text);
  return (
    <div className="space-y-2 text-[13px] leading-5 text-ink-700">
      {blocks.map((block, i) => {
        if (block.type === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-4">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline parts={item} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-4">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline parts={item} />
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i}>
            <Inline parts={block.parts} />
          </p>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import { Fragment } from "react";

/**
 * Minimal, safe Markdown renderer for CMS pages (headings, paragraphs, bullet/numbered lists,
 * **bold**, *italic*, [links](url)). Everything is rendered as React text nodes — no raw HTML.
 */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      const href = mm[2]!;
      const safe = /^(https?:\/\/|\/|mailto:|tel:)/i.test(href) ? href : "#";
      out.push(
        safe.startsWith("/") ? (
          <Link key={k} href={safe} className="font-medium text-brand-700 underline underline-offset-2">
            {mm[1]}
          </Link>
        ) : (
          <a key={k} href={safe} rel="noopener noreferrer nofollow" target="_blank" className="font-medium text-brand-700 underline underline-offset-2">
            {mm[1]}
          </a>
        ),
      );
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(
        <p key={k} className="leading-7 text-slate-700">
          {inline(para.join(" "), k)}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
      blocks.push(
        list.ordered ? (
          <ol key={k} className="list-decimal space-y-1.5 pl-6 text-slate-700">
            {items}
          </ol>
        ) : (
          <ul key={k} className="list-disc space-y-1.5 pl-6 text-slate-700 marker:text-brand-500">
            {items}
          </ul>
        ),
      );
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      const level = h[1]!.length;
      const k = `h${blocks.length}`;
      const cls = level === 1 ? "text-2xl font-bold mt-2" : level === 2 ? "text-xl font-semibold mt-4" : "text-lg font-semibold mt-3";
      const content = inline(h[2]!, k);
      blocks.push(level <= 1 ? <h2 key={k} className={cls}>{content}</h2> : level === 2 ? <h2 key={k} className={cls}>{content}</h2> : <h3 key={k} className={cls}>{content}</h3>);
    } else if (ul || ol) {
      flushPara();
      const ordered = Boolean(ol);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((ul ?? ol)![1]!);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className={className ?? "space-y-4"}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}

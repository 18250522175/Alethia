import { useEffect, useMemo, useRef } from 'react';
import MarkdownIt from 'markdown-it';
import matter from 'gray-matter';
import hljs from 'highlight.js/lib/common';
import { useTranslation } from 'react-i18next';
import { CaretRight } from '@phosphor-icons/react';
import type { EvidenceSpan } from '@shared/evidence';

interface MarkdownRendererProps {
  content: string;
  evidenceSpans?: EvidenceSpan[] | Partial<EvidenceSpan>[];
  showFrontmatter?: boolean;
  onEvidenceClick?: (spanId: string) => void;
}

/* ----------------------------- helpers ----------------------------- */

function shortenId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 6)}…` : id;
}

/** Remove footnote definitions like `[^span_id]: text` (handled separately as evidence markers). */
function stripFootnoteDefs(text: string): string {
  return text
    .replace(/^[ \t]*\[\^[^\]\s]+\]:.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

const COLLAPSIBLE_PATTERNS = [
  /^version\s*history$/i,
  /^changelog$/i,
  /版本历史|版本变更|变更记录/,
  /^semantic\s*rings?$/i,
  /语义年轮|语义环|年轮/
];

function isCollapsibleHeading(heading: string): boolean {
  const h = heading.trim();
  return COLLAPSIBLE_PATTERNS.some(p => p.test(h));
}

interface Section {
  heading: string;
  level: number;
  headingLine: string;
  body: string;
}

/** Split markdown into sections by headings (ignoring fenced code blocks). */
function splitSections(text: string): Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];
  let heading = '';
  let level = 0;
  let headingLine = '';
  let body: string[] = [];
  let inFence = false;

  const flush = () => {
    if (heading || body.some(l => l.trim())) {
      sections.push({ heading, level, headingLine, body: body.join('\n') });
    }
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = !inFence ? line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/) : null;
    if (m) {
      flush();
      heading = m[2];
      level = m[1].length;
      headingLine = line;
      body = [];
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

/* --------------------- module-level markdown-it instance --------------------- */

const QUOTE_SVG =
  '<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2.5 3a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 .5.5h2.4l-1 3.4a.5.5 0 0 0 .48.64h1.06a.5.5 0 0 0 .46-.3L7.8 8.2a.5.5 0 0 0 .04-.2V3.5a.5.5 0 0 0-.5-.5h-4.84Zm6.5 0a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 .5.5h2.4l-1 3.4a.5.5 0 0 0 .48.64h1.06a.5.5 0 0 0 .46-.3L14.3 8.2a.5.5 0 0 0 .04-.2V3.5a.5.5 0 0 0-.5-.5H9Z"/></svg>';
const MEDIA_SVG =
  '<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3.5 1A1.5 1.5 0 0 0 2 2.5v12a.5.5 0 0 0 .76.43L8 11.83l5.24 3.1A.5.5 0 0 0 14 14.5v-12A1.5 1.5 0 0 0 12.5 1h-9Z"/></svg>';

const md: MarkdownIt = new MarkdownIt({
  html: false, // XSS 防护：不渲染原始 HTML
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(code, lang) {
    const langName = (lang || '').trim().toLowerCase();
    if (langName && hljs.getLanguage(langName)) {
      try {
        return `<pre class="hljs code-block"><code>${hljs.highlight(code, { language: langName }).value}</code></pre>`;
      } catch {
        /* fall through */
      }
    }
    return `<pre class="hljs code-block"><code>${md.utils.escapeHtml(code)}</code></pre>`;
  }
});

/* evidence_span：将 `[^span_id]` 渲染为可点击的角标 */
md.inline.ruler.before('link', 'evidence_span', (state, silent) => {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x5b /* [ */ || src.charCodeAt(start + 1) !== 0x5e /* ^ */) {
    return false;
  }
  let end = start + 2;
  while (end < state.posMax && src.charCodeAt(end) !== 0x5d /* ] */ && src.charCodeAt(end) !== 0x0a /* \n */) {
    end++;
  }
  if (end >= state.posMax || src.charCodeAt(end) !== 0x5d) return false;
  const label = src.slice(start + 2, end);
  if (!label || /\s/.test(label)) return false;
  if (!silent) {
    const token = state.push('evidence_span', 'sup', 0);
    token.content = label;
    token.markup = '[^]';
  }
  state.pos = end + 1;
  return true;
});

md.renderer.rules.evidence_span = (tokens, idx, _opts, env) => {
  const spanId = tokens[idx].content;
  const known = env && env.evidenceIds instanceof Set ? env.evidenceIds.has(spanId) : true;
  const cls = known ? 'evidence-marker evidence-known' : 'evidence-marker evidence-unknown';
  const safeId = md.utils.escapeHtml(spanId);
  return `<sup class="${cls}" data-span-id="${safeId}" role="button" tabindex="0" title="Evidence · ${safeId}">${QUOTE_SVG}<span class="evidence-label">${md.utils.escapeHtml(shortenId(spanId))}</span></sup>`;
};

/* media plugin：`library://hash` 链接渲染为媒体引用角标 */
const origLinkOpen = md.renderer.rules.link_open;
const origLinkClose = md.renderer.rules.link_close;

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') || '';
  if (href.startsWith('library://')) {
    const hash = href.slice('library://'.length);
    env._mediaStack = env._mediaStack || [];
    env._mediaStack.push(true);
    const safeHash = md.utils.escapeHtml(hash);
    return `<sup class="media-ref" data-hash="${safeHash}" title="Media · ${safeHash}">${MEDIA_SVG}`;
  }
  env._mediaStack = env._mediaStack || [];
  env._mediaStack.push(false);
  return origLinkOpen ? origLinkOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

md.renderer.rules.link_close = (tokens, idx, options, env, self) => {
  const stack: boolean[] = (env._mediaStack = env._mediaStack || []);
  const isMedia = stack.length > 0 ? !!stack.pop() : false;
  if (isMedia) return '</sup>';
  return origLinkClose ? origLinkClose(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

/* ----------------------------- prose styles ----------------------------- */

const PROSE_CLASS = [
  'text-slate-700 dark:text-slate-300 leading-7',
  '[&_p]:my-3 [&_p]:leading-7 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
  // headings
  '[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-slate-900 dark:[&_h1]:text-slate-100',
  '[&_h2]:mt-5 [&_h2]:mb-2.5 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100 [&_h2]:border-b [&_h2]:border-slate-200 dark:[&_h2]:border-slate-700 [&_h2]:pb-1.5',
  '[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-slate-900 dark:[&_h3]:text-slate-100',
  '[&_h4]:mt-3 [&_h4]:mb-1.5 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-slate-800 dark:[&_h4]:text-slate-200',
  '[&_h5]:mt-3 [&_h5]:mb-1 [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:text-slate-700 dark:[&_h5]:text-slate-300',
  '[&_h6]:mt-3 [&_h6]:mb-1 [&_h6]:text-sm [&_h6]:font-medium [&_h6]:text-slate-500 dark:[&_h6]:text-slate-400',
  // links
  '[&_a]:text-primary-600 dark:[&_a]:text-primary-400 [&_a]:underline [&_a]:decoration-primary-400/40 [&_a]:underline-offset-2 [&_a]:transition-colors [&_a:hover]:text-primary-700 dark:[&_a:hover]:text-primary-300',
  // emphasis
  '[&_strong]:font-semibold [&_strong]:text-slate-900 dark:[&_strong]:text-slate-100',
  '[&_em]:italic [&_em]:text-slate-600 dark:[&_em]:text-slate-400',
  '[&_del]:text-slate-400 dark:[&_del]:text-slate-500',
  // lists
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1',
  '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1',
  '[&_li]:leading-6 [&_li::marker]:text-slate-400 dark:[&_li::marker]:text-slate-500',
  '[&_li_ul]:my-1 [&_li_ol]:my-1',
  // blockquote
  '[&_blockquote]:my-4 [&_blockquote]:rounded-r-lg [&_blockquote]:border-l-4 [&_blockquote]:border-primary-400 dark:[&_blockquote]:border-primary-500 [&_blockquote]:bg-primary-50 dark:[&_blockquote]:bg-primary-900/20 [&_blockquote]:py-1 [&_blockquote]:pl-4 [&_blockquote]:pr-3 [&_blockquote]:not-italic',
  '[&_blockquote_p]:my-1 [&_blockquote_p]:text-slate-600 dark:[&_blockquote_p]:text-slate-300',
  // inline code
  '[&_code]:rounded [&_code]:bg-slate-100 dark:[&_code]:bg-slate-700/60 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:font-mono [&_code]:text-primary-700 dark:[&_code]:text-primary-300 [&_code]:break-words',
  // code block (highlight.js 输出 <pre class="hljs code-block"><code>…</code></pre>)
  '[&_pre.hljs]:my-4 [&_pre.hljs]:overflow-x-auto [&_pre.hljs]:rounded-lg [&_pre.hljs]:border [&_pre.hljs]:border-slate-200 dark:[&_pre.hljs]:border-slate-700 [&_pre.hljs]:bg-slate-50 dark:[&_pre.hljs]:bg-slate-900 [&_pre.hljs]:p-4 [&_pre.hljs]:text-sm [&_pre.hljs]:leading-6',
  '[&_pre.hljs_code]:bg-transparent dark:[&_pre.hljs_code]:bg-transparent [&_pre.hljs_code]:p-0 [&_pre.hljs_code]:text-sm [&_pre.hljs_code]:font-mono [&_pre.hljs_code]:text-slate-800 dark:[&_pre.hljs_code]:text-slate-200 [&_pre.hljs_code]:break-normal',
  // tables
  '[&_table]:my-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:rounded-lg [&_table]:text-sm',
  '[&_thead]:bg-slate-100 dark:[&_thead]:bg-slate-800',
  '[&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-700 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-slate-700 dark:[&_th]:text-slate-200',
  '[&_td]:border [&_td]:border-slate-200 dark:[&_td]:border-slate-700 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-slate-600 dark:[&_td]:text-slate-300',
  '[&_tbody_tr:nth-child(even)]:bg-slate-50/60 dark:[&_tbody_tr:nth-child(even)]:bg-slate-800/30',
  // hr / images
  '[&_hr]:my-6 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-slate-200 dark:[&_hr]:border-slate-700',
  '[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200 dark:[&_img]:border-slate-700',
  // evidence markers
  '[&_.evidence-marker]:mx-0.5 [&_.evidence-marker]:inline-flex [&_.evidence-marker]:items-center [&_.evidence-marker]:gap-0.5 [&_.evidence-marker]:px-1 [&_.evidence-marker]:py-px [&_.evidence-marker]:text-[0.7em] [&_.evidence-marker]:font-semibold [&_.evidence-marker]:rounded [&_.evidence-marker]:no-underline [&_.evidence-marker]:align-baseline [&_.evidence-marker]:cursor-pointer [&_.evidence-marker]:select-none [&_.evidence-marker]:transition-colors',
  '[&_.evidence-marker.evidence-known]:bg-parchment-100 [&_.evidence-marker.evidence-known]:text-parchment-700 [&_.evidence-marker.evidence-known:hover]:bg-parchment-200 dark:[&_.evidence-marker.evidence-known]:bg-parchment-900/40 dark:[&_.evidence-marker.evidence-known]:text-parchment-300 dark:[&_.evidence-marker.evidence-known:hover]:bg-parchment-800/60',
  '[&_.evidence-marker.evidence-unknown]:bg-slate-100 [&_.evidence-marker.evidence-unknown]:text-slate-400 [&_.evidence-marker.evidence-unknown:hover]:bg-slate-200 dark:[&_.evidence-marker.evidence-unknown]:bg-slate-700/40 dark:[&_.evidence-marker.evidence-unknown]:text-slate-500 dark:[&_.evidence-marker.evidence-unknown:hover]:bg-slate-700',
  '[&_.evidence-marker:focus]:outline-none [&_.evidence-marker:focus]:ring-2 [&_.evidence-marker:focus]:ring-parchment-400 [&_.evidence-marker:focus]:ring-offset-1 dark:[&_.evidence-marker:focus]:ring-offset-slate-900',
  '[&_.evidence-label]:font-mono [&_.evidence-label]:text-[0.95em]',
  // media refs
  '[&_.media-ref]:mx-0.5 [&_.media-ref]:inline-flex [&_.media-ref]:items-center [&_.media-ref]:no-underline [&_.media-ref]:align-super [&_.media-ref]:text-[0.75em] [&_.media-ref]:text-primary-500 dark:[&_.media-ref]:text-primary-400 [&_.media-ref]:cursor-help [&_.media-ref:hover]:text-primary-700 dark:[&_.media-ref:hover]:text-primary-300 [&_.media-ref]:transition-colors'
].join(' ');

const HLJS_STYLE = `
.hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-name,.hljs-tag,.hljs-section,.hljs-class .hljs-title{color:#7c3aed}
.hljs-string,.hljs-title,.hljs-attribute,.hljs-literal,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-addition{color:#16a34a}
.hljs-comment,.hljs-quote,.hljs-deletion,.hljs-meta,.hljs-doctag{color:#94a3b8;font-style:italic}
.hljs-number,.hljs-symbol,.hljs-bullet,.hljs-link{color:#d97706}
.hljs-attr,.hljs-variable,.hljs-property,.hljs-params,.hljs-params .hljs-title{color:#0284c7}
.dark .hljs-keyword,.dark .hljs-selector-tag,.dark .hljs-built_in,.dark .hljs-name,.dark .hljs-tag,.dark .hljs-section{color:#c4b5fd}
.dark .hljs-string,.dark .hljs-title,.dark .hljs-attribute,.dark .hljs-literal,.dark .hljs-template-tag,.dark .hljs-template-variable,.dark .hljs-type,.dark .hljs-addition{color:#86efac}
.dark .hljs-comment,.dark .hljs-quote,.dark .hljs-deletion,.dark .hljs-meta,.dark .hljs-doctag{color:#64748b}
.dark .hljs-number,.dark .hljs-symbol,.dark .hljs-bullet,.dark .hljs-link{color:#fcd34d}
.dark .hljs-attr,.dark .hljs-variable,.dark .hljs-property,.dark .hljs-params{color:#7dd3fc}
`;

let hljsStyleInjected = false;
function injectHljsStyle() {
  if (hljsStyleInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.setAttribute('data-md-renderer-hljs', '');
  style.textContent = HLJS_STYLE;
  document.head.appendChild(style);
  hljsStyleInjected = true;
}
injectHljsStyle();

/* ------------------------------- component ------------------------------- */

interface RenderedSection {
  heading: string;
  level: number;
  collapsible: boolean;
  html: string;
  bodyHtml: string;
}

export default function MarkdownRenderer({
  content,
  evidenceSpans,
  showFrontmatter = false,
  onEvidenceClick
}: MarkdownRendererProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const env = useMemo(() => {
    const evidenceIds = new Set<string>();
    const evidenceMap = new Map<string, Partial<EvidenceSpan>>();
    (evidenceSpans || []).forEach(s => {
      if (s.span_id) {
        evidenceIds.add(s.span_id);
        evidenceMap.set(s.span_id, s);
      }
    });
    return { evidenceIds, evidenceMap };
  }, [evidenceSpans]);

  const { frontmatter, renderedSections } = useMemo<{ frontmatter: Record<string, unknown>; renderedSections: RenderedSection[] }>(() => {
    let data: Record<string, unknown> = {};
    let body = content;
    try {
      const parsed = matter(content);
      data = (parsed.data as Record<string, unknown>) || {};
      body = parsed.content;
    } catch {
      data = {};
      body = content;
    }
    const stripped = stripFootnoteDefs(body);
    const sections = splitSections(stripped);
    const rendered = sections.map(s => {
      const fullMd = s.headingLine ? `${s.headingLine}\n${s.body}` : s.body;
      return {
        heading: s.heading,
        level: s.level,
        collapsible: isCollapsibleHeading(s.heading),
        html: md.render(fullMd, env),
        bodyHtml: md.render(s.body, env)
      };
    });
    return { frontmatter: data, renderedSections: rendered };
  }, [content, env]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const activate = (target: HTMLElement) => {
      const node = target.closest('.evidence-marker, .media-ref') as HTMLElement | null;
      if (!node) return;
      if (node.classList.contains('evidence-marker')) {
        const spanId = node.getAttribute('data-span-id') || '';
        onEvidenceClick?.(spanId);
      }
    };
    const onClick = (e: MouseEvent) => activate(e.target as HTMLElement);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      activate(e.target as HTMLElement);
    };
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('keydown', onKey);
    };
  }, [onEvidenceClick]);

  const frontmatterEntries = useMemo(
    () => (frontmatter && typeof frontmatter === 'object' ? Object.entries(frontmatter) : []),
    [frontmatter]
  );

  return (
    <div ref={containerRef} className="markdown-renderer">
      {showFrontmatter && frontmatterEntries.length > 0 && (
        <dl className="card mb-5 grid animate-fade-in grid-cols-1 gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
          {frontmatterEntries.map(([k, v]) => (
            <div key={k} className="flex items-start gap-2">
              <dt className="min-w-[5rem] font-mono text-xs text-slate-500 dark:text-slate-400">{k}</dt>
              <dd className="flex-1 break-words text-slate-800 dark:text-slate-200">{renderFrontmatterValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="markdown-body">
        {renderedSections.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">{t('common.loading')}</p>
        ) : (
          renderedSections.map((s, i) =>
            s.collapsible && s.heading ? (
              <details
                key={i}
                className="group my-4 animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 open:bg-white dark:border-slate-700 dark:bg-slate-800/40 dark:open:bg-slate-800/60"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold text-slate-800 select-none dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                  <CaretRight
                    size={16}
                    className="text-parchment-500 transition-transform duration-200 group-open:rotate-90"
                  />
                  <span>{s.heading}</span>
                </summary>
                <div className={`${PROSE_CLASS} px-4 pb-4 pt-1`} dangerouslySetInnerHTML={{ __html: s.bodyHtml }} />
              </details>
            ) : (
              <div key={i} className={PROSE_CLASS} dangerouslySetInnerHTML={{ __html: s.html }} />
            )
          )
        )}
      </div>
    </div>
  );
}

function renderFrontmatterValue(v: unknown) {
  if (v === null || v === undefined) return <span className="text-slate-400">—</span>;
  if (Array.isArray(v)) {
    return (
      <span className="flex flex-wrap gap-1">
        {v.map((item, i) => (
          <span key={i} className="badge badge-blue">
            {String(item)}
          </span>
        ))}
      </span>
    );
  }
  if (typeof v === 'object') return <code className="font-mono text-xs">{JSON.stringify(v)}</code>;
  const str = String(v);
  if (/^(true|false)$/i.test(str)) return <span className="badge badge-green">{str}</span>;
  if (/^-?\d+(\.\d+)?$/.test(str)) return <span className="font-mono">{str}</span>;
  return <span>{str}</span>;
}

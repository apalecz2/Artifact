import React from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * A deliberately minimal Markdown renderer for the legal documents (Privacy, EULA).
 * It supports exactly the constructs those documents use — headings, paragraphs,
 * unordered lists, bold, italics, inline code, links, and horizontal rules — and
 * nothing else, so it carries no third-party dependency (which would itself need a
 * NOTICES entry). It is NOT a general Markdown engine; documents with tables or
 * other constructs (e.g. NOTICES.md) are rendered as preformatted text instead.
 *
 * Links open in the system browser via the opener plugin rather than navigating the
 * webview, and relative links to sibling docs (e.g. `PRIVACY.md`) are rewritten to
 * in-app legal routes so cross-references stay inside the app.
 */

const RELATIVE_DOC_ROUTES: Record<string, string> = {
    'PRIVACY.md': '#/legal/privacy',
    'EULA.md': '#/legal/terms',
    'NOTICES.md': '#/legal/notices',
};

// Split inline text into bold / italic / code / link spans. Kept simple: the
// legal docs use `**bold**`, `*italic*`, `` `code` ``, and `[text](url)` only.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let i = 0;
    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(text.slice(lastIndex, match.index));
        }
        const key = `${keyPrefix}-${i++}`;
        if (match[1] !== undefined) {
            nodes.push(<strong key={key} className="font-semibold text-on-surface">{match[1]}</strong>);
        } else if (match[2] !== undefined) {
            nodes.push(<em key={key}>{match[2]}</em>);
        } else if (match[3] !== undefined) {
            nodes.push(
                <code key={key} className="rounded bg-surface-container-high px-1 py-0.5 font-mono text-[0.85em]">
                    {match[3]}
                </code>,
            );
        } else if (match[4] !== undefined && match[5] !== undefined) {
            const label = match[4];
            const href = match[5];
            const inApp = RELATIVE_DOC_ROUTES[href];
            if (inApp) {
                nodes.push(<a key={key} href={inApp} className="text-primary underline underline-offset-2">{label}</a>);
            } else if (/^https?:\/\//.test(href) || href.startsWith('mailto:')) {
                nodes.push(
                    <a
                        key={key}
                        href={href}
                        onClick={(e) => { e.preventDefault(); void openUrl(href); }}
                        className="text-primary underline underline-offset-2 cursor-pointer"
                    >
                        {label}
                    </a>,
                );
            } else {
                nodes.push(label);
            }
        }
        lastIndex = pattern.lastIndex;
    }
    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
}

export default function Markdown({ source }: { source: string }): React.ReactElement {
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const blocks: React.ReactNode[] = [];
    let listItems: string[] = [];
    let paraLines: string[] = [];
    let quoteLines: string[] = [];
    let key = 0;

    // A paragraph/list item/blockquote is a run of consecutive source lines. We buffer
    // those lines and join them into one string before inline parsing, so a soft-wrapped
    // construct is rendered as a single element — and, critically, so an emphasis span
    // that wraps across a line break (`**bold\ntext**`) still matches renderInline's
    // pattern instead of leaking literal asterisks.

    const flushList = () => {
        if (listItems.length === 0) return;
        const items = listItems;
        listItems = [];
        blocks.push(
            <ul key={`ul-${key++}`} className="my-3 flex list-disc flex-col gap-1.5 pl-6 text-on-surface-variant">
                {items.map((item, idx) => (
                    <li key={idx} className="font-body-md text-body-md leading-relaxed">
                        {renderInline(item, `li-${key}-${idx}`)}
                    </li>
                ))}
            </ul>,
        );
    };

    const flushParagraph = () => {
        if (paraLines.length === 0) return;
        const text = paraLines.join(' ');
        paraLines = [];
        blocks.push(
            <p key={`p-${key++}`} className="my-3 font-body-md text-body-md leading-relaxed text-on-surface-variant">
                {renderInline(text, `p-${key}`)}
            </p>,
        );
    };

    const flushQuote = () => {
        if (quoteLines.length === 0) return;
        const text = quoteLines.join(' ');
        quoteLines = [];
        blocks.push(
            <p key={`bq-${key++}`} className="my-3 rounded-lg border-l-4 border-primary/50 bg-surface-container px-4 py-3 font-body-md text-body-md text-on-surface-variant">
                {renderInline(text, `bq-${key}`)}
            </p>,
        );
    };

    const flushAll = () => { flushParagraph(); flushList(); flushQuote(); };

    for (const raw of lines) {
        const line = raw.trimEnd();
        const trimmed = line.trim();

        // Blank line: ends whatever block was open.
        if (trimmed === '') { flushAll(); continue; }

        // List item.
        const listMatch = /^[-*]\s+(.*)$/.exec(trimmed);
        if (listMatch) { flushParagraph(); flushQuote(); listItems.push(listMatch[1]); continue; }

        // Indented continuation of the current list item (a soft-wrapped bullet).
        if (listItems.length > 0 && /^\s/.test(line) && !/^(#{1,4}\s|>|---+$)/.test(trimmed)) {
            listItems[listItems.length - 1] += ' ' + trimmed;
            continue;
        }

        // Horizontal rule.
        if (/^---+$/.test(trimmed)) { flushAll(); blocks.push(<hr key={`hr-${key++}`} className="my-6 border-outline-variant" />); continue; }

        // Heading.
        const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
        if (heading) {
            flushAll();
            const level = heading[1].length;
            const content = renderInline(heading[2], `h-${key}`);
            const cls = level === 1
                ? 'font-display-sm text-display-sm text-primary tracking-tight mt-2 mb-4'
                : level === 2
                    ? 'font-headline-lg text-headline-lg text-on-surface mt-8 mb-2'
                    : 'font-headline-md text-headline-md text-on-surface mt-6 mb-2';
            blocks.push(React.createElement(`h${level}`, { key: `h-${key++}`, className: cls }, content));
            continue;
        }

        // Blockquote line: buffer consecutive `>` lines into one callout.
        const quote = /^>\s?(.*)$/.exec(trimmed);
        if (quote) { flushParagraph(); flushList(); quoteLines.push(quote[1]); continue; }

        // Ordinary paragraph text.
        flushList(); flushQuote();
        paraLines.push(trimmed);
    }
    flushAll();

    return <div>{blocks}</div>;
}

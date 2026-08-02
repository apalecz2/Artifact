import { useState, useRef, useEffect } from 'react';
import type { ProvenanceCell } from '../extraction/types';
import { parseCSV } from '../llama/promptUtils';
import { toCsv, toHtml, toMarkdown, toPlainText, saveWithDialog, saveXlsxWithDialog } from './exportUtils';
import type { SaveFormat } from './exportUtils';
import { copyTextToClipboard } from '../../utils/clipboard';
import Icon from '../../components/Icon';

interface ExportMenuProps {
    provenanceCells: ProvenanceCell[][] | null;
    savedCsv: string | null;
    /** Filename stem (no extension) for the save dialog, e.g. "invoice_page1" */
    fileStem: string;
    disabled?: boolean;
    /** Open the menu above the trigger instead of below (for bottom-anchored toolbars) */
    openUp?: boolean;
    /** 'primary' marks this as the happy-path finish action (filled, on-brand);
     *  default is the neutral chrome-button look used elsewhere. */
    variant?: 'default' | 'primary';
    /** Drop the trigger's text label on a narrow container, leaving the icon —
     *  for the session's output toolbar, which shrinks with the split divider and
     *  runs out of room for its labels at `@3xl` (`outputToolbarLabelClass`,
     *  sessionToolbar.tsx — keep the two in step). Requires an `@container`
     *  ancestor, so it's opt-in rather than the default. */
    collapsible?: boolean;
}

function normalizeRows(
    provenanceCells: ProvenanceCell[][] | null,
    savedCsv: string | null
): string[][] {
    if (provenanceCells && provenanceCells.length > 0) {
        return provenanceCells.map(row => row.map(c => c.value));
    }
    if (savedCsv) return parseCSV(savedCsv);
    return [];
}

type ExportFormatKey = 'csv' | 'xlsx' | 'html' | 'md' | 'txt';

interface TextFormatEntry {
    kind: 'text';
    label: string;
    icon: string;
    serialize: (r: string[][]) => string;
    saveFormat: SaveFormat;
}

interface BinaryFormatEntry {
    kind: 'binary';
    label: string;
    icon: string;
    saveFormat: SaveFormat;
}

const FORMAT_CONFIG: Record<ExportFormatKey, TextFormatEntry | BinaryFormatEntry> = {
    csv:  { kind: 'text',   label: 'CSV',        icon: 'table_view',  serialize: toCsv,      saveFormat: { ext: 'csv',  label: 'CSV files',   filters: [{ name: 'CSV',   extensions: ['csv']  }] } },
    xlsx: { kind: 'binary', label: 'Excel',      icon: 'table_chart', saveFormat: { ext: 'xlsx', label: 'Excel files', filters: [{ name: 'Excel', extensions: ['xlsx'] }] } },
    html: { kind: 'text',   label: 'HTML',       icon: 'code',        serialize: toHtml,     saveFormat: { ext: 'html', label: 'HTML files',  filters: [{ name: 'HTML', extensions: ['html'] }] } },
    md:   { kind: 'text',   label: 'Markdown',   icon: 'article',     serialize: toMarkdown, saveFormat: { ext: 'md',   label: 'Markdown files', filters: [{ name: 'Markdown', extensions: ['md']   }] } },
    txt:  { kind: 'text',   label: 'Plain text', icon: 'text_fields', serialize: toPlainText, saveFormat: { ext: 'txt', label: 'Text files',  filters: [{ name: 'Text', extensions: ['txt']  }] } },
};

/** Transient result of the last action. Export is the app's terminal step, so a
 *  failure that says nothing is the worst place to be silent — the user walks away
 *  believing a file exists. `null` is the resting state; a *cancelled* save dialog
 *  is also `null`, since dismissing a dialog needs no report. */
type Feedback = { kind: 'copied' } | { kind: 'error'; message: string } | null;

/** How long feedback stays up. An error carries a reason worth reading (and often
 *  acting on), so it outlives the success tick by a wide margin. */
const FEEDBACK_MS: Record<Exclude<Feedback, null>['kind'], number> = { copied: 2000, error: 8000 };

/** Tauri rejects `invoke` with a plain string while the fs plugin rejects with an
 *  Error — keep whichever reason we were handed instead of replacing a specific
 *  cause ("The process cannot access the file") with a generic one. */
function describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Please try again.';
}

export function ExportMenu({ provenanceCells, savedCsv, fileStem, disabled, openUp, variant = 'default', collapsible }: ExportMenuProps) {
    const [open, setOpen] = useState(false);
    const [feedback, setFeedback] = useState<Feedback>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    useEffect(() => {
        if (!feedback) return;
        const timer = setTimeout(() => setFeedback(null), FEEDBACK_MS[feedback.kind]);
        return () => clearTimeout(timer);
    }, [feedback]);

    const rows = normalizeRows(provenanceCells, savedCsv);
    const hasData = rows.length > 0;
    const copied = feedback?.kind === 'copied';

    const handleExport = async (key: ExportFormatKey) => {
        setOpen(false);
        if (!hasData) return;
        setFeedback(null);
        const format = FORMAT_CONFIG[key];
        try {
            // Both helpers resolve `false` when the user dismisses the save dialog and
            // reject only when the write itself failed — so a cancel stays silent while
            // a real failure (locked file, no space, a grid too wide for XLSX) is named.
            if (format.kind === 'text') {
                await saveWithDialog(fileStem, format.serialize(rows), format.saveFormat);
            } else {
                await saveXlsxWithDialog(fileStem, rows, format.saveFormat);
            }
        } catch (error) {
            console.error(`Failed to export ${key}:`, error);
            setFeedback({
                kind: 'error',
                message: `Couldn’t save the ${format.label} file. ${describeError(error)}`,
            });
        }
    };

    const handleCopy = async () => {
        setOpen(false);
        if (!hasData) return;
        // `copyTextToClipboard` reports rather than throws, and brings the
        // `execCommand` fallback for webviews that withhold the async clipboard API.
        const ok = await copyTextToClipboard(toMarkdown(rows));
        setFeedback(ok
            ? { kind: 'copied' }
            : { kind: 'error', message: 'Couldn’t copy the table to the clipboard.' });
    };

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setOpen(o => !o)}
                disabled={disabled || !hasData}
                className={`flex h-9 items-center gap-1 text-sm rounded-lg disabled:opacity-50 transition-colors ${
                    collapsible ? 'px-2 @3xl:px-3' : 'px-3'
                } ${
                    variant === 'primary'
                        ? 'bg-primary text-on-primary hover:bg-primary/90'
                        : 'bg-surface-variant text-on-surface-variant hover:bg-surface-container-high'
                }`}
                aria-haspopup="true"
                aria-expanded={open}
                aria-label={copied ? 'Copied!' : 'Export'}
                title={copied ? 'Copied!' : 'Export table'}
            >
                <Icon name={copied ? 'check' : 'download'} size={16} />
                <span className={collapsible ? 'hidden @3xl:inline' : undefined}>{copied ? 'Copied!' : 'Export'}</span>
                <Icon name="expand_more" size={14} className="leading-none" />
            </button>

            {open && (
                <div className={`absolute right-0 z-50 min-w-40 rounded-xl border border-outline-variant bg-surface shadow-lg py-1 ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                    {(Object.entries(FORMAT_CONFIG) as [ExportFormatKey, typeof FORMAT_CONFIG[ExportFormatKey]][]).map(([key, { label, icon }]) => (
                        <button
                            key={key}
                            onClick={() => { void handleExport(key); }}
                            className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-variant transition-colors flex items-center gap-2"
                        >
                            <Icon name={icon} size={16} />
                            {label}
                        </button>
                    ))}
                    <div className="border-t border-outline-variant my-1" />
                    <button
                        onClick={() => { void handleCopy(); }}
                        className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-variant transition-colors flex items-center gap-2"
                    >
                        <Icon name="content_copy" size={16} />
                        Copy table
                    </button>
                </div>
            )}

            {/* A failed save has no other tell — the dialog simply closes, exactly as
                it does on a cancel. Anchored like the menu (and under the title bar's
                z-100), so it can't be clipped by the toolbar it sits in. */}
            {feedback?.kind === 'error' && (
                <div
                    role="alert"
                    className={`absolute right-0 z-50 w-64 max-w-[70vw] rounded-xl border border-error/40 bg-surface px-3 py-2 text-xs leading-relaxed text-error shadow-lg ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
                >
                    <span className="flex items-start gap-1.5">
                        <Icon name="error" size={14} className="mt-px shrink-0" />
                        <span className="min-w-0 wrap-break-word">{feedback.message}</span>
                    </span>
                </div>
            )}
        </div>
    );
}

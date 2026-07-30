import { useState, useRef, useEffect } from 'react';
import type { ProvenanceCell } from '../extraction/types';
import { parseCSV } from '../llama/promptUtils';
import { toCsv, toHtml, toMarkdown, toPlainText, saveWithDialog, saveXlsxWithDialog } from './exportUtils';
import type { SaveFormat } from './exportUtils';
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

export function ExportMenu({ provenanceCells, savedCsv, fileStem, disabled, openUp, variant = 'default', collapsible }: ExportMenuProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const rows = normalizeRows(provenanceCells, savedCsv);
    const hasData = rows.length > 0;

    const handleExport = async (key: ExportFormatKey) => {
        setOpen(false);
        if (!hasData) return;
        const format = FORMAT_CONFIG[key];
        if (format.kind === 'text') {
            await saveWithDialog(fileStem, format.serialize(rows), format.saveFormat);
        } else {
            await saveXlsxWithDialog(fileStem, rows, format.saveFormat);
        }
    };

    const handleCopy = () => {
        setOpen(false);
        if (!hasData) return;
        void navigator.clipboard.writeText(toMarkdown(rows)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
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
                        onClick={handleCopy}
                        className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-variant transition-colors flex items-center gap-2"
                    >
                        <Icon name="content_copy" size={16} />
                        Copy table
                    </button>
                </div>
            )}
        </div>
    );
}

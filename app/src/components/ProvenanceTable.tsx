import { useEffect, useRef, useState } from 'react';
import type { ProvenanceCell, TrustLevel } from '../features/extraction/types';

export type SelectedCell = { rowIndex: number; colIndex: number } | null;

// The review worklist predicate, shared by the toolbar (count/stepper) and this
// table: a cell needs a second look until its trust is high or the user has
// manually verified (or corrected) it.
export function needsReview(cell: ProvenanceCell): boolean {
    return !cell.verified && cell.confidence.trust !== 'high';
}

interface ProvenanceTableProps {
    rows: ProvenanceCell[][];
    onCellClick: (cell: ProvenanceCell) => void;
    selectedCell: SelectedCell;
    // Editing is enabled only when all three editing props are provided (the
    // read-only rendering elsewhere just omits them). The parent owns which cell
    // is in edit mode so keyboard shortcuts outside the table can open it.
    editingCell?: SelectedCell;
    onStartEdit?: (cell: ProvenanceCell) => void;
    onCommitEdit?: (cell: ProvenanceCell, value: string) => void;
    onCancelEdit?: () => void;
}

// Light mode uses pale pastels with dark text; dark mode uses a translucent deep
// tint over the dark surface with light text, so cells read as subtle tinted
// rows rather than glaring bright blocks.
const TRUST_BG: Record<TrustLevel, string> = {
    high:   'bg-green-100 hover:bg-green-200 dark:bg-green-500/15 dark:hover:bg-green-500/25',
    medium: 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/15 dark:hover:bg-amber-500/25',
    low:    'bg-red-100 hover:bg-red-200 dark:bg-red-500/15 dark:hover:bg-red-500/25',
};

const TRUST_TEXT: Record<TrustLevel, string> = {
    high:   'text-green-900 dark:text-green-200',
    medium: 'text-amber-900 dark:text-amber-200',
    low:    'text-red-900 dark:text-red-200',
};

// Blank cells follow the empty-cell rules: sessions persisted before the
// "empty" status existed stored them as unmatched/image_only, so a blank value
// is accepted as the signal too — either way, "blank" must not render as a
// failed match.
function isEmptyCell(cell: ProvenanceCell): boolean {
    return cell.matchStatus === 'empty' || cell.value.trim() === '';
}

// An empty cell carrying wordIds means provenance found unclaimed OCR text at
// the cell's location — the model may have dropped content. (Legacy blank
// cells never carry wordIds, so this only fires on new extractions.)
function hasOverlookedText(cell: ProvenanceCell): boolean {
    return isEmptyCell(cell) && cell.wordIds.length > 0;
}

function cellTooltip(cell: ProvenanceCell): string {
    if (cell.verified) {
        return cell.edited
            ? 'Manually corrected and verified. Double-click to edit again'
            : 'Manually verified against the source. Double-click to edit';
    }
    if (hasOverlookedText(cell)) {
        return 'Blank cell, but unextracted text was found at this spot. Click to see it in the source';
    }
    if (isEmptyCell(cell)) {
        return 'Blank cell';
    }
    if (cell.confidence.agreement === 'image_only') {
        return 'No matching OCR word. Value read from image only';
    }
    // null llmMean = unscored (value arrived as a single boundary-merged token, so
    // the logprob reflects tokenization, not value certainty) — show it as such
    // rather than a misleading 0%/low number.
    const llmStr = cell.confidence.llmMean != null
        ? `${(cell.confidence.llmMean * 100).toFixed(0)}%`
        : 'not scored';
    const ocrPct = cell.confidence.ocr != null ? `${cell.confidence.ocr.toFixed(0)}%` : 'N/A';
    const prefix = cell.matchStatus === 'fuzzy' ? 'Approximate OCR match, verify value | ' : '';
    return `${prefix}LLM confidence: ${llmStr} | OCR confidence: ${ocrPct}`;
}

function trustColor(cell: ProvenanceCell): string {
    // A manually verified cell is the strongest signal there is — the user
    // checked it against the source — so it renders as high trust regardless of
    // what the automatic scoring said.
    if (cell.verified) return `${TRUST_BG.high} ${TRUST_TEXT.high}`;
    // Overlooked text is a real warning (possible dropped content) — red like
    // low trust. A plain blank cell is neutral: no tint and no trust color, so
    // a sparse table doesn't read as a wall of warnings.
    if (hasOverlookedText(cell)) return `${TRUST_BG.low} ${TRUST_TEXT.low}`;
    if (isEmptyCell(cell)) return 'text-on-surface-variant hover:bg-surface-variant/40';
    return cell.confidence.agreement === 'image_only'
        ? 'bg-surface-variant/60 text-on-surface-variant hover:bg-surface-variant'
        : `${TRUST_BG[cell.confidence.trust]} ${TRUST_TEXT[cell.confidence.trust]}`;
}

// Black ring on the light cells, white on the dark-mode cells — either way it
// contrasts with the trust background it sits on.
const SELECTION_RING = ' ring-2 ring-black dark:ring-white ring-inset';

function cellClasses(cell: ProvenanceCell, isSelected: boolean): string {
    const base = 'border border-outline-variant px-3 py-2 text-sm cursor-pointer transition-colors';
    const ring = isSelected ? SELECTION_RING : '';
    return `${base} ${trustColor(cell)}${ring}`;
}

// Header cells carry real provenance/confidence too, so they get the same trust
// colors as data cells (previously they were always flat gray, implying
// "unverified" regardless of actual trust — review M14). A heavier bottom border
// and bolder text keep the header row visually distinct from the data it labels.
function headerClasses(cell: ProvenanceCell, isSelected: boolean): string {
    const base = 'border border-outline-variant border-b-2 border-b-on-surface/30 px-3 py-2 text-left text-sm font-semibold cursor-pointer transition-colors';
    const ring = isSelected ? SELECTION_RING : '';
    return `${base} ${trustColor(cell)}${ring}`;
}

// The "?" (no OCR source), "≈" (approximate match) and "!" (low confidence /
// overlooked text) indicators, shared by header and data cells. The "!" gives a
// low-trust cell a signal that isn't hue alone — the red tint is
// indistinguishable from green for red-green color-blind users (review #10).
// It's suppressed when another badge already marks the cell, so no cell ever
// carries two. Blank cells are badge-free unless overlooked source text was
// found at their location.
function CellBadges({ cell }: { cell: ProvenanceCell }) {
    // Verified wins over every warning badge: the user has already looked at
    // this cell, so re-flagging it would just re-open a closed question.
    if (cell.verified) {
        return (
            <span
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-green-600/15 px-1 text-[10px] font-medium leading-tight text-green-800 dark:text-green-300"
                title={cell.edited ? 'Manually corrected and verified' : 'Manually verified'}
            >
                ✓
            </span>
        );
    }
    if (isEmptyCell(cell)) {
        if (!hasOverlookedText(cell)) return null;
        return (
            <span
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-variant px-1 text-[10px] font-medium leading-tight text-on-surface-variant"
                title="Blank cell, but unextracted text was found here. Click to review the source"
            >
                !
            </span>
        );
    }
    const imageOnly = cell.confidence.agreement === 'image_only';
    const fuzzy = cell.matchStatus === 'fuzzy';
    return (
        <>
            {imageOnly && (
                <span
                    className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-variant px-1 text-[10px] font-medium leading-tight text-on-surface-variant"
                    title="No OCR match, source unverified"
                >
                    ?
                </span>
            )}
            {fuzzy && (
                <span
                    className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-variant px-1 text-[10px] font-medium leading-tight text-on-surface-variant"
                    title="Approximate OCR match, value differs slightly from OCR"
                >
                    ≈
                </span>
            )}
            {!imageOnly && !fuzzy && cell.confidence.trust === 'low' && (
                <span
                    className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-variant px-1 text-[10px] font-medium leading-tight text-on-surface-variant"
                    title="Low confidence, verify against the source"
                >
                    !
                </span>
            )}
        </>
    );
}

// Inline value editor rendered in place of a cell's content. Enter always
// commits (an unchanged commit is an explicit "this is correct" confirmation);
// Escape cancels; clicking away commits only if the value actually changed, so
// an accidental blur doesn't silently mark the cell verified.
function CellEditor({ cell, onCommit, onCancel }: {
    cell: ProvenanceCell;
    onCommit: (value: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(cell.value);
    const inputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);
    return (
        <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
                // Keep table-level shortcuts (arrow nav, space-to-verify) from
                // firing while typing.
                e.stopPropagation();
                if (e.key === 'Enter') onCommit(value);
                else if (e.key === 'Escape') onCancel();
            }}
            onBlur={() => {
                if (value.trim() !== cell.value.trim()) onCommit(value);
                else onCancel();
            }}
            aria-label="Edit cell value"
            className="w-full min-w-24 rounded border border-primary bg-surface px-1 py-0.5 text-sm font-normal text-on-surface outline-none"
        />
    );
}

export default function ProvenanceTable({
    rows,
    onCellClick,
    selectedCell,
    editingCell,
    onStartEdit,
    onCommitEdit,
    onCancelEdit,
}: ProvenanceTableProps) {
    // Bring the selected cell into view when selection changes — needed when the
    // selection comes from clicking a word on the image (e.g. the cell may be
    // scrolled out of the table's viewport). `nearest` keeps movement minimal so a
    // direct cell click that's already visible doesn't jump.
    const selectedRef = useRef<HTMLTableCellElement | null>(null);
    useEffect(() => {
        selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [selectedCell?.rowIndex, selectedCell?.colIndex]);

    if (rows.length === 0) return null;

    const headerRow = rows[0];
    const dataRows = rows.slice(1);

    const isSelected = (r: number, c: number) =>
        selectedCell?.rowIndex === r && selectedCell?.colIndex === c;
    const isEditing = (r: number, c: number) =>
        !!onCommitEdit && editingCell?.rowIndex === r && editingCell?.colIndex === c;

    const editable = !!onStartEdit && !!onCommitEdit && !!onCancelEdit;

    const cellContent = (cell: ProvenanceCell, r: number, c: number) =>
        isEditing(r, c) ? (
            <CellEditor
                cell={cell}
                onCommit={value => onCommitEdit!(cell, value)}
                onCancel={() => onCancelEdit!()}
            />
        ) : (
            <div className="flex items-center justify-between gap-1">
                <span>{cell.value}</span>
                <CellBadges cell={cell} />
            </div>
        );

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr>
                        {headerRow.map((cell, c) => (
                            <th
                                key={c}
                                ref={isSelected(0, c) ? selectedRef : undefined}
                                className={headerClasses(cell, isSelected(0, c))}
                                onClick={() => onCellClick(cell)}
                                onDoubleClick={editable ? () => onStartEdit!(cell) : undefined}
                                title={cellTooltip(cell)}
                            >
                                {cellContent(cell, 0, c)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {dataRows.map((row, ri) => (
                        <tr key={ri}>
                            {row.map((cell, c) => (
                                <td
                                    key={c}
                                    ref={isSelected(ri + 1, c) ? selectedRef : undefined}
                                    className={cellClasses(cell, isSelected(ri + 1, c))}
                                    onClick={() => onCellClick(cell)}
                                    onDoubleClick={editable ? () => onStartEdit!(cell) : undefined}
                                    title={cellTooltip(cell)}
                                >
                                    {cellContent(cell, ri + 1, c)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

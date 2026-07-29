import React, { useEffect, useRef, useState } from 'react';
import type { ProvenanceCell, TrustLevel } from '../features/extraction/types';
import type { CellRange } from '../features/extraction/tableEdits';

export type SelectedCell = { rowIndex: number; colIndex: number } | null;

/** Where the selection should land after an inline edit is committed. */
export type EditAdvance = 'down' | 'right' | null;

// The review worklist predicate, shared by the toolbar (count/stepper) and this
// table: a cell needs a second look until its trust is high or the user has
// manually verified (or corrected) it.
export function needsReview(cell: ProvenanceCell): boolean {
    return !cell.verified && cell.confidence.trust !== 'high';
}

/** Spreadsheet-style column label: A, B, … Z, AA, AB. */
export function columnLabel(index: number): string {
    let label = '';
    for (let i = index; i >= 0; i = Math.floor(i / 26) - 1) {
        label = String.fromCharCode(65 + (i % 26)) + label;
    }
    return label;
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
    onCommitEdit?: (cell: ProvenanceCell, value: string, advance?: EditAdvance) => void;
    onCancelEdit?: () => void;
    /** Opening value for the editor, when editing began by typing over the cell
     *  (otherwise the editor starts from the cell's current value). */
    editingInitialValue?: string;
    // Range selection. When `onCellPointerDown` is provided the table selects on
    // pointer-down rather than click (so Shift-click extends and drag paints a
    // range), and `onCellClick` is not wired — pointer-down covers it.
    selectionRange?: CellRange | null;
    onCellPointerDown?: (cell: ProvenanceCell, e: React.MouseEvent) => void;
    onCellPointerEnter?: (cell: ProvenanceCell) => void;
    onCellContextMenu?: (cell: ProvenanceCell, e: React.MouseEvent) => void;
    /** Row/column handle gutters — the affordance for whole-row/column edits.
     *  Requires the three selection callbacks below. */
    showHandles?: boolean;
    onSelectRow?: (rowIndex: number, e: React.MouseEvent) => void;
    onSelectColumn?: (colIndex: number, e: React.MouseEvent) => void;
    onSelectAll?: () => void;
    onHandleContextMenu?: (target: { kind: 'row' | 'column'; index: number }, e: React.MouseEvent) => void;
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
// The rest of a multi-cell selection: present but clearly subordinate to the
// anchor, which is the cell whose source is highlighted on the document.
const RANGE_RING = ' ring-2 ring-primary/45 ring-inset';

function cellClasses(cell: ProvenanceCell, isSelected: boolean, inRange: boolean): string {
    const base = 'border border-outline-variant px-3 py-2 text-sm cursor-pointer transition-colors';
    const ring = isSelected ? SELECTION_RING : inRange ? RANGE_RING : '';
    return `${base} ${trustColor(cell)}${ring}`;
}

// Header cells carry real provenance/confidence too, so they get the same trust
// colors as data cells (previously they were always flat gray, implying
// "unverified" regardless of actual trust — review M14). A heavier bottom border
// and bolder text keep the header row visually distinct from the data it labels.
function headerClasses(cell: ProvenanceCell, isSelected: boolean, inRange: boolean): string {
    const base = 'border border-outline-variant border-b-2 border-b-on-surface/30 px-3 py-2 text-left text-sm font-semibold cursor-pointer transition-colors';
    const ring = isSelected ? SELECTION_RING : inRange ? RANGE_RING : '';
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
// commits (an unchanged commit is an explicit "this is correct" confirmation)
// and moves down a row; Tab commits and moves right; Escape cancels; clicking
// away commits only if the value actually changed, so an accidental blur
// doesn't silently mark the cell verified.
function CellEditor({ cell, initialValue, onCommit, onCancel }: {
    cell: ProvenanceCell;
    initialValue?: string;
    onCommit: (value: string, advance: EditAdvance) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(initialValue ?? cell.value);
    const inputRef = useRef<HTMLInputElement | null>(null);
    // Typing into the cell to start the edit is a replace, so the caret goes
    // after the typed character; opening the editor deliberately selects the
    // existing value so it can be replaced or edited.
    useEffect(() => {
        inputRef.current?.focus();
        if (initialValue === undefined) inputRef.current?.select();
    }, [initialValue]);
    return (
        <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onKeyDown={e => {
                // Keep table-level shortcuts (arrow nav, space-to-verify) from
                // firing while typing.
                e.stopPropagation();
                if (e.key === 'Enter') onCommit(value, 'down');
                else if (e.key === 'Tab') { e.preventDefault(); onCommit(value, e.shiftKey ? null : 'right'); }
                else if (e.key === 'Escape') onCancel();
            }}
            onBlur={() => {
                if (value.trim() !== cell.value.trim()) onCommit(value, null);
                else onCancel();
            }}
            aria-label="Edit cell value"
            // select-text overrides the grid's select-none (below) so the value
            // being edited can still be selected with the mouse.
            className="w-full min-w-24 select-text rounded border border-primary bg-surface px-1 py-0.5 text-sm font-normal text-on-surface outline-none"
        />
    );
}

const HANDLE_BASE = 'select-none border border-outline-variant px-1 py-1 text-center align-middle text-[10px] font-normal leading-none text-on-surface-variant transition-colors';

export default function ProvenanceTable({
    rows,
    onCellClick,
    selectedCell,
    editingCell,
    onStartEdit,
    onCommitEdit,
    onCancelEdit,
    editingInitialValue,
    selectionRange,
    onCellPointerDown,
    onCellPointerEnter,
    onCellContextMenu,
    showHandles,
    onSelectRow,
    onSelectColumn,
    onSelectAll,
    onHandleContextMenu,
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
    const inRange = (r: number, c: number) =>
        !!selectionRange &&
        r >= selectionRange.top && r <= selectionRange.bottom &&
        c >= selectionRange.left && c <= selectionRange.right;
    const isEditing = (r: number, c: number) =>
        !!onCommitEdit && editingCell?.rowIndex === r && editingCell?.colIndex === c;

    const editable = !!onStartEdit && !!onCommitEdit && !!onCancelEdit;
    const handles = !!showHandles && !!onSelectRow && !!onSelectColumn;
    const rowInRange = (r: number) => !!selectionRange && r >= selectionRange.top && r <= selectionRange.bottom;
    const colInRange = (c: number) => !!selectionRange && c >= selectionRange.left && c <= selectionRange.right;
    const handleTone = (active: boolean) =>
        active ? 'bg-primary/20 text-on-surface' : 'bg-surface-variant/70 hover:bg-surface-container-high';

    const cellContent = (cell: ProvenanceCell, r: number, c: number) =>
        isEditing(r, c) ? (
            <CellEditor
                cell={cell}
                initialValue={editingInitialValue}
                onCommit={(value, advance) => onCommitEdit!(cell, value, advance)}
                onCancel={() => onCancelEdit!()}
            />
        ) : (
            <div className="flex items-center justify-between gap-1">
                <span>{cell.value}</span>
                <CellBadges cell={cell} />
            </div>
        );

    // Pointer-down drives selection when the editor is wired up (it has to, for
    // Shift-click and drag); otherwise the read-only table selects on click.
    const cellHandlers = (cell: ProvenanceCell) => ({
        onClick: onCellPointerDown ? undefined : () => onCellClick(cell),
        onMouseDown: onCellPointerDown
            ? (e: React.MouseEvent) => {
                // Right-click opens the menu without moving the anchor.
                if (e.button !== 0) return;
                onCellPointerDown(cell, e);
            }
            : undefined,
        onMouseEnter: onCellPointerEnter ? () => onCellPointerEnter(cell) : undefined,
        onContextMenu: onCellContextMenu ? (e: React.MouseEvent) => onCellContextMenu(cell, e) : undefined,
        onDoubleClick: editable ? () => onStartEdit!(cell) : undefined,
        title: cellTooltip(cell),
    });

    return (
        <div className="overflow-x-auto">
            {/* Dragging paints a cell range, so the browser's own text-selection
                drag has to be off — otherwise both happen at once. Selecting a
                value with the mouse happens inside the cell editor instead. */}
            <table className={`w-full border-collapse text-sm${onCellPointerDown ? ' select-none' : ''}`}>
                <thead>
                    {handles && (
                        // Column handles: click to select the whole column, right-click
                        // for the column commands. The corner selects the whole table.
                        <tr>
                            <th
                                scope="col"
                                onClick={onSelectAll}
                                title="Select the whole table"
                                aria-label="Select the whole table"
                                className={`${HANDLE_BASE} w-8 cursor-pointer ${handleTone(false)}`}
                            />
                            {headerRow.map((_, c) => (
                                <th
                                    key={c}
                                    scope="col"
                                    onMouseDown={e => { e.preventDefault(); onSelectColumn!(c, e); }}
                                    onContextMenu={e => onHandleContextMenu?.({ kind: 'column', index: c }, e)}
                                    title={`Select column ${columnLabel(c)}`}
                                    className={`${HANDLE_BASE} cursor-pointer ${handleTone(colInRange(c))}`}
                                >
                                    {columnLabel(c)}
                                </th>
                            ))}
                        </tr>
                    )}
                    <tr>
                        {handles && (
                            <th
                                scope="row"
                                onMouseDown={e => { e.preventDefault(); onSelectRow!(0, e); }}
                                onContextMenu={e => onHandleContextMenu?.({ kind: 'row', index: 0 }, e)}
                                title="Select the header row"
                                className={`${HANDLE_BASE} w-8 cursor-pointer ${handleTone(rowInRange(0))}`}
                            >
                                1
                            </th>
                        )}
                        {headerRow.map((cell, c) => (
                            <th
                                key={c}
                                ref={isSelected(0, c) ? selectedRef : undefined}
                                className={headerClasses(cell, isSelected(0, c), inRange(0, c))}
                                {...cellHandlers(cell)}
                            >
                                {cellContent(cell, 0, c)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {dataRows.map((row, ri) => (
                        <tr key={ri}>
                            {handles && (
                                <th
                                    scope="row"
                                    onMouseDown={e => { e.preventDefault(); onSelectRow!(ri + 1, e); }}
                                    onContextMenu={e => onHandleContextMenu?.({ kind: 'row', index: ri + 1 }, e)}
                                    title={`Select row ${ri + 2}`}
                                    className={`${HANDLE_BASE} w-8 cursor-pointer ${handleTone(rowInRange(ri + 1))}`}
                                >
                                    {ri + 2}
                                </th>
                            )}
                            {row.map((cell, c) => (
                                <td
                                    key={c}
                                    ref={isSelected(ri + 1, c) ? selectedRef : undefined}
                                    className={cellClasses(cell, isSelected(ri + 1, c), inRange(ri + 1, c))}
                                    {...cellHandlers(cell)}
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

import { useEffect, useRef, useState } from 'react';
import type { ProvenanceCell } from './types';
import {
    allVerified,
    clampPos,
    clearCells,
    deleteCellsShiftLeft,
    deleteColumns,
    deleteRows,
    insertCellsShiftRight,
    insertColumns,
    insertRows,
    mergeCells,
    mergeColumns,
    moveColumns,
    moveRows,
    normalizeRange,
    parseClipboardTable,
    pasteBlock,
    pastedRange,
    rangeHas,
    rangeSize,
    rangeToStrings,
    removeEmptyRowsAndColumns,
    setCellValue,
    setVerified,
} from './tableEdits';
import type { CellPos, CellRange, Grid } from './tableEdits';
import { copyTableToClipboard, readClipboardText } from '../../utils/clipboard';

/** How many grids the undo stack keeps. A page's table is small (a few hundred
 *  cells of plain data), so depth costs little and running out mid-cleanup is
 *  the failure that actually hurts. */
const HISTORY_LIMIT = 50;

export interface TableEditorOptions {
    /** The current grid. `null`/empty disables every command. */
    rows: Grid | null;
    /** The selection anchor, owned by the session (it also drives the source
     *  document highlight). The editor extends *from* it but never owns it. */
    selectedCell: CellPos | null;
    /** Commit a new grid: updates the session's table state and persists it. */
    onApplyGrid: (next: Grid) => void;
    /** Select a cell — the same handler a click uses, so structural edits leave
     *  the document highlight pointing somewhere real. */
    onSelectCell: (cell: ProvenanceCell, opts?: { autoZoom?: boolean }) => void;
    /** Changing this (session + page) clears the undo history and selection —
     *  undoing into another page's table would be nonsense. */
    resetKey: string;
}

type Selection = { anchor: CellPos; focus: CellPos };
/** The cell open for inline editing. `initial` is set when editing began by
 *  typing over the cell, so the editor opens with that character instead of the
 *  old value — one history entry for the whole edit, not one per keystroke. */
type EditingCell = CellPos & { initial?: string };

const at = (rowIndex: number, colIndex: number): CellPos => ({ rowIndex, colIndex });

const samePos = (a: CellPos, b: CellPos): boolean =>
    a.rowIndex === b.rowIndex && a.colIndex === b.colIndex;

/**
 * Spreadsheet-style editing over a provenance grid: range selection, structural
 * edits, clipboard and undo/redo.
 *
 * The hook owns only *editor* state (the selection's far corner, which cell is
 * open for editing, the history). The grid itself and the selection anchor stay
 * with the session, so click-to-highlight, the review worklist and persistence
 * keep working exactly as they did — every command here is a pure grid
 * transform handed back through `onApplyGrid`.
 */
export function useTableEditor({ rows, selectedCell, onApplyGrid, onSelectCell, resetKey }: TableEditorOptions) {
    const [selection, setSelection] = useState<Selection | null>(null);
    const [editing, setEditing] = useState<EditingCell | null>(null);
    const [past, setPast] = useState<Grid[]>([]);
    const [future, setFuture] = useState<Grid[]>([]);
    const [notice, setNotice] = useState<string | null>(null);
    const dragging = useRef(false);

    const grid = rows ?? [];
    const hasGrid = grid.length > 0;

    // A new page (or session) is a different table: an undo stack from the
    // previous one would write its cells over this one's.
    useEffect(() => {
        setPast([]);
        setFuture([]);
        setSelection(null);
        setEditing(null);
    }, [resetKey]);

    // Re-extracting replaces the grid wholesale; anything mid-edit refers to
    // cells that no longer exist.
    useEffect(() => setEditing(null), [rows]);

    // Follow the session's selection. A selection change that didn't come from
    // this hook (clicking a word on the document, the review stepper) collapses
    // the range onto the new cell; one that did leaves the range alone, so
    // extending with Shift doesn't fight the anchor it extends from.
    useEffect(() => {
        if (!selectedCell) {
            setSelection(null);
            return;
        }
        const pos = { rowIndex: selectedCell.rowIndex, colIndex: selectedCell.colIndex };
        setSelection(prev => (prev && samePos(prev.anchor, pos) ? prev : { anchor: pos, focus: pos }));
    }, [selectedCell?.rowIndex, selectedCell?.colIndex]);

    // Drag-select ends wherever the mouse is released, inside the table or not.
    useEffect(() => {
        const stop = () => { dragging.current = false; };
        window.addEventListener('mouseup', stop);
        return () => window.removeEventListener('mouseup', stop);
    }, []);

    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(null), 4000);
        return () => clearTimeout(timer);
    }, [notice]);

    /** The selection as an inclusive rectangle, or null when nothing is selected. */
    const range: CellRange | null = selection ? normalizeRange(selection.anchor, selection.focus) : null;
    const selectionCount = range ? rangeSize(range) : 0;

    /* ── Selection ────────────────────────────────────────────────────────── */

    const select = (target: Grid, anchor: CellPos, opts: { extendTo?: CellPos; autoZoom?: boolean } = {}) => {
        if (target.length === 0) return;
        const nextAnchor = clampPos(anchor, target);
        const nextFocus = opts.extendTo ? clampPos(opts.extendTo, target) : nextAnchor;
        setSelection({ anchor: nextAnchor, focus: nextFocus });
        const cell = target[nextAnchor.rowIndex]?.[nextAnchor.colIndex];
        if (cell) onSelectCell(cell, { autoZoom: opts.autoZoom ?? false });
    };

    /** Extend the selection to `pos`, keeping the anchor (and so the document
     *  highlight) where it is. */
    const extendTo = (pos: CellPos) => {
        setSelection(prev => {
            const anchor = prev?.anchor ?? pos;
            return { anchor, focus: clampPos(pos, grid) };
        });
    };

    const selectAll = () => {
        if (!hasGrid) return;
        select(grid, { rowIndex: 0, colIndex: 0 }, {
            extendTo: { rowIndex: grid.length - 1, colIndex: (grid[0]?.length ?? 1) - 1 },
        });
    };

    const selectRow = (rowIndex: number, additive = false) => {
        if (!hasGrid) return;
        const lastCol = (grid[rowIndex]?.length ?? 1) - 1;
        if (additive && selection) {
            extendTo({ rowIndex, colIndex: lastCol });
            return;
        }
        select(grid, { rowIndex, colIndex: 0 }, { extendTo: { rowIndex, colIndex: lastCol } });
    };

    const selectColumn = (colIndex: number, additive = false) => {
        if (!hasGrid) return;
        if (additive && selection) {
            extendTo({ rowIndex: grid.length - 1, colIndex });
            return;
        }
        select(grid, { rowIndex: 0, colIndex }, { extendTo: { rowIndex: grid.length - 1, colIndex } });
    };

    /** Pointer-down on a cell: plain click anchors, Shift-click extends, and a
     *  plain press arms drag-to-select. */
    const pointerDown = (cell: ProvenanceCell, shiftKey: boolean) => {
        const pos = { rowIndex: cell.rowIndex, colIndex: cell.colIndex };
        if (shiftKey && selection) {
            extendTo(pos);
            return;
        }
        dragging.current = true;
        select(grid, pos, { autoZoom: true });
    };

    const pointerEnter = (cell: ProvenanceCell) => {
        if (!dragging.current) return;
        extendTo({ rowIndex: cell.rowIndex, colIndex: cell.colIndex });
    };

    /** Right-click selects the cell under the pointer unless it is already
     *  inside the selection — so a menu opened over a multi-cell selection acts
     *  on all of it, the way every spreadsheet behaves. */
    const contextTarget = (cell: ProvenanceCell) => {
        if (range && rangeHas(range, cell.rowIndex, cell.colIndex)) return;
        select(grid, { rowIndex: cell.rowIndex, colIndex: cell.colIndex });
    };

    /** Move the anchor (or, with `extend`, the far corner) by one cell. */
    const moveFocus = (dRow: number, dCol: number, extend: boolean) => {
        if (!hasGrid) return;
        if (!selection) {
            select(grid, { rowIndex: 0, colIndex: 0 }, { autoZoom: true });
            return;
        }
        if (extend) {
            const from = selection.focus;
            extendTo({ rowIndex: from.rowIndex + dRow, colIndex: from.colIndex + dCol });
            return;
        }
        const from = selection.anchor;
        select(grid, { rowIndex: from.rowIndex + dRow, colIndex: from.colIndex + dCol }, { autoZoom: true });
    };

    /** Step one cell in reading order, wrapping across row ends (Tab / Shift+Tab). */
    const stepCell = (delta: 1 | -1) => {
        if (!hasGrid) return;
        if (!selection) {
            select(grid, { rowIndex: 0, colIndex: 0 }, { autoZoom: true });
            return;
        }
        let { rowIndex: r, colIndex: c } = selection.anchor;
        c += delta;
        while (r >= 0 && r < grid.length) {
            if (c < 0) { r -= 1; c = (grid[r]?.length ?? 0) - 1; continue; }
            if (c >= grid[r].length) { r += 1; c = 0; continue; }
            break;
        }
        if (r < 0 || r >= grid.length) return;
        select(grid, { rowIndex: r, colIndex: c }, { autoZoom: true });
    };

    /* ── History ──────────────────────────────────────────────────────────── */

    /**
     * Commit a transformed grid: push the current one onto the undo stack,
     * persist the new one, and leave a sensible selection behind (structural
     * edits move cells, so the previous selection can point at a different cell
     * — or none at all).
     */
    const apply = (next: Grid, focus?: CellPos, extendToPos?: CellPos) => {
        if (!rows || next === rows) return;
        setPast(prev => [...prev, rows].slice(-HISTORY_LIMIT));
        setFuture([]);
        setEditing(null);
        onApplyGrid(next);
        select(next, focus ?? selection?.anchor ?? { rowIndex: 0, colIndex: 0 }, { extendTo: extendToPos });
    };

    const undo = () => {
        const previous = past[past.length - 1];
        if (!previous || !rows) return;
        setPast(prev => prev.slice(0, -1));
        setFuture(prev => [rows, ...prev].slice(0, HISTORY_LIMIT));
        setEditing(null);
        onApplyGrid(previous);
        select(previous, selection?.anchor ?? { rowIndex: 0, colIndex: 0 });
    };

    const redo = () => {
        const next = future[0];
        if (!next || !rows) return;
        setFuture(prev => prev.slice(1));
        setPast(prev => [...prev, rows].slice(-HISTORY_LIMIT));
        setEditing(null);
        onApplyGrid(next);
        select(next, selection?.anchor ?? { rowIndex: 0, colIndex: 0 });
    };

    /* ── Editing ──────────────────────────────────────────────────────────── */

    const startEdit = (pos?: CellPos) => {
        const target = pos ?? selection?.anchor;
        if (!target || !grid[target.rowIndex]?.[target.colIndex]) return;
        setSelection({ anchor: target, focus: target });
        setEditing({ rowIndex: target.rowIndex, colIndex: target.colIndex });
    };

    const cancelEdit = () => setEditing(null);

    /**
     * Commit an edited value. `advance` moves the selection on the way out the
     * way a spreadsheet does — Enter down the column, Tab across the row — so a
     * run of corrections is one uninterrupted typing flow.
     */
    const commitEdit = (cell: ProvenanceCell, value: string, advance: 'down' | 'right' | null = null) => {
        setEditing(null);
        const pos = { rowIndex: cell.rowIndex, colIndex: cell.colIndex };
        const next = setCellValue(grid, pos, value);
        const focus = advance === 'down'
            ? { rowIndex: pos.rowIndex + 1, colIndex: pos.colIndex }
            : advance === 'right'
                ? { rowIndex: pos.rowIndex, colIndex: pos.colIndex + 1 }
                : pos;
        if (next === grid) {
            select(grid, focus);
            return;
        }
        apply(next, focus);
    };

    /** Begin editing by typing over the cell, so correcting a value needs no
     *  Enter first. The character is handed to the editor as its starting
     *  value; nothing is committed until the edit is. */
    const typeInto = (pos: CellPos, initial: string) => {
        if (!grid[pos.rowIndex]?.[pos.colIndex]) return;
        setSelection({ anchor: pos, focus: pos });
        setEditing({ ...pos, initial });
    };

    /* ── Commands ─────────────────────────────────────────────────────────── */

    /**
     * Run a range transform and leave the affected block selected.
     * `focusOf`/`spanOf` map the *old* range to the new selection corners, so
     * e.g. moving rows down keeps the same rows selected in their new place.
     */
    const onRange = (
        transform: (r: CellRange) => Grid,
        focusOf: (r: CellRange) => CellPos = r => at(r.top, r.left),
        spanOf?: (r: CellRange) => CellPos,
    ) => {
        if (!range || !hasGrid) return;
        apply(transform(range), focusOf(range), spanOf?.(range));
    };

    const height = (r: CellRange) => r.bottom - r.top + 1;
    const width = (r: CellRange) => r.right - r.left + 1;

    const verifiedInRange = !!range && hasGrid && allVerified(grid, range);

    const commands = {
        clear: () => onRange(r => clearCells(grid, r), r => at(r.top, r.left), r => at(r.bottom, r.right)),
        toggleVerified: () => onRange(
            r => setVerified(grid, r, !verifiedInRange),
            r => at(r.top, r.left),
            r => at(r.bottom, r.right),
        ),

        // Insert/delete as many rows (columns) as the selection covers — the
        // spreadsheet convention, so "select 3 rows, insert" adds 3.
        insertRowAbove: () => onRange(r => insertRows(grid, r.top, height(r)), r => at(r.top, r.left)),
        insertRowBelow: () => onRange(r => insertRows(grid, r.bottom + 1, height(r)), r => at(r.bottom + 1, r.left)),
        deleteSelectedRows: () => onRange(r => deleteRows(grid, r.top, r.bottom)),
        moveRowsUp: () => onRange(r => moveRows(grid, r.top, r.bottom, -1), r => at(r.top - 1, r.left), r => at(r.bottom - 1, r.right)),
        moveRowsDown: () => onRange(r => moveRows(grid, r.top, r.bottom, 1), r => at(r.top + 1, r.left), r => at(r.bottom + 1, r.right)),

        insertColumnLeft: () => onRange(r => insertColumns(grid, r.left, width(r)), r => at(r.top, r.left)),
        insertColumnRight: () => onRange(r => insertColumns(grid, r.right + 1, width(r)), r => at(r.top, r.right + 1)),
        deleteSelectedColumns: () => onRange(r => deleteColumns(grid, r.left, r.right)),
        moveColumnsLeft: () => onRange(r => moveColumns(grid, r.left, r.right, -1), r => at(r.top, r.left - 1), r => at(r.bottom, r.right - 1)),
        moveColumnsRight: () => onRange(r => moveColumns(grid, r.left, r.right, 1), r => at(r.top, r.left + 1), r => at(r.bottom, r.right + 1)),

        mergeSelection: () => onRange(r => mergeCells(grid, r), r => at(r.top, r.left), r => at(r.bottom, r.right)),
        mergeSelectedColumns: () => onRange(r => mergeColumns(grid, r.left, r.right), r => at(r.top, r.left), r => at(r.bottom, r.left)),
        deleteCellsShiftLeft: () => onRange(r => deleteCellsShiftLeft(grid, r), r => at(r.top, r.left), r => at(r.bottom, r.right)),
        insertCellsShiftRight: () => onRange(r => insertCellsShiftRight(grid, r), r => at(r.top, r.left), r => at(r.bottom, r.right)),

        removeEmpty: () => {
            if (!hasGrid) return;
            const next = removeEmptyRowsAndColumns(grid);
            if (next.length === grid.length && (next[0]?.length ?? 0) === (grid[0]?.length ?? 0)) {
                setNotice('No empty rows or columns to remove.');
                return;
            }
            apply(next);
        },
    };

    /* ── Clipboard ────────────────────────────────────────────────────────── */

    /** Write a range to the clipboard as TSV. Reports whether the clipboard actually
     *  took it, rather than throwing — `cutSelection` has to know. */
    const writeRangeToClipboard = async (selected: CellRange, failureNotice: string): Promise<boolean> => {
        try {
            await copyTableToClipboard(rangeToStrings(grid, selected));
            return true;
        } catch {
            setNotice(failureNotice);
            return false;
        }
    };

    const copySelection = async (): Promise<boolean> => {
        if (!range || !hasGrid) return false;
        return writeRangeToClipboard(range, 'Couldn’t copy to the clipboard.');
    };

    /**
     * Cut is copy-then-clear, and the copy has to land first.
     *
     * A clipboard write can genuinely fail (a webview that withholds
     * `navigator.clipboard.write`, a denied permission), and clearing anyway would
     * make this the one command in the editor that destroys data outright — the
     * values gone from the grid *and* absent from the clipboard. Undo would recover
     * them, but a user who just watched their cells vanish has no reason to expect
     * that the "cut" they asked for didn't happen. So a failed copy leaves the
     * selection exactly as it was and says so.
     */
    const cutSelection = async (): Promise<void> => {
        if (!range || !hasGrid) return;
        const copied = await writeRangeToClipboard(
            range,
            'Couldn’t copy to the clipboard, so nothing was cut.',
        );
        if (!copied) return;
        commands.clear();
    };

    /**
     * Paste tab-separated text over the grid from the anchor, growing the table
     * if the block runs past its edges.
     *
     * Ctrl+V routes here through the webview's own `paste` event rather than
     * `navigator.clipboard.readText()` — the event carries the data outright,
     * while reading the clipboard needs a permission the packaged webview may
     * not grant.
     */
    const pasteText = (text: string) => {
        if (!hasGrid || !selection || !text) return;
        const block = parseClipboardTable(text);
        if (block.length === 0) return;
        const anchor = selection.anchor;
        const covered = pastedRange(anchor, block);
        apply(pasteBlock(grid, anchor, block), anchor, at(covered.bottom, covered.right));
    };

    /** The menu's Paste, which has no `paste` event to ride on and so has to ask
     *  for the clipboard (`readClipboardText` reads it through the OS, so this
     *  raises no permission prompt). Denied or empty, it says so rather than
     *  doing nothing. */
    const pasteFromClipboard = async (): Promise<void> => {
        if (!hasGrid || !selection) return;
        try {
            const text = await readClipboardText();
            if (!text) {
                setNotice('The clipboard is empty.');
                return;
            }
            pasteText(text);
        } catch {
            setNotice('Couldn’t read the clipboard. Press Ctrl+V to paste instead.');
        }
    };

    return {
        /** The selection rectangle, or null. */
        range,
        selectionCount,
        editing,
        notice,
        /** Grid dimensions, so menus can disable moves that would run off an edge. */
        gridRows: grid.length,
        gridCols: grid[0]?.length ?? 0,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        verifiedInRange,
        undo,
        redo,
        // Selection
        pointerDown,
        pointerEnter,
        contextTarget,
        selectAll,
        selectRow,
        selectColumn,
        moveFocus,
        stepCell,
        // Editing
        startEdit,
        cancelEdit,
        commitEdit,
        typeInto,
        // Commands
        commands,
        copySelection,
        cutSelection,
        pasteText,
        pasteFromClipboard,
    };
}

export type TableEditor = ReturnType<typeof useTableEditor>;

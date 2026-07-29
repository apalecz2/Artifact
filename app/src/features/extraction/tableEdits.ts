/**
 * Pure grid transforms behind the table editor (Session ▸ Formatted Table).
 *
 * Every function takes a `ProvenanceCell[][]` and returns a **new** rectangular,
 * re-indexed grid — never mutating the input — so the caller can push the old
 * grid onto an undo stack and persist the new one with a single write
 * (`Session.applyCellUpdate`). Two invariants hold on every return value:
 *
 *   1. **Rectangular.** Every row has the same length. The table renderer, the
 *      exporters and `padProvenanceGrid` all assume it, and a ragged grid drops
 *      trailing cells silently.
 *   2. **Positionally indexed.** `cell.rowIndex`/`cell.colIndex` equal the cell's
 *      position. They are the cell's identity for selection, click-to-highlight
 *      and the review worklist, so a structural edit that moved a cell without
 *      re-indexing would point the document highlight at the wrong row.
 *
 * `wordIds` are stable OCR word UUIDs and are carried through edits wherever the
 * cell still refers to the same place on the page (see `withValue`).
 */
import type { CellConfidence, ProvenanceCell } from './types';

export type Grid = ProvenanceCell[][];
export interface CellPos { rowIndex: number; colIndex: number }
/** Inclusive on all four sides. */
export interface CellRange { top: number; left: number; bottom: number; right: number }

/** The confidence a cell carries when it holds no extracted content: unscored,
 *  and in agreement with a blank region rather than flagged (design.md §6 5). */
export const EMPTY_CONFIDENCE: CellConfidence = {
    llmMean: null,
    llmMin: null,
    ocr: null,
    agreement: 'agree',
    trust: 'high',
};

/** A synthetic blank cell — the shape `computeProvenanceCells` gives a clean
 *  empty cell, so inserted cells are indistinguishable from extracted ones. */
export const blankCell = (rowIndex: number, colIndex: number): ProvenanceCell => ({
    rowIndex,
    colIndex,
    value: '',
    wordIds: [],
    matchStatus: 'empty',
    confidence: { ...EMPTY_CONFIDENCE },
});

/* ── Range helpers ────────────────────────────────────────────────────────── */

export const normalizeRange = (a: CellPos, b: CellPos): CellRange => ({
    top: Math.min(a.rowIndex, b.rowIndex),
    bottom: Math.max(a.rowIndex, b.rowIndex),
    left: Math.min(a.colIndex, b.colIndex),
    right: Math.max(a.colIndex, b.colIndex),
});

export const singleRange = (pos: CellPos): CellRange => normalizeRange(pos, pos);

export const rangeHas = (range: CellRange, rowIndex: number, colIndex: number): boolean =>
    rowIndex >= range.top && rowIndex <= range.bottom &&
    colIndex >= range.left && colIndex <= range.right;

export const rangeSize = (range: CellRange): number =>
    (range.bottom - range.top + 1) * (range.right - range.left + 1);

/** Clamp a range to the grid, so an op can never index outside it (a range can
 *  outlive the grid it was made against — e.g. undoing a row insert). */
export const clampRange = (range: CellRange, rows: Grid): CellRange => {
    const lastRow = Math.max(0, rows.length - 1);
    const lastCol = Math.max(0, (rows[0]?.length ?? 1) - 1);
    return {
        top: Math.min(Math.max(range.top, 0), lastRow),
        bottom: Math.min(Math.max(range.bottom, 0), lastRow),
        left: Math.min(Math.max(range.left, 0), lastCol),
        right: Math.min(Math.max(range.right, 0), lastCol),
    };
};

export const clampPos = (pos: CellPos, rows: Grid): CellPos => {
    const rowIndex = Math.min(Math.max(pos.rowIndex, 0), Math.max(0, rows.length - 1));
    const colIndex = Math.min(Math.max(pos.colIndex, 0), Math.max(0, (rows[rowIndex]?.length ?? 1) - 1));
    return { rowIndex, colIndex };
};

/* ── Grid plumbing ────────────────────────────────────────────────────────── */

/** Rewrite every cell's stored position to match where it now sits. Cells that
 *  did not move keep their identity, so React re-renders only what changed. */
export const reindex = (rows: Grid): Grid =>
    rows.map((row, r) => row.map((cell, c) =>
        cell.rowIndex === r && cell.colIndex === c ? cell : { ...cell, rowIndex: r, colIndex: c }
    ));

/** Pad every short row with blanks so the grid is rectangular. */
const rectangular = (rows: Grid): Grid => {
    const width = rows.reduce((w, row) => Math.max(w, row.length), 0);
    return rows.map((row, r) =>
        row.length === width
            ? row
            : [...row, ...Array.from({ length: width - row.length }, (_, i) => blankCell(r, row.length + i))]
    );
};

const finalize = (rows: Grid): Grid => reindex(rectangular(rows));

const isBlank = (cell: ProvenanceCell): boolean => cell.value.trim() === '';

const gridWidth = (rows: Grid): number => rows[0]?.length ?? 0;

/**
 * Apply a hand-entered value to a cell.
 *
 * Committing a value is also a manual verification — the user looked at the
 * source and stated what it says — so the cell leaves the review worklist even
 * when the typed value matches the original. `wordIds` are kept: they still
 * point at this cell's location on the page, which is what the user was looking
 * at. (Same contract as the inline cell editor, so typing, pasting and clearing
 * all resolve a cell the same way.)
 */
export const withValue = (cell: ProvenanceCell, raw: string): ProvenanceCell => {
    const value = raw.trim();
    return {
        ...cell,
        value,
        verified: true,
        edited: cell.edited || value !== cell.value.trim(),
    };
};

/* ── Cell-level edits ─────────────────────────────────────────────────────── */

export function setCellValue(rows: Grid, pos: CellPos, value: string): Grid {
    if (!rows[pos.rowIndex]?.[pos.colIndex]) return rows;
    return rows.map((row, r) => r !== pos.rowIndex
        ? row
        : row.map((cell, c) => (c === pos.colIndex ? withValue(cell, value) : cell)));
}

/** Blank every value in the range. The cells keep their `wordIds`, so clicking a
 *  cleared cell still points at the place on the page it was read from. */
export function clearCells(rows: Grid, range: CellRange): Grid {
    const r = clampRange(range, rows);
    return rows.map((row, ri) => (ri < r.top || ri > r.bottom)
        ? row
        : row.map((cell, ci) => (ci < r.left || ci > r.right ? cell : withValue(cell, ''))));
}

/** Set (or clear) "manually verified" across a range without touching values. */
export function setVerified(rows: Grid, range: CellRange, verified: boolean): Grid {
    const r = clampRange(range, rows);
    return rows.map((row, ri) => (ri < r.top || ri > r.bottom)
        ? row
        : row.map((cell, ci) => (ci < r.left || ci > r.right ? cell : { ...cell, verified })));
}

/** True when every cell in the range is already marked verified — the toggle's
 *  direction, so a mixed selection resolves to "verify all" rather than flipping
 *  each cell independently. */
export function allVerified(rows: Grid, range: CellRange): boolean {
    const r = clampRange(range, rows);
    for (let ri = r.top; ri <= r.bottom; ri++) {
        for (let ci = r.left; ci <= r.right; ci++) {
            if (!rows[ri]?.[ci]?.verified) return false;
        }
    }
    return true;
}

/* ── Rows ─────────────────────────────────────────────────────────────────── */

export function insertRows(rows: Grid, at: number, count = 1): Grid {
    const width = Math.max(gridWidth(rows), 1);
    const fresh = Array.from({ length: count }, (_, i) =>
        Array.from({ length: width }, (_, c) => blankCell(at + i, c)));
    const index = Math.min(Math.max(at, 0), rows.length);
    return finalize([...rows.slice(0, index), ...fresh, ...rows.slice(index)]);
}

/** Delete rows `top..bottom`. Refuses to empty the table — a grid with no rows
 *  renders as "no table", which is not what deleting a row means. */
export function deleteRows(rows: Grid, top: number, bottom: number): Grid {
    const r = clampRange({ top, bottom, left: 0, right: 0 }, rows);
    const remaining = rows.length - (r.bottom - r.top + 1);
    if (remaining < 1) return rows;
    return finalize([...rows.slice(0, r.top), ...rows.slice(r.bottom + 1)]);
}

/** Move the block of rows `top..bottom` one step up (-1) or down (+1). */
export function moveRows(rows: Grid, top: number, bottom: number, delta: -1 | 1): Grid {
    if (top + delta < 0 || bottom + delta > rows.length - 1) return rows;
    const block = rows.slice(top, bottom + 1);
    const without = [...rows.slice(0, top), ...rows.slice(bottom + 1)];
    return finalize([...without.slice(0, top + delta), ...block, ...without.slice(top + delta)]);
}

/* ── Columns ──────────────────────────────────────────────────────────────── */

export function insertColumns(rows: Grid, at: number, count = 1): Grid {
    const index = Math.min(Math.max(at, 0), gridWidth(rows));
    return finalize(rows.map((row, r) => [
        ...row.slice(0, index),
        ...Array.from({ length: count }, (_, i) => blankCell(r, index + i)),
        ...row.slice(index),
    ]));
}

/** Delete columns `left..right`. Refuses to empty the table (see `deleteRows`). */
export function deleteColumns(rows: Grid, left: number, right: number): Grid {
    const r = clampRange({ top: 0, bottom: 0, left, right }, rows);
    const remaining = gridWidth(rows) - (r.right - r.left + 1);
    if (remaining < 1) return rows;
    return finalize(rows.map(row => [...row.slice(0, r.left), ...row.slice(r.right + 1)]));
}

/** Move the block of columns `left..right` one step left (-1) or right (+1). */
export function moveColumns(rows: Grid, left: number, right: number, delta: -1 | 1): Grid {
    if (left + delta < 0 || right + delta > gridWidth(rows) - 1) return rows;
    return finalize(rows.map(row => {
        const block = row.slice(left, right + 1);
        const without = [...row.slice(0, left), ...row.slice(right + 1)];
        return [...without.slice(0, left + delta), ...block, ...without.slice(left + delta)];
    }));
}

/* ── Merging ──────────────────────────────────────────────────────────────── */

/**
 * Fold a run of cells into one.
 *
 * The values are joined with a single space (blank cells contribute nothing, so
 * a half-empty run doesn't gain leading/trailing padding) and the source
 * `wordIds` are unioned in column order, so the merged cell highlights the whole
 * span on the document. The LLM logprobs are dropped to `null` — they described
 * the pieces, not the joined string — while the OCR confidence, which is a
 * property of the underlying words, is averaged and kept.
 */
function foldCells(cells: ProvenanceCell[]): ProvenanceCell {
    const target = cells[0];
    const value = cells.map(c => c.value.trim()).filter(Boolean).join(' ');
    const wordIds = [...new Set(cells.flatMap(c => c.wordIds))];
    const filled = cells.filter(c => !isBlank(c));
    const ocrs = filled.map(c => c.confidence.ocr).filter((n): n is number => n != null);
    const trusts = filled.map(c => c.confidence.trust);
    const trust = trusts.includes('low') ? 'low' : trusts.includes('medium') ? 'medium' : 'high';

    if (value === '') {
        return { ...target, value, wordIds, matchStatus: 'empty', confidence: { ...EMPTY_CONFIDENCE }, verified: true, edited: true };
    }
    return {
        ...target,
        value,
        wordIds,
        matchStatus: wordIds.length > 1 ? 'multi_word' : wordIds.length === 1 ? 'matched' : 'unmatched',
        confidence: {
            llmMean: null,
            llmMin: null,
            ocr: ocrs.length > 0 ? ocrs.reduce((a, b) => a + b, 0) / ocrs.length : null,
            agreement: wordIds.length > 0 ? 'agree' : 'image_only',
            trust,
        },
        verified: true,
        edited: true,
    };
}

/**
 * Merge each selected row's cells into that row's leftmost selected cell,
 * leaving the rest blank. The grid keeps its shape — a spanning cell has no
 * representation in a CSV/TSV export, so "merge" here means "join the text",
 * which is what the user is actually after when the model split one value
 * across two cells.
 */
export function mergeCells(rows: Grid, range: CellRange): Grid {
    const r = clampRange(range, rows);
    if (r.left === r.right) return rows;
    return finalize(rows.map((row, ri) => (ri < r.top || ri > r.bottom)
        ? row
        : row.map((cell, ci) => {
            if (ci === r.left) return foldCells(row.slice(r.left, r.right + 1));
            if (ci > r.left && ci <= r.right) return withValue(cell, '');
            return cell;
        })));
}

/**
 * Merge whole columns `left..right` into `left` and drop the emptied ones — the
 * fix for the model splitting one column in two (issues.md ▸ Provenance #1),
 * which `mergeCells` alone would leave as a trailing run of blank columns.
 */
export function mergeColumns(rows: Grid, left: number, right: number): Grid {
    if (right <= left || right > gridWidth(rows) - 1) return rows;
    const merged = mergeCells(rows, { top: 0, bottom: rows.length - 1, left, right });
    return deleteColumns(merged, left + 1, right);
}

/* ── Cell-level structural edits (the off-by-one fixes) ───────────────────── */

/**
 * Delete the selected cells and pull the rest of each affected row leftwards,
 * padding the end with blanks. This is the repair for a row that lost a cell
 * upstream and is shifted one column out of alignment.
 */
export function deleteCellsShiftLeft(rows: Grid, range: CellRange): Grid {
    const r = clampRange(range, rows);
    const width = gridWidth(rows);
    const count = r.right - r.left + 1;
    if (count >= width) return clearCells(rows, r);
    return finalize(rows.map((row, ri) => (ri < r.top || ri > r.bottom)
        ? row
        : [
            ...row.slice(0, r.left),
            ...row.slice(r.right + 1),
            ...Array.from({ length: count }, (_, i) => blankCell(ri, width - count + i)),
        ]));
}

/**
 * Insert blanks at the selection and push each affected row's remaining cells
 * rightwards — the inverse repair, for a row that gained a cell or is shifted
 * one column early. Trailing blanks absorb the shift where they exist; the
 * table only grows a column when real content would otherwise fall off the end.
 */
export function insertCellsShiftRight(rows: Grid, range: CellRange): Grid {
    const r = clampRange(range, rows);
    const width = gridWidth(rows);
    const count = r.right - r.left + 1;
    return finalize(rows.map((row, ri) => {
        if (ri < r.top || ri > r.bottom) return row;
        const grown = [
            ...row.slice(0, r.left),
            ...Array.from({ length: count }, (_, i) => blankCell(ri, r.left + i)),
            ...row.slice(r.left),
        ];
        while (grown.length > width && isBlank(grown[grown.length - 1])) grown.pop();
        return grown;
    }));
}

/* ── Cleanup ──────────────────────────────────────────────────────────────── */

/**
 * Drop rows and columns that hold no content anywhere — the tidy-up after a
 * sparse extraction, or after merging columns row by row. The header row is
 * never dropped (a blank header is a labelling problem, not an empty column)
 * and the last row/column always survives.
 */
export function removeEmptyRowsAndColumns(rows: Grid): Grid {
    if (rows.length === 0) return rows;
    const keptRows = rows.filter((row, r) => r === 0 || row.some(cell => !isBlank(cell)));
    const safeRows = keptRows.length > 0 ? keptRows : [rows[0]];
    const width = gridWidth(safeRows);
    const keepCol = Array.from({ length: width }, (_, c) => safeRows.some(row => !isBlank(row[c])));
    if (!keepCol.some(Boolean)) keepCol[0] = true;
    return finalize(safeRows.map(row => row.filter((_, c) => keepCol[c])));
}

/* ── Clipboard ────────────────────────────────────────────────────────────── */

/** The cell values of a range (or the whole grid), for copy/export. */
export function rangeToStrings(rows: Grid, range?: CellRange): string[][] {
    if (!range) return rows.map(row => row.map(c => c.value));
    const r = clampRange(range, rows);
    return rows.slice(r.top, r.bottom + 1).map(row => row.slice(r.left, r.right + 1).map(c => c.value));
}

/**
 * Parse clipboard text as a table: tab-separated columns, newline-separated
 * rows, with Excel-style `"…"` quoting for cells that contain a tab, newline or
 * quote — the exact dialect `copyTableToClipboard` writes, so a copy out of the
 * table (or out of Excel/Sheets) round-trips back in.
 */
export function parseClipboardTable(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch !== '"') { field += ch; continue; }
            // A doubled quote is a literal one; a lone quote ends the field.
            if (text[i + 1] === '"') { field += '"'; i++; }
            else quoted = false;
            continue;
        }
        if (ch === '"' && field === '') { quoted = true; continue; }
        if (ch === '\t') { row.push(field); field = ''; continue; }
        if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            continue;
        }
        field += ch;
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

/**
 * Write a block of values into the grid with its top-left corner at `at`,
 * growing the table if the block runs past its edges. Pasted values are treated
 * exactly like typed ones (see `withValue`).
 */
export function pasteBlock(rows: Grid, at: CellPos, block: string[][]): Grid {
    if (block.length === 0) return rows;
    const blockWidth = block.reduce((w, line) => Math.max(w, line.length), 0);
    const height = Math.max(rows.length, at.rowIndex + block.length);
    const width = Math.max(gridWidth(rows), at.colIndex + blockWidth);

    const next: Grid = Array.from({ length: height }, (_, r) =>
        Array.from({ length: width }, (_, c) => rows[r]?.[c] ?? blankCell(r, c)));

    block.forEach((line, dr) => line.forEach((value, dc) => {
        const r = at.rowIndex + dr;
        const c = at.colIndex + dc;
        next[r][c] = withValue(next[r][c], value);
    }));
    return finalize(next);
}

/** The range a paste at `at` would cover — used to leave it selected afterwards. */
export const pastedRange = (at: CellPos, block: string[][]): CellRange => ({
    top: at.rowIndex,
    left: at.colIndex,
    bottom: at.rowIndex + Math.max(block.length, 1) - 1,
    right: at.colIndex + Math.max(block.reduce((w, line) => Math.max(w, line.length), 0), 1) - 1,
});

import { describe, it, expect, beforeEach } from 'vitest';
import { provenanceCell, resetFixtureIds } from '../../test/fixtures';
import type { ProvenanceCell } from './types';
import {
    allVerified,
    blankCell,
    clampPos,
    clampRange,
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
    withValue,
} from './tableEdits';
import type { CellRange, Grid } from './tableEdits';

/** Build a grid from a matrix of strings; cell metadata defaults are irrelevant
 *  to structure, so tests that care about it override afterwards. */
const gridOf = (matrix: string[][], over: (r: number, c: number) => Partial<ProvenanceCell> = () => ({})): Grid =>
    matrix.map((row, r) => row.map((value, c) => ({
        ...provenanceCell(value, { rowIndex: r, colIndex: c }),
        ...over(r, c),
    })));

const values = (rows: Grid): string[][] => rows.map(row => row.map(c => c.value));

/** Every returned grid must be rectangular and positionally indexed — the two
 *  invariants the renderer, the exporters and click-to-highlight rely on. */
const expectWellFormed = (rows: Grid) => {
    const width = rows[0]?.length ?? 0;
    rows.forEach((row, r) => {
        expect(row).toHaveLength(width);
        row.forEach((cell, c) => {
            expect([cell.rowIndex, cell.colIndex]).toEqual([r, c]);
        });
    });
};

const range = (top: number, left: number, bottom: number, right: number): CellRange =>
    ({ top, left, bottom, right });

beforeEach(resetFixtureIds);

describe('range helpers', () => {
    it('normalizes a backwards drag into an inclusive rectangle', () => {
        expect(normalizeRange({ rowIndex: 3, colIndex: 4 }, { rowIndex: 1, colIndex: 2 }))
            .toEqual({ top: 1, left: 2, bottom: 3, right: 4 });
    });

    it('counts and tests membership', () => {
        const r = range(1, 1, 2, 3);
        expect(rangeSize(r)).toBe(6);
        expect(rangeHas(r, 2, 3)).toBe(true);
        expect(rangeHas(r, 0, 1)).toBe(false);
    });

    it('clamps a stale range/position back inside the grid', () => {
        const rows = gridOf([['a', 'b'], ['c', 'd']]);
        expect(clampRange(range(-2, 0, 9, 9), rows)).toEqual({ top: 0, left: 0, bottom: 1, right: 1 });
        expect(clampPos({ rowIndex: 7, colIndex: 7 }, rows)).toEqual({ rowIndex: 1, colIndex: 1 });
    });
});

describe('withValue', () => {
    it('trims, marks the cell verified, and keeps its source words', () => {
        const cell = provenanceCell('Alise', { wordIds: ['w1'] });
        const next = withValue(cell, '  Alice  ');
        expect(next.value).toBe('Alice');
        expect(next.verified).toBe(true);
        expect(next.edited).toBe(true);
        expect(next.wordIds).toEqual(['w1']);
    });

    it('treats an unchanged commit as verification without marking it edited', () => {
        const next = withValue(provenanceCell('Alice'), 'Alice');
        expect(next.verified).toBe(true);
        expect(next.edited).toBe(false);
    });
});

describe('cell edits', () => {
    it('sets one cell and leaves the rest untouched by identity', () => {
        const rows = gridOf([['a', 'b'], ['c', 'd']]);
        const next = setCellValue(rows, { rowIndex: 1, colIndex: 0 }, 'C!');
        expect(values(next)).toEqual([['a', 'b'], ['C!', 'd']]);
        expect(next[0]).toBe(rows[0]);
    });

    it('ignores a write outside the grid', () => {
        const rows = gridOf([['a']]);
        expect(setCellValue(rows, { rowIndex: 4, colIndex: 0 }, 'x')).toBe(rows);
    });

    it('clears a range but keeps each cell pointing at its place on the page', () => {
        const rows = gridOf([['a', 'b'], ['c', 'd']], () => ({ wordIds: ['w1'] }));
        const next = clearCells(rows, range(1, 0, 1, 1));
        expect(values(next)).toEqual([['a', 'b'], ['', '']]);
        expect(next[1][0].wordIds).toEqual(['w1']);
        expect(next[1][0].verified).toBe(true);
    });

    it('sets and reports verified across a range', () => {
        const rows = gridOf([['a', 'b'], ['c', 'd']]);
        expect(allVerified(rows, range(0, 0, 1, 1))).toBe(false);
        const next = setVerified(rows, range(0, 0, 1, 1), true);
        expect(allVerified(next, range(0, 0, 1, 1))).toBe(true);
        expect(next[0][0].value).toBe('a');
    });
});

describe('rows', () => {
    const rows = () => gridOf([['h1', 'h2'], ['a', 'b'], ['c', 'd']]);

    it('inserts blank rows at a position', () => {
        const next = insertRows(rows(), 1, 2);
        expect(values(next)).toEqual([['h1', 'h2'], ['', ''], ['', ''], ['a', 'b'], ['c', 'd']]);
        expectWellFormed(next);
    });

    it('deletes a block of rows', () => {
        const next = deleteRows(rows(), 1, 2);
        expect(values(next)).toEqual([['h1', 'h2']]);
        expectWellFormed(next);
    });

    it('refuses to delete every row — an empty grid is not a table', () => {
        const start = rows();
        expect(deleteRows(start, 0, 2)).toBe(start);
    });

    it('promotes the next row to header when the header row is deleted', () => {
        const next = deleteRows(rows(), 0, 0);
        expect(values(next)[0]).toEqual(['a', 'b']);
    });

    it('moves a row down and back up again', () => {
        const down = moveRows(rows(), 1, 1, 1);
        expect(values(down)).toEqual([['h1', 'h2'], ['c', 'd'], ['a', 'b']]);
        expect(values(moveRows(down, 2, 2, -1))).toEqual(values(rows()));
        expectWellFormed(down);
    });

    it('will not move a row off either end', () => {
        const start = rows();
        expect(moveRows(start, 0, 0, -1)).toBe(start);
        expect(moveRows(start, 2, 2, 1)).toBe(start);
    });
});

describe('columns', () => {
    const rows = () => gridOf([['h1', 'h2', 'h3'], ['a', 'b', 'c']]);

    it('inserts blank columns', () => {
        const next = insertColumns(rows(), 1);
        expect(values(next)).toEqual([['h1', '', 'h2', 'h3'], ['a', '', 'b', 'c']]);
        expectWellFormed(next);
    });

    it('deletes a block of columns', () => {
        const next = deleteColumns(rows(), 0, 1);
        expect(values(next)).toEqual([['h3'], ['c']]);
        expectWellFormed(next);
    });

    it('refuses to delete every column', () => {
        const start = rows();
        expect(deleteColumns(start, 0, 2)).toBe(start);
    });

    it('moves a column and will not push it off an edge', () => {
        const next = moveColumns(rows(), 0, 0, 1);
        expect(values(next)).toEqual([['h2', 'h1', 'h3'], ['b', 'a', 'c']]);
        expect(moveColumns(rows(), 2, 2, 1)).toEqual(rows());
        expectWellFormed(next);
    });
});

describe('merging', () => {
    it('joins each row\'s selected cells into the leftmost, unioning their source words', () => {
        const rows = gridOf(
            [['Course', 'Code'], ['Calculus', 'I']],
            (r, c) => ({ wordIds: [`w${r}${c}`] }),
        );
        const next = mergeCells(rows, range(0, 0, 1, 1));
        expect(values(next)).toEqual([['Course Code', ''], ['Calculus I', '']]);
        expect(next[1][0].wordIds).toEqual(['w10', 'w11']);
        expect(next[1][0].matchStatus).toBe('multi_word');
        expect(next[1][0].verified).toBe(true);
        // The logprobs described the pieces, not the joined string.
        expect(next[1][0].confidence.llmMean).toBeNull();
        expectWellFormed(next);
    });

    it('skips blanks when joining rather than padding the value with spaces', () => {
        const rows = gridOf([['a', '', 'b']]);
        expect(values(mergeCells(rows, range(0, 0, 0, 2)))).toEqual([['a b', '', '']]);
    });

    it('keeps the merged trust at the weakest of the parts', () => {
        const rows = gridOf([['a', 'b']], (_r, c) => ({
            confidence: { ...provenanceCell('x').confidence, trust: c === 1 ? 'low' : 'high' },
        }));
        expect(mergeCells(rows, range(0, 0, 0, 1))[0][0].confidence.trust).toBe('low');
    });

    it('is a no-op on a single column', () => {
        const rows = gridOf([['a'], ['b']]);
        expect(mergeCells(rows, range(0, 0, 1, 0))).toBe(rows);
    });

    it('merging columns joins every row and drops the emptied column', () => {
        const rows = gridOf([['Course', 'Code'], ['Calculus', 'I'], ['Physics', 'II']]);
        const next = mergeColumns(rows, 0, 1);
        expect(values(next)).toEqual([['Course Code'], ['Calculus I'], ['Physics II']]);
        expectWellFormed(next);
    });
});

describe('cell shifts', () => {
    it('deleting cells pulls the row left and pads the end', () => {
        const rows = gridOf([['h1', 'h2', 'h3'], ['x', 'a', 'b'], ['1', '2', '3']]);
        const next = deleteCellsShiftLeft(rows, range(1, 0, 1, 0));
        expect(values(next)).toEqual([['h1', 'h2', 'h3'], ['a', 'b', ''], ['1', '2', '3']]);
        expectWellFormed(next);
    });

    it('inserting cells pushes the row right, consuming a trailing blank first', () => {
        const rows = gridOf([['h1', 'h2', 'h3'], ['a', 'b', ''], ['1', '2', '3']]);
        const next = insertCellsShiftRight(rows, range(1, 0, 1, 0));
        expect(values(next)).toEqual([['h1', 'h2', 'h3'], ['', 'a', 'b'], ['1', '2', '3']]);
        expectWellFormed(next);
    });

    it('grows the table only when real content would fall off the end', () => {
        const rows = gridOf([['h1', 'h2'], ['a', 'b']]);
        const next = insertCellsShiftRight(rows, range(1, 0, 1, 0));
        expect(values(next)).toEqual([['h1', 'h2', ''], ['', 'a', 'b']]);
        expectWellFormed(next);
    });

    it('deleting a whole row of cells clears it instead of collapsing the table', () => {
        const rows = gridOf([['h1', 'h2'], ['a', 'b']]);
        const next = deleteCellsShiftLeft(rows, range(1, 0, 1, 1));
        expect(values(next)).toEqual([['h1', 'h2'], ['', '']]);
    });
});

describe('removeEmptyRowsAndColumns', () => {
    it('drops rows and columns with no content anywhere', () => {
        const rows = gridOf([
            ['h1', '', 'h3'],
            ['a', '', 'c'],
            ['', '', ''],
        ]);
        const next = removeEmptyRowsAndColumns(rows);
        expect(values(next)).toEqual([['h1', 'h3'], ['a', 'c']]);
        expectWellFormed(next);
    });

    it('keeps a blank header row — a missing label is not an empty column', () => {
        const rows = gridOf([['', 'h2'], ['a', 'b']]);
        expect(values(removeEmptyRowsAndColumns(rows))).toEqual([['', 'h2'], ['a', 'b']]);
    });

    it('never empties the grid entirely', () => {
        const next = removeEmptyRowsAndColumns(gridOf([['', ''], ['', '']]));
        expect(next).toHaveLength(1);
        expect(next[0]).toHaveLength(1);
    });
});

describe('clipboard', () => {
    it('parses tab-separated rows', () => {
        expect(parseClipboardTable('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
    });

    it('handles CRLF and a trailing newline without inventing a blank row', () => {
        expect(parseClipboardTable('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    });

    it('unquotes Excel-style cells that contain a tab, newline or quote', () => {
        expect(parseClipboardTable('"a\tb"\tc')).toEqual([['a\tb', 'c']]);
        expect(parseClipboardTable('"say ""hi"""')).toEqual([['say "hi"']]);
    });

    it('treats a bare string as a single cell', () => {
        expect(parseClipboardTable('hello')).toEqual([['hello']]);
    });

    it('extracts the values of a range', () => {
        const rows = gridOf([['h1', 'h2'], ['a', 'b']]);
        expect(rangeToStrings(rows, range(1, 0, 1, 1))).toEqual([['a', 'b']]);
        expect(rangeToStrings(rows)).toEqual([['h1', 'h2'], ['a', 'b']]);
    });

    it('pastes a block at the anchor, treating pasted values as verified edits', () => {
        const rows = gridOf([['h1', 'h2'], ['a', 'b']]);
        const next = pasteBlock(rows, { rowIndex: 1, colIndex: 0 }, [['x', 'y']]);
        expect(values(next)).toEqual([['h1', 'h2'], ['x', 'y']]);
        expect(next[1][0].verified).toBe(true);
        expect(next[1][0].edited).toBe(true);
    });

    it('grows the grid when the pasted block runs past its edges', () => {
        const rows = gridOf([['h1'], ['a']]);
        const next = pasteBlock(rows, { rowIndex: 1, colIndex: 0 }, [['x', 'y'], ['p', 'q']]);
        expect(values(next)).toEqual([['h1', ''], ['x', 'y'], ['p', 'q']]);
        expectWellFormed(next);
    });

    it('reports the range a paste covers, so it can be left selected', () => {
        expect(pastedRange({ rowIndex: 1, colIndex: 2 }, [['a', 'b'], ['c', 'd']]))
            .toEqual({ top: 1, left: 2, bottom: 2, right: 3 });
    });

    it('ignores an empty paste', () => {
        const rows = gridOf([['a']]);
        expect(pasteBlock(rows, { rowIndex: 0, colIndex: 0 }, [])).toBe(rows);
    });
});

describe('blankCell', () => {
    it('is an unscored empty cell that agrees with a blank region', () => {
        const cell = blankCell(2, 3);
        expect(cell).toMatchObject({
            rowIndex: 2,
            colIndex: 3,
            value: '',
            wordIds: [],
            matchStatus: 'empty',
        });
        expect(cell.confidence).toEqual({
            llmMean: null, llmMin: null, ocr: null, agreement: 'agree', trust: 'high',
        });
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTableEditor } from './useTableEditor';
import type { Grid } from './tableEdits';
import type { ProvenanceCell } from './types';
import { provenanceCell, resetFixtureIds } from '../../test/fixtures';

const gridOf = (matrix: string[][]): Grid =>
    matrix.map((row, r) => row.map((value, c) => provenanceCell(value, { rowIndex: r, colIndex: c })));

const values = (rows: Grid): string[][] => rows.map(row => row.map(c => c.value));

/**
 * Drives the hook the way Session does: it owns the grid and the selection
 * anchor, and the hook hands both back through its callbacks. Re-rendering with
 * the returned state is what makes undo/redo and the follow-the-anchor sync
 * testable at all.
 */
function harness(initial: Grid) {
    const state = {
        rows: initial,
        selected: null as { rowIndex: number; colIndex: number } | null,
        zooms: 0,
    };
    const view = renderHook(() => useTableEditor({
        rows: state.rows,
        selectedCell: state.selected,
        onApplyGrid: next => { state.rows = next; },
        onSelectCell: (cell: ProvenanceCell, opts) => {
            state.selected = { rowIndex: cell.rowIndex, colIndex: cell.colIndex };
            if (opts?.autoZoom) state.zooms += 1;
        },
        resetKey: 'session:0',
    }));
    // Every command mutates `state` inside an act(); re-render so the hook sees
    // the grid and anchor the session now holds.
    const run = (fn: () => void) => {
        act(() => { fn(); });
        view.rerender();
    };
    return { state, view, run, editor: () => view.result.current };
}

beforeEach(resetFixtureIds);

describe('useTableEditor', () => {
    describe('selection', () => {
        it('anchors on pointer-down and extends with Shift, leaving the anchor put', () => {
            const h = harness(gridOf([['a', 'b'], ['c', 'd']]));
            h.run(() => h.editor().pointerDown(h.state.rows[0][0], false));
            expect(h.state.selected).toEqual({ rowIndex: 0, colIndex: 0 });

            h.run(() => h.editor().pointerDown(h.state.rows[1][1], true));
            expect(h.editor().range).toEqual({ top: 0, left: 0, bottom: 1, right: 1 });
            expect(h.editor().selectionCount).toBe(4);
            // The document keeps showing the anchor's source, not the far corner.
            expect(h.state.selected).toEqual({ rowIndex: 0, colIndex: 0 });
        });

        it('only extends on drag while the button is held', () => {
            const h = harness(gridOf([['a', 'b'], ['c', 'd']]));
            h.run(() => h.editor().pointerEnter(h.state.rows[1][1]));
            expect(h.editor().range).toBeNull();

            h.run(() => h.editor().pointerDown(h.state.rows[0][0], false));
            h.run(() => h.editor().pointerEnter(h.state.rows[1][1]));
            expect(h.editor().range).toEqual({ top: 0, left: 0, bottom: 1, right: 1 });
        });

        it('collapses the range when the session selects a cell elsewhere', () => {
            const h = harness(gridOf([['a', 'b'], ['c', 'd']]));
            h.run(() => h.editor().selectAll());
            expect(h.editor().selectionCount).toBe(4);

            // e.g. clicking a word on the document image.
            h.run(() => { h.state.selected = { rowIndex: 1, colIndex: 1 }; });
            expect(h.editor().selectionCount).toBe(1);
            expect(h.editor().range).toEqual({ top: 1, left: 1, bottom: 1, right: 1 });
        });

        it('selects whole rows and columns', () => {
            const h = harness(gridOf([['a', 'b', 'c'], ['d', 'e', 'f']]));
            h.run(() => h.editor().selectRow(1));
            expect(h.editor().range).toEqual({ top: 1, left: 0, bottom: 1, right: 2 });
            h.run(() => h.editor().selectColumn(2));
            expect(h.editor().range).toEqual({ top: 0, left: 2, bottom: 1, right: 2 });
        });

        it('keeps a multi-cell selection when right-clicking inside it', () => {
            const h = harness(gridOf([['a', 'b'], ['c', 'd']]));
            h.run(() => h.editor().selectAll());
            h.run(() => h.editor().contextTarget(h.state.rows[1][1]));
            expect(h.editor().selectionCount).toBe(4);

            h.run(() => h.editor().selectRow(0));
            h.run(() => h.editor().contextTarget(h.state.rows[1][1]));
            expect(h.editor().selectionCount).toBe(1);
        });

        it('zooms the document only for keyboard/click navigation, not for edits', () => {
            const h = harness(gridOf([['a', 'b'], ['c', 'd']]));
            h.run(() => h.editor().pointerDown(h.state.rows[0][0], false));
            expect(h.state.zooms).toBe(1);
            h.run(() => h.editor().moveFocus(1, 0, false));
            expect(h.state.zooms).toBe(2);
            // A structural edit re-selects without yanking the document view around.
            h.run(() => h.editor().commands.insertRowBelow());
            expect(h.state.zooms).toBe(2);
        });

        it('clamps movement at the table edges', () => {
            const h = harness(gridOf([['a', 'b'], ['c', 'd']]));
            h.run(() => h.editor().pointerDown(h.state.rows[0][0], false));
            h.run(() => h.editor().moveFocus(-1, -1, false));
            expect(h.state.selected).toEqual({ rowIndex: 0, colIndex: 0 });
        });

        it('steps across row ends in reading order', () => {
            const h = harness(gridOf([['a', 'b'], ['c', 'd']]));
            h.run(() => h.editor().pointerDown(h.state.rows[0][1], false));
            h.run(() => h.editor().stepCell(1));
            expect(h.state.selected).toEqual({ rowIndex: 1, colIndex: 0 });
            h.run(() => h.editor().stepCell(-1));
            expect(h.state.selected).toEqual({ rowIndex: 0, colIndex: 1 });
        });
    });

    describe('editing', () => {
        it('commits a value and advances down a row', () => {
            const h = harness(gridOf([['head'], ['a'], ['b']]));
            h.run(() => h.editor().commitEdit(h.state.rows[1][0], 'A!', 'down'));
            expect(values(h.state.rows)).toEqual([['head'], ['A!'], ['b']]);
            expect(h.state.rows[1][0].verified).toBe(true);
            expect(h.state.selected).toEqual({ rowIndex: 2, colIndex: 0 });
        });

        it('opens the editor with a typed character without committing it yet', () => {
            const h = harness(gridOf([['head'], ['a']]));
            h.run(() => h.editor().typeInto({ rowIndex: 1, colIndex: 0 }, '9'));
            expect(h.editor().editing).toEqual({ rowIndex: 1, colIndex: 0, initial: '9' });
            expect(values(h.state.rows)).toEqual([['head'], ['a']]);
            expect(h.editor().canUndo).toBe(false);
        });

        it('marks the whole selection checked in one step, and unmarks it again', () => {
            const h = harness(gridOf([['a', 'b'], ['c', 'd']]));
            h.run(() => h.editor().selectAll());
            h.run(() => h.editor().commands.toggleVerified());
            expect(h.state.rows.flat().every(c => c.verified)).toBe(true);
            h.run(() => h.editor().commands.toggleVerified());
            expect(h.state.rows.flat().some(c => c.verified)).toBe(false);
        });

        it('verifies a mixed selection rather than flipping each cell independently', () => {
            const grid = gridOf([['a', 'b']]);
            grid[0][0] = { ...grid[0][0], verified: true };
            const h = harness(grid);
            h.run(() => h.editor().selectAll());
            h.run(() => h.editor().commands.toggleVerified());
            expect(h.state.rows[0].every(c => c.verified)).toBe(true);
        });
    });

    describe('structural commands', () => {
        it('inserts as many rows as the selection covers, and selects the new block', () => {
            const h = harness(gridOf([['h'], ['a'], ['b']]));
            h.run(() => h.editor().pointerDown(h.state.rows[1][0], false));
            h.run(() => h.editor().pointerDown(h.state.rows[2][0], true));
            h.run(() => h.editor().commands.insertRowAbove());
            expect(values(h.state.rows)).toEqual([['h'], [''], [''], ['a'], ['b']]);
            expect(h.state.selected).toEqual({ rowIndex: 1, colIndex: 0 });
        });

        it('follows moved rows with the selection', () => {
            const h = harness(gridOf([['h'], ['a'], ['b']]));
            h.run(() => h.editor().pointerDown(h.state.rows[1][0], false));
            h.run(() => h.editor().commands.moveRowsDown());
            expect(values(h.state.rows)).toEqual([['h'], ['b'], ['a']]);
            expect(h.state.selected).toEqual({ rowIndex: 2, colIndex: 0 });
        });

        it('joins two columns into one', () => {
            const h = harness(gridOf([['Course', 'Code'], ['Calc', 'I']]));
            h.run(() => h.editor().selectAll());
            h.run(() => h.editor().commands.mergeSelectedColumns());
            expect(values(h.state.rows)).toEqual([['Course Code'], ['Calc I']]);
        });

        it('reports when there is nothing to tidy instead of doing nothing visible', () => {
            const h = harness(gridOf([['h'], ['a']]));
            h.run(() => h.editor().commands.removeEmpty());
            expect(h.editor().notice).toMatch(/No empty rows or columns/);
            expect(h.editor().canUndo).toBe(false);
        });

        it('keeps the selection inside the table after deleting the last row', () => {
            const h = harness(gridOf([['h'], ['a'], ['b']]));
            h.run(() => h.editor().pointerDown(h.state.rows[2][0], false));
            h.run(() => h.editor().commands.deleteSelectedRows());
            expect(values(h.state.rows)).toEqual([['h'], ['a']]);
            expect(h.state.selected).toEqual({ rowIndex: 1, colIndex: 0 });
        });
    });

    describe('history', () => {
        it('undoes and redoes a structural edit', () => {
            const h = harness(gridOf([['h'], ['a']]));
            const before = values(h.state.rows);

            h.run(() => h.editor().pointerDown(h.state.rows[1][0], false));
            h.run(() => h.editor().commands.deleteSelectedRows());
            expect(values(h.state.rows)).toEqual([['h']]);
            expect(h.editor().canUndo).toBe(true);

            h.run(() => h.editor().undo());
            expect(values(h.state.rows)).toEqual(before);
            expect(h.editor().canRedo).toBe(true);

            h.run(() => h.editor().redo());
            expect(values(h.state.rows)).toEqual([['h']]);
        });

        it('drops the redo stack once a new edit is made', () => {
            const h = harness(gridOf([['h'], ['a'], ['b']]));
            h.run(() => h.editor().pointerDown(h.state.rows[1][0], false));
            h.run(() => h.editor().commands.deleteSelectedRows());
            h.run(() => h.editor().undo());
            expect(h.editor().canRedo).toBe(true);
            h.run(() => h.editor().commands.insertRowBelow());
            expect(h.editor().canRedo).toBe(false);
        });

        it('has nothing to undo before the first edit', () => {
            const h = harness(gridOf([['a']]));
            expect(h.editor().canUndo).toBe(false);
            h.run(() => h.editor().undo());
            expect(values(h.state.rows)).toEqual([['a']]);
        });
    });

    describe('clipboard', () => {
        it('pastes a tab-separated block from the anchor', () => {
            const h = harness(gridOf([['h1', 'h2'], ['a', 'b']]));
            h.run(() => h.editor().pointerDown(h.state.rows[1][0], false));
            h.run(() => h.editor().pasteText('x\ty'));
            expect(values(h.state.rows)).toEqual([['h1', 'h2'], ['x', 'y']]);
            expect(h.editor().canUndo).toBe(true);
        });

        it('ignores a paste with no selection to paste into', () => {
            const h = harness(gridOf([['a']]));
            h.run(() => h.editor().pasteText('x'));
            expect(values(h.state.rows)).toEqual([['a']]);
        });

        it('copies the selected block as a table', async () => {
            const write = vi.fn().mockResolvedValue(undefined);
            vi.stubGlobal('navigator', { clipboard: { write, writeText: vi.fn().mockResolvedValue(undefined) } });
            vi.stubGlobal('ClipboardItem', undefined);

            const h = harness(gridOf([['h1', 'h2'], ['a', 'b']]));
            h.run(() => h.editor().selectRow(1));
            await act(async () => { await h.editor().copySelection(); });
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('a\tb');
            vi.unstubAllGlobals();
        });
    });
});

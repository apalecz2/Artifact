/**
 * Menu definitions for the table editor.
 *
 * One builder feeds every surface that offers these commands — the cell
 * right-click menu, the row/column handle menus, and the toolbar's "Edit table"
 * menu — so a command can never be worded one way in one place and another way
 * elsewhere, or be enabled in one and dead in the next.
 *
 * Wording targets the non-technical reader the app is built for: "Delete 3
 * rows", not "Delete selection"; the shortcut hints teach the keyboard path
 * without requiring it.
 */
import type { MenuItem } from '../../components/ContextMenu';
import type { TableEditor } from '../../features/extraction/useTableEditor';

export type MenuTarget = 'cell' | 'row' | 'column' | 'toolbar';

const plural = (n: number, one: string) => (n === 1 ? one : `${n} ${one}s`);

const separator: MenuItem = { separator: true };

export function buildTableMenu(editor: TableEditor, target: MenuTarget): MenuItem[] {
    const { range, selectionCount, commands, verifiedInRange } = editor;
    const rowCount = range ? range.bottom - range.top + 1 : 0;
    const colCount = range ? range.right - range.left + 1 : 0;
    const hasSelection = !!range;
    const singleCell = selectionCount === 1;
    const spansColumns = colCount > 1;

    const clipboard: MenuItem[] = [
        { label: 'Cut', icon: 'content_cut', shortcut: 'Ctrl+X', disabled: !hasSelection, onSelect: () => void editor.cutSelection() },
        { label: 'Copy', icon: 'content_copy', shortcut: 'Ctrl+C', disabled: !hasSelection, onSelect: () => void editor.copySelection() },
        { label: 'Paste', icon: 'content_paste', shortcut: 'Ctrl+V', disabled: !hasSelection, onSelect: () => void editor.pasteFromClipboard() },
        { label: 'Clear contents', icon: 'backspace', shortcut: 'Delete', disabled: !hasSelection, onSelect: commands.clear },
    ];

    const rowOps: MenuItem[] = [
        {
            label: rowCount === 1 ? 'Insert row above' : `Insert ${rowCount} rows above`,
            icon: 'add_row_above', disabled: !hasSelection, onSelect: commands.insertRowAbove,
        },
        {
            label: rowCount === 1 ? 'Insert row below' : `Insert ${rowCount} rows below`,
            icon: 'add_row_below', disabled: !hasSelection, onSelect: commands.insertRowBelow,
        },
        { label: 'Move up', icon: 'arrow_upward', disabled: !hasSelection || range!.top === 0, onSelect: commands.moveRowsUp },
        { label: 'Move down', icon: 'arrow_downward', disabled: !hasSelection || range!.bottom >= editor.gridRows - 1, onSelect: commands.moveRowsDown },
        { label: `Delete ${plural(rowCount, 'row')}`, icon: 'delete', danger: true, disabled: !hasSelection || rowCount >= editor.gridRows, onSelect: commands.deleteSelectedRows },
    ];

    const columnOps: MenuItem[] = [
        {
            label: colCount === 1 ? 'Insert column left' : `Insert ${colCount} columns left`,
            icon: 'add_column_left', disabled: !hasSelection, onSelect: commands.insertColumnLeft,
        },
        {
            label: colCount === 1 ? 'Insert column right' : `Insert ${colCount} columns right`,
            icon: 'add_column_right', disabled: !hasSelection, onSelect: commands.insertColumnRight,
        },
        { label: 'Move left', icon: 'arrow_back', disabled: !hasSelection || range!.left === 0, onSelect: commands.moveColumnsLeft },
        { label: 'Move right', icon: 'arrow_forward', disabled: !hasSelection || range!.right >= editor.gridCols - 1, onSelect: commands.moveColumnsRight },
        { label: `Delete ${plural(colCount, 'column')}`, icon: 'delete', danger: true, disabled: !hasSelection || colCount >= editor.gridCols, onSelect: commands.deleteSelectedColumns },
    ];

    // The repairs for a table that came out of the model misaligned: a value
    // split across two cells, or a row shifted a column early/late because the
    // OCR dropped or gained one.
    const fixOps: MenuItem[] = [
        {
            label: 'Join selected cells',
            icon: 'cell_merge',
            disabled: !spansColumns,
            onSelect: commands.mergeSelection,
        },
        {
            label: colCount === 2 ? 'Join these columns' : `Join ${colCount} columns`,
            icon: 'merge',
            disabled: !spansColumns,
            onSelect: commands.mergeSelectedColumns,
        },
        {
            label: 'Delete cells, shift left',
            icon: 'keyboard_tab_rtl',
            disabled: !hasSelection,
            onSelect: commands.deleteCellsShiftLeft,
        },
        {
            label: 'Insert cells, shift right',
            icon: 'keyboard_tab',
            disabled: !hasSelection,
            onSelect: commands.insertCellsShiftRight,
        },
    ];

    const reviewOps: MenuItem[] = [
        {
            label: singleCell ? 'Edit value' : `Edit ${selectionCount} cells`,
            icon: 'edit',
            shortcut: 'Enter',
            disabled: !singleCell,
            onSelect: () => editor.startEdit(),
        },
        {
            label: verifiedInRange
                ? (singleCell ? 'Unmark as checked' : `Unmark ${selectionCount} cells`)
                : (singleCell ? 'Mark as checked' : `Mark ${selectionCount} cells as checked`),
            icon: verifiedInRange ? 'check_box' : 'check_box_outline_blank',
            shortcut: 'Space',
            disabled: !hasSelection,
            onSelect: commands.toggleVerified,
        },
    ];

    const history: MenuItem[] = [
        { label: 'Undo', icon: 'undo', shortcut: 'Ctrl+Z', disabled: !editor.canUndo, onSelect: editor.undo },
        { label: 'Redo', icon: 'redo', shortcut: 'Ctrl+Y', disabled: !editor.canRedo, onSelect: editor.redo },
    ];

    const tidy: MenuItem[] = [
        { label: 'Remove empty rows & columns', icon: 'cleaning_services', onSelect: commands.removeEmpty },
    ];

    switch (target) {
        case 'row':
            return [...rowOps, separator, ...clipboard, separator, ...reviewOps];
        case 'column':
            return [...columnOps, separator, { ...fixOps[1] }, separator, ...clipboard, separator, ...reviewOps];
        case 'toolbar':
            return [
                ...history, separator,
                ...reviewOps, separator,
                ...rowOps, separator,
                ...columnOps, separator,
                ...fixOps, separator,
                ...tidy,
            ];
        case 'cell':
        default:
            return [
                ...reviewOps, separator,
                ...clipboard, separator,
                rowOps[0], rowOps[1], rowOps[4],
                separator,
                columnOps[0], columnOps[1], columnOps[4],
                separator,
                ...fixOps,
            ];
    }
}

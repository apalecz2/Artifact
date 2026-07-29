import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProvenanceTable, { columnLabel, needsReview } from './ProvenanceTable';
import type { TrustLevel, AgreementStatus, ProvenanceCell } from '../features/extraction/types';
import { provenanceCell } from '../test/fixtures';

const cell = (
    value: string,
    trust: TrustLevel,
    over: {
        agreement?: AgreementStatus;
        matchStatus?: ProvenanceCell['matchStatus'];
        wordIds?: string[];
    } = {},
) => provenanceCell(value, { trust, ...over });

describe('ProvenanceTable', () => {
    it('renders nothing for empty rows', () => {
        const { container } = render(
            <ProvenanceTable rows={[]} onCellClick={vi.fn()} selectedCell={null} />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('renders header and data rows', () => {
        const rows = [
            [cell('Name', 'high'), cell('Score', 'high')],
            [cell('Alice', 'high'), cell('90', 'medium')],
        ];
        render(<ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} />);
        expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('maps trust levels to background colour classes', () => {
        const rows = [
            [cell('H', 'high')],
            [cell('M', 'medium')],
            [cell('L', 'low')],
        ];
        render(<ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} />);
        expect(screen.getByText('H').closest('th')!.className).toContain('bg-green');
        expect(screen.getByText('M').closest('td')!.className).toContain('bg-amber');
        expect(screen.getByText('L').closest('td')!.className).toContain('bg-red');
    });

    it('shows a gray cell and ? badge for image-only cells (M14)', () => {
        const rows = [[cell('X', 'low', { agreement: 'image_only', matchStatus: 'unmatched' })]];
        render(<ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} />);
        const th = screen.getByText('X').closest('th')!;
        expect(th.className).toContain('bg-surface-variant');
        expect(th.textContent).toContain('?');
    });

    it('shows the ≈ badge for fuzzy cells', () => {
        const rows = [
            [cell('H', 'high')],
            [cell('approx', 'medium', { matchStatus: 'fuzzy' })],
        ];
        render(<ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} />);
        expect(screen.getByText('approx').closest('td')!.textContent).toContain('≈');
    });

    it('shows the ! badge on low-trust cells so low confidence is not hue-only', () => {
        const rows = [
            [cell('H', 'high')],
            [cell('shaky', 'low')],
        ];
        render(<ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} />);
        expect(screen.getByText('shaky').closest('td')!.textContent).toContain('!');
        expect(screen.getByText('H').closest('th')!.textContent).not.toContain('!');
    });

    it('does not double-badge a low-trust cell that already shows ? or ≈', () => {
        const rows = [
            [cell('img', 'low', { agreement: 'image_only', matchStatus: 'unmatched' })],
            [cell('fuz', 'low', { matchStatus: 'fuzzy' })],
        ];
        render(<ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} />);
        const imgCell = screen.getByText('img').closest('th')!;
        expect(imgCell.textContent).toContain('?');
        expect(imgCell.textContent).not.toContain('!');
        const fuzCell = screen.getByText('fuz').closest('td')!;
        expect(fuzCell.textContent).toContain('≈');
        expect(fuzCell.textContent).not.toContain('!');
    });

    it('renders a blank cell neutrally — no trust tint, no badge', () => {
        const rows = [
            [cell('Head', 'high')],
            [cell('', 'high', { agreement: 'agree', matchStatus: 'empty' })],
        ];
        const { container } = render(
            <ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} />,
        );
        const td = container.querySelector('tbody td')!;
        expect(td.className).not.toMatch(/bg-(green|amber|red)/);
        expect(td.textContent).toBe('');
    });

    it('renders a legacy blank cell (pre-"empty" status) neutrally, without the ? badge', () => {
        // Old sessions persisted blank cells as unmatched/image_only — they must
        // not surface as "unverified source" warnings.
        const rows = [
            [cell('Head', 'high')],
            [cell('', 'low', { agreement: 'image_only', matchStatus: 'unmatched' })],
        ];
        const { container } = render(
            <ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} />,
        );
        const td = container.querySelector('tbody td')!;
        expect(td.textContent).not.toContain('?');
        expect(td.className).not.toMatch(/bg-(green|amber|red)/);
    });

    it('warns on a blank cell that carries overlooked source text', () => {
        const rows = [
            [cell('Head', 'high')],
            [cell('', 'low', { agreement: 'disagree', matchStatus: 'empty', wordIds: ['w9'] })],
        ];
        const { container } = render(
            <ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} />,
        );
        const td = container.querySelector('tbody td')!;
        expect(td.className).toContain('bg-red');
        expect(td.textContent).toContain('!');
        expect(screen.getByTitle(/unextracted text was found here/)).toBeInTheDocument();
    });

    it('header cells get trust colours, not a flat gray', () => {
        const rows = [[cell('Header', 'high')], [cell('data', 'high')]];
        render(<ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} />);
        expect(screen.getByText('Header').closest('th')!.className).toContain('bg-green');
    });

    it('fires onCellClick for both header and data cells', () => {
        const onCellClick = vi.fn();
        const rows = [[cell('Head', 'high')], [cell('Body', 'high')]];
        render(<ProvenanceTable rows={rows} onCellClick={onCellClick} selectedCell={null} />);
        fireEvent.click(screen.getByText('Head'));
        fireEvent.click(screen.getByText('Body'));
        expect(onCellClick).toHaveBeenCalledTimes(2);
    });

    it('adds a selection ring and scrolls the selected cell into view', () => {
        const rows = [[cell('A', 'high'), cell('B', 'high')]];
        render(
            <ProvenanceTable
                rows={rows}
                onCellClick={vi.fn()}
                selectedCell={{ rowIndex: 0, colIndex: 1 }}
            />,
        );
        expect(screen.getByText('B').closest('th')!.className).toContain('ring-2');
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it('renders a manually verified cell green with a ✓ and no warning badge', () => {
        const rows = [
            [cell('Head', 'high')],
            [{ ...cell('shaky', 'low'), verified: true }],
        ];
        render(<ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} />);
        const td = screen.getByText('shaky').closest('td')!;
        expect(td.className).toContain('bg-green');
        expect(td.textContent).toContain('✓');
        expect(td.textContent).not.toContain('!');
    });

    describe('needsReview', () => {
        it('flags non-high-trust cells until they are manually verified', () => {
            expect(needsReview(cell('x', 'low'))).toBe(true);
            expect(needsReview(cell('x', 'medium'))).toBe(true);
            expect(needsReview(cell('x', 'high'))).toBe(false);
            expect(needsReview({ ...cell('x', 'low'), verified: true })).toBe(false);
        });
    });

    describe('inline editing', () => {
        const editProps = () => ({
            onStartEdit: vi.fn(),
            onCommitEdit: vi.fn(),
            onCancelEdit: vi.fn(),
        });

        it('opens the editor via double-click through onStartEdit', () => {
            const props = editProps();
            const rows = [[cell('Head', 'high')], [cell('Body', 'high', { rowIndex: 1 })]];
            render(
                <ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} editingCell={null} {...props} />,
            );
            fireEvent.doubleClick(screen.getByText('Body'));
            expect(props.onStartEdit).toHaveBeenCalledWith(rows[1][0]);
        });

        it('renders an input for the editing cell; Enter commits the typed value', () => {
            const props = editProps();
            const rows = [[cell('Head', 'high')], [cell('90', 'low', { rowIndex: 1 })]];
            render(
                <ProvenanceTable
                    rows={rows}
                    onCellClick={vi.fn()}
                    selectedCell={{ rowIndex: 1, colIndex: 0 }}
                    editingCell={{ rowIndex: 1, colIndex: 0 }}
                    {...props}
                />,
            );
            const input = screen.getByLabelText('Edit cell value') as HTMLInputElement;
            expect(input.value).toBe('90');
            fireEvent.change(input, { target: { value: '98' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            // Enter commits and moves down a row, the way a spreadsheet does.
            expect(props.onCommitEdit).toHaveBeenCalledWith(rows[1][0], '98', 'down');
        });

        it('Tab commits and moves right; Shift+Tab commits without advancing', () => {
            const props = editProps();
            const rows = [[cell('Head', 'high')], [cell('90', 'low', { rowIndex: 1 })]];
            const { rerender } = render(
                <ProvenanceTable
                    rows={rows}
                    onCellClick={vi.fn()}
                    selectedCell={null}
                    editingCell={{ rowIndex: 1, colIndex: 0 }}
                    {...props}
                />,
            );
            fireEvent.keyDown(screen.getByLabelText('Edit cell value'), { key: 'Tab' });
            expect(props.onCommitEdit).toHaveBeenCalledWith(rows[1][0], '90', 'right');

            rerender(
                <ProvenanceTable
                    rows={rows}
                    onCellClick={vi.fn()}
                    selectedCell={null}
                    editingCell={{ rowIndex: 1, colIndex: 0 }}
                    {...props}
                />,
            );
            fireEvent.keyDown(screen.getByLabelText('Edit cell value'), { key: 'Tab', shiftKey: true });
            expect(props.onCommitEdit).toHaveBeenLastCalledWith(rows[1][0], '90', null);
        });

        it('opens with the typed character when editing began by typing over the cell', () => {
            const props = editProps();
            const rows = [[cell('Head', 'high')], [cell('90', 'low', { rowIndex: 1 })]];
            render(
                <ProvenanceTable
                    rows={rows}
                    onCellClick={vi.fn()}
                    selectedCell={null}
                    editingCell={{ rowIndex: 1, colIndex: 0 }}
                    editingInitialValue="7"
                    {...props}
                />,
            );
            expect((screen.getByLabelText('Edit cell value') as HTMLInputElement).value).toBe('7');
        });

        it('Escape cancels without committing; blur with no change also cancels', () => {
            const props = editProps();
            const rows = [[cell('Head', 'high')], [cell('90', 'low', { rowIndex: 1 })]];
            render(
                <ProvenanceTable
                    rows={rows}
                    onCellClick={vi.fn()}
                    selectedCell={null}
                    editingCell={{ rowIndex: 1, colIndex: 0 }}
                    {...props}
                />,
            );
            const input = screen.getByLabelText('Edit cell value');
            fireEvent.keyDown(input, { key: 'Escape' });
            fireEvent.blur(input);
            expect(props.onCancelEdit).toHaveBeenCalled();
            expect(props.onCommitEdit).not.toHaveBeenCalled();
        });

        it('blur commits when the value changed', () => {
            const props = editProps();
            const rows = [[cell('Head', 'high')], [cell('90', 'low', { rowIndex: 1 })]];
            render(
                <ProvenanceTable
                    rows={rows}
                    onCellClick={vi.fn()}
                    selectedCell={null}
                    editingCell={{ rowIndex: 1, colIndex: 0 }}
                    {...props}
                />,
            );
            const input = screen.getByLabelText('Edit cell value');
            fireEvent.change(input, { target: { value: '95' } });
            fireEvent.blur(input);
            expect(props.onCommitEdit).toHaveBeenCalledWith(rows[1][0], '95', null);
        });
    });

    describe('range selection', () => {
        const grid = () => [
            [cell('A', 'high'), cell('B', 'high', { colIndex: 1 })],
            [cell('C', 'high', { rowIndex: 1 }), cell('D', 'high', { rowIndex: 1, colIndex: 1 })],
        ];

        it('rings every cell inside the selection range, and the anchor differently', () => {
            render(
                <ProvenanceTable
                    rows={grid()}
                    onCellClick={vi.fn()}
                    selectedCell={{ rowIndex: 0, colIndex: 0 }}
                    selectionRange={{ top: 0, left: 0, bottom: 1, right: 1 }}
                />,
            );
            // Anchor: the high-contrast ring (its source is what the document shows).
            expect(screen.getByText('A').closest('th')!.className).toContain('ring-black');
            // Rest of the range: the subordinate primary ring.
            expect(screen.getByText('D').closest('td')!.className).toContain('ring-primary');
            expect(screen.getByText('D').closest('td')!.className).not.toContain('ring-black');
        });

        it('selects on pointer-down (not click) once range selection is wired up', () => {
            const onCellPointerDown = vi.fn();
            const onCellClick = vi.fn();
            const rows = grid();
            render(
                <ProvenanceTable
                    rows={rows}
                    onCellClick={onCellClick}
                    selectedCell={null}
                    onCellPointerDown={onCellPointerDown}
                />,
            );
            fireEvent.mouseDown(screen.getByText('C'), { button: 0, shiftKey: true });
            expect(onCellPointerDown).toHaveBeenCalledWith(rows[1][0], expect.anything());
            // Click must not double-fire selection through the legacy path.
            fireEvent.click(screen.getByText('C'));
            expect(onCellClick).not.toHaveBeenCalled();
        });

        it('ignores non-primary mouse buttons so right-click does not move the anchor', () => {
            const onCellPointerDown = vi.fn();
            render(
                <ProvenanceTable
                    rows={grid()}
                    onCellClick={vi.fn()}
                    selectedCell={null}
                    onCellPointerDown={onCellPointerDown}
                />,
            );
            fireEvent.mouseDown(screen.getByText('C'), { button: 2 });
            expect(onCellPointerDown).not.toHaveBeenCalled();
        });

        it('extends the range while dragging across cells', () => {
            const onCellPointerEnter = vi.fn();
            const rows = grid();
            render(
                <ProvenanceTable
                    rows={rows}
                    onCellClick={vi.fn()}
                    selectedCell={null}
                    onCellPointerDown={vi.fn()}
                    onCellPointerEnter={onCellPointerEnter}
                />,
            );
            fireEvent.mouseEnter(screen.getByText('D'));
            expect(onCellPointerEnter).toHaveBeenCalledWith(rows[1][1]);
        });
    });

    describe('row/column handles', () => {
        const rows = [
            [cell('Name', 'high'), cell('Score', 'high', { colIndex: 1 })],
            [cell('Alice', 'high', { rowIndex: 1 }), cell('90', 'high', { rowIndex: 1, colIndex: 1 })],
        ];

        const handleProps = () => ({
            showHandles: true,
            onSelectRow: vi.fn(),
            onSelectColumn: vi.fn(),
            onSelectAll: vi.fn(),
        });

        it('are hidden unless asked for (the read-only table shows no gutters)', () => {
            render(<ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} />);
            expect(screen.queryByTitle('Select column A')).not.toBeInTheDocument();
        });

        it('select a whole row or column, numbering rows from the header', () => {
            const props = handleProps();
            render(<ProvenanceTable rows={rows} onCellClick={vi.fn()} selectedCell={null} {...props} />);
            fireEvent.mouseDown(screen.getByTitle('Select column B'));
            expect(props.onSelectColumn).toHaveBeenCalledWith(1, expect.anything());
            fireEvent.mouseDown(screen.getByTitle('Select row 2'));
            expect(props.onSelectRow).toHaveBeenCalledWith(1, expect.anything());
            fireEvent.click(screen.getByTitle('Select the whole table'));
            expect(props.onSelectAll).toHaveBeenCalled();
        });

        it('open the handle menu on right-click', () => {
            const onHandleContextMenu = vi.fn();
            render(
                <ProvenanceTable
                    rows={rows}
                    onCellClick={vi.fn()}
                    selectedCell={null}
                    {...handleProps()}
                    onHandleContextMenu={onHandleContextMenu}
                />,
            );
            fireEvent.contextMenu(screen.getByTitle('Select column A'));
            expect(onHandleContextMenu).toHaveBeenCalledWith({ kind: 'column', index: 0 }, expect.anything());
        });
    });

    describe('columnLabel', () => {
        it('numbers columns the way a spreadsheet does', () => {
            expect(columnLabel(0)).toBe('A');
            expect(columnLabel(25)).toBe('Z');
            expect(columnLabel(26)).toBe('AA');
            expect(columnLabel(27)).toBe('AB');
            expect(columnLabel(51)).toBe('AZ');
            expect(columnLabel(52)).toBe('BA');
        });
    });
});

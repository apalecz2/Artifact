import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProvenanceTable, { needsReview } from './ProvenanceTable';
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
            expect(props.onCommitEdit).toHaveBeenCalledWith(rows[1][0], '98');
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
            expect(props.onCommitEdit).toHaveBeenCalledWith(rows[1][0], '95');
        });
    });
});

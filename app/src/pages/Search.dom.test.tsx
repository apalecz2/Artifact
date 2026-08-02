import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const select = vi.fn();
vi.mock('../lib/db', () => ({ getDb: async () => ({ select: (...a: unknown[]) => select(...a) }) }));
vi.mock('../features/sessions/DeleteSessionDialog', () => ({ DeleteSessionDialog: () => null }));

import Search from './Search';

/** The SQL of every query the page issued, whitespace-collapsed. */
const queries = () => select.mock.calls.map(c => (c[0] as string).replace(/\s+/g, ' '));

const session = (over: Record<string, unknown> = {}) => ({
    id: 's1',
    title: 'Statement 2024',
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-02 00:00:00',
    scan_match: null,
    table_match: null,
    ...over,
});

function renderSearch(rows: Record<string, unknown>[]) {
    select.mockImplementation(async (sql: string) =>
        sql.includes('COUNT(*)') ? [{ matches: rows.length, total: rows.length }] : rows,
    );
    return render(<MemoryRouter><Search /></MemoryRouter>);
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('Search', () => {
    /**
     * The gap this closes: the placeholder promises "Search extractions…" while
     * the query only ever looked at `sessions.title`. Someone who remembers a
     * document by an invoice number in it — the whole point of the product — got
     * "No results found".
     */
    it('consults the OCR text and the extracted tables, not just the title', async () => {
        renderSearch([session()]);

        await waitFor(() => expect(select).toHaveBeenCalled());
        const sql = queries().join(' | ');
        expect(sql).toContain('FROM document_pages p');
        expect(sql).toContain('p.full_text LIKE');
        expect(sql).toContain('FROM csv_outputs c');
        expect(sql).toContain('c.csv_content LIKE');
    });

    it('counts content matches too, so pagination agrees with the results', async () => {
        renderSearch([session()]);

        await waitFor(() => expect(select).toHaveBeenCalled());
        const countQuery = queries().find(q => q.includes('COUNT(*)'))!;
        // Not `SUM(CASE WHEN title LIKE …)`: a count over titles alone would
        // report "no results" for a page that has some, and clamp it away.
        expect(countQuery).toContain('FROM document_pages p');
        expect(countQuery).toContain('FROM csv_outputs c');
    });

    it('shows where in the document the match was, with the hit marked', async () => {
        const { container } = renderSearch([
            session({ scan_match: 'Total due for\nInvoice 4471 on receipt' }),
        ]);

        // Typing is debounced by 300ms; seed the query through the input.
        const input = screen.getByPlaceholderText('Search extractions...') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'invoice 4471' } });

        const mark = await waitFor(() => {
            const found = container.querySelector('mark');
            if (!found) throw new Error('no excerpt yet');
            return found;
        }, { timeout: 2000 });

        expect(mark.textContent).toBe('Invoice 4471');
        expect(screen.getByText('In the document')).toBeInTheDocument();
        // The newline in the stored OCR text is flattened for display.
        expect(mark.parentElement?.textContent).toContain('Total due for Invoice 4471');
    });

    it('shows no excerpt when only the title matched', async () => {
        const { container } = renderSearch([session()]);
        await screen.findByText('Statement 2024');
        expect(container.querySelector('mark')).toBeNull();
    });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ExportMenu } from './ExportMenu';
import * as exportUtils from './exportUtils';
import type { ProvenanceCell } from '../extraction/types';
import { mockClipboard } from '../../test/helpers';
import { provenanceCell as provCell } from '../../test/fixtures';

// Keep the real serializers, but spy on the dialog-driven save so we never touch
// the Tauri fs/dialog plugins.
vi.mock('./exportUtils', async () => {
    const actual = await vi.importActual<typeof import('./exportUtils')>('./exportUtils');
    return {
        ...actual,
        saveWithDialog: vi.fn().mockResolvedValue(true),
        saveXlsxWithDialog: vi.fn().mockResolvedValue(true),
    };
});

const rows: ProvenanceCell[][] = [[provCell('Name'), provCell('Age')], [provCell('Al'), provCell('30')]];

describe('ExportMenu', () => {
    beforeEach(() => vi.useRealTimers());
    afterEach(() => {
        Reflect.deleteProperty(document, 'execCommand');
        Reflect.deleteProperty(navigator, 'clipboard');
    });

    it('is disabled when there is no data', () => {
        render(<ExportMenu provenanceCells={null} savedCsv={null} fileStem="x" />);
        expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled();
    });

    it('toggles the menu open and closed', () => {
        render(<ExportMenu provenanceCells={rows} savedCsv={null} fileStem="x" />);
        const trigger = screen.getByRole('button', { name: /Export/ });
        fireEvent.click(trigger);
        expect(screen.getByText('CSV')).toBeInTheDocument();
        fireEvent.click(trigger);
        expect(screen.queryByText('CSV')).not.toBeInTheDocument();
    });

    it('closes on outside mousedown', () => {
        render(<ExportMenu provenanceCells={rows} savedCsv={null} fileStem="x" />);
        fireEvent.click(screen.getByRole('button', { name: /Export/ }));
        expect(screen.getByText('CSV')).toBeInTheDocument();
        fireEvent.mouseDown(document.body);
        expect(screen.queryByText('CSV')).not.toBeInTheDocument();
    });

    it('saves each format with its serializer and SaveFormat', async () => {
        render(<ExportMenu provenanceCells={rows} savedCsv={null} fileStem="report" />);
        fireEvent.click(screen.getByRole('button', { name: /Export/ }));
        fireEvent.click(screen.getByText('CSV'));
        await waitFor(() =>
            expect(exportUtils.saveWithDialog).toHaveBeenCalledWith(
                'report',
                exportUtils.toCsv([['Name', 'Age'], ['Al', '30']]),
                expect.objectContaining({ ext: 'csv' }),
            ),
        );
    });

    it('exports xlsx via saveXlsxWithDialog with raw rows, not a serialized string', async () => {
        render(<ExportMenu provenanceCells={rows} savedCsv={null} fileStem="report" />);
        fireEvent.click(screen.getByRole('button', { name: /Export/ }));
        fireEvent.click(screen.getByText('Excel'));
        await waitFor(() =>
            expect(exportUtils.saveXlsxWithDialog).toHaveBeenCalledWith(
                'report',
                [['Name', 'Age'], ['Al', '30']],
                expect.objectContaining({ ext: 'xlsx' }),
            ),
        );
        expect(exportUtils.saveWithDialog).not.toHaveBeenCalled();
    });

    it('prefers provenance rows over savedCsv', async () => {
        render(<ExportMenu provenanceCells={rows} savedCsv={'ignored,csv\n1,2'} fileStem="r" />);
        fireEvent.click(screen.getByRole('button', { name: /Export/ }));
        fireEvent.click(screen.getByText('CSV'));
        await waitFor(() => {
            const content = (exportUtils.saveWithDialog as ReturnType<typeof vi.fn>).mock.calls[0][1];
            expect(content).toContain('Name');
            expect(content).not.toContain('ignored');
        });
    });

    it('falls back to parsing savedCsv when there are no provenance rows', async () => {
        render(<ExportMenu provenanceCells={null} savedCsv={'a,b\n1,2'} fileStem="r" />);
        fireEvent.click(screen.getByRole('button', { name: /Export/ }));
        fireEvent.click(screen.getByText('CSV'));
        await waitFor(() => {
            const content = (exportUtils.saveWithDialog as ReturnType<typeof vi.fn>).mock.calls[0][1];
            expect(content).toBe(exportUtils.toCsv([['a', 'b'], ['1', '2']]));
        });
    });

    /**
     * TSV, not Markdown. This button sits a few pixels from the card's own Copy
     * button on the same table; writing a different format from it made the one
     * *inside the Export menu* the one that pastes into a spreadsheet as a column
     * of pipe characters. (jsdom has no `ClipboardItem`, so `copyTableToClipboard`
     * takes its text/plain-only path here — which is the TSV either way.)
     */
    it('copies the table as TSV and flips to "Copied!" then back', async () => {
        vi.useFakeTimers();
        const writeText = mockClipboard();
        render(<ExportMenu provenanceCells={rows} savedCsv={null} fileStem="x" />);
        fireEvent.click(screen.getByRole('button', { name: /Export/ }));
        fireEvent.click(screen.getByText('Copy table'));
        expect(writeText).toHaveBeenCalledWith('Name\tAge\nAl\t30');
        // resolve the clipboard promise -> "Copied!"
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByText('Copied!')).toBeInTheDocument();
        await act(async () => { vi.advanceTimersByTime(2000); });
        expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
        vi.useRealTimers();
    });

    // Export is the app's terminal step: a save that fails and says nothing leaves
    // the user believing a file exists.
    it('reports a failed save with the reason it failed', async () => {
        vi.mocked(exportUtils.saveWithDialog).mockRejectedValueOnce(
            new Error('The process cannot access the file'),
        );
        render(<ExportMenu provenanceCells={rows} savedCsv={null} fileStem="report" />);
        fireEvent.click(screen.getByRole('button', { name: /Export/ }));
        fireEvent.click(screen.getByText('CSV'));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(/Couldn’t save the CSV file/);
        expect(alert).toHaveTextContent(/The process cannot access the file/);
    });

    it('reports a failed xlsx export too', async () => {
        vi.mocked(exportUtils.saveXlsxWithDialog).mockRejectedValueOnce('too many columns for XLSX');
        render(<ExportMenu provenanceCells={rows} savedCsv={null} fileStem="report" />);
        fireEvent.click(screen.getByRole('button', { name: /Export/ }));
        fireEvent.click(screen.getByText('Excel'));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(/Couldn’t save the Excel file/);
        // Tauri rejects `invoke` with a plain string — the reason must survive.
        expect(alert).toHaveTextContent(/too many columns for XLSX/);
    });

    // `false` means the user dismissed the save dialog. Nothing happened, so nothing
    // should be said — an "error" here would be the app crying wolf.
    it('stays silent when the user cancels the save dialog', async () => {
        vi.mocked(exportUtils.saveWithDialog).mockResolvedValueOnce(false);
        render(<ExportMenu provenanceCells={rows} savedCsv={null} fileStem="report" />);
        fireEvent.click(screen.getByRole('button', { name: /Export/ }));
        fireEvent.click(screen.getByText('CSV'));

        await waitFor(() => expect(exportUtils.saveWithDialog).toHaveBeenCalled());
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('reports a refused clipboard instead of silently showing nothing', async () => {
        mockClipboard().mockRejectedValue(new Error('denied'));
        render(<ExportMenu provenanceCells={rows} savedCsv={null} fileStem="x" />);
        fireEvent.click(screen.getByRole('button', { name: /Export/ }));
        fireEvent.click(screen.getByText('Copy table'));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(/Couldn’t copy the table to the clipboard/);
        expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toCsv, toHtml, toMarkdown, toPlainText, buildFileStem, saveWithDialog, saveXlsxWithDialog } from './exportUtils';

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
const { writeTextFile } = vi.hoisted(() => ({ writeTextFile: vi.fn() }));
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/plugin-dialog', () => ({ save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

describe('toCsv (RFC-4180 escaping)', () => {
    it('joins rows with CRLF and cells with commas', () => {
        expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d');
    });

    it('quotes cells containing a comma', () => {
        expect(toCsv([['a,b', 'c']])).toBe('"a,b",c');
    });

    it('quotes and doubles embedded quotes — even without a comma (M1 regression)', () => {
        expect(toCsv([['he said "hi"']])).toBe('"he said ""hi"""');
    });

    it('quotes cells containing newlines', () => {
        expect(toCsv([['line1\nline2']])).toBe('"line1\nline2"');
    });

    it('quotes a cell containing a carriage return', () => {
        expect(toCsv([['a\rb']])).toBe('"a\rb"');
    });

    it('leaves a plain cell unquoted', () => {
        expect(toCsv([['plain']])).toBe('plain');
    });
});

describe('toPlainText', () => {
    it('joins cells with tabs and rows with newlines', () => {
        expect(toPlainText([['a', 'b'], ['c', 'd']])).toBe('a\tb\nc\td');
    });
});

describe('toHtml', () => {
    it('renders a thead/tbody table and escapes markup', () => {
        const html = toHtml([['H&1', 'H2'], ['<b>', 'd']]);
        expect(html).toContain('<th>H&amp;1</th>');
        expect(html).toContain('<td>&lt;b&gt;</td>');
        expect(html).toContain('<thead>');
        expect(html).toContain('<tbody>');
    });

    it('escapes double quotes', () => {
        expect(toHtml([['"q"'], ['x']])).toContain('<th>&quot;q&quot;</th>');
    });

    it('returns empty string for no rows', () => {
        expect(toHtml([])).toBe('');
    });
});

describe('toMarkdown', () => {
    it('emits a header row, a separator, and padded data rows', () => {
        const md = toMarkdown([['Name', 'Age'], ['Al', '30']]).split('\n');
        expect(md[0]).toContain('Name');
        expect(md[1]).toMatch(/^\| -+ \| -+ \|$/);
        expect(md[2]).toContain('Al');
    });

    it('uses a minimum column width of 3', () => {
        // single-char header/data still gets padded to width 3
        const md = toMarkdown([['A'], ['x']]).split('\n');
        expect(md[1]).toBe('| --- |');
        expect(md[0]).toBe('| A   |');
    });

    it('pads ragged rows out to the widest column count', () => {
        const md = toMarkdown([['A', 'B'], ['x']]).split('\n');
        // data row missing a second cell is padded, keeping the table rectangular
        expect(md[2]).toMatch(/^\| x\s+\|\s+\|$/);
    });

    it('returns empty string for no rows', () => {
        expect(toMarkdown([])).toBe('');
    });
});

describe('buildFileStem', () => {
    it('sanitizes the source name and appends _extract', () => {
        expect(buildFileStem('My Report.pdf', 0, 1)).toBe('My_Report_extract');
    });

    it('includes the page number for multi-page documents', () => {
        expect(buildFileStem('doc.pdf', 2, 5)).toBe('doc_p3_extract');
    });

    it('falls back to "extraction" when no name is given', () => {
        expect(buildFileStem(null, 0, 1)).toBe('extraction_extract');
    });

    it('collapses repeated illegal chars and trims edge underscores', () => {
        expect(buildFileStem('!!a  b!!.csv', 0, 1)).toBe('a_b_extract');
    });

    it('caps the stem at 50 characters before the suffix', () => {
        const long = 'x'.repeat(80) + '.pdf';
        const stem = buildFileStem(long, 0, 1);
        expect(stem).toBe('x'.repeat(50) + '_extract');
    });

    it('falls back to "extraction" when the name sanitizes to empty', () => {
        expect(buildFileStem('!!!.pdf', 0, 1)).toBe('extraction_extract');
    });
});

const csvFormat = { ext: 'csv', label: 'CSV files', filters: [{ name: 'CSV', extensions: ['csv'] }] };
const xlsxFormat = { ext: 'xlsx', label: 'Excel files', filters: [{ name: 'Excel', extensions: ['xlsx'] }] };

describe('saveWithDialog', () => {
    beforeEach(() => vi.clearAllMocks());

    it('opens the dialog with the stem/ext as the default filename and forwards filters', async () => {
        save.mockResolvedValue('/tmp/report.csv');
        await saveWithDialog('report', 'a,b', csvFormat);
        expect(save).toHaveBeenCalledWith({ defaultPath: 'report.csv', filters: csvFormat.filters });
    });

    it('returns false and never writes when the user cancels', async () => {
        save.mockResolvedValue(null);
        const result = await saveWithDialog('report', 'a,b', csvFormat);
        expect(result).toBe(false);
        expect(writeTextFile).not.toHaveBeenCalled();
    });

    it('writes the content to the chosen path and returns true', async () => {
        save.mockResolvedValue('/tmp/report.csv');
        const result = await saveWithDialog('report', 'a,b', csvFormat);
        expect(result).toBe(true);
        expect(writeTextFile).toHaveBeenCalledWith('/tmp/report.csv', 'a,b');
    });
});

describe('saveXlsxWithDialog', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns false and never invokes the backend when the user cancels', async () => {
        save.mockResolvedValue(null);
        const result = await saveXlsxWithDialog('report', [['a']], xlsxFormat);
        expect(result).toBe(false);
        expect(invoke).not.toHaveBeenCalled();
    });

    it('invokes export_xlsx with the raw rows and chosen path, returns true', async () => {
        save.mockResolvedValue('/tmp/report.xlsx');
        const rows = [['Name', 'Age'], ['Al', '30']];
        const result = await saveXlsxWithDialog('report', rows, xlsxFormat);
        expect(result).toBe(true);
        expect(invoke).toHaveBeenCalledWith('export_xlsx', { rows, destPath: '/tmp/report.xlsx' });
    });
});

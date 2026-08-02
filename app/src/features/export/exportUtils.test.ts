import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toCsv, toCsvForExport, neutralizeFormula, toHtml, toMarkdown, toPlainText, buildFileStem, saveWithDialog, saveXlsxWithDialog } from './exportUtils';

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

describe('neutralizeFormula (CSV injection)', () => {
    // Values a scanned document could carry that a spreadsheet would execute.
    it.each([
        ['=cmd|\'/c calc\'!A1', "'=cmd|'/c calc'!A1"],
        ['=SUM(A1:A9)', "'=SUM(A1:A9)"],
        ['@SUM(1+1)*cmd', "'@SUM(1+1)*cmd"],
        ['+cmd|\'/c calc\'!A0', "'+cmd|'/c calc'!A0"],
        ['-1+cmd|\'/c calc\'!A0', "'-1+cmd|'/c calc'!A0"],
        ['\tstill a formula', "'\tstill a formula"],
    ])('neutralizes %j', (input, expected) => {
        expect(neutralizeFormula(input)).toBe(expected);
    });

    // The reason this is narrower than the usual "escape every leading -+=@" rule:
    // extracted tables are full of signed numbers, and prefixing them would turn
    // every negative amount into text and break the sums the export exists for.
    it.each([
        '-42',
        '+42',
        '-1.5',
        '-1,234.00',
        '-42%',
        '-$42',
        '-1.5e3',
        '+1.5E-10',
        '1234',
    ])('leaves the number %j alone', (input) => {
        expect(neutralizeFormula(input)).toBe(input);
    });

    it.each(['plain', '', 'a=b', 'user@example.com', '(1,234)'])(
        'leaves %j alone — nothing formula-shaped about it',
        (input) => {
            expect(neutralizeFormula(input)).toBe(input);
        },
    );
});

describe('toCsvForExport', () => {
    it('neutralizes formula cells that toCsv passes straight through', () => {
        const rows = [['Item', 'Total'], ['=cmd|\'/c calc\'!A1', '-42']];
        expect(toCsv(rows)).toContain('=cmd');
        expect(toCsvForExport(rows)).toContain("'=cmd");
        // The negative number is data and survives untouched.
        expect(toCsvForExport(rows)).toContain('-42');
    });

    it('quotes around the apostrophe, not the other way round', () => {
        // The cell needs CSV quoting *and* neutralizing; the prefix has to end up
        // inside the quotes or the spreadsheet sees a bare `=` again.
        expect(toCsvForExport([['=a,b']])).toBe('"\'=a,b"');
    });

    it('is identical to toCsv when nothing is formula-shaped', () => {
        const rows = [['Name', 'Age'], ['Al', '30']];
        expect(toCsvForExport(rows)).toBe(toCsv(rows));
    });

    // toCsv is also what gets persisted and read back into the app's own grid, so
    // it must stay byte-faithful — the guard belongs only on the export path.
    it('leaves toCsv itself unguarded', () => {
        expect(toCsv([['=SUM(A1)']])).toBe('=SUM(A1)');
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

    // A raw `|` ends the cell early and shifts every column after it, so the table
    // silently stops matching its header.
    it('escapes a pipe inside a cell so the columns stay put', () => {
        const md = toMarkdown([['A', 'B'], ['x|y', 'z']]).split('\n');
        expect(md[2]).toContain('x\\|y');
        // Still exactly two columns: three delimiters, none of them the escaped one.
        expect(md[2].replace(/\\\|/g, '')).toMatch(/^\|[^|]*\|[^|]*\|$/);
    });

    it('escapes backslashes before pipes, so a trailing backslash cannot re-open the cell', () => {
        // Escaping only the pipe would emit `a\\|b`: the pair renders as one literal
        // backslash and the pipe becomes a delimiter again.
        const md = toMarkdown([['A', 'B'], ['a\\', 'b']]).split('\n');
        expect(md[2]).toContain('a\\\\');
        expect(md[2].replace(/\\\\/g, '')).toMatch(/^\|[^|]*\|[^|]*\|$/);
    });

    it('folds a newline into a space rather than ending the row', () => {
        const md = toMarkdown([['A'], ['line1\nline2']]).split('\n');
        expect(md).toHaveLength(3);
        expect(md[2]).toContain('line1 line2');
    });

    it('pads from the escaped width, so an escaped cell still aligns', () => {
        const md = toMarkdown([['Head'], ['a|b']]).split('\n');
        // 'a\|b' is 4 source characters; the header is 4 wide, so no extra padding.
        expect(md[2]).toBe('| a\\|b |');
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

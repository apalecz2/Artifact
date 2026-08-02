/** Pure serializers: string[][] → various formats. Row 0 is the header row. */

function escCsv(cell: string): string {
    const escaped = cell.replace(/"/g, '""');
    return /[,"\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

/**
 * RFC-4180 CSV. This is the **round-trip** serializer, not the export one.
 *
 * Its output is also what gets persisted (`csv_outputs.csv_content`) and read back
 * through `parseCSV` into the displayed table, so it must reproduce cell values
 * byte for byte. Anything that alters a value for a *consumer's* benefit belongs in
 * `toCsvForExport` below, never here — a guard added at this level would write its
 * escapes into the database and show them in the app's own grid.
 */
export function toCsv(rows: string[][]): string {
    return rows.map(row => row.map(escCsv).join(',')).join('\r\n');
}

// Leading characters a spreadsheet may read as the start of a formula rather than
// as data. Tab and CR are included because they let following text drift into a
// neighbouring cell's formula context.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

// A value a spreadsheet evaluates as a *number*: optional sign, optional currency
// mark, digits with optional group separators, optional decimal part, optional
// exponent, optional percent. These carry no formula risk and must survive export
// untouched — see `neutralizeFormula`.
const PLAIN_NUMBER = /^[+-]?[$€£¥]?\d[\d,\s]*(\.\d+)?([eE][+-]?\d+)?%?$/;

/**
 * Defuse spreadsheet formula injection (OWASP "CSV injection") in one cell.
 *
 * Every value we export came out of a document *we did not write* — a scanned page
 * someone handed the user. A cell reading `=cmd|'/c calc'!A1` is inert in our table
 * and inert in the CSV file itself, and becomes code the moment Excel or
 * LibreOffice opens it. A formula-shaped cell is therefore prefixed with an
 * apostrophe, the spreadsheet convention for "this is text".
 *
 * Deliberately narrower than the usual advice, which is to escape every leading
 * `=`, `+`, `-` and `@`. That rule is written for exporting *application* records,
 * and it wrecks a data-extraction tool: a leading `-` is nearly always a negative
 * number, and prefixing those would silently turn every negative amount in the
 * sheet into text and break the arithmetic the user exported it to do. So numbers
 * are recognised and passed through, and only values that are formula-shaped *and*
 * not data get the prefix.
 *
 * Not applied to the clipboard or to `toCsv`: copy/paste has to round-trip back
 * into our own editor, and `toCsv` is what we persist. The XLSX path needs no
 * guard at all — `export_xlsx` writes cells via `write_string`, so the spreadsheet
 * receives them already typed as text.
 */
export function neutralizeFormula(cell: string): string {
    if (!FORMULA_LEAD.test(cell) || PLAIN_NUMBER.test(cell)) return cell;
    return `'${cell}`;
}

/** CSV destined for a file the user will open in a spreadsheet: `toCsv`, with
 *  formula-shaped cells neutralized first (so the apostrophe is inside the quoting,
 *  not bolted on after it). */
export function toCsvForExport(rows: string[][]): string {
    return toCsv(rows.map(row => row.map(neutralizeFormula)));
}

/**
 * Escape a cell for an HTML *text node*. Shared with the clipboard's `text/html`
 * flavour ([clipboard.ts](../../utils/clipboard.ts)), which builds the same kind
 * of table for a spreadsheet to paste — one escaper so a cell that survives a
 * copy/paste also survives an export.
 *
 * `"` is escaped alongside `&<>` even though a text node doesn't require it: no
 * caller interpolates a cell into an attribute today, and escaping it means one
 * that later does isn't a quote-out-of-the-attribute bug.
 */
export function escapeHtmlText(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function toHtml(rows: string[][]): string {
    if (rows.length === 0) return '';
    const [header, ...data] = rows;
    const thead =
        `  <thead>\n    <tr>${header.map(h => `<th>${escapeHtmlText(h)}</th>`).join('')}</tr>\n  </thead>`;
    const tbody =
        `  <tbody>\n${data.map(row =>
            `    <tr>${row.map(c => `<td>${escapeHtmlText(c)}</td>`).join('')}</tr>`
        ).join('\n')}\n  </tbody>`;
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head><meta charset="UTF-8"><title>Exported Table</title></head>',
        '<body>',
        '<table border="1" cellpadding="4" cellspacing="0">',
        thead,
        tbody,
        '</table>',
        '</body>',
        '</html>',
    ].join('\n');
}

/**
 * Escape one cell for a Markdown table.
 *
 * A table cell is pipe-delimited, so a literal `|` in a value ends the cell early
 * and shifts every column after it on that row — the table silently stops matching
 * its header. A newline ends the *row* outright. Both appear in real extracted
 * data (measurement ranges, wrapped addresses), so neither can be left raw.
 *
 * Backslashes are escaped first, and must be: escaping only the pipe would turn a
 * value that already ends in a backslash (`a\` + `|`) into `a\\|`, where the pair
 * renders as one literal backslash and the pipe goes back to being a delimiter —
 * reintroducing the very bug for the one input most likely to be probing for it.
 */
const escMd = (cell: string): string =>
    cell
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/\s*\r?\n\s*/g, ' ');

export function toMarkdown(rows: string[][]): string {
    if (rows.length === 0) return '';
    // Escape before measuring: an escaped pipe is two characters wide in the
    // source, so widths taken from the raw values would misalign every column
    // after it.
    const [header, ...data] = rows.map(row => row.map(escMd));

    const colCount = Math.max(header.length, ...data.map(r => r.length));
    const widths = Array.from({ length: colCount }, (_, i) =>
        Math.max(
            3,
            (header[i] ?? '').length,
            ...data.map(row => (row[i] ?? '').length)
        )
    );

    const pad = (s: string, w: number) => s.padEnd(w);
    const row2md = (row: string[]) =>
        `| ${Array.from({ length: colCount }, (_, i) => pad(row[i] ?? '', widths[i])).join(' | ')} |`;

    const sep = `| ${widths.map(w => '-'.repeat(w)).join(' | ')} |`;

    return [row2md(header), sep, ...data.map(row2md)].join('\n');
}

export function toPlainText(rows: string[][]): string {
    return rows.map(row => row.join('\t')).join('\n');
}

/** Sanitize a source document name for use as a filename stem (no extension). */
export function buildFileStem(sourceName: string | null, pageIndex: number, totalPages: number): string {
    const base = sourceName
        ? sourceName
            .replace(/\.[^.]+$/, '')            // strip extension
            .replace(/[^a-zA-Z0-9_-]/g, '_')   // replace illegal chars
            .replace(/_+/g, '_')                // collapse repeated underscores
            .replace(/^_|_$/g, '')              // trim leading/trailing underscores
            .slice(0, 50)
        : 'extraction';
    const safe = base || 'extraction';
    return totalPages > 1 ? `${safe}_p${pageIndex + 1}_extract` : `${safe}_extract`;
}

export interface SaveFormat {
    ext: string;
    label: string;
    filters: { name: string; extensions: string[] }[];
}

/** Open the OS native Save As dialog; returns the chosen path, or null if the user cancelled. */
async function pickSavePath(stem: string, format: SaveFormat): Promise<string | null> {
    const { save } = await import('@tauri-apps/plugin-dialog');
    return save({
        defaultPath: `${stem}.${format.ext}`,
        filters: format.filters,
    });
}

/** Open the OS native Save As dialog and write text content to the chosen path. Returns false if user cancelled. */
export async function saveWithDialog(
    stem: string,
    content: string,
    format: SaveFormat
): Promise<boolean> {
    const path = await pickSavePath(stem, format);
    if (!path) return false;

    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(path, content);
    return true;
}

/**
 * Open the OS native Save As dialog and write an XLSX workbook to the chosen path.
 * The workbook itself is built on the Rust side (`export_xlsx`) via `rust_xlsxwriter`,
 * since XLSX is a binary zip/XML format best left to a dedicated writer rather than
 * hand-rolled in the frontend. Returns false if the user cancelled.
 */
export async function saveXlsxWithDialog(
    stem: string,
    rows: string[][],
    format: SaveFormat
): Promise<boolean> {
    const path = await pickSavePath(stem, format);
    if (!path) return false;

    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('export_xlsx', { rows, destPath: path });
    return true;
}

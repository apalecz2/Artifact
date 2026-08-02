/**
 * Copy plain text, reporting success instead of throwing.
 *
 * Unlike `copyTableToClipboard` below (whose callers can let a rejection bubble),
 * the one caller here is the About screen's "copy diagnostics" button, which has
 * to *tell* the user when the copy didn't happen — a silently dead button on the
 * page people use to file bug reports is the worst place for one.
 *
 * The `execCommand` fallback covers webviews that withhold the async clipboard
 * API from a non-https origin; it's the same mechanism the Edit menu's Cut/Copy
 * items use (see TitleBarMenu).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const area = document.createElement('textarea');
            area.value = text;
            // Kept off-screen but focusable — execCommand('copy') only acts on a
            // live selection, so the element has to be in the document.
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            const copied = document.execCommand('copy');
            document.body.removeChild(area);
            return copied;
        } catch {
            return false;
        }
    }
}

/**
 * Whether a Tauri backend is present to serve `invoke`.
 *
 * `@tauri-apps/api`'s `invoke` dispatches through this global, so its absence is
 * exactly the "running under plain `vite dev`, no backend" case — and nothing else.
 * A plugin call that fails *with* the global present is a real failure, not a
 * missing environment.
 */
const hasTauriBackend = (): boolean =>
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Read the clipboard's text, natively.
 *
 * Not `navigator.clipboard.readText()`: that is a *web* API, so the webview gates
 * it behind Chromium's `clipboard-read` permission and pops up "<origin> wants to
 * see text and images copied to the clipboard" the first time. A local desktop app
 * pasting into its own window has no business showing that, so reads go through
 * Tauri's clipboard plugin, which asks the OS from Rust and never prompts.
 *
 * The web API is kept only for a plain `vite dev` run, where there is no backend to
 * ask and a dev-server origin prompting is nobody's problem. That case is detected
 * up front rather than by catching a failure: the plugin is an ordinary npm package
 * that imports fine without Tauri, so it is the *call* that fails there — meaning a
 * `catch` around the call cannot tell "no backend" from "the OS refused". Treating
 * the second as the first is what re-introduced the prompt this function exists to
 * avoid, in the packaged app, at the one moment the user was already having trouble.
 *
 * Inside the app a failure therefore propagates, and the caller says so —
 * `useTableEditor.pasteFromClipboard` catches it and points at Ctrl+V, which rides
 * the webview's own paste event and needs no permission at all.
 *
 * Writing needs none of this — `navigator.clipboard.write` is granted outright for
 * a focused document acting on a user gesture — so `copyTableToClipboard` below
 * stays on the web API, where it can offer HTML alongside plain text.
 */
export async function readClipboardText(): Promise<string> {
    if (!hasTauriBackend()) {
        return (await navigator.clipboard.readText()) ?? '';
    }
    const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
    return (await readText()) ?? '';
}

// Copy tabular data to the clipboard the way a spreadsheet (or Claude's chat) does:
// TSV as text/plain (pastes into a text editor) plus an HTML <table> (pastes as a real
// grid into Excel / Google Sheets / docs). Cells containing tabs, newlines, or quotes
// are quoted like Excel's TSV so the row/column structure survives a plain-text paste.
export async function copyTableToClipboard(rows: string[][]): Promise<void> {
    if (rows.length === 0) return;

    const tsvCell = (s: string) => (/[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const tsv = rows.map(r => r.map(tsvCell).join('\t')).join('\n');

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const [head, ...body] = rows;
    const html =
        '<table>' +
        (head ? `<thead><tr>${head.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : '') +
        `<tbody>${body.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>` +
        '</table>';

    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
            'text/plain': new Blob([tsv], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
        })]);
    } else {
        // Older webviews without ClipboardItem: TSV-only still pastes cleanly into a grid.
        await navigator.clipboard.writeText(tsv);
    }
}

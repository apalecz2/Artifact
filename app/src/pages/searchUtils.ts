// Pure helpers for the Search page, split out so they can be unit-tested without
// pulling the whole page (react-router, db) into a node test.

// SQLite's CURRENT_TIMESTAMP is UTC with no timezone marker ('YYYY-MM-DD HH:MM:SS').
// `new Date()` would parse that as *local* time, skewing "Last updated" by the UTC
// offset. Tag it as UTC (ISO 'T...Z') so it's interpreted correctly. A value that
// doesn't match the SQLite shape is passed through unchanged (and, if unparseable,
// returned verbatim rather than as "Invalid Date").
export function formatSqliteTimestamp(ts: string): string {
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)
        ? `${ts.replace(' ', 'T')}Z`
        : ts;
    const date = new Date(normalized);
    return isNaN(date.getTime()) ? ts : date.toLocaleDateString();
}

// Escape LIKE metacharacters so a query such as "100%" or "a_b" matches literally
// instead of acting as wildcards. Paired with `ESCAPE '\'` in the query.
export function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** A match found inside a page's text, split so the hit can be styled without
 *  building markup from user content. */
export interface Snippet {
    before: string;
    match: string;
    after: string;
}

const CONTEXT_CHARS = 48;

/**
 * The neighbourhood of the first occurrence of `query` in `text`, for showing
 * *why* a session matched.
 *
 * A result row that says only "Statement 2024" when the user searched for
 * "Invoice 4471" leaves them to open every hit and hunt — so the excerpt is the
 * half of content search that makes it usable, not a decoration.
 *
 * The comparison is case-insensitive and mirrors SQLite's `LIKE`, which is what
 * selected the row; anything else and a row could arrive with no findable match.
 * (Both are ASCII-only case folders, so they agree on the accented characters
 * where a locale-aware fold would not.) Whitespace is collapsed because the
 * source is either newline-per-row OCR text or TSV — rendered raw, one match
 * would arrive with half a page of layout around it.
 */
export function matchSnippet(text: string, query: string): Snippet | null {
    if (!query) return null;
    const flat = text.replace(/\s+/g, ' ').trim();
    const at = flat.toLowerCase().indexOf(query.toLowerCase());
    if (at === -1) return null;

    const start = Math.max(0, at - CONTEXT_CHARS);
    const end = Math.min(flat.length, at + query.length + CONTEXT_CHARS);
    return {
        before: (start > 0 ? '…' : '') + flat.slice(start, at),
        match: flat.slice(at, at + query.length),
        after: flat.slice(at + query.length, end) + (end < flat.length ? '…' : ''),
    };
}

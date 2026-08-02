import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { DeleteSessionDialog } from '../features/sessions/DeleteSessionDialog';
import { getDb } from '../lib/db';
import Icon from '../components/Icon';
import { formatSqliteTimestamp, escapeLike, matchSnippet } from './searchUtils';

interface Session {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    /** Text of the first page whose OCR text matched, or null. */
    scan_match: string | null;
    /** Content of the first extracted table that matched, or null. */
    table_match: string | null;
}

const ITEMS_PER_PAGE = 10;

/** The excerpt under a result, shown when the query was found in the session's
 *  content rather than (or as well as) its name. The document's own words come
 *  first — that is what the user was reading when they remembered the phrase. */
function MatchExcerpt({ session, query }: { session: Session; query: string }): React.ReactElement | null {
    const sources = [
        { label: 'In the document', text: session.scan_match },
        { label: 'In the extracted table', text: session.table_match },
    ];
    for (const { label, text } of sources) {
        const snippet = text ? matchSnippet(text, query) : null;
        if (!snippet) continue;
        return (
            <span className="mt-1 flex min-w-0 items-baseline gap-2 text-sm">
                <span className="shrink-0 text-xs uppercase tracking-wide text-on-surface-variant/70">{label}</span>
                <span className="truncate text-on-surface-variant">
                    {snippet.before}
                    <mark className="bg-primary/20 text-on-surface">{snippet.match}</mark>
                    {snippet.after}
                </span>
            </span>
        );
    }
    return null;
}

/**
 * What "matches" means: the session's name, the OCR text of any of its pages, or
 * any table extracted from it.
 *
 * Title-only search was the letter of the schema and not the promise the
 * placeholder makes ("Search extractions…"): a user who remembers a document by
 * something *in* it — an invoice number, a name in a column — is exactly the
 * user this page is for, and the content is already stored per session. It is a
 * scan rather than an index (no FTS table), which suits a local corpus of a few
 * hundred documents and keeps the schema as it is.
 *
 * `$1` is the caller's `%…%` term, escaped for LIKE.
 */
const MATCHES_QUERY = `(
    s.title LIKE $1 ESCAPE '\\'
    OR EXISTS (SELECT 1 FROM document_pages p WHERE p.session_id = s.id AND p.full_text LIKE $1 ESCAPE '\\')
    OR EXISTS (SELECT 1 FROM csv_outputs c WHERE c.session_id = s.id AND c.csv_content LIKE $1 ESCAPE '\\')
)`;

// The matching text itself, for the excerpt under each result. Pulled in the same
// round-trip as the results — a second query per row would be ten more of them.
const MATCH_EXCERPTS = `
    (SELECT p.full_text FROM document_pages p
      WHERE p.session_id = s.id AND p.full_text LIKE $1 ESCAPE '\\'
      ORDER BY p.page_index LIMIT 1) AS scan_match,
    (SELECT c.csv_content FROM csv_outputs c
      WHERE c.session_id = s.id AND c.csv_content LIKE $1 ESCAPE '\\'
      ORDER BY c.page_index LIMIT 1) AS table_match`;

export default function Search(): React.ReactElement {
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [results, setResults] = useState<Session[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    // Distinguishes "nothing matched this query" from "there is nothing to search
    // yet" — null until the first fetch resolves, so neither empty state flashes
    // before we know which one applies.
    const [hasAnySessions, setHasAnySessions] = useState<boolean | null>(null);
    const [refreshToken, setRefreshToken] = useState(0);
    const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);

    // 1. Debounce the search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query);
            setPage(1); // Reset to first page on new search
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    // 2. Fetch data when query or page changes
    useEffect(() => {
        let isMounted = true;

        const fetchResults = async () => {
            setIsLoading(true);
            try {
                const db = await getDb();
                const searchTerm = `%${escapeLike(debouncedQuery)}%`;

                // Total count for pagination, plus the unfiltered total in the same
                // pass — the empty state needs to know whether the table itself is
                // empty, and a second round-trip for that would be wasteful.
                const countRes = await db.select<{ matches: number | null; total: number }[]>(
                    `SELECT SUM(CASE WHEN ${MATCHES_QUERY} THEN 1 ELSE 0 END) as matches,
                            COUNT(*) as total
                     FROM sessions s`,
                    [searchTerm]
                );

                const totalItems = countRes[0]?.matches || 0;
                const totalSessions = countRes[0]?.total || 0;
                const calculatedTotalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));

                // Clamp the requested page into range and fetch *that* page's results
                // directly. Returning early on an out-of-range page (e.g. after the
                // result set shrank) would leave the previous, now-stale results on
                // screen until a follow-up render — so fetch the clamped page now and
                // sync the page state to match.
                const safePage = Math.min(page, calculatedTotalPages);
                const offset = (safePage - 1) * ITEMS_PER_PAGE;

                // Fetch paginated results
                const items = await db.select<Session[]>(
                    `SELECT s.*, ${MATCH_EXCERPTS}
                     FROM sessions s
                     WHERE ${MATCHES_QUERY}
                     ORDER BY s.updated_at DESC LIMIT $2 OFFSET $3`,
                    [searchTerm, ITEMS_PER_PAGE, offset]
                );

                if (isMounted) {
                    setResults(items);
                    setTotalPages(calculatedTotalPages);
                    setHasAnySessions(totalSessions > 0);
                    if (safePage !== page) setPage(safePage);
                }
            } catch (error) {
                console.error("Failed to fetch search results:", error);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchResults();

        return () => {
            isMounted = false;
        };
    }, [debouncedQuery, page, refreshToken]);

    return (
        <main className="relative flex h-full flex-col overflow-hidden bg-background px-6 pb-10 pt-18 md:px-10">
            {/* Centered Content Wrapper */}
            <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
                
                <div className="mb-8 space-y-4">
                    <h1 className="text-3xl font-bold text-primary">Search</h1>
                    
                    {/* Search Input */}
                    <div className="relative flex w-full items-center">
                        <Icon name="search" size={24} className="absolute left-4 text-on-surface-variant" />
                        <input
                            type="text"
                            placeholder="Search extractions..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="h-12 w-full rounded-[10px] bg-surface-variant pl-12 pr-4 text-on-surface shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 placeholder:text-on-surface-variant/70"
                        />
                    </div>
                </div>

                {/* Results List */}
                <div className="flex-1 overflow-y-auto pb-4 pr-2">
                    {isLoading ? (
                        <div className="flex items-center text-on-surface-variant">
                            <Icon name="refresh" className="mr-2 animate-spin" />
                            Searching...
                        </div>
                    ) : results.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {results.map((session) => (
                                <div
                                    key={session.id}
                                    className="group flex items-stretch overflow-hidden rounded-[10px] border border-surface-variant bg-surface-container/50 transition-all duration-300 ease-out hover:bg-surface-variant"
                                >
                                    <Link
                                        to={`/session/${session.id}`}
                                        className="flex min-w-0 flex-1 flex-col justify-center p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/20"
                                    >
                                        <span className="truncate text-lg font-medium text-on-surface transition-colors group-hover:text-primary">
                                            {session.title}
                                        </span>
                                        <MatchExcerpt session={session} query={debouncedQuery} />
                                        <span className="mt-1 text-sm text-on-surface-variant">
                                            Last updated: {formatSqliteTimestamp(session.updated_at)}
                                        </span>
                                    </Link>

                                    <button
                                        type="button"
                                        onClick={() => setSessionToDelete(session)}
                                        className="flex shrink-0 items-center gap-2 border-l border-surface-variant bg-surface-container px-4 text-sm font-medium text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/20"
                                        aria-label={`Delete session ${session.title}`}
                                    >
                                        <Icon name="delete" size={18} />
                                        Delete
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : hasAnySessions === false ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                            <Icon name="search" size={40} className="text-on-surface-variant/50" />
                            <p className="text-lg font-medium text-on-surface">No extractions yet</p>
                            <p className="max-w-sm text-sm text-on-surface-variant">
                                Once you extract a table from a document, it will show up here —
                                searchable by name, by anything the scan says, and by anything in
                                the table you pulled out of it.
                            </p>
                            <Link
                                to="/"
                                className="mt-2 flex h-10 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-medium text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                            >
                                <Icon name="add" size={18} />
                                New extraction
                            </Link>
                        </div>
                    ) : hasAnySessions === null ? null : debouncedQuery ? (
                        <div className="text-on-surface-variant">
                            No results found for "{debouncedQuery}".
                        </div>
                    ) : null}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="mt-6 flex w-full items-center justify-between border-t border-surface-variant pt-4">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-surface-variant px-4 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50"
                        >
                            <Icon name="arrow_back" size={18} />
                            Previous
                        </button>
                        
                        <span className="text-sm text-on-surface-variant">
                            Page {page} of {totalPages}
                        </span>

                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-surface-variant px-4 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50"
                        >
                            Next
                            <Icon name="arrow_forward" size={18} />
                        </button>
                    </div>
                )}
            </div>

            <DeleteSessionDialog
                session={sessionToDelete ? { id: sessionToDelete.id, name: sessionToDelete.title } : null}
                onClose={() => setSessionToDelete(null)}
                onDeleted={() => setRefreshToken((current) => current + 1)}
            />
        </main>
    );
}
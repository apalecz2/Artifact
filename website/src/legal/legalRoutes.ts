// Canonical clean URLs for the standalone legal pages, plus the browser-path → doc
// mapping. This is the single source of truth for the legal routes, imported by both
// the client (legalContent.ts / main.tsx) and the build's pre-render step
// (vite.config.ts) so the two can never drift.
//
// It deliberately imports nothing else — no `?raw` markdown, no app code — so
// vite.config.ts can import it in a plain Node/esbuild context.

export type LegalDocId = 'privacy' | 'terms' | 'licenses';

/** Canonical path for each legal doc — the permanent URLs the Store and app link to. */
export const LEGAL_ROUTE_PATHS: Record<LegalDocId, string> = {
    privacy: '/privacy',
    terms: '/terms',
    licenses: '/licenses',
};

/** Legacy/alias paths that resolve to a doc but have no dedicated static page. */
const LEGAL_PATH_ALIASES: Record<string, LegalDocId> = {
    '/notices': 'licenses',
};

/** Map a browser pathname to a legal doc id, or null for the marketing page. */
export function docIdForPath(pathname: string): LegalDocId | null {
    const p = pathname.replace(/\/+$/, '') || '/';
    for (const id of Object.keys(LEGAL_ROUTE_PATHS) as LegalDocId[]) {
        if (p === LEGAL_ROUTE_PATHS[id]) return id;
    }
    return LEGAL_PATH_ALIASES[p] ?? null;
}

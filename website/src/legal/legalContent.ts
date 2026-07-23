// Canonical legal text, imported from the repo's single source of truth in
// docs/legal/ and NOTICES.md — the exact same files the desktop app bundles, so
// the website and the app never drift (docs/compliance-documents.md §2).
import privacyMarkdown from '../../../docs/legal/PRIVACY.md?raw';
import eulaMarkdown from '../../../docs/legal/EULA.md?raw';
import noticesMarkdown from '../../../NOTICES.md?raw';
import { LEGAL_ROUTE_PATHS, type LegalDocId } from './legalRoutes';

// Route paths and path->doc resolution live in legalRoutes.ts (shared with the build);
// re-exported here so existing importers keep a single entry point.
export { docIdForPath } from './legalRoutes';
export type { LegalDocId } from './legalRoutes';

export const LEGAL_DOCS: Record<LegalDocId, { title: string; path: string; markdown: string }> = {
    privacy: { title: 'Privacy Policy', path: LEGAL_ROUTE_PATHS.privacy, markdown: privacyMarkdown },
    terms: { title: 'Terms of Use & EULA', path: LEGAL_ROUTE_PATHS.terms, markdown: eulaMarkdown },
    licenses: { title: 'Licenses & Notices', path: LEGAL_ROUTE_PATHS.licenses, markdown: noticesMarkdown },
};

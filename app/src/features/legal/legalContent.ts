// Canonical legal text, imported straight from the repo's single source of truth
// in docs/legal/ and NOTICES.md (see docs/compliance-documents.md §2). The app,
// the website, and the GitHub repo therefore all render byte-identical text — the
// Store-linked URL can never contradict what the app shows. Bundled at build time
// as strings so they are available fully offline.
import privacyMarkdown from '../../../../docs/legal/PRIVACY.md?raw';
import eulaMarkdown from '../../../../docs/legal/EULA.md?raw';
import noticesMarkdown from '../../../../NOTICES.md?raw';

export { privacyMarkdown, eulaMarkdown, noticesMarkdown };

// Bump whenever the EULA's substance changes. Must match the EULA's effective date
// so a user who accepted an older version is re-prompted to accept the new one
// (see eulaAcceptance.ts). Keep in sync with the "Effective date" line in EULA.md.
export const EULA_VERSION = '2026-07-20';

export type LegalDocId = 'privacy' | 'terms' | 'notices';

export const LEGAL_DOCS: Record<LegalDocId, { title: string; markdown: string }> = {
    privacy: { title: 'Privacy Policy', markdown: privacyMarkdown },
    terms: { title: 'Terms of Use & EULA', markdown: eulaMarkdown },
    notices: { title: 'Licenses & Notices', markdown: noticesMarkdown },
};

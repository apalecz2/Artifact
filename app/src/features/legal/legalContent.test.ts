import { describe, it, expect } from 'vitest';
import {
    EULA_VERSION,
    LEGAL_DOCS,
    eulaMarkdown,
    privacyMarkdown,
    noticesMarkdown,
} from './legalContent';

/** The "**Effective date / last updated: August 4, 2026**" line, as an ISO date. */
function effectiveDate(markdown: string): string {
    const m = /^\*\*Effective date \/ last updated: (.+?)\*\*$/m.exec(markdown);
    if (!m) throw new Error('no "Effective date / last updated" line found');
    const parsed = new Date(`${m[1]} UTC`);
    if (Number.isNaN(parsed.getTime())) throw new Error(`unparseable date: ${m[1]}`);
    return parsed.toISOString().slice(0, 10);
}

/**
 * Guards the invariant `EULA_VERSION` documents but cannot enforce on its own: the
 * recorded consent version has to be the effective date of the document the user was
 * shown. It broke once (the date moved to 2026-07-23 and the constant stayed at
 * 2026-07-20), which shipped a revision without re-prompting anyone and wrote consent
 * records citing a superseded document. Parsing the date out of the bundled markdown is
 * the only check that survives someone editing one file and not the other.
 */
describe('EULA_VERSION', () => {
    it('matches the effective date in EULA.md', () => {
        expect(EULA_VERSION).toBe(effectiveDate(eulaMarkdown));
    });

    it('is an ISO calendar date', () => {
        expect(EULA_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    // The consent step presents both documents together and records one version for the
    // pair, so a Privacy revision that leaves the EULA untouched would be accepted
    // silently. Keeping the dates equal is what makes that single record honest.
    it('matches the effective date in PRIVACY.md', () => {
        expect(effectiveDate(privacyMarkdown)).toBe(effectiveDate(eulaMarkdown));
    });
});

describe('bundled legal documents', () => {
    it('bundles all three documents as non-empty markdown', () => {
        for (const [id, doc] of Object.entries(LEGAL_DOCS)) {
            expect(doc.markdown.length, `${id} is empty`).toBeGreaterThan(500);
            expect(doc.title.length, `${id} has no title`).toBeGreaterThan(0);
        }
    });

    it('bundles the canonical files, not placeholders', () => {
        expect(eulaMarkdown).toContain('# Anchor End User License Agreement');
        expect(privacyMarkdown).toContain('# Anchor Privacy Policy');
        expect(noticesMarkdown).toContain('# Third-Party Notices');
    });

    // Every `Section N` reference in the EULA has to resolve to a heading that exists.
    // Renumbering is the realistic way this breaks: inserting a section shifts every
    // number after it, and the cross-references are plain prose that nothing else checks.
    it('has no dangling Section cross-references in the EULA', () => {
        const headings = new Set(
            [...eulaMarkdown.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1])),
        );
        expect(headings.size).toBeGreaterThan(0);

        const referenced = new Set<number>();
        for (const m of eulaMarkdown.matchAll(/Sections? ([\d,\s]*\d)/g)) {
            for (const n of m[1].match(/\d+/g) ?? []) referenced.add(Number(n));
        }

        const dangling = [...referenced].filter((n) => !headings.has(n)).sort((a, b) => a - b);
        expect(dangling, `EULA references missing sections: ${dangling.join(', ')}`).toEqual([]);
    });

    // The disclaimers the consent checkbox and the About page both lean on. If a rewrite
    // drops them, the clickwrap is asserting something the document no longer says.
    it('keeps the AI-output and liability disclaimers in the EULA', () => {
        expect(eulaMarkdown).toContain('NO WARRANTY');
        expect(eulaMarkdown).toContain('LIMITATION OF LIABILITY');
        expect(eulaMarkdown).toContain('Indemnification');
        expect(eulaMarkdown).toMatch(/output may be inaccurate, incomplete, or wrong/i);
    });
});

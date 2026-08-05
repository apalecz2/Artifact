// Copyright year for the site's footers. Deliberately a byte-for-byte copy of the
// app's app/src/utils/copyright.ts: the two state the same legal claim about the same
// work, and they used to disagree — the app collapsed a skewed clock to the founding
// year while this side printed a reversed "2026-2025" range, and LegalPage.tsx carried
// a third rule (a hard-coded "2026") that would have gone stale on 1 January.
//
// The website is a separate npm package with no path into app/, so this cannot be a
// shared import without a workspace. If you change the rule, change it in both files.

/** First year Anchor was published. Change this only to correct the true
 *  founding date; the end of the range is computed at render time. */
export const FOUNDED_YEAR = 2026;

/**
 * "2026" during the founding year, "2026-2027" (and onward) after it.
 *
 * The `<=` rather than an equality check is deliberate: this runs on whatever the
 * visitor's machine believes the date is, and a skewed clock reading earlier than
 * the founding year would otherwise print a backwards range like "2026-2025".
 * Collapsing to the single year is the safe degradation.
 *
 * `now` is injectable so the range logic can be tested without touching the
 * system clock.
 */
export function copyrightYears(now: Date = new Date()): string {
    const current = now.getFullYear();
    return current <= FOUNDED_YEAR ? `${FOUNDED_YEAR}` : `${FOUNDED_YEAR}-${current}`;
}

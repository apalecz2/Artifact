// Copyright year for in-app notices. Mirrors the website's rule
// (website/src/copyright.ts, a byte-for-byte copy of this logic) so the two never
// disagree about the same claim. They did once: the website used an equality check
// that printed a reversed "2026-2025" range on a skewed clock, and the legal pages
// carried a third, hard-coded year. The website is a separate npm package with no
// path into app/, so this stays a copy rather than a shared import — change both.

/** First year Anchor was published. Change this only to correct the true
 *  founding date; the end of the range is computed at render time. */
export const FOUNDED_YEAR = 2026;

/**
 * "2026" during the founding year, "2026-2027" (and onward) after it.
 *
 * The `<=` rather than an equality check is deliberate: unlike a server-rendered
 * site, this runs on whatever the user's machine believes the date is, and a
 * skewed clock reading earlier than the founding year would otherwise print a
 * backwards range like "2026-2025". Collapsing to the single year is the safe
 * degradation.
 *
 * `now` is injectable so the range logic can be tested without touching the
 * system clock.
 */
export function copyrightYears(now: Date = new Date()): string {
    const current = now.getFullYear();
    return current <= FOUNDED_YEAR ? `${FOUNDED_YEAR}` : `${FOUNDED_YEAR}-${current}`;
}

// Copyright year for in-app notices. Mirrors the website footer's rule
// (website/src/App.tsx) so the two never disagree about the same claim.

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

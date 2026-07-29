/**
 * Folds a freshly-ordered list into the one already on screen *without* taking
 * its ordering: entries the user can already see keep their current relative
 * positions, while membership and contents come from the fresh list.
 *
 * The recent-sessions list is ordered by last activity, which moves while the
 * app is in use. Re-sorting rows out from under a pointer that is aiming at one
 * is how you click the wrong session, so the sidebar holds the new ordering back
 * while the user is engaged with the list and reconciles with this instead — a
 * deleted session still disappears immediately, only the shuffling waits.
 */
export function mergePreservingOrder<T extends { id: string }>(displayed: T[], next: T[]): T[] {
    const nextById = new Map(next.map((item) => [item.id, item]));

    // Survivors, in the order they are already on screen but carrying the fresh
    // data — anything gone from `next` drops out here.
    const merged = displayed
        .filter((item) => nextById.has(item.id))
        .map((item) => nextById.get(item.id) as T);

    // An entry the user has never seen has no position to preserve, so it takes
    // the one the fresh list gives it (clamped: earlier entries may have gone).
    const displayedIds = new Set(displayed.map((item) => item.id));
    next.forEach((item, index) => {
        if (!displayedIds.has(item.id)) {
            merged.splice(Math.min(index, merged.length), 0, item);
        }
    });

    return merged;
}

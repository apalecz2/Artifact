/**
 * What the title bar's navigation can do right now — two facts, from two places.
 *
 * **`routed`** — whether the app's routed screens are on screen at all. Three
 * things render *instead of* them (the startup check, the setup wizard, and the
 * error fallback once `ErrorBoundary` has unmounted the tree), and `App`
 * withholds the router wholesale for each. Navigating during one moves the
 * history entry and changes nothing visible.
 *
 * That went unnoticed because a genuine first run has no history to move through.
 * The re-run path is what exposes it: Settings ▸ *Re-run setup* sets its flag and
 * reloads, and a reload keeps the session's entries *and* the `idx` React Router
 * wrote into `history.state` — so the wizard came up with Back looking live,
 * walking the history behind a screen that never changed.
 *
 * **The back handler** — what a full-screen takeover wants Back to *mean*, since
 * "return to the app" is exactly what a user pressing it there is asking for. The
 * wizard registers one whenever it is escapable: a re-run over an install that
 * checks out, which the user may simply walk away from. A first install registers
 * none — there is no app behind it to go back to — and neither does the install
 * step, which owns its own cancellation because a download in flight has to be
 * stopped, not abandoned.
 *
 * A module-level singleton rather than context for the same reason as
 * [`editTarget`](./editTarget.ts): the bar renders above the router *and* above
 * the error boundary, so a provider would have to sit outside the very tree whose
 * state it reports. The snapshot/handler split is the same idea too — the
 * snapshot carries only the two booleans the bar renders from, so its identity
 * changes only when they do, while the handler itself is replaced without
 * notifying, so re-registering from a later render can't leave the bar holding a
 * stale closure.
 *
 * Both default to closed: the value is only ever *narrower* than the truth for
 * the first frames after a reload, which is exactly when the stale-`idx` hazard
 * above is live.
 */

export interface NavState {
    /** The routes are on screen, so router navigation does something visible. */
    routed: boolean;
    /** A takeover is showing and can be backed out of. Meaningless when `routed`. */
    canExit: boolean;
}

let routed = false;
let backHandler: (() => void) | null = null;
let snapshot: NavState = { routed: false, canExit: false };
const listeners = new Set<() => void>();

function publish(): void {
    const canExit = backHandler !== null;
    if (routed === snapshot.routed && canExit === snapshot.canExit) return;
    snapshot = { routed, canExit };
    listeners.forEach(listener => listener());
}

/** Declare whether the routes are on screen. `App` owns this. */
export function setRoutesMounted(value: boolean): void {
    routed = value;
    publish();
}

/** Offer a way out of a full-screen takeover, or withdraw it with `null`. Safe to
 *  call on every render: subscribers hear only about the offer appearing or
 *  disappearing, not about the function being swapped. */
export function setBackHandler(handler: (() => void) | null): void {
    backHandler = handler;
    publish();
}

/** Snapshot for `useSyncExternalStore`; stable between actual changes. */
export function getNavState(): NavState {
    return snapshot;
}

export function subscribeNavState(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Leave the current takeover. False when there is nothing registered, which is
 *  how the bar tells "Back means exit" from "Back means nothing here". */
export function runBackHandler(): boolean {
    if (!backHandler) return false;
    backHandler();
    return true;
}

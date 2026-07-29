/**
 * Who currently owns the Edit menu's commands.
 *
 * The title bar's Edit menu normally runs them through `document.execCommand`,
 * which acts on the *focused field*: its undo stack, its text selection. That is
 * right for a text input and useless everywhere else. The session's table editor
 * has its own undo history over the cell grid, its own selection of cells, and
 * its own clipboard format (TSV) — none of which any field owns and none of
 * which `execCommand` can reach.
 *
 * So a surface with its own editing model claims these commands while it is
 * focused, and the menu asks here first. The registry is a module-level
 * singleton rather than context because the two ends are nowhere near each other
 * in the tree — the title bar renders above the router, the table deep inside a
 * route — and a provider spanning both would mean re-rendering the whole app on
 * every cell selection.
 *
 * Availability and dispatch are deliberately split:
 *
 * - The **snapshot** ([`getEditTarget`]) carries only what each command can do
 *   right now, and its identity changes only when that changes.
 *   `useSyncExternalStore` requires a stable snapshot, and it means the title
 *   bar re-renders when the rows' enabled state changes — not on every
 *   keystroke in the table.
 * - The **runner** is replaced on every registration without notifying. It
 *   closes over the claimant's current state, so calling one from an older
 *   render would act on a stale grid; [`runInEditTarget`] always dispatches to
 *   the most recent one.
 */

/** The Edit menu's commands. */
export type EditCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll';

export const EDIT_COMMANDS: readonly EditCommand[] = [
    'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll',
] as const;

/** Which commands the claimant can run right now — what the menu renders. */
export type EditAvailability = Record<EditCommand, boolean>;

export interface EditTarget {
    can: EditAvailability;
    run: (command: EditCommand) => void;
}

let availability: EditAvailability | null = null;
let runner: EditTarget['run'] | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach(listener => listener());

const sameAvailability = (a: EditAvailability, b: EditAvailability): boolean =>
    EDIT_COMMANDS.every(command => a[command] === b[command]);

/**
 * Claim the Edit commands, or release them with `null`. Safe to call on every
 * render: it only notifies subscribers when the availability actually changes.
 */
export function setEditTarget(target: EditTarget | null): void {
    if (!target) {
        runner = null;
        if (availability === null) return;
        availability = null;
        notify();
        return;
    }

    runner = target.run;
    if (availability && sameAvailability(availability, target.can)) return;
    availability = { ...target.can };
    notify();
}

/** Snapshot for `useSyncExternalStore`; null when nothing has claimed the menu. */
export function getEditTarget(): EditAvailability | null {
    return availability;
}

export function subscribeEditTarget(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Run a command against the claimant. Returns false only when there is no
 * claimant, so the caller can fall back to the focused field.
 *
 * A claimed-but-unavailable command (Paste with nothing selected) still counts
 * as handled: the claimant owns the command while it is focused, and falling
 * through would run it somewhere the user isn't looking.
 */
export function runInEditTarget(command: EditCommand): boolean {
    if (!runner || !availability) return false;
    if (availability[command]) runner(command);
    return true;
}

/** Test seam: drop any claim, silently. Subscribers are left alone — they are
 *  removed by their own unsubscribe, and a cleared set would leave a mounted
 *  title bar permanently unnotified. */
export function resetEditTarget(): void {
    availability = null;
    runner = null;
}

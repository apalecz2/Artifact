import { invoke } from '@tauri-apps/api/core';
import { closeDb, sealDb, unsealDb } from '../../lib/db';

/** What the backend managed to remove. `failed` holds absolute paths that were still
 *  locked by another process after several attempts — a partial wipe is reported, not
 *  swallowed, because "all your data is gone" has to be true when we say it. */
export interface RemovalReport {
    freed_bytes: number;
    failed: string[];
}

/** `reset` wipes and stays running (the caller reloads into first-run setup);
 *  `uninstall` wipes and leaves the directories gone, for quitting straight after. */
export type RemovalMode = 'reset' | 'uninstall';

/** Remove everything Anchor has written to this machine: the downloaded engine,
 *  model, and libraries (~3.5 GB), the session database and its page images, the logs,
 *  and the settings held in webview storage.
 *
 *  Ordering matters:
 *
 *  1. Seal the database, so nothing can re-open it while the wipe runs. `Database.load`
 *     re-creates the file *and its directory*, so one stray query mid-wipe leaves a
 *     fresh `workspace.db` sitting in the folder we just emptied.
 *  2. Close the pool — Windows will not delete an open file, so a live pool leaves
 *     `workspace.db` behind entirely.
 *  3. Wipe, then clear webview storage only once the backend reports the files are
 *     gone. Clearing it up front and then failing would strand the user with assets on
 *     disk and no settings pointing at them (recoverable via `useSetupCheck`'s heal,
 *     but a worse place to fail). */
export async function removeAllAppData(mode: RemovalMode): Promise<RemovalReport> {
    sealDb();
    await closeDb();

    let report: RemovalReport;
    try {
        report = await invoke<RemovalReport>('remove_all_app_data', {
            recreateDirs: mode === 'reset',
        });
    } catch (error) {
        // The command failed outright, so nothing was deleted — put the app back the
        // way it was instead of leaving it unable to query its own data.
        unsealDb();
        throw error;
    }

    // Settings, the EULA acceptance record, and the force-setup flag live in
    // localStorage, which the Rust side cannot reach. They describe files that no
    // longer exist, and leaving them would not be "remove all data".
    try {
        localStorage.clear();
    } catch {
        /* storage unavailable — then there is nothing stored to clear */
    }

    // Deliberately no session-change event: every listener responds by querying the
    // database, which is the resurrection this seals against. Both paths out of here
    // (reload into setup, or exit) replace the UI wholesale anyway.
    return report;
}

/** Close Anchor. Used after an `uninstall`-mode removal so the user can uninstall the
 *  app itself with nothing left behind; the backend exits the process directly rather
 *  than unwinding, which would re-create the directory we just deleted. */
export async function quitApp(): Promise<void> {
    await invoke('quit_app');
}

/** What the caller should do once the wipe returns, and what to say about it. */
export type RemovalOutcome =
    | { next: 'reload' }
    | { next: 'quit'; message: string }
    | { next: 'stay'; message: string };

/** Decide the aftermath. The rule that matters: a partial wipe never reloads and never
 *  quits, whichever mode asked for it. Reloading would drop the user in the wizard with
 *  files still on disk, and quitting would close the one window telling them so — either
 *  way the app would have claimed to remove everything when it hadn't. */
export function planAfterRemoval(report: RemovalReport, mode: RemovalMode): RemovalOutcome {
    const freed = formatFreedBytes(report.freed_bytes);

    if (report.failed.length > 0) {
        const count = report.failed.length;
        return {
            next: 'stay',
            message: `Removed ${freed}, but ${count} file${count === 1 ? '' : 's'} could not be deleted, because something on this device is still using them. Restart your computer and try again.`,
        };
    }

    // Nothing left for the Settings page to report: the reload lands in first-run setup.
    if (mode === 'reset') return { next: 'reload' };

    return { next: 'quit', message: `Removed ${freed}. Closing Anchor…` };
}

/** Bytes as a short human string for the removal summary — GB for the model-sized
 *  wipe, MB below that, and plain bytes for the near-empty case. */
export function formatFreedBytes(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
    if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
    return `${bytes} bytes`;
}

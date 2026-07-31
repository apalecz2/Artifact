/**
 * Whether to treat the current webview as macOS.
 *
 * Extracted from `TitleBar` (which still re-exports it) so surfaces below the
 * title bar can gate the same platform behaviour without importing a helper out
 * of a component — the session's table editor needs it to leave the Edit
 * accelerators to the system menu bar (see `pages/session/ExtractionOutputPane`
 * and `src-tauri/src/menu.rs`).
 *
 * macOS keeps the window's real decorations: the traffic lights float over the
 * header (`titleBarStyle: "Overlay"`), so the bar reserves space at the left and
 * draws no window buttons of its own. Every other platform runs undecorated and
 * owns the whole bar.
 */
export function isMacPlatform(userAgent: string): boolean {
    return /Mac(intosh| OS X)/.test(userAgent);
}

/**
 * Renders a keyboard hint for the current platform.
 *
 * Hints are authored in the Windows/Linux form (`Ctrl+Shift+Z`) because that is
 * what most of the app's copy says, and rewritten to macOS' symbols here. The
 * app's menus and help text are read on both platforms from one source, so a
 * hardcoded `Ctrl` would teach Mac users a key that does nothing — the pane
 * leaves every ⌘ accelerator to the system menu bar (see `ExtractionOutputPane`
 * and `src-tauri/src/menu.rs`).
 *
 * Only the modifiers move: `Delete`, `Enter` and `Space` name the same key on
 * both platforms. Where the *binding* itself differs — Redo is `Ctrl+Y` off
 * macOS but `⌘⇧Z` on it — the caller picks the hint; this only formats it.
 */
/**
 * Which way (if either) a keydown steps through the table's flagged cells.
 *
 * The binding differs by platform because on each one the *other* choice is
 * already taken:
 *
 * - Off macOS, `Alt+←/→` belongs to the title bar's history nav
 *   (`historyShortcut`), which handles it on `window` without stopping
 *   propagation — so binding it here too sent the user back a page *and* stepped
 *   a cell. `Alt+→` hid the clash by looking correct, since forward history is
 *   normally empty. `F3`/`Shift+F3` is the browser-conventional "find next" key
 *   and collides with nothing.
 * - On macOS, `F3` is Mission Control on a default Apple keyboard and needs
 *   `fn` to reach the app at all, while history nav lives on `⌘[`/`⌘]` — so
 *   `⌥←/→` is free and is the better key there.
 *
 * Each platform therefore gets exactly one binding, which is what the toolbar
 * tooltips and the help panel promise.
 */
export function flagStepShortcut(
    event: { key: string; altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
    isMac: boolean,
): 1 | -1 | null {
    if (event.ctrlKey || event.metaKey) return null;
    if (isMac) {
        if (!event.altKey) return null;
        if (event.key === 'ArrowRight') return 1;
        if (event.key === 'ArrowLeft') return -1;
        return null;
    }
    if (event.altKey) return null;
    if (event.key === 'F3') return event.shiftKey ? -1 : 1;
    return null;
}

export function formatShortcut(hint: string, isMac: boolean): string {
    if (!isMac) return hint;
    return hint
        .replace(/Ctrl\+/g, '⌘')
        .replace(/Shift\+/g, '⇧')
        .replace(/Alt\+/g, '⌥');
}

/**
 * Redo's hint, which is the one binding that *differs* between platforms rather
 * than just rendering differently: off macOS the table pane handles `Ctrl+Y`
 * (and `Ctrl+Shift+Z`), but on macOS the only accelerator is the system menu
 * bar's `⌘⇧Z` — nothing handles `⌘Y` there, so naming it points at a dead key.
 *
 * It lives here because more than one surface shows it (the table menus and the
 * floating toolbar's Redo button), and they drifted apart once already.
 */
export function redoShortcut(isMac: boolean): string {
    return formatShortcut(isMac ? 'Ctrl+Shift+Z' : 'Ctrl+Y', isMac);
}

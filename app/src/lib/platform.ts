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

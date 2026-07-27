import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Icon from './Icon';
import TitleBarMenu, { type MenuEntry, type MenuLeaf } from './TitleBarMenu';
// The bundled app icon, straight from the source Tauri ships to the OS, so the
// bar and the taskbar/dock can never show different marks. Vite hashes and emits
// it like any other asset (`server.fs.allow` already covers the path).
import appLogo from '../../src-tauri/icons/128x128.png';

/** Matches the `ZoomAction` wire format in `src-tauri/src/zoom.rs`. */
export type ZoomAction = 'in' | 'out' | 'reset';

/**
 * Whether to lay the bar out for macOS, where the window keeps its real
 * decorations: the traffic lights float over our header (`titleBarStyle:
 * "Overlay"`), so we reserve space at the left and draw no window buttons of
 * our own. Every other platform runs undecorated and owns the whole bar.
 */
export function isMacPlatform(userAgent: string): boolean {
    return /Mac(intosh| OS X)/.test(userAgent);
}

/** Modifier as written in the menu's shortcut hints. */
export function modifierLabel(isMac: boolean): string {
    return isMac ? '⌘' : 'Ctrl';
}

interface ZoomItem {
    action: ZoomAction;
    label: string;
    /** Key as printed in the hint; the accelerator itself is `e.code`-based. */
    key: string;
}

const ZOOM_ITEMS: ZoomItem[] = [
    { action: 'in', label: 'Zoom In', key: '+' },
    { action: 'out', label: 'Zoom Out', key: '−' },
    { action: 'reset', label: 'Actual Size', key: '0' },
];

/**
 * Maps a keydown to a zoom action, or null if it isn't a zoom shortcut. Uses
 * `code` rather than `key` so the physical keys work on layouts where `=` and
 * `-` sit behind a modifier, and accepts the numpad equivalents.
 */
export function zoomShortcut(event: {
    code: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
}): ZoomAction | null {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
    switch (event.code) {
        case 'Equal':
        case 'NumpadAdd':
            return 'in';
        case 'Minus':
        case 'NumpadSubtract':
            return 'out';
        case 'Digit0':
        case 'Numpad0':
            return 'reset';
        default:
            return null;
    }
}

/** The title bar's menus, left to right; `all` is the narrow bar's hamburger. */
type MenuName = 'file' | 'edit' | 'view' | 'all';

/**
 * Width below which the File/Edit/View titles fold into a hamburger.
 *
 * Measured against the expanded bar: logo + back/forward + the three titles come
 * to roughly 240px, the window buttons another 132, and the drag region needs
 * room left over. This is in **CSS** pixels, which is what makes it cover the
 * zoom case for free — at 200% zoom a 900px window is a 450px viewport, so the
 * bar folds exactly when it would otherwise start crowding the window buttons.
 */
const MENU_BAR_VISIBILITY = 'max-[460px]:hidden';
const HAMBURGER_VISIBILITY = 'hidden max-[460px]:block';

/** App-level commands the File/Edit menus expose a keyboard shortcut for. */
export type AppCommand = 'new' | 'open' | 'settings' | 'find';

/**
 * Where each command lands. `open` and `find` share a route on purpose: /search
 * *is* the app's list of saved extractions, so browsing to one and searching for
 * one are the same screen reached by the two shortcuts users reach for.
 */
export const APP_COMMAND_ROUTE: Record<AppCommand, string> = {
    new: '/',
    open: '/search',
    settings: '/settings',
    find: '/search',
};

/**
 * Event the macOS system menu bar sends when one of its navigating items is
 * chosen. The routes stay here rather than in Rust, so the payload is an
 * [`AppCommand`] name — keep it in step with `src-tauri/src/menu.rs`.
 */
export const MENU_COMMAND_EVENT = 'menu:command';

/**
 * Maps a keydown to an app command. Only the shortcuts the app itself owns are
 * bound here — the Edit menu's clipboard and undo items deliberately are not,
 * because the webview already handles those keys natively on the focused field,
 * and binding them again would run each one twice.
 */
export function appShortcut(
    event: {
        code: string;
        ctrlKey: boolean;
        metaKey: boolean;
        altKey: boolean;
        shiftKey: boolean;
    },
    isMac: boolean,
): AppCommand | null {
    const modifier = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (!modifier || event.altKey || event.shiftKey) return null;
    switch (event.code) {
        case 'KeyN':
            return 'new';
        case 'KeyO':
            return 'open';
        case 'Comma':
            return 'settings';
        case 'KeyF':
            return 'find';
        default:
            return null;
    }
}

/** Which way a history shortcut moves through the session's pages. */
export type HistoryMove = 'back' | 'forward';

/**
 * Maps a keydown to a history move: Alt+←/→ off macOS, ⌘[ / ⌘] on it. The
 * platforms are kept apart deliberately — on macOS Alt+← is "move a word left"
 * inside a text field, so binding it here would break editing.
 */
export function historyShortcut(
    event: { code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean },
    isMac: boolean,
): HistoryMove | null {
    if (isMac) {
        if (!event.metaKey || event.altKey || event.ctrlKey) return null;
        if (event.code === 'BracketLeft') return 'back';
        if (event.code === 'BracketRight') return 'forward';
        return null;
    }

    if (!event.altKey || event.ctrlKey || event.metaKey) return null;
    if (event.code === 'ArrowLeft') return 'back';
    if (event.code === 'ArrowRight') return 'forward';
    return null;
}

/** The Edit menu's commands, run against whatever currently has focus. */
export type EditCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll';

/**
 * Runs an Edit-menu command on the focused field.
 *
 * `execCommand` is deprecated, but it is still the only API that drives a
 * field's *own* undo stack and its selection-based cut/copy — the modern
 * Clipboard API can write text but can't replace a selection or undo an edit.
 * Paste is the one case it can't do: Chromium refuses `execCommand('paste')`
 * outright, so read the clipboard and insert the text as an undoable edit.
 */
export async function runEditCommand(command: EditCommand): Promise<void> {
    if (command !== 'paste') {
        document.execCommand(command);
        return;
    }

    try {
        const text = await navigator.clipboard.readText();
        if (text) document.execCommand('insertText', false, text);
    } catch {
        // Clipboard read denied or unavailable; nothing further to try.
    }
}

/** What the back/forward buttons should offer right now. */
export interface HistoryPosition {
    canGoBack: boolean;
    canGoForward: boolean;
}

/**
 * Derives back/forward availability from the History API.
 *
 * React Router records its position in `history.state.idx`, which is the only
 * way to know whether anything sits *ahead* of us — `history.length` alone can't
 * tell "3 entries, at the newest" from "3 entries, went back twice". Before the
 * router has written that state (first paint, or the setup wizard, which runs
 * before any route mounts) fall back to the entry count, which can only ever
 * offer Back.
 */
export function historyPosition(state: unknown, length: number): HistoryPosition {
    const idx = (state as { idx?: unknown } | null | undefined)?.idx;
    if (typeof idx !== 'number') return { canGoBack: length > 1, canGoForward: false };
    return { canGoBack: idx > 0, canGoForward: idx < length - 1 };
}

/**
 * The window's own title bar, drawn in the webview because no OS lets an app put
 * menu items up beside the window title. On Windows/Linux the native frame is
 * switched off in `lib.rs` and this bar supplies the drag region, the navigation
 * and View controls, and the minimize/maximize/close buttons; on macOS it sits
 * under a transparent overlay frame, so the system keeps the traffic lights and
 * its menu bar (which drives the same zoom state — see `src-tauri/src/menu.rs`).
 *
 * It renders above the error boundary in `main.tsx`: an undecorated window whose
 * React tree has crashed still needs a way to be moved and closed.
 */
export default function TitleBar() {
    const [isMac] = useState(() =>
        typeof navigator === 'undefined' ? false : isMacPlatform(navigator.userAgent),
    );
    const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
    const [zoom, setZoom] = useState(1);
    const [isMaximized, setIsMaximized] = useState(false);
    const [history, setHistory] = useState<HistoryPosition>({
        canGoBack: false,
        canGoForward: false,
    });
    const menuBarRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const location = useLocation();

    const applyZoom = useCallback(async (action: ZoomAction) => {
        try {
            setZoom(await invoke<number>('set_app_zoom', { action }));
        } catch (error) {
            console.error('Failed to change zoom:', error);
        }
    }, []);

    const go = useCallback(
        (move: HistoryMove) => {
            navigate(move === 'back' ? -1 : 1);
        },
        [navigate],
    );

    // Re-read the history position on every navigation. Keying off `location`
    // rather than a `hashchange` listener is what makes this correct: React
    // Router navigates with `pushState`, which fires no event at all.
    useEffect(() => {
        setHistory(historyPosition(window.history.state, window.history.length));
    }, [location]);

    // The zoom survives a webview reload (the setup wizard ends in one), so read
    // the backend's value rather than assuming 100%.
    useEffect(() => {
        void (async () => {
            try {
                setZoom(await invoke<number>('get_app_zoom'));
            } catch {
                // Not running under Tauri (plain `vite dev`) — leave it at 100%.
            }
        })();
    }, []);

    const runCommand = useCallback(
        (command: AppCommand) => {
            navigate(APP_COMMAND_ROUTE[command]);
        },
        [navigate],
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const move = historyShortcut(event, isMac);
            if (move) {
                event.preventDefault();
                go(move);
                return;
            }

            // On macOS every remaining accelerator belongs to the system menu
            // bar, which handles the keystroke before the webview sees it —
            // binding them here too would run each one twice.
            if (isMac) return;

            const command = appShortcut(event, isMac);
            if (command) {
                event.preventDefault();
                runCommand(command);
                return;
            }

            const action = zoomShortcut(event);
            if (!action) return;
            event.preventDefault();
            void applyZoom(action);
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isMac, applyZoom, go, runCommand]);

    // macOS drives File/Edit/View from the system menu bar. Its navigating items
    // can't route on their own — the router lives here — so the backend forwards
    // them as commands.
    useEffect(() => {
        if (!isMac) return;
        let unlisten: (() => void) | undefined;
        let active = true;

        void (async () => {
            try {
                const stop = await listen<AppCommand>(MENU_COMMAND_EVENT, (event) =>
                    runCommand(event.payload),
                );
                if (active) unlisten = stop;
                else stop();
            } catch {
                // Not running under Tauri — there is no native menu either.
            }
        })();

        return () => {
            active = false;
            unlisten?.();
        };
    }, [isMac, runCommand]);

    // Keep the maximize/restore glyph honest: the window can also be maximized by
    // dragging to the top edge or double-clicking the drag region.
    useEffect(() => {
        if (isMac) return;
        let unlisten: (() => void) | undefined;
        let active = true;

        void (async () => {
            try {
                const appWindow = getCurrentWindow();
                setIsMaximized(await appWindow.isMaximized());
                const stop = await appWindow.onResized(async () => {
                    setIsMaximized(await appWindow.isMaximized());
                });
                if (active) unlisten = stop;
                else stop();
            } catch {
                // Not running under Tauri — the buttons are inert anyway.
            }
        })();

        return () => {
            active = false;
            unlisten?.();
        };
    }, [isMac]);

    useEffect(() => {
        if (!openMenu) return;

        // One listener for the whole menu bar rather than per menu: a press on a
        // sibling title has to close this menu *and* open that one, which the
        // sibling's own handler already does.
        const onPointerDown = (event: MouseEvent) => {
            if (menuBarRef.current?.contains(event.target as Node)) return;
            setOpenMenu(null);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenMenu(null);
        };

        window.addEventListener('mousedown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [openMenu]);

    const windowAction = async (action: 'minimize' | 'toggleMaximize' | 'close') => {
        try {
            await getCurrentWindow()[action]();
        } catch (error) {
            console.error(`Window ${action} failed:`, error);
        }
    };

    const modifier = modifierLabel(isMac);
    const navButton =
        'flex h-7 w-7 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-titlebar-hover disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20';

    const fileEntries: MenuLeaf[] = [
        { label: 'New Extraction', hint: `${modifier} N`, onSelect: () => runCommand('new') },
        { label: 'Open Extraction…', hint: `${modifier} O`, onSelect: () => runCommand('open') },
        'separator',
        { label: 'Settings', hint: `${modifier} ,`, onSelect: () => runCommand('settings') },
        { label: 'About Anchor', onSelect: () => navigate('/about') },
        'separator',
        {
            label: isMac ? 'Quit Anchor' : 'Exit',
            hint: isMac ? '⌘ Q' : 'Alt F4',
            onSelect: () => void windowAction('close'),
        },
    ];

    // These carry hints but bind no keys: the webview already handles Ctrl+Z/X/C/
    // V/A on the focused field, so the menu only needs to offer them by mouse.
    const editEntries: MenuLeaf[] = [
        { label: 'Undo', hint: `${modifier} Z`, onSelect: () => void runEditCommand('undo') },
        {
            label: 'Redo',
            hint: isMac ? '⌘ ⇧ Z' : 'Ctrl Y',
            onSelect: () => void runEditCommand('redo'),
        },
        'separator',
        { label: 'Cut', hint: `${modifier} X`, onSelect: () => void runEditCommand('cut') },
        { label: 'Copy', hint: `${modifier} C`, onSelect: () => void runEditCommand('copy') },
        { label: 'Paste', hint: `${modifier} V`, onSelect: () => void runEditCommand('paste') },
        {
            label: 'Select All',
            hint: `${modifier} A`,
            onSelect: () => void runEditCommand('selectAll'),
        },
        'separator',
        { label: 'Find Extractions…', hint: `${modifier} F`, onSelect: () => runCommand('find') },
    ];

    const viewEntries: MenuLeaf[] = ZOOM_ITEMS.map((item) => ({
        label: item.label,
        hint: `${modifier} ${item.key}`,
        onSelect: () => void applyZoom(item.action),
    }));

    /** Opens a menu on hover only while another one is already open. */
    const hoverSwitch = (menu: MenuName) => () => setOpenMenu((current) => (current ? menu : null));

    const zoomReadout = (
        <div className="mt-1 border-t border-outline-variant px-3 pb-0.5 pt-1.5 font-body-sm text-xs text-on-surface-variant">
            Current zoom: {Math.round(zoom * 100)}%
        </div>
    );

    // The same three menus the wide bar shows as titles, as categories that open
    // their own panel — rather than one flat list of every item.
    const hamburgerEntries: MenuEntry[] = [
        { label: 'File', entries: fileEntries },
        { label: 'Edit', entries: editEntries },
        { label: 'View', entries: viewEntries, footer: zoomReadout },
    ];

    return (
        <header
            data-tauri-drag-region
            // `z-100` clears every overlay in the app (the highest is `z-70`).
            // It has to be an absolute number, not just higher than its sibling:
            // `Modal` and the output pane's tooltip portal into `document.body`,
            // landing outside the content pane's stacking context, so they are
            // ordered against this header directly. See AppShell for the rest.
            className={`relative z-100 flex h-9 shrink-0 select-none items-center border-b border-outline-variant bg-titlebar ${isMac ? 'pl-19.5' : 'pl-3'}`}
        >
            {/* The identity/navigation group is the one part allowed to be
                clipped: it holds no dropdowns, so `overflow-hidden` here is safe,
                and it gives the flex row something to give up before the window
                buttons would be pushed off the edge. */}
            <div className="flex min-w-0 items-center overflow-hidden">
                {/* `data-tauri-drag-region` is matched against the exact event
                    target, so the logo needs its own — otherwise it's a dead spot
                    in the drag area. `draggable` off stops the browser's image
                    drag from pre-empting the window drag. */}
                <img
                    src={appLogo}
                    alt="Anchor"
                    data-tauri-drag-region
                    draggable={false}
                    className="h-5 w-5 shrink-0"
                />

                <div className="ml-2 flex items-center gap-0.5">
                    <button
                        type="button"
                        aria-label="Back"
                        title={isMac ? 'Back (⌘[)' : 'Back (Alt+←)'}
                        disabled={!history.canGoBack}
                        onClick={() => go('back')}
                        className={navButton}
                    >
                        <Icon name="arrow_back" size={18} />
                    </button>
                    <button
                        type="button"
                        aria-label="Forward"
                        title={isMac ? 'Forward (⌘])' : 'Forward (Alt+→)'}
                        disabled={!history.canGoForward}
                        onClick={() => go('forward')}
                        className={navButton}
                    >
                        <Icon name="arrow_forward" size={18} />
                    </button>
                </div>
            </div>

            {/* No in-window menus on macOS: the same File/Edit/View live in the
                system menu bar at the top of the screen (src-tauri/src/menu.rs),
                and a Mac app that repeated them inside its own window would look
                wrong twice over.

                Elsewhere, the titles show while there is room for them and are
                replaced below the breakpoint by the hamburger, which carries the
                same three as categories. The swap is a media query rather than JS
                because webview zoom shrinks the *CSS* pixel width of the window —
                so zooming in trips the same breakpoint that narrowing the window
                does, which is exactly the case where the titles used to shove the
                window buttons off the edge. */}
            {!isMac && (
                <div ref={menuBarRef} className="ml-1 flex shrink-0 items-center gap-0.5">
                    <TitleBarMenu
                        label="File"
                        className={MENU_BAR_VISIBILITY}
                        entries={fileEntries}
                        open={openMenu === 'file'}
                        onOpen={() => setOpenMenu('file')}
                        onClose={() => setOpenMenu(null)}
                        onHover={hoverSwitch('file')}
                    />
                    <TitleBarMenu
                        label="Edit"
                        className={MENU_BAR_VISIBILITY}
                        entries={editEntries}
                        open={openMenu === 'edit'}
                        onOpen={() => setOpenMenu('edit')}
                        onClose={() => setOpenMenu(null)}
                        onHover={hoverSwitch('edit')}
                    />
                    <TitleBarMenu
                        label="View"
                        className={MENU_BAR_VISIBILITY}
                        entries={viewEntries}
                        open={openMenu === 'view'}
                        onOpen={() => setOpenMenu('view')}
                        onClose={() => setOpenMenu(null)}
                        onHover={hoverSwitch('view')}
                        footer={zoomReadout}
                    />
                    <TitleBarMenu
                        label="Menu"
                        icon="menu"
                        className={HAMBURGER_VISIBILITY}
                        entries={hamburgerEntries}
                        open={openMenu === 'all'}
                        onOpen={() => setOpenMenu('all')}
                        onClose={() => setOpenMenu(null)}
                        onHover={hoverSwitch('all')}
                    />
                </div>
            )}

            {/* Everything from here to the window buttons drags the window. */}
            <div data-tauri-drag-region className="h-full min-w-0 flex-1" />

            {!isMac && (
                <div className="flex h-full shrink-0 items-stretch">
                    <button
                        type="button"
                        aria-label="Minimize"
                        onClick={() => void windowAction('minimize')}
                        className="flex w-11 items-center justify-center text-on-surface-variant transition-colors hover:bg-titlebar-hover"
                    >
                        <Icon name="remove" size={18} />
                    </button>
                    <button
                        type="button"
                        aria-label={isMaximized ? 'Restore' : 'Maximize'}
                        onClick={() => void windowAction('toggleMaximize')}
                        className="flex w-11 items-center justify-center text-on-surface-variant transition-colors hover:bg-titlebar-hover"
                    >
                        <Icon name={isMaximized ? 'filter_none' : 'crop_square'} size={15} />
                    </button>
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={() => void windowAction('close')}
                        className="flex w-11 items-center justify-center text-on-surface-variant transition-colors hover:bg-titlebar-close hover:text-white active:bg-titlebar-close-active active:text-white"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>
            )}
        </header>
    );
}

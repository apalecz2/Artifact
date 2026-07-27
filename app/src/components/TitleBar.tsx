import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Icon from './Icon';

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

/**
 * The window's own title bar, drawn in the webview because no OS lets an app put
 * menu items up beside the window title. On Windows/Linux the native frame is
 * switched off in `lib.rs` and this bar supplies the drag region, the View menu
 * and the minimize/maximize/close buttons; on macOS it sits under a transparent
 * overlay frame, so the system keeps the traffic lights and its menu bar (which
 * drives the same zoom state — see `src-tauri/src/menu.rs`).
 *
 * It renders above the error boundary in `main.tsx`: an undecorated window whose
 * React tree has crashed still needs a way to be moved and closed.
 */
export default function TitleBar() {
    const [isMac] = useState(() =>
        typeof navigator === 'undefined' ? false : isMacPlatform(navigator.userAgent),
    );
    const [menuOpen, setMenuOpen] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [isMaximized, setIsMaximized] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const applyZoom = useCallback(async (action: ZoomAction) => {
        try {
            setZoom(await invoke<number>('set_app_zoom', { action }));
        } catch (error) {
            console.error('Failed to change zoom:', error);
        }
    }, []);

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

    // macOS' native View menu already owns these accelerators; registering them
    // here too would step the zoom twice per press.
    useEffect(() => {
        if (isMac) return;

        const onKeyDown = (event: KeyboardEvent) => {
            const action = zoomShortcut(event);
            if (!action) return;
            event.preventDefault();
            void applyZoom(action);
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isMac, applyZoom]);

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
        if (!menuOpen) return;

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
            setMenuOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMenuOpen(false);
                buttonRef.current?.focus();
            }
        };

        window.addEventListener('mousedown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [menuOpen]);

    const windowAction = async (action: 'minimize' | 'toggleMaximize' | 'close') => {
        try {
            await getCurrentWindow()[action]();
        } catch (error) {
            console.error(`Window ${action} failed:`, error);
        }
    };

    const modifier = modifierLabel(isMac);

    return (
        <header
            data-tauri-drag-region
            className={`relative z-50 flex h-9 shrink-0 select-none items-center border-b border-surface-variant bg-surface-container ${isMac ? 'pl-19.5' : 'pl-3'}`}
        >
            <span
                data-tauri-drag-region
                className="font-label-md text-label-md text-on-surface-variant"
            >
                Anchor
            </span>

            <div className="relative ml-3">
                <button
                    ref={buttonRef}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                    className={`flex h-7 items-center gap-0.5 rounded-md px-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${menuOpen ? 'bg-surface-variant' : ''}`}
                >
                    View
                    <Icon name="arrow_drop_down" size={16} />
                </button>

                {menuOpen && (
                    <div
                        ref={menuRef}
                        role="menu"
                        aria-label="View"
                        className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-[10px] border border-outline-variant bg-surface-bright p-1 shadow-xl"
                    >
                        {ZOOM_ITEMS.map((item) => (
                            <button
                                key={item.action}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    void applyZoom(item.action);
                                    setMenuOpen(false);
                                }}
                                className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left font-body-sm text-body-sm text-on-surface transition-colors hover:bg-surface-variant focus-visible:outline-none focus-visible:bg-surface-variant"
                            >
                                {item.label}
                                <span className="font-mono text-xs text-on-surface-variant">
                                    {modifier} {item.key}
                                </span>
                            </button>
                        ))}
                        <div className="mt-1 border-t border-outline-variant px-3 pb-0.5 pt-1.5 font-body-sm text-xs text-on-surface-variant">
                            Current zoom: {Math.round(zoom * 100)}%
                        </div>
                    </div>
                )}
            </div>

            {/* Everything from here to the window buttons drags the window. */}
            <div data-tauri-drag-region className="h-full flex-1" />

            {!isMac && (
                <div className="flex h-full items-stretch">
                    <button
                        type="button"
                        aria-label="Minimize"
                        onClick={() => void windowAction('minimize')}
                        className="flex w-11 items-center justify-center text-on-surface-variant transition-colors hover:bg-surface-variant"
                    >
                        <Icon name="remove" size={18} />
                    </button>
                    <button
                        type="button"
                        aria-label={isMaximized ? 'Restore' : 'Maximize'}
                        onClick={() => void windowAction('toggleMaximize')}
                        className="flex w-11 items-center justify-center text-on-surface-variant transition-colors hover:bg-surface-variant"
                    >
                        <Icon name={isMaximized ? 'filter_none' : 'crop_square'} size={15} />
                    </button>
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={() => void windowAction('close')}
                        className="flex w-11 items-center justify-center text-on-surface-variant transition-colors hover:bg-error hover:text-on-error"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>
            )}
        </header>
    );
}

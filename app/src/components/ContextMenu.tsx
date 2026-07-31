import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export interface MenuItem {
    /** A divider rule. Every other field is ignored when set. */
    separator?: boolean;
    label?: string;
    icon?: string;
    /** Right-aligned shortcut hint, e.g. "Ctrl+Z". Purely a hint — the key
     *  binding itself lives with whoever owns the keyboard handler. */
    shortcut?: string;
    disabled?: boolean;
    /** Destructive action: rendered in the error colour. */
    danger?: boolean;
    onSelect?: () => void;
}

interface ContextMenuProps {
    /** Viewport coordinates of the anchor point (e.g. the right-click position). */
    x: number;
    y: number;
    items: MenuItem[];
    onClose: () => void;
    /** 'down' (default) drops from the point; 'up' rises from it, for menus
     *  opened by a bottom-anchored toolbar button. */
    placement?: 'down' | 'up';
    /** Accessible name for the menu itself. */
    label?: string;
}

const MARGIN = 8;

/**
 * A floating command menu, portalled to `<body>` so it escapes the panes'
 * `overflow-hidden` and can be positioned in viewport space.
 *
 * Stacking: `z-60` sits above the in-pane overlays and the saved-badge popover
 * (`z-50`) but stays below the window title bar's `z-100`, which must remain on
 * top of everything (see CLAUDE.md ▸ TitleBar invariants).
 *
 * It closes on anything that would move it out from under the pointer —
 * outside mousedown, Escape, outside scroll, resize, window blur — rather than
 * trying to track its anchor.
 *
 * A menu taller than the space available scrolls instead of running off the
 * bottom — the table's menus outgrow a short window or a zoomed-in one, and the
 * position clamp can only keep the *top* on screen.
 *
 * "Available" starts below the window's title bar, not at the viewport top. The
 * bar is `z-100` and this menu is `z-60`, so a menu clamped to the top of the
 * viewport had its first rows hidden underneath it — the scroll cap alone
 * doesn't help, because the overflow was at the top. The bar is measured rather
 * than assumed: its height differs by platform (macOS insets for the traffic
 * lights) and moves with the webview zoom.
 */
export function ContextMenu({ x, y, items, onClose, placement = 'down', label }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

    // Measure before paint so the menu never renders at the raw click point and
    // then visibly jumps to its clamped position.
    useLayoutEffect(() => {
        const el = menuRef.current;
        if (!el) return;
        const bar = document.querySelector('[data-app-titlebar]');
        const topLimit = (bar?.getBoundingClientRect().bottom ?? 0) + MARGIN;
        const available = window.innerHeight - topLimit - MARGIN;
        const { width, height } = el.getBoundingClientRect();
        // The height it will *have* once the cap applies — using the natural
        // height here would push a too-tall menu's top back under the bar.
        const capped = Math.min(height, available);
        const wantedTop = placement === 'up' ? y - capped : y;
        setPos({
            left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
            top: Math.max(topLimit, Math.min(wantedTop, window.innerHeight - capped - MARGIN)),
            maxHeight: available,
        });
    }, [x, y, placement, items]);

    // Read through a ref so the subscription below registers once for the menu's
    // whole life instead of tearing down and re-adding on every render (callers
    // pass an inline `onClose`, so its identity is never stable). Fewer moving
    // parts around listeners that must fire on a specific dispatch.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        const close = () => onCloseRef.current();
        const onMouseDown = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node)) close();
        };
        // A scroll *inside* the menu is the user reading a list too tall for the
        // viewport, not the anchor moving out from under them — only outside
        // scrolls close it.
        const onScroll = (e: Event) => {
            if (menuRef.current?.contains(e.target as Node)) return;
            close();
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            }
        };
        document.addEventListener('mousedown', onMouseDown, true);
        // Capture phase: a scroll inside the table pane doesn't bubble to window.
        document.addEventListener('scroll', onScroll, true);
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('resize', close);
        window.addEventListener('blur', close);
        return () => {
            document.removeEventListener('mousedown', onMouseDown, true);
            document.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('resize', close);
            window.removeEventListener('blur', close);
        };
    }, []);

    return createPortal(
        <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            style={{
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                maxHeight: pos?.maxHeight,
                // Hidden until measured, so the pre-clamp position is never painted.
                visibility: pos ? 'visible' : 'hidden',
            }}
            className="fixed z-60 min-w-56 max-w-72 overflow-y-auto overscroll-contain rounded-xl border border-outline-variant bg-surface py-1 shadow-lg"
        >
            {items.map((item, i) => item.separator ? (
                <div key={i} className="my-1 border-t border-outline-variant" />
            ) : (
                <button
                    key={i}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                        onClose();
                        item.onSelect?.();
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${
                        item.danger
                            ? 'text-error hover:bg-error/10'
                            : 'text-on-surface hover:bg-surface-variant'
                    }`}
                >
                    <Icon name={item.icon ?? 'chevron_right'} size={16} className={item.icon ? 'shrink-0' : 'shrink-0 opacity-0'} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.shortcut && (
                        <span className="shrink-0 text-xs text-on-surface-variant">{item.shortcut}</span>
                    )}
                </button>
            ))}
        </div>,
        document.body
    );
}

export default ContextMenu;

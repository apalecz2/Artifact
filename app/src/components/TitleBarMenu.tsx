import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';

/** One selectable row in a title-bar menu. */
export interface MenuAction {
    label: string;
    /** Shortcut text shown right-aligned, e.g. "Ctrl N". Display only — the key
     *  itself is bound in TitleBar, or handled natively by the webview. */
    hint?: string;
    onSelect: () => void;
    disabled?: boolean;
}

/** Rows a menu (or a submenu) can hold. Submenus don't nest further. */
export type MenuLeaf = MenuAction | 'separator';

/** A category row that opens its own panel beside the parent. */
export interface MenuSubmenu {
    label: string;
    entries: MenuLeaf[];
    footer?: ReactNode;
}

export type MenuEntry = MenuLeaf | MenuSubmenu;

const isSubmenu = (entry: MenuEntry): entry is MenuSubmenu =>
    entry !== 'separator' && 'entries' in entry;

/**
 * How long the pointer must rest on a category before its panel opens, and the
 * grace period before it closes on the way out. Long enough not to fire while
 * the pointer is just passing through on its way down the list, short enough to
 * feel like a hover rather than a wait.
 */
const SUBMENU_HOVER_MS = 250;

const ROW_CLASS =
    'flex w-full items-center justify-between gap-6 rounded-md px-3 py-1.5 text-left font-body-sm text-body-sm text-on-surface transition-colors hover:bg-surface-variant focus-visible:bg-surface-variant focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40';

// Deliberately no `overflow-hidden`: a submenu panel is a descendant of its
// parent panel, so clipping here would cut off the very flyout it opens. The
// rounded corners survive without it — rows are inset by the `p-1` padding and
// carry their own radius, so nothing ever paints into a corner.
const PANEL_CLASS =
    'z-50 rounded-[10px] border border-outline-variant bg-surface-bright p-1 shadow-xl';

/** Breathing room kept between a panel and the window edge. */
const VIEWPORT_MARGIN = 8;

/**
 * How far left a panel must slide to sit inside the viewport; 0 if it fits.
 *
 * Submenus open to the right of their parent, which in a narrow window — the
 * only place the hamburger appears — runs past the edge. Rather than flip sides
 * (this close to the left edge there is rarely room there either), slide the
 * panel back by however much it overflows. The shift is capped at the distance
 * to the left margin so correcting a right overflow can never push the panel off
 * the *left* edge instead: a panel wider than the window ends up flush left,
 * still clipped, but showing its content rather than its empty right half.
 */
export function clampOffset(rect: { left: number; right: number }, viewportWidth: number): number {
    const overflow = rect.right - (viewportWidth - VIEWPORT_MARGIN);
    if (overflow <= 0) return 0;
    const shift = Math.min(overflow, Math.max(0, rect.left - VIEWPORT_MARGIN));
    return shift === 0 ? 0 : -shift;
}

/**
 * Keeps an open panel inside the window, via [`clampOffset`]. The panel may end
 * up overlapping its parent; that is what a constrained menu does, and the panel
 * is opaque, so it stays readable.
 *
 * This is load-bearing rather than cosmetic: `AppShell`'s root is
 * `overflow-hidden`, so a panel that runs past the window edge is cut off, not
 * merely inconvenient.
 */
function useViewportClamp(open: boolean) {
    const ref = useRef<HTMLDivElement>(null);
    const [offset, setOffset] = useState(0);

    useLayoutEffect(() => {
        if (!open) {
            setOffset(0);
            return;
        }
        const panel = ref.current;
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        if (rect.width === 0) return; // never laid out (jsdom)

        setOffset(clampOffset(rect, window.innerWidth));
    }, [open]);

    return {
        ref,
        style: offset ? { transform: `translateX(${offset}px)` } : undefined,
    };
}

function ActionRow({ action, onDone }: { action: MenuAction; onDone: () => void }) {
    return (
        <button
            type="button"
            role="menuitem"
            disabled={action.disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
                action.onSelect();
                onDone();
            }}
            className={ROW_CLASS}
        >
            {action.label}
            {action.hint && (
                <span className="shrink-0 font-mono text-xs text-on-surface-variant">
                    {action.hint}
                </span>
            )}
        </button>
    );
}

function Separator() {
    return <div role="separator" className="my-1 border-t border-outline-variant" />;
}

function LeafRows({ entries, onDone }: { entries: MenuLeaf[]; onDone: () => void }) {
    return (
        <>
            {entries.map((entry, index) =>
                entry === 'separator' ? (
                    // eslint-disable-next-line react/no-array-index-key -- separators carry no identity of their own
                    <Separator key={`separator-${index}`} />
                ) : (
                    <ActionRow key={entry.label} action={entry} onDone={onDone} />
                ),
            )}
        </>
    );
}

interface SubmenuRowProps {
    submenu: MenuSubmenu;
    open: boolean;
    /** Pointer rested on the row — the parent starts the open timer. */
    onHoverStart: () => void;
    /** Pointer left the row *and* its panel. */
    onHoverEnd: () => void;
    onToggle: () => void;
    onDone: () => void;
}

function SubmenuRow({ submenu, open, onHoverStart, onHoverEnd, onToggle, onDone }: SubmenuRowProps) {
    const panel = useViewportClamp(open);

    return (
        <div className="relative" onMouseEnter={onHoverStart} onMouseLeave={onHoverEnd}>
            <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onToggle}
                className={ROW_CLASS}
            >
                {submenu.label}
                <Icon name="chevron_right" size={16} className="shrink-0" />
            </button>

            {open && (
                // Butted against the row with no gap: a gap sits outside this
                // wrapper, so crossing it would fire `onMouseLeave` and close the
                // panel the pointer is travelling towards.
                <div
                    ref={panel.ref}
                    style={panel.style}
                    role="menu"
                    aria-label={submenu.label}
                    className={`absolute left-full top-0 w-56 ${PANEL_CLASS}`}
                >
                    <LeafRows entries={submenu.entries} onDone={onDone} />
                    {submenu.footer}
                </div>
            )}
        </div>
    );
}

interface TitleBarMenuProps {
    label: string;
    entries: MenuEntry[];
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
    /** Hovering a sibling title while any menu is open switches to it, the way a
     *  native menu bar behaves. The parent decides whether that applies. */
    onHover: () => void;
    /** Optional non-interactive footer (the View menu's zoom readout). */
    footer?: ReactNode;
    /** Material Symbols glyph to show instead of the text label (the collapsed
     *  bar's hamburger). `label` stays on as the accessible name. */
    icon?: string;
    /** Extra classes on the wrapper — the bar uses these to swap the menu titles
     *  and the hamburger at a width breakpoint. */
    className?: string;
}

/**
 * One menu in the title bar's menu bar.
 *
 * Rows may be plain actions or categories that open a panel of their own, which
 * is how the collapsed bar's hamburger holds File/Edit/View without stacking
 * every item into one list.
 *
 * Both the title and the rows open/select on **mousedown with the default
 * prevented**, which is what a native menu does and — more importantly here —
 * what keeps the focus and text selection where they were. Edit ▸ Cut/Copy act
 * on the focused field via `document.execCommand`, so a menu that stole focus on
 * click would clear the very selection those items operate on.
 */
export function TitleBarMenu({
    label,
    entries,
    open,
    onOpen,
    onClose,
    onHover,
    footer,
    icon,
    className = '',
}: TitleBarMenuProps) {
    const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const panel = useViewportClamp(open);

    const cancelHover = () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
    };

    /** Opens (or closes, with `null`) a category once the pointer has settled. */
    const scheduleSubmenu = (name: string | null) => {
        cancelHover();
        hoverTimer.current = setTimeout(() => setOpenSubmenu(name), SUBMENU_HOVER_MS);
    };

    // Closing the menu must not leave a category primed to open next time.
    useEffect(() => {
        if (!open) {
            cancelHover();
            setOpenSubmenu(null);
        }
    }, [open]);

    useEffect(() => cancelHover, []);

    const closeAll = () => {
        cancelHover();
        setOpenSubmenu(null);
        onClose();
    };

    return (
        <div className={`relative shrink-0 ${className}`}>
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={icon ? label : undefined}
                onMouseDown={(event) => {
                    event.preventDefault();
                    if (open) onClose();
                    else onOpen();
                }}
                onMouseEnter={onHover}
                className={`flex h-7 items-center gap-0.5 rounded-md font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-titlebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${icon ? 'w-7 justify-center' : 'px-2'} ${open ? 'bg-titlebar-hover' : ''}`}
            >
                {icon ? <Icon name={icon} size={18} /> : label}
            </button>

            {open && (
                <div
                    ref={panel.ref}
                    style={panel.style}
                    role="menu"
                    aria-label={label}
                    className={`absolute left-0 top-full mt-1 ${icon ? 'w-44' : 'w-60'} ${PANEL_CLASS}`}
                >
                    {entries.map((entry, index) =>
                        entry === 'separator' ? (
                            // eslint-disable-next-line react/no-array-index-key -- separators carry no identity of their own
                            <Separator key={`separator-${index}`} />
                        ) : isSubmenu(entry) ? (
                            <SubmenuRow
                                key={entry.label}
                                submenu={entry}
                                open={openSubmenu === entry.label}
                                onHoverStart={() => scheduleSubmenu(entry.label)}
                                onHoverEnd={() => scheduleSubmenu(null)}
                                onToggle={() => {
                                    cancelHover();
                                    setOpenSubmenu((current) =>
                                        current === entry.label ? null : entry.label,
                                    );
                                }}
                                onDone={closeAll}
                            />
                        ) : (
                            <ActionRow key={entry.label} action={entry} onDone={closeAll} />
                        ),
                    )}
                    {footer}
                </div>
            )}
        </div>
    );
}

export default TitleBarMenu;

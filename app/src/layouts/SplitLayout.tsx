import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import Icon from '../components/Icon';
import { useElementBounds } from '../hooks/useElementBounds';

// A pane narrower than this can't lay out its floating toolbar without the
// controls wrapping into a tall stack crowded against the resize gutter
// (review #6), so the divider clamps to a pixel floor rather than a bare
// percentage. On small windows where the floor would eat most of the width,
// it's capped at 40% so both panes always remain usable.
const MIN_PANE_PX = 360;

// The bounding rect of the whole split area (both panes + gutter), for
// overlays that should dim the entire session rather than just the pane
// they're anchored to — see HelpOverlay's `dimBounds`.
const SplitLayoutBoundsContext = createContext<DOMRect | null>(null);

export function useSplitLayoutBounds(): DOMRect | null {
    return useContext(SplitLayoutBoundsContext);
}

export const SplitLayout = ({ children }: { children: React.ReactNode }) => {
    const [leftWidth, setLeftWidth] = useState(50);
    const containerRef = useRef<HTMLDivElement>(null);
    const [, sessionBounds] = useElementBounds<HTMLDivElement>(true, containerRef);
    const isDragging = useRef(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current || !containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
            const minPct = Math.min(40, Math.max(20, (MIN_PANE_PX / containerRect.width) * 100));
            // Clamp to the limit rather than ignoring the move, so dragging past
            // the bound pins the divider at it instead of freezing it mid-track.
            setLeftWidth(Math.min(100 - minPct, Math.max(minPct, newWidth)));
        };
        const handleMouseUp = () => {
            if (isDragging.current) {
                isDragging.current = false;
                document.body.style.cursor = 'default';
            }
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const leftPane = React.Children.toArray(children)[0];
    const rightPane = React.Children.toArray(children)[1];

    return (
        <main className="relative flex h-full w-full overflow-hidden bg-background">
            <SplitLayoutBoundsContext.Provider value={sessionBounds}>
                <div className="flex h-full w-full" ref={containerRef}>
                    <div className="@container flex h-full flex-col bg-surface-container-lowest transition-[width] duration-0 py-4 px-6" style={{ width: `${leftWidth}%` }}>
                        {leftPane}
                    </div>
                    <div
                        className="group relative flex w-5 shrink-0 cursor-col-resize select-none items-center justify-center"
                        onMouseDown={() => isDragging.current = true}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize panes"
                    >
                        {/* Pane-colored halves so each side of the gutter blends into its pane */}
                        <div className="absolute inset-y-0 left-0 w-1/2 bg-surface-container-lowest" />
                        <div className="absolute inset-y-0 right-0 w-1/2 bg-background" />
                        {/* Full-height guide line so the split is always visible */}
                        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-outline-variant transition-colors group-hover:bg-primary/40" />
                        {/* Grip handle that signals the bar is draggable */}
                        <div className="relative flex h-14 w-5 items-center justify-center rounded-full border border-outline-variant bg-surface-variant shadow-sm transition-colors group-hover:border-primary group-hover:bg-surface-container-high">
                            <Icon name="drag_indicator" size={18} className="leading-none text-on-surface-variant transition-colors group-hover:text-primary" />
                        </div>
                    </div>
                    <div className="@container flex h-full flex-col transition-[width] duration-0 py-4 px-6" style={{ width: `${100 - leftWidth}%` }}>
                        {rightPane}
                    </div>
                </div>
            </SplitLayoutBoundsContext.Provider>
        </main>
    );
};
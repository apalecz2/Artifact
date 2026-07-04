import { useEffect, useRef, useState } from 'react';

/**
 * Tracks an element's live bounding rect while `active`, updating on any
 * resize of the element itself (via ResizeObserver — covers split-pane
 * drags, not just window resizes) or the window. Used to scope a
 * body-portaled overlay to one pane's footprint instead of the whole
 * viewport, without the overlay itself needing to live inside that pane's
 * (possibly `overflow-hidden`) DOM subtree.
 */
export function useElementBounds<T extends HTMLElement>(active: boolean): [React.RefObject<T | null>, DOMRect | null] {
    const ref = useRef<T | null>(null);
    const [bounds, setBounds] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!active) return;
        const el = ref.current;
        if (!el) return;

        const update = () => setBounds(el.getBoundingClientRect());
        update();

        const ro = new ResizeObserver(update);
        ro.observe(el);
        window.addEventListener('resize', update);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [active]);

    return [ref, bounds];
}

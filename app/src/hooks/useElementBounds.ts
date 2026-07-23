import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Tracks an element's live bounding rect while `active`, updating on any
 * resize of the element itself (via ResizeObserver — covers split-pane
 * drags, not just window resizes) or the window. Used to scope a
 * body-portaled overlay to one pane's footprint instead of the whole
 * viewport, without the overlay itself needing to live inside that pane's
 * (possibly `overflow-hidden`) DOM subtree.
 *
 * Pass `externalRef` to measure an element some other code already holds a
 * ref to (e.g. a shared layout container) instead of allocating a new one.
 *
 * Measures via `useLayoutEffect`, not `useEffect`: the first measurement
 * then lands before the browser paints, so a just-opened overlay never
 * flashes at a fallback position first.
 */
export function useElementBounds<T extends HTMLElement>(active: boolean, externalRef?: React.RefObject<T | null>): [React.RefObject<T | null>, DOMRect | null] {
    const internalRef = useRef<T | null>(null);
    const ref = externalRef ?? internalRef;
    const [bounds, setBounds] = useState<DOMRect | null>(null);

    useLayoutEffect(() => {
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
    }, [active, ref]);

    return [ref, bounds];
}

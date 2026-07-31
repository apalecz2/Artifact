/**
 * Auto-scroll while drag-selecting.
 *
 * A drag that reaches the edge of the table's scroll viewport used to stop
 * dead: the pointer leaves the last visible cell, no further `mouseenter`
 * fires, and a range taller than the viewport could only be built by scrolling
 * first and Shift+clicking. Holding the pointer at (or past) an edge now scrolls
 * the viewport and keeps extending the selection, the way a spreadsheet does.
 *
 * The geometry is pure and lives here; the DOM plumbing is `useDragAutoScroll`
 * in `ProvenanceTable`.
 */

/** Distance from an edge, in px, at which scrolling starts. */
export const EDGE_BAND = 36;

/** Scroll speed in px per frame at full overshoot (~60fps ⇒ ~1400px/s). */
export const MAX_SPEED = 24;

export interface Point {
    x: number;
    y: number;
}

export interface Bounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/**
 * How far to scroll this frame for a pointer at `point` over a viewport of
 * `bounds`.
 *
 * Speed ramps linearly from 0 at the inner edge of the band to `maxSpeed` at
 * the boundary, and stays at `maxSpeed` beyond it — a pointer dragged far
 * outside the window scrolls fast but not unboundedly, so overshooting by a
 * screen's width doesn't teleport the selection.
 *
 * Returns whole pixels: fractional `scrollTop` accumulates rounding drift
 * across a long drag, and sub-pixel steps do nothing visible anyway.
 */
export function autoScrollDelta(
    point: Point,
    bounds: Bounds,
    band = EDGE_BAND,
    maxSpeed = MAX_SPEED,
): { dx: number; dy: number } {
    return {
        dx: axisDelta(point.x, bounds.left, bounds.right, band, maxSpeed),
        dy: axisDelta(point.y, bounds.top, bounds.bottom, band, maxSpeed),
    };
}

function axisDelta(
    value: number,
    min: number,
    max: number,
    band: number,
    maxSpeed: number,
): number {
    // A viewport narrower than two bands would have them overlap and fight; the
    // near edge wins, which is the one the pointer is closest to.
    if (value < min + band) {
        return -speed(min + band - value, band, maxSpeed);
    }
    if (value > max - band) {
        return speed(value - (max - band), band, maxSpeed);
    }
    return 0;
}

function speed(overshoot: number, band: number, maxSpeed: number): number {
    const ratio = Math.min(1, Math.max(0, overshoot / band));
    return Math.round(ratio * maxSpeed);
}

/**
 * `point` pulled inside `bounds`, for `elementFromPoint`: once the pointer is
 * outside the viewport there is no cell under it, but the edge-most cell in its
 * direction is what the user is reaching for.
 */
export function clampIntoBounds(point: Point, bounds: Bounds, inset = 1): Point {
    return {
        x: Math.min(Math.max(point.x, bounds.left + inset), bounds.right - inset),
        y: Math.min(Math.max(point.y, bounds.top + inset), bounds.bottom - inset),
    };
}

/**
 * The nearest ancestor that actually scrolls on the given axis (including the
 * element itself). The table's own wrapper scrolls horizontally, but vertical
 * scrolling belongs to a pane wrapper several levels up, so the drag has to
 * find it rather than assume it.
 */
export function findScrollParent(
    start: HTMLElement | null,
    axis: 'x' | 'y',
): HTMLElement | null {
    const overflowProp = axis === 'x' ? 'overflowX' : 'overflowY';
    for (let el = start; el; el = el.parentElement) {
        const overflow = getComputedStyle(el)[overflowProp];
        if (overflow !== 'auto' && overflow !== 'scroll') continue;
        const scrollable = axis === 'x'
            ? el.scrollWidth > el.clientWidth
            : el.scrollHeight > el.clientHeight;
        if (scrollable) return el;
    }
    return null;
}

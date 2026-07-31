import { describe, it, expect } from 'vitest';
import { autoScrollDelta, clampIntoBounds, EDGE_BAND, MAX_SPEED } from './dragScroll';

const bounds = { left: 100, top: 100, right: 500, bottom: 400 };

describe('autoScrollDelta', () => {
    it('does not scroll while the pointer is clear of every edge', () => {
        expect(autoScrollDelta({ x: 300, y: 250 }, bounds)).toEqual({ dx: 0, dy: 0 });
    });

    it('scrolls down as the pointer nears the bottom edge', () => {
        const { dy } = autoScrollDelta({ x: 300, y: bounds.bottom - EDGE_BAND / 2 }, bounds);
        expect(dy).toBeGreaterThan(0);
        expect(dy).toBeLessThan(MAX_SPEED);
    });

    it('scrolls up as the pointer nears the top edge', () => {
        const { dy } = autoScrollDelta({ x: 300, y: bounds.top + EDGE_BAND / 2 }, bounds);
        expect(dy).toBeLessThan(0);
    });

    it('scrolls sideways near the left and right edges', () => {
        expect(autoScrollDelta({ x: bounds.left + 1, y: 250 }, bounds).dx).toBeLessThan(0);
        expect(autoScrollDelta({ x: bounds.right - 1, y: 250 }, bounds).dx).toBeGreaterThan(0);
    });

    it('ramps with proximity: deeper into the band scrolls faster', () => {
        const shallow = autoScrollDelta({ x: 300, y: bounds.bottom - EDGE_BAND + 2 }, bounds).dy;
        const deep = autoScrollDelta({ x: 300, y: bounds.bottom - 2 }, bounds).dy;
        expect(deep).toBeGreaterThan(shallow);
    });

    it('caps at full speed however far outside the pointer goes', () => {
        // The reported failure was a drag *past* the pane's edge doing nothing.
        // Well past it must still scroll — and no faster than at the boundary,
        // so overshooting by a screen doesn't teleport the selection.
        expect(autoScrollDelta({ x: 300, y: bounds.bottom + 5 }, bounds).dy).toBe(MAX_SPEED);
        expect(autoScrollDelta({ x: 300, y: bounds.bottom + 5000 }, bounds).dy).toBe(MAX_SPEED);
        expect(autoScrollDelta({ x: 300, y: bounds.top - 5000 }, bounds).dy).toBe(-MAX_SPEED);
    });

    it('returns whole pixels, so a long drag accumulates no rounding drift', () => {
        for (const y of [bounds.bottom - 30, bounds.bottom - 17, bounds.bottom - 3]) {
            expect(Number.isInteger(autoScrollDelta({ x: 300, y }, bounds).dy)).toBe(true);
        }
    });

    it('scrolls both axes at once in a corner', () => {
        const { dx, dy } = autoScrollDelta({ x: bounds.right + 20, y: bounds.bottom + 20 }, bounds);
        expect(dx).toBe(MAX_SPEED);
        expect(dy).toBe(MAX_SPEED);
    });
});

describe('clampIntoBounds', () => {
    it('leaves a point that is already inside alone', () => {
        expect(clampIntoBounds({ x: 300, y: 250 }, bounds)).toEqual({ x: 300, y: 250 });
    });

    it('pulls an outside point to the edge it overshot', () => {
        // elementFromPoint needs a point over a cell; the edge-most cell in the
        // direction of the drag is the one being reached for.
        expect(clampIntoBounds({ x: 300, y: 9999 }, bounds)).toEqual({ x: 300, y: 399 });
        expect(clampIntoBounds({ x: -9999, y: 250 }, bounds)).toEqual({ x: 101, y: 250 });
    });

    it('insets by a pixel so the point never lands on the boundary itself', () => {
        const { x, y } = clampIntoBounds({ x: 9999, y: 9999 }, bounds);
        expect(x).toBeLessThan(bounds.right);
        expect(y).toBeLessThan(bounds.bottom);
    });
});

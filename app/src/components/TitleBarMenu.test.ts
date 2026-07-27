import { describe, it, expect } from 'vitest';
import { clampOffset } from './TitleBarMenu';

// A submenu panel opens to the right of its parent row, which in the narrow bar
// can run past the window edge — and `AppShell` is `overflow-hidden`, so the
// overflow is cut off rather than merely untidy.
describe('clampOffset', () => {
    it('leaves a panel that already fits alone', () => {
        expect(clampOffset({ left: 100, right: 324 }, 800)).toBe(0);
    });

    it('slides an overflowing panel back by exactly its overflow', () => {
        // Right edge at 502 in a 460-wide window: 50px past the 8px margin.
        expect(clampOffset({ left: 278, right: 502 }, 460)).toBe(-50);
    });

    it('treats a panel touching the margin as fitting', () => {
        expect(clampOffset({ left: 100, right: 452 }, 460)).toBe(0);
        expect(clampOffset({ left: 100, right: 453 }, 460)).toBe(-1);
    });

    it('never shifts a panel off the left edge to fix a right overflow', () => {
        // Wider than the window: it can only slide as far as the left margin.
        expect(clampOffset({ left: 60, right: 400 }, 250)).toBe(-52);
        expect(clampOffset({ left: 8, right: 400 }, 250)).toBe(0);
    });
});

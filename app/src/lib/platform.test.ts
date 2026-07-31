import { describe, it, expect } from 'vitest';
import { isMacPlatform, formatShortcut, flagStepShortcut, redoShortcut } from './platform';

describe('isMacPlatform', () => {
    it('detects macOS user agents', () => {
        expect(isMacPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(true);
    });

    it('rejects other platforms', () => {
        expect(isMacPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
        expect(isMacPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false);
    });
});

describe('redoShortcut', () => {
    it('names Ctrl+Y off macOS', () => {
        expect(redoShortcut(false)).toBe('Ctrl+Y');
    });

    it('names ⌘⇧Z on macOS, never ⌘Y — nothing handles that there', () => {
        expect(redoShortcut(true)).toBe('⌘⇧Z');
    });
});

describe('flagStepShortcut', () => {
    const event = (over: Partial<Parameters<typeof flagStepShortcut>[0]>) => ({
        key: 'a',
        altKey: false,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        ...over,
    });

    it('steps on F3/Shift+F3 off macOS', () => {
        expect(flagStepShortcut(event({ key: 'F3' }), false)).toBe(1);
        expect(flagStepShortcut(event({ key: 'F3', shiftKey: true }), false)).toBe(-1);
    });

    it('leaves Alt+arrows to the title bar history nav off macOS', () => {
        // The bug this split fixes: Alt+← stepped a cell *and* navigated back,
        // because TitleBar handles it on window without stopping propagation.
        expect(flagStepShortcut(event({ key: 'ArrowLeft', altKey: true }), false)).toBeNull();
        expect(flagStepShortcut(event({ key: 'ArrowRight', altKey: true }), false)).toBeNull();
    });

    it('steps on ⌥←/→ on macOS', () => {
        expect(flagStepShortcut(event({ key: 'ArrowRight', altKey: true }), true)).toBe(1);
        expect(flagStepShortcut(event({ key: 'ArrowLeft', altKey: true }), true)).toBe(-1);
    });

    it('leaves F3 alone on macOS, where it is a media key', () => {
        expect(flagStepShortcut(event({ key: 'F3' }), true)).toBeNull();
        expect(flagStepShortcut(event({ key: 'F3', shiftKey: true }), true)).toBeNull();
    });

    it('ignores unmodified arrows on both, so they still move the selection', () => {
        expect(flagStepShortcut(event({ key: 'ArrowLeft' }), true)).toBeNull();
        expect(flagStepShortcut(event({ key: 'ArrowLeft' }), false)).toBeNull();
    });

    it('ignores anything carrying Ctrl or Cmd', () => {
        expect(flagStepShortcut(event({ key: 'F3', ctrlKey: true }), false)).toBeNull();
        expect(flagStepShortcut(event({ key: 'ArrowLeft', altKey: true, metaKey: true }), true))
            .toBeNull();
    });
});

describe('formatShortcut', () => {
    it('leaves hints untouched off macOS', () => {
        expect(formatShortcut('Ctrl+C', false)).toBe('Ctrl+C');
        expect(formatShortcut('Ctrl+Shift+Z', false)).toBe('Ctrl+Shift+Z');
        expect(formatShortcut('Alt+', false)).toBe('Alt+');
    });

    it('rewrites modifiers to macOS symbols', () => {
        expect(formatShortcut('Ctrl+C', true)).toBe('⌘C');
        expect(formatShortcut('Alt+', true)).toBe('⌥');
    });

    it('rewrites every modifier in a chord, in order', () => {
        // The order matters: Ctrl+ is replaced first, leaving "Shift+Z" for the
        // next pass — a chord must not come out as "⌘Shift+Z".
        expect(formatShortcut('Ctrl+Shift+Z', true)).toBe('⌘⇧Z');
    });

    it('leaves keys that name themselves on both platforms alone', () => {
        for (const hint of ['Delete', 'Enter', 'Space', 'F3']) {
            expect(formatShortcut(hint, true)).toBe(hint);
        }
    });
});

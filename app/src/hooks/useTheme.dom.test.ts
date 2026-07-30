import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyStoredTheme } from './useTheme';

// jsdom has no matchMedia, and `resolveTheme` consults it whenever no explicit
// choice is stored. Stub it per-test so the OS-preference fallback is testable.
function stubPrefersDark(prefersDark: boolean): void {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: prefersDark,
        media: query,
        addEventListener() {},
        removeEventListener() {},
    }));
}

afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove('dark');
});

describe('applyStoredTheme', () => {
    it('applies the dark class from the stored preference', () => {
        localStorage.setItem('theme', 'dark');
        stubPrefersDark(false);

        applyStoredTheme();

        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    // The regression this exists for: re-running setup (or an EULA re-consent run)
    // renders no themed subscriber, so a stored dark preference has to reach <html>
    // from startup alone.
    it('removes the dark class when the stored preference is light, even under a dark OS', () => {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'light');
        stubPrefersDark(true);

        applyStoredTheme();

        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('falls back to the OS preference when nothing is stored', () => {
        stubPrefersDark(true);

        applyStoredTheme();

        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
});

import { describe, it, expect } from 'vitest';
import { copyrightYears, FOUNDED_YEAR } from './copyright';

const jan1 = (year: number) => new Date(year, 0, 1);

describe('copyrightYears', () => {
    it('shows a single year during the founding year', () => {
        expect(copyrightYears(jan1(FOUNDED_YEAR))).toBe(String(FOUNDED_YEAR));
    });

    it('opens a range once the year rolls over', () => {
        expect(copyrightYears(jan1(FOUNDED_YEAR + 1))).toBe(`${FOUNDED_YEAR}-${FOUNDED_YEAR + 1}`);
        expect(copyrightYears(jan1(FOUNDED_YEAR + 9))).toBe(`${FOUNDED_YEAR}-${FOUNDED_YEAR + 9}`);
    });

    it('collapses to the founding year when the machine clock reads earlier', () => {
        // A desktop app renders against the user's clock, not a server's, so a
        // backwards range has to be unreachable rather than merely unlikely.
        expect(copyrightYears(jan1(FOUNDED_YEAR - 1))).toBe(String(FOUNDED_YEAR));
    });

    it('defaults to the current date with no argument', () => {
        const expected = new Date().getFullYear() <= FOUNDED_YEAR
            ? String(FOUNDED_YEAR)
            : `${FOUNDED_YEAR}-${new Date().getFullYear()}`;
        expect(copyrightYears()).toBe(expected);
    });
});

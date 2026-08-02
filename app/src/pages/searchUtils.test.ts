import { describe, it, expect } from 'vitest';
import { formatSqliteTimestamp, escapeLike, matchSnippet } from './searchUtils';

describe('formatSqliteTimestamp (L4)', () => {
    it('interprets a SQLite UTC timestamp as UTC, not local', () => {
        // 2026-06-21 00:30:00 UTC -> a valid, locale-formatted date string.
        const out = formatSqliteTimestamp('2026-06-21 00:30:00');
        // toLocaleDateString output varies by host locale; assert it parsed to a real date.
        expect(out).not.toBe('Invalid Date');
        const expected = new Date('2026-06-21T00:30:00Z').toLocaleDateString();
        expect(out).toBe(expected);
    });

    it('passes an unparseable value through verbatim', () => {
        expect(formatSqliteTimestamp('not a date')).toBe('not a date');
    });

    it('passes a non-SQLite-shaped string through to Date parsing', () => {
        // Already ISO with Z — should still format to a valid date.
        expect(formatSqliteTimestamp('2026-01-01T12:00:00Z')).toBe(
            new Date('2026-01-01T12:00:00Z').toLocaleDateString(),
        );
    });
});

describe('escapeLike (L5)', () => {
    it('escapes percent, underscore, and backslash', () => {
        expect(escapeLike('100%')).toBe('100\\%');
        expect(escapeLike('a_b')).toBe('a\\_b');
        expect(escapeLike('c\\d')).toBe('c\\\\d');
    });

    it('leaves ordinary text untouched', () => {
        expect(escapeLike('hello world')).toBe('hello world');
    });

    it('escapes a SQL-injection-flavoured string literally', () => {
        // The metacharacters are escaped; quotes/semicolons are bind-param-safe and
        // pass through unchanged (they cannot break a parameterized query).
        expect(escapeLike("%_';--")).toBe("\\%\\_';--");
    });
});

describe('matchSnippet', () => {
    it('splits the hit out of its surroundings so it can be marked up safely', () => {
        const snippet = matchSnippet('Total due for Invoice 4471 on receipt', 'invoice 4471');
        expect(snippet).toEqual({
            before: 'Total due for ',
            match: 'Invoice 4471',   // the source's casing, not the query's
            after: ' on receipt',
        });
    });

    /**
     * The rows come from SQLite `LIKE`, which is case-insensitive over ASCII, so
     * anything stricter here would hand back a matched row with no excerpt to show.
     */
    it('finds the match case-insensitively, the way the query that selected it did', () => {
        expect(matchSnippet('ACME HOLDINGS', 'acme')?.match).toBe('ACME');
    });

    it('flattens OCR line breaks and TSV tabs into one readable line', () => {
        const snippet = matchSnippet('Item\tQty\nWidget\t4471', '4471');
        expect(snippet?.before).toBe('Item Qty Widget ');
    });

    it('ellipsises a match buried in a long page', () => {
        const snippet = matchSnippet(`${'x'.repeat(200)} needle ${'y'.repeat(200)}`, 'needle');
        expect(snippet?.before.startsWith('…')).toBe(true);
        expect(snippet?.after.endsWith('…')).toBe(true);
        expect(snippet?.before.length).toBeLessThan(60);
    });

    it('does not ellipsise when the whole text already fits', () => {
        const snippet = matchSnippet('short needle here', 'needle');
        expect(snippet?.before).toBe('short ');
        expect(snippet?.after).toBe(' here');
    });

    it('reports no snippet for text that does not contain the query', () => {
        expect(matchSnippet('nothing relevant', 'needle')).toBeNull();
    });

    it('reports no snippet for an empty query, rather than marking the first character', () => {
        // The browse case: no query typed, every session listed. An empty `indexOf`
        // matches at 0, which would put a highlight on nothing at all.
        expect(matchSnippet('anything', '')).toBeNull();
    });
});

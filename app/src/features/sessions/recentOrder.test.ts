import { describe, it, expect } from 'vitest';
import { mergePreservingOrder } from './recentOrder';

const items = (...ids: string[]) => ids.map((id) => ({ id, label: id.toUpperCase() }));

describe('mergePreservingOrder', () => {
    it('keeps the on-screen order when the fresh list only re-sorts', () => {
        const merged = mergePreservingOrder(items('a', 'b', 'c'), items('c', 'a', 'b'));
        expect(merged.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    });

    it('drops entries missing from the fresh list', () => {
        const merged = mergePreservingOrder(items('a', 'b', 'c'), items('c', 'a'));
        expect(merged.map((i) => i.id)).toEqual(['a', 'c']);
    });

    it('inserts new entries at their fresh-list position', () => {
        const merged = mergePreservingOrder(items('a', 'b'), items('new', 'b', 'a'));
        expect(merged.map((i) => i.id)).toEqual(['new', 'a', 'b']);
    });

    it('adds and removes in one pass without losing the surviving order', () => {
        const merged = mergePreservingOrder(items('a', 'b', 'c'), items('n', 'c', 'a'));
        expect(merged.map((i) => i.id)).toEqual(['n', 'a', 'c']);
    });

    it('takes contents from the fresh list for entries it keeps in place', () => {
        const merged = mergePreservingOrder(
            [{ id: 'a', label: 'OLD' }],
            [{ id: 'a', label: 'RENAMED' }],
        );
        expect(merged).toEqual([{ id: 'a', label: 'RENAMED' }]);
    });

    it('is the fresh list when nothing is displayed yet', () => {
        const next = items('a', 'b');
        expect(mergePreservingOrder([], next)).toEqual(next);
    });
});

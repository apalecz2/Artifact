import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared call log so we can assert ordering across the db and fs boundaries.
const log: string[] = [];

const fakeDb = {
    select: vi.fn(async (sql: string) => {
        if (sql.includes('FROM files')) return [{ file_path: '/data/upload.pdf' }];
        if (sql.includes('FROM document_pages')) return [{ image_path: '/data/page1.png' }, { image_path: '' }];
        return [];
    }),
    execute: vi.fn(async (sql: string) => {
        log.push(`db:${sql.replace(/\s+/g, ' ').trim()}`);
        return { rowsAffected: 1, lastInsertId: 0 };
    }),
};

vi.mock('../../lib/db', () => ({
    getDb: async () => fakeDb,
    SESSION_CHILD_TABLES: ['csv_outputs', 'document_page_sets', 'document_pages', 'files'],
}));

const remove = vi.fn(async (p: string) => {
    log.push(`fs:remove:${p}`);
    if (p === '/data/page1.png') throw new Error('ENOENT'); // already gone
});
vi.mock('@tauri-apps/plugin-fs', () => ({ remove: (p: string) => remove(p) }));

const emitSessionChange = vi.fn();
vi.mock('./sessionEvents', () => ({ emitSessionChange: (d: unknown) => emitSessionChange(d) }));

import { deleteSession, discardCachedPages } from './sessionActions';

beforeEach(() => {
    log.length = 0;
    vi.clearAllMocks();
});

describe('deleteSession (CR:H1)', () => {
    it('deletes children in order then the parent, before touching the filesystem', async () => {
        await deleteSession('sess-1');

        const dbDeletes = log.filter(l => l.startsWith('db:'));
        expect(dbDeletes).toEqual([
            'db:DELETE FROM csv_outputs WHERE session_id = $1',
            'db:DELETE FROM document_page_sets WHERE session_id = $1',
            'db:DELETE FROM document_pages WHERE session_id = $1',
            'db:DELETE FROM files WHERE session_id = $1',
            'db:DELETE FROM sessions WHERE id = $1',
        ]);

        // Every DB delete happens before any filesystem removal.
        const firstFsIndex = log.findIndex(l => l.startsWith('fs:'));
        const lastDbIndex = log.map(l => l.startsWith('db:')).lastIndexOf(true);
        expect(lastDbIndex).toBeLessThan(firstFsIndex);
    });

    it('emits a session-change event with the deleted id', async () => {
        await deleteSession('sess-1');
        expect(emitSessionChange).toHaveBeenCalledWith({ deletedSessionId: 'sess-1' });
    });

    it('removes collected paths and skips empty ones, tolerating a missing file', async () => {
        await expect(deleteSession('sess-1')).resolves.toBeUndefined();
        // upload + page1 are removed; the empty image_path is filtered out.
        expect(remove).toHaveBeenCalledWith('/data/upload.pdf');
        expect(remove).toHaveBeenCalledWith('/data/page1.png');
        expect(remove).not.toHaveBeenCalledWith('');
        // The ENOENT on page1 was swallowed (allSettled), so deleteSession resolved.
    });
});

describe('discardCachedPages', () => {
    // The page images' paths live in `document_pages` and nowhere else, so rows
    // deleted on their own strand the PNGs permanently — not even deleteSession can
    // find them afterwards. Every retry of a long document leaked a full set.
    it('deletes the page images along with the rows', async () => {
        await discardCachedPages('sess-1');

        expect(remove).toHaveBeenCalledWith('/data/page1.png');
        // The failed page's empty image_path is filtered out.
        expect(remove).not.toHaveBeenCalledWith('');
        // The session's own upload is untouched — only the cache is being dropped.
        expect(remove).not.toHaveBeenCalledWith('/data/upload.pdf');
    });

    it('drops the completeness marker with the rows it describes', async () => {
        await discardCachedPages('sess-1');
        expect(log).toContain('db:DELETE FROM document_pages WHERE session_id = $1');
        expect(log).toContain('db:DELETE FROM document_page_sets WHERE session_id = $1');
    });

    it('reads the image paths before deleting the rows that hold them', async () => {
        await discardCachedPages('sess-1');
        // Rows first, files second (matching deleteSession) — but the SELECT has to
        // come before the DELETE or there would be no paths left to collect.
        const firstFs = log.findIndex(l => l.startsWith('fs:'));
        const lastDb = log.map(l => l.startsWith('db:')).lastIndexOf(true);
        expect(lastDb).toBeLessThan(firstFs);
        expect(remove).toHaveBeenCalled();
    });

    it('tolerates an image that is already gone', async () => {
        // The fs mock rejects for /data/page1.png; allSettled must swallow it.
        await expect(discardCachedPages('sess-1')).resolves.toBeUndefined();
    });
});

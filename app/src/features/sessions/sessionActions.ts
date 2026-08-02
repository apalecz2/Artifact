import { remove } from '@tauri-apps/plugin-fs';
import { getDb, SESSION_CHILD_TABLES } from '../../lib/db';
import { emitSessionChange } from './sessionEvents';

/**
 * Unlink every path, tolerating the ones that aren't there.
 *
 * Blank paths are filtered out: a page that failed to render or OCR is stored with
 * an empty `image_path`, and `remove('')` would surface a spurious error. The rest
 * is best-effort — a file already gone is the outcome we wanted anyway.
 */
async function removeFilesBestEffort(paths: string[]): Promise<void> {
    const unique = new Set(paths.filter(Boolean));
    await Promise.allSettled([...unique].map(p => remove(p)));
}

/**
 * Drop a session's cached page rows *and* the page images they point at.
 *
 * Deleting the rows alone orphans the PNGs: their paths are recorded nowhere else,
 * so not even `deleteSession` can find them afterwards and they outlive the session
 * that produced them. Every retry of a long document used to leave a full set of
 * full-resolution renders behind.
 *
 * Rows first, files second — the same ordering `deleteSession` uses, and for the
 * same reason: a failed unlink leaves the app correct (no cache, so the next open
 * re-renders), whereas the reverse would leave rows pointing at files that are
 * already gone.
 */
export async function discardCachedPages(sessionId: string): Promise<void> {
    const db = await getDb();
    const images = await db.select<{ image_path: string }[]>(
        'SELECT image_path FROM document_pages WHERE session_id = $1',
        [sessionId]
    );
    await db.execute('DELETE FROM document_pages WHERE session_id = $1', [sessionId]);
    await db.execute('DELETE FROM document_page_sets WHERE session_id = $1', [sessionId]);
    await removeFilesBestEffort(images.map(image => image.image_path));
}

export async function deleteSession(sessionId: string): Promise<void> {
    const db = await getDb();

    // Collect paths before the rows are deleted.
    const [uploadedFiles, generatedImages] = await Promise.all([
        db.select<{ file_path: string }[]>(
            'SELECT file_path FROM files WHERE session_id = $1',
            [sessionId]
        ),
        db.select<{ image_path: string }[]>(
            'SELECT image_path FROM document_pages WHERE session_id = $1',
            [sessionId]
        ),
    ]);

    // Delete child rows explicitly rather than trusting ON DELETE CASCADE: the
    // FK pragma is per-connection and the sqlx pool may run this on a connection
    // that never enabled it, which would orphan files/pages/outputs. Children
    // first, then the parent. DB delete precedes filesystem removal: if file
    // removal fails the UI is still correct (session gone); the reverse risks DB
    // records pointing at already-deleted files with no recovery path.
    for (const table of SESSION_CHILD_TABLES) {
        await db.execute(`DELETE FROM ${table} WHERE session_id = $1`, [sessionId]);
    }
    await db.execute('DELETE FROM sessions WHERE id = $1', [sessionId]);
    emitSessionChange({ deletedSessionId: sessionId });

    await removeFilesBestEffort([
        ...uploadedFiles.map(f => f.file_path),
        ...generatedImages.map(p => p.image_path),
    ]);
}

// Deletes every session and its associated rows and files. Returns the number of
// sessions removed so callers can give feedback. Mirrors deleteSession's ordering
// (children before parents, DB before filesystem) but clears the tables wholesale.
export async function deleteAllSessions(): Promise<number> {
    const db = await getDb();

    // Collect every on-disk path before the rows are deleted.
    const [uploadedFiles, generatedImages, sessions] = await Promise.all([
        db.select<{ file_path: string }[]>('SELECT file_path FROM files'),
        db.select<{ image_path: string }[]>('SELECT image_path FROM document_pages'),
        db.select<{ id: string }[]>('SELECT id FROM sessions'),
    ]);

    // Children first, then parents — same reasoning as deleteSession: we don't
    // trust ON DELETE CASCADE because the FK pragma is per-connection.
    for (const table of SESSION_CHILD_TABLES) {
        await db.execute(`DELETE FROM ${table}`);
    }
    await db.execute('DELETE FROM sessions');
    emitSessionChange({ allDeleted: true });

    await removeFilesBestEffort([
        ...uploadedFiles.map(f => f.file_path),
        ...generatedImages.map(p => p.image_path),
    ]);

    return sessions.length;
}
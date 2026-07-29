import { getDb } from '../../lib/db';
import { emitSessionChange } from './sessionEvents';

/**
 * Marks a session as just-active: bumps the `updated_at` that the sidebar's
 * "Recent Sessions" list and Search order by, then announces the change.
 *
 * Every writer that counts as session activity goes through here. A bare
 * `UPDATE sessions SET updated_at ...` moves the ordering without telling
 * anyone, so the sidebar only picks it up at its next navigation-triggered
 * re-query — which is what made a whole batch of re-ordering land the moment
 * the user clicked a row, jumping the list under the pointer.
 *
 * Emitting only after the write succeeds also keeps the app-data wipe safe:
 * `getDb()` rejects once the database is sealed, so a touch racing the wipe
 * throws here instead of broadcasting an event that would make listeners
 * re-query — and re-create — the deleted database (issues.md § Data/Storage).
 */
export async function touchSession(sessionId: string): Promise<void> {
    const db = await getDb();
    await db.execute('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [sessionId]);
    emitSessionChange({ updatedSessionId: sessionId });
}

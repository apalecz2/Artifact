export interface SessionChangeDetail {
    deletedSessionId?: string;
    // Set when every session was removed (e.g. "Delete all sessions" in Settings).
    allDeleted?: boolean;
    // Set when a session's contents changed (a table/OCR edit, a finished
    // extraction) and its `updated_at` moved with it, so anything ordering by
    // that column is now stale. Nothing was removed — listeners must not
    // navigate away on this one.
    updatedSessionId?: string;
}

const SESSION_CHANGE_EVENT = 'dataextractionai:sessions-changed';

export function emitSessionChange(detail: SessionChangeDetail): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.dispatchEvent(new CustomEvent<SessionChangeDetail>(SESSION_CHANGE_EVENT, { detail }));
}

export function subscribeToSessionChanges(
    listener: (detail: SessionChangeDetail) => void,
): () => void {
    if (typeof window === 'undefined') {
        return () => {};
    }

    const handleChange = (event: Event) => {
        listener((event as CustomEvent<SessionChangeDetail>).detail);
    };

    window.addEventListener(SESSION_CHANGE_EVENT, handleChange);

    return () => {
        window.removeEventListener(SESSION_CHANGE_EVENT, handleChange);
    };
}
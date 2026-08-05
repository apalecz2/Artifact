import { useCallback, useEffect, useState } from 'react';
import { EULA_VERSION } from './legalContent';

// Records that the user affirmatively accepted the EULA, and which version. This is
// the app's clickwrap consent record: a limitation-of-liability and AI-output
// disclaimer is far more defensible when tied to a recorded, affirmative acceptance
// than to a document the user never had to interact with. Acceptance is required
// BEFORE the first-run wizard downloads and then executes ~3.5 GB of third-party
// binaries (see App.tsx and features/setup/steps/TermsStep.tsx).
//
// The record lives in two places. `localStorage` is the fast path: the gate needs a
// synchronous answer before first paint, and this is the only store that can give one.
// It is also fragile — per-origin, wiped by clearing the webview's browsing data, gone
// if the WebView2/WKWebView profile is recreated — so acceptance is mirrored to
// `consent.json` in AppData (see src-tauri/src/consent.rs), which is what survives and
// what restores localStorage on the next launch if it was lost.
const VERSION_KEY = 'eula_accepted_version';
const TIMESTAMP_KEY = 'eula_accepted_at';

/** True only if the user has accepted the *current* EULA version. A version bump
 *  (EULA_VERSION) invalidates an older acceptance so the user is re-prompted. */
export function hasAcceptedCurrentEula(): boolean {
    try {
        return localStorage.getItem(VERSION_KEY) === EULA_VERSION;
    } catch {
        // If storage is unavailable, fail closed (treat as not accepted) so the
        // gate still shows rather than silently skipping consent.
        return false;
    }
}

/** The EULA version the user last accepted, whatever it was — null if there is no
 *  acceptance record at all. Unlike `hasAcceptedCurrentEula`, this survives a version
 *  bump, which is what tells a re-consent run "the terms changed since you agreed"
 *  apart from "we have never recorded your consent" (see TermsStep's copy). */
export function acceptedEulaVersion(): string | null {
    try {
        return localStorage.getItem(VERSION_KEY);
    } catch {
        return null;
    }
}

/** The ISO timestamp of the current acceptance, or null if not accepted. */
export function eulaAcceptedAt(): string | null {
    try {
        return hasAcceptedCurrentEula() ? localStorage.getItem(TIMESTAMP_KEY) : null;
    } catch {
        return null;
    }
}

function recordAcceptance(): { version: string; acceptedAt: string } {
    const acceptedAt = new Date().toISOString();
    try {
        localStorage.setItem(VERSION_KEY, EULA_VERSION);
        localStorage.setItem(TIMESTAMP_KEY, acceptedAt);
    } catch {
        // Storage unavailable. The AppData mirror below is then the only record, and
        // the heal on next launch is what will make the gate pass.
    }
    return { version: EULA_VERSION, acceptedAt };
}

interface ConsentRecord {
    version: string;
    accepted_at: string;
}

/**
 * Restore `localStorage` from the AppData record, and report whether the current
 * version ends up accepted.
 *
 * Only ever *adds* an acceptance that was already given — it writes localStorage solely
 * when the file names the current version, so a stale file cannot resurrect consent to
 * terms that have since been revised. Every failure (not running under Tauri, no file,
 * unreadable file) resolves to the localStorage answer, so the gate shows.
 */
async function healFromDisk(): Promise<boolean> {
    if (hasAcceptedCurrentEula()) return true;
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        const record = await invoke<ConsentRecord | null>('read_consent_record');
        if (record?.version !== EULA_VERSION) return false;
        try {
            localStorage.setItem(VERSION_KEY, record.version);
            localStorage.setItem(TIMESTAMP_KEY, record.accepted_at);
        } catch {
            /* storage unavailable — the return value below still unblocks this run */
        }
        return true;
    } catch {
        return false;
    }
}

export interface EulaAcceptance {
    accepted: boolean;
    /** True until the AppData record has been consulted. App holds its spinner over
     *  this, because rendering the wizard first and flipping it away a tick later
     *  would flash a consent prompt at a user who has already consented. */
    loading: boolean;
    /** Records acceptance (localStorage now, AppData in the background) and flips
     *  `accepted`. */
    accept: () => void;
}

/** React state for the acceptance gate. */
export function useEulaAcceptance(): EulaAcceptance {
    const [accepted, setAccepted] = useState<boolean>(hasAcceptedCurrentEula);
    // Nothing to wait for when localStorage already answers yes — the common case, which
    // therefore never pays for the round-trip.
    const [loading, setLoading] = useState<boolean>(() => !hasAcceptedCurrentEula());

    useEffect(() => {
        if (!loading) return;
        let cancelled = false;
        void healFromDisk().then((ok) => {
            if (cancelled) return;
            if (ok) setAccepted(true);
            setLoading(false);
        });
        return () => { cancelled = true; };
        // Runs once: `loading` only ever goes true -> false, and the guard above
        // makes a re-run a no-op anyway.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const accept = useCallback(() => {
        const { version, acceptedAt } = recordAcceptance();
        setAccepted(true);
        // Fire-and-forget: the gate has already passed on the localStorage write, and a
        // machine that cannot write to AppData should not be blocked from using the app
        // over it. It loses durability, not consent.
        void import('@tauri-apps/api/core')
            .then(({ invoke }) => invoke('write_consent_record', { version, acceptedAt }))
            .catch(() => {});
    }, []);

    return { accepted, loading, accept };
}

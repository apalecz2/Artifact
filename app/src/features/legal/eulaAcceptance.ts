import { useCallback, useState } from 'react';
import { EULA_VERSION } from './legalContent';

// Records that the user affirmatively accepted the EULA, and which version. This is
// the app's clickwrap consent record: a limitation-of-liability and AI-output
// disclaimer is far more defensible when tied to a recorded, affirmative acceptance
// than to a document the user never had to interact with. Acceptance is required
// BEFORE the first-run wizard downloads and then executes ~3.5 GB of third-party
// binaries (see App.tsx and FirstRunEula.tsx).
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

function recordAcceptance(): void {
    localStorage.setItem(VERSION_KEY, EULA_VERSION);
    localStorage.setItem(TIMESTAMP_KEY, new Date().toISOString());
}

/** React state for the acceptance gate: whether the current EULA is accepted, and
 *  an `accept` action that records it and flips the flag. */
export function useEulaAcceptance(): { accepted: boolean; accept: () => void } {
    const [accepted, setAccepted] = useState<boolean>(hasAcceptedCurrentEula);
    const accept = useCallback(() => {
        recordAcceptance();
        setAccepted(true);
    }, []);
    return { accepted, accept };
}

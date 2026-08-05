import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { useEulaAcceptance, hasAcceptedCurrentEula, eulaAcceptedAt } from './eulaAcceptance';
import { EULA_VERSION } from './legalContent';

const VERSION_KEY = 'eula_accepted_version';
const TIMESTAMP_KEY = 'eula_accepted_at';

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    invoke.mockResolvedValue(null);
});

describe('acceptance gate', () => {
    it('starts unaccepted and does not block on the disk read when nothing is stored', async () => {
        const { result } = renderHook(() => useEulaAcceptance());
        expect(result.current.accepted).toBe(false);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.accepted).toBe(false);
    });

    // The common case: localStorage answers yes synchronously, so the gate must not
    // hold the app behind a round-trip it does not need.
    it('accepts synchronously from localStorage without reading disk', () => {
        localStorage.setItem(VERSION_KEY, EULA_VERSION);
        const { result } = renderHook(() => useEulaAcceptance());
        expect(result.current.accepted).toBe(true);
        expect(result.current.loading).toBe(false);
        expect(invoke).not.toHaveBeenCalled();
    });

    it('records the version and a timestamp on accept, and mirrors both to AppData', async () => {
        const { result } = renderHook(() => useEulaAcceptance());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.accept());

        expect(result.current.accepted).toBe(true);
        expect(localStorage.getItem(VERSION_KEY)).toBe(EULA_VERSION);
        expect(eulaAcceptedAt()).toMatch(/^\d{4}-\d{2}-\d{2}T/);

        await waitFor(() =>
            expect(invoke).toHaveBeenCalledWith('write_consent_record', {
                version: EULA_VERSION,
                acceptedAt: localStorage.getItem(TIMESTAMP_KEY),
            }),
        );
    });

    // A failed AppData write loses durability, not consent — the user must not be stuck
    // on the gate because their disk is read-only.
    it('still accepts when the AppData mirror write fails', async () => {
        invoke.mockRejectedValue(new Error('read-only volume'));
        const { result } = renderHook(() => useEulaAcceptance());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.accept());

        expect(result.current.accepted).toBe(true);
        expect(hasAcceptedCurrentEula()).toBe(true);
    });
});

describe('healing a lost localStorage record from AppData', () => {
    it('restores acceptance when the stored record names the current version', async () => {
        invoke.mockResolvedValue({ version: EULA_VERSION, accepted_at: '2026-08-04T10:00:00.000Z' });

        const { result } = renderHook(() => useEulaAcceptance());
        expect(result.current.accepted).toBe(false);

        await waitFor(() => expect(result.current.accepted).toBe(true));
        expect(result.current.loading).toBe(false);
        expect(invoke).toHaveBeenCalledWith('read_consent_record');
        // Rewritten so the next launch answers synchronously again.
        expect(localStorage.getItem(VERSION_KEY)).toBe(EULA_VERSION);
        expect(localStorage.getItem(TIMESTAMP_KEY)).toBe('2026-08-04T10:00:00.000Z');
    });

    // The whole point of versioning consent: a record of the *old* terms must not let a
    // user past a gate raised by a revision they have never seen.
    it('does not restore acceptance from a superseded version', async () => {
        invoke.mockResolvedValue({ version: '2000-01-01', accepted_at: '2000-01-01T00:00:00.000Z' });
        expect('2000-01-01').not.toBe(EULA_VERSION);

        const { result } = renderHook(() => useEulaAcceptance());
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.accepted).toBe(false);
        expect(localStorage.getItem(VERSION_KEY)).toBeNull();
    });

    it.each([
        ['no record on disk', null],
        ['a malformed record', { accepted_at: '2026-08-04T10:00:00.000Z' }],
    ])('fails closed on %s', async (_label, record) => {
        invoke.mockResolvedValue(record);
        const { result } = renderHook(() => useEulaAcceptance());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.accepted).toBe(false);
    });

    // Plain-browser dev, where the Tauri IPC does not exist at all.
    it('fails closed when the backend command is unavailable', async () => {
        invoke.mockRejectedValue(new Error('command not found'));
        const { result } = renderHook(() => useEulaAcceptance());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.accepted).toBe(false);
    });
});

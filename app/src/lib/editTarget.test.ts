import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    EDIT_COMMANDS,
    getEditTarget,
    resetEditTarget,
    runInEditTarget,
    setEditTarget,
    subscribeEditTarget,
} from './editTarget';
import type { EditAvailability, EditCommand } from './editTarget';

const can = (over: Partial<EditAvailability> = {}): EditAvailability => ({
    undo: true,
    redo: true,
    cut: true,
    copy: true,
    paste: true,
    selectAll: true,
    ...over,
});

const target = (over: Partial<EditAvailability> = {}) => ({
    can: can(over),
    run: vi.fn(),
});

beforeEach(resetEditTarget);

describe('editTarget', () => {
    it('reports no claimant until one registers', () => {
        expect(getEditTarget()).toBeNull();
        expect(runInEditTarget('undo')).toBe(false);
        expect(runInEditTarget('copy')).toBe(false);
    });

    it('dispatches every command to the claimant', () => {
        const claim = target();
        setEditTarget(claim);

        for (const command of EDIT_COMMANDS) {
            expect(runInEditTarget(command)).toBe(true);
        }
        expect(claim.run.mock.calls.map(([command]) => command as EditCommand)).toEqual([...EDIT_COMMANDS]);
    });

    it('swallows a claimed command it cannot currently run, rather than letting it fall through', () => {
        const claim = target({ paste: false });
        setEditTarget(claim);

        // Handled — the claimant owns Paste while focused, so this must not run
        // against some other surface the user isn't looking at.
        expect(runInEditTarget('paste')).toBe(true);
        expect(claim.run).not.toHaveBeenCalled();
    });

    it('exposes availability, and notifies when any of it changes', () => {
        const listener = vi.fn();
        subscribeEditTarget(listener);

        setEditTarget(target({ undo: false }));
        expect(getEditTarget()).toEqual(can({ undo: false }));
        expect(listener).toHaveBeenCalledTimes(1);

        setEditTarget(target({ undo: false, copy: false }));
        expect(getEditTarget()).toEqual(can({ undo: false, copy: false }));
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('keeps a stable snapshot across re-registrations that change nothing', () => {
        setEditTarget(target());
        const first = getEditTarget();

        const listener = vi.fn();
        const unsubscribe = subscribeEditTarget(listener);
        setEditTarget(target());

        // useSyncExternalStore would loop forever on a fresh object each render.
        expect(getEditTarget()).toBe(first);
        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
    });

    it('still dispatches to the newest runner after a silent re-registration', () => {
        setEditTarget(target());
        const fresh = target();
        setEditTarget(fresh);

        runInEditTarget('undo');
        // A runner from an earlier render would act on a stale grid.
        expect(fresh.run).toHaveBeenCalledWith('undo');
    });

    it('releases the claim, notifying once', () => {
        const listener = vi.fn();
        setEditTarget(target());
        const unsubscribe = subscribeEditTarget(listener);

        setEditTarget(null);
        expect(getEditTarget()).toBeNull();
        expect(runInEditTarget('undo')).toBe(false);
        expect(listener).toHaveBeenCalledTimes(1);

        setEditTarget(null);
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it('stops notifying an unsubscribed listener', () => {
        const listener = vi.fn();
        subscribeEditTarget(listener)();

        setEditTarget(target());
        expect(listener).not.toHaveBeenCalled();
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared call log: the ordering (close the pool before the wipe) is the point of
// removeAllAppData, so it has to be assertable across the db/IPC boundary.
const log: string[] = [];

const closeDb = vi.fn(async () => { log.push('db:close'); });
const sealDb = vi.fn(() => { log.push('db:seal'); });
const unsealDb = vi.fn(() => { log.push('db:unseal'); });
vi.mock('../../lib/db', () => ({
    closeDb: () => closeDb(),
    sealDb: () => sealDb(),
    unsealDb: () => unsealDb(),
}));

let invokeResult: unknown = { freed_bytes: 0, failed: [] };
const invoke = vi.fn(async (cmd: string, args?: unknown) => {
    log.push(`invoke:${cmd}`);
    if (invokeResult instanceof Error) throw invokeResult;
    void args;
    return invokeResult;
});
vi.mock('@tauri-apps/api/core', () => ({
    invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

import { removeAllAppData, planAfterRemoval, quitApp, formatFreedBytes } from './appDataActions';

beforeEach(() => {
    log.length = 0;
    vi.clearAllMocks();
    invokeResult = { freed_bytes: 0, failed: [] };
    localStorage.setItem('theme', 'light');
    localStorage.setItem('eula_accepted_version', '1.0');
});

describe('removeAllAppData', () => {
    it('seals the database, then closes it, before asking the backend to delete it', async () => {
        // The seal has to come first: `Database.load` re-creates the file and its
        // directory, so any query landing mid-wipe would resurrect workspace.db.
        await removeAllAppData('reset');
        expect(log).toEqual(['db:seal', 'db:close', 'invoke:remove_all_app_data']);
    });

    it('never emits a session-change event — every listener would re-query the database', async () => {
        const listener = vi.fn();
        window.addEventListener('dataextractionai:sessions-changed', listener);
        await removeAllAppData('uninstall');
        window.removeEventListener('dataextractionai:sessions-changed', listener);
        expect(listener).not.toHaveBeenCalled();
    });

    it('unseals when the wipe fails outright, since nothing was deleted', async () => {
        invokeResult = new Error('permission denied');
        await expect(removeAllAppData('uninstall')).rejects.toThrow('permission denied');
        expect(unsealDb).toHaveBeenCalled();
    });

    it('leaves the database sealed after a successful wipe', async () => {
        await removeAllAppData('uninstall');
        expect(unsealDb).not.toHaveBeenCalled();
    });

    it('recreates directories only for the reset path', async () => {
        await removeAllAppData('reset');
        expect(invoke).toHaveBeenCalledWith('remove_all_app_data', { recreateDirs: true });

        vi.clearAllMocks();
        await removeAllAppData('uninstall');
        expect(invoke).toHaveBeenCalledWith('remove_all_app_data', { recreateDirs: false });
    });

    it('clears webview storage, which the backend cannot reach', async () => {
        await removeAllAppData('uninstall');
        expect(localStorage.getItem('theme')).toBeNull();
        expect(localStorage.getItem('eula_accepted_version')).toBeNull();
    });

    it('keeps settings when the wipe fails, so the install stays usable', async () => {
        invokeResult = new Error('permission denied');
        await expect(removeAllAppData('reset')).rejects.toThrow('permission denied');
        expect(localStorage.getItem('theme')).toBe('light');
    });

    it('returns the report, including paths that could not be removed', async () => {
        invokeResult = { freed_bytes: 3_500_000_000, failed: ['C:\\data\\models\\model.gguf'] };
        const report = await removeAllAppData('uninstall');
        expect(report.freed_bytes).toBe(3_500_000_000);
        expect(report.failed).toEqual(['C:\\data\\models\\model.gguf']);
    });
});

describe('planAfterRemoval', () => {
    const clean = (freed: number) => ({ freed_bytes: freed, failed: [] });

    it('reloads into first-run setup after a clean reset', () => {
        expect(planAfterRemoval(clean(3_500_000_000), 'reset')).toEqual({ next: 'reload' });
    });

    it('quits after a clean uninstall, reporting what was freed', () => {
        const outcome = planAfterRemoval(clean(3_500_000_000), 'uninstall');
        expect(outcome.next).toBe('quit');
        expect(outcome).toHaveProperty('message', expect.stringContaining('3.50 GB'));
    });

    it('neither reloads nor quits when files survived — in either mode', () => {
        const partial = { freed_bytes: 1_000_000, failed: ['a.gguf', 'b.dll'] };
        for (const mode of ['reset', 'uninstall'] as const) {
            const outcome = planAfterRemoval(partial, mode);
            expect(outcome.next).toBe('stay');
            // The count is what the user acts on, so it has to be in the message.
            expect(outcome).toHaveProperty('message', expect.stringContaining('2 files'));
        }
    });

    it('says "1 file" rather than "1 files"', () => {
        const outcome = planAfterRemoval({ freed_bytes: 0, failed: ['a.gguf'] }, 'uninstall');
        expect(outcome).toHaveProperty('message', expect.stringContaining('1 file could not'));
    });
});

describe('quitApp', () => {
    it('asks the backend to exit', async () => {
        await quitApp();
        expect(invoke).toHaveBeenCalledWith('quit_app', undefined);
    });
});

describe('formatFreedBytes', () => {
    it('scales the unit to the size', () => {
        expect(formatFreedBytes(3_512_000_000)).toBe('3.51 GB');
        expect(formatFreedBytes(38_000_000)).toBe('38 MB');
        expect(formatFreedBytes(4_096)).toBe('4 KB');
        expect(formatFreedBytes(0)).toBe('0 bytes');
    });
});

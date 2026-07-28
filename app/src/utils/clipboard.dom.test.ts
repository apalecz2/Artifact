import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyTextToClipboard } from './clipboard';

// jsdom provides neither navigator.clipboard nor execCommand, so both layers are
// installed per-test. The point of these cases is the *fallback contract*: the
// About screen shows a failure message off the boolean, so a wrong return value
// silently lies to the user about whether their diagnostics were copied.
function stubClipboard(writeText: () => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
        writable: true,
    });
}

describe('copyTextToClipboard', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.restoreAllMocks();
        Reflect.deleteProperty(navigator, 'clipboard');
        Reflect.deleteProperty(document, 'execCommand');
    });

    it('uses the async clipboard API when it works', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        stubClipboard(writeText);

        await expect(copyTextToClipboard('Version: Anchor 0.2.0')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('Version: Anchor 0.2.0');
    });

    it('falls back to execCommand when the async API rejects', async () => {
        stubClipboard(vi.fn().mockRejectedValue(new Error('not allowed')));
        const execCommand = vi.fn().mockReturnValue(true);
        Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });

        await expect(copyTextToClipboard('fallback text')).resolves.toBe(true);
        expect(execCommand).toHaveBeenCalledWith('copy');
    });

    it('leaves no scratch textarea behind after the fallback runs', async () => {
        stubClipboard(vi.fn().mockRejectedValue(new Error('not allowed')));
        Object.defineProperty(document, 'execCommand', { value: () => true, configurable: true });

        await copyTextToClipboard('fallback text');
        expect(document.querySelectorAll('textarea')).toHaveLength(0);
    });

    it('reports failure when execCommand declines rather than claiming success', async () => {
        stubClipboard(vi.fn().mockRejectedValue(new Error('not allowed')));
        Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true });

        await expect(copyTextToClipboard('nope')).resolves.toBe(false);
    });

    it('reports failure when neither mechanism exists at all', async () => {
        stubClipboard(vi.fn().mockRejectedValue(new Error('not allowed')));
        // No execCommand defined — jsdom throws "not implemented" on the call.
        await expect(copyTextToClipboard('nope')).resolves.toBe(false);
    });
});

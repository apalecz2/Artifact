import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => vi.fn()) }));
vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({
        onCloseRequested: vi.fn(async () => vi.fn()),
        destroy: vi.fn(async () => {}),
    }),
}));

import DownloadStep from './DownloadStep';
import type { SetupConfig } from '../types';

const config = (backend: SetupConfig['backend']): SetupConfig => ({ backend });

/** Order of the Tauri commands the step issued. */
const commands = () => invoke.mock.calls.map(c => c[0] as string);

beforeEach(() => {
    vi.clearAllMocks();
    // Everything already installed, so the run reaches completion without downloading.
    invoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_asset_manifest') {
            return Promise.resolve([
                { asset_id: 'llama_server', label: 'llama', size_bytes: 1, dest_path: '/a', sha256: '', url_primary: 'u', url_fallback: null, extract_to_dir: null, flatten_marker: null, installed: true, version: null },
            ]);
        }
        return Promise.resolve(undefined);
    });
});

describe('DownloadStep', () => {
    /**
     * `check_setup_complete` decides whether the CUDA runtime is required from the
     * backend recorded in AppData. CompleteStep writes it too, but only on success —
     * so an install that dies partway (the case the check exists for) would leave it
     * unwritten, and a CUDA install missing cudart would read as complete.
     */
    it('records the backend before fetching the manifest, not after the install', async () => {
        render(<DownloadStep config={config('cuda')} onComplete={vi.fn()} onError={vi.fn()} onCancel={vi.fn()} />);

        await waitFor(() => expect(invoke).toHaveBeenCalledWith('persist_backend', { backend: 'cuda' }));
        const order = commands();
        expect(order.indexOf('persist_backend')).toBeLessThan(order.indexOf('get_asset_manifest'));
    });

    it('records a cpu backend just the same', async () => {
        render(<DownloadStep config={config('cpu')} onComplete={vi.fn()} onError={vi.fn()} onCancel={vi.fn()} />);
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('persist_backend', { backend: 'cpu' }));
    });

    it('still installs when the backend cannot be persisted', async () => {
        // Non-fatal: the completeness check just falls back to not requiring cudart.
        invoke.mockImplementation((cmd: string) => {
            if (cmd === 'persist_backend') return Promise.reject('read-only volume');
            if (cmd === 'get_asset_manifest') return Promise.resolve([]);
            return Promise.resolve(undefined);
        });
        const onComplete = vi.fn();
        const onError = vi.fn();
        render(<DownloadStep config={config('cuda')} onComplete={onComplete} onError={onError} onCancel={vi.fn()} />);

        await waitFor(() => expect(onComplete).toHaveBeenCalled());
        expect(onError).not.toHaveBeenCalled();
    });

    it('asks for the manifest matching the chosen backend', async () => {
        render(<DownloadStep config={config('cuda')} onComplete={vi.fn()} onError={vi.fn()} onCancel={vi.fn()} />);
        await waitFor(() =>
            expect(invoke).toHaveBeenCalledWith('get_asset_manifest', { backend: 'cuda' }),
        );
    });
});

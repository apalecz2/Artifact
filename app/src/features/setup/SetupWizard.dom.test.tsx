import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
// The install step listens for download progress and intercepts the window's close
// button, neither of which exists outside Tauri.
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));
vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({ onCloseRequested: async () => () => {} }),
}));

import SetupWizard from './SetupWizard';
import { getNavState, runBackHandler, setBackHandler } from '../../lib/navState';

const HARDWARE = { gpu_name: 'RTX 4090', vram_mb: 24_576, recommended_backend: 'cuda' };
const ASSET = {
    asset_id: 'model',
    label: 'Qwen language model',
    size_bytes: 2_700_000_000,
    url_primary: 'https://example.invalid/model.gguf',
    dest_path: '/models/model.gguf',
    sha256: 'deadbeef',
    installed: false,
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setBackHandler(null);
    invoke.mockImplementation(async (cmd: string) => (cmd === 'detect_hardware' ? HARDWARE : null));
});

const renderWizard = (props: Partial<Parameters<typeof SetupWizard>[0]> = {}) =>
    render(
        <SetupWizard
            eulaAccepted
            onAcceptEula={vi.fn()}
            installNeeded
            onComplete={vi.fn()}
            {...props}
        />,
    );

// The window's Back button is what a user who has changed their mind about a
// re-run reaches for, and the wizard renders instead of the routes — so it has to
// say what Back means while it is up. See lib/navState.ts.
describe('<SetupWizard /> back handling', () => {
    it('offers no way out when there is no app behind it (a first install)', async () => {
        renderWizard();

        await waitFor(() => expect(invoke).toHaveBeenCalledWith('detect_hardware'));
        expect(getNavState().canExit).toBe(false);
        expect(runBackHandler()).toBe(false);
    });

    it('registers the exit it was given, and runs it on Back', async () => {
        const onExit = vi.fn();
        renderWizard({ onExit });

        await waitFor(() => expect(getNavState().canExit).toBe(true));
        expect(runBackHandler()).toBe(true);
        expect(onExit).toHaveBeenCalledOnce();
    });

    it('offers the same way out as a button, since the title bar arrow is easy to miss', async () => {
        const user = userEvent.setup();
        const onExit = vi.fn();
        renderWizard({ onExit });

        await user.click(await screen.findByRole('button', { name: /back to anchor/i }));

        expect(onExit).toHaveBeenCalledOnce();
    });

    it('shows no such button on a first install', async () => {
        renderWizard();

        await waitFor(() => expect(invoke).toHaveBeenCalledWith('detect_hardware'));
        expect(screen.queryByRole('button', { name: /back to anchor/i })).not.toBeInTheDocument();
    });

    it('withdraws it once the wizard is gone', async () => {
        const { unmount } = renderWizard({ onExit: vi.fn() });

        await waitFor(() => expect(getNavState().canExit).toBe(true));
        unmount();

        expect(getNavState().canExit).toBe(false);
    });

    // The install step owns cancellation: a download in flight has to be stopped
    // and confirmed, not abandoned behind a screen that closes itself. Its own
    // "Cancel setup" lands back on Welcome, where Back works again — and the
    // Complete step keeps it withdrawn too, since Launch is what persists the new
    // paths and reloads into them.
    it('withdraws it while installing', async () => {
        const user = userEvent.setup();
        invoke.mockImplementation(async (cmd: string) => {
            if (cmd === 'detect_hardware') return HARDWARE;
            if (cmd === 'get_asset_manifest') return [ASSET];
            // Never settles: the download is still in flight, which is the case the
            // rule exists for.
            if (cmd === 'download_file') return new Promise(() => {});
            return null;
        });
        renderWizard({ onExit: vi.fn() });

        await waitFor(() => expect(getNavState().canExit).toBe(true));
        // Automatic goes welcome → install directly, the EULA already being accepted.
        await user.click(await screen.findByRole('button', { name: /automatic/i }));

        await waitFor(() => expect(getNavState().canExit).toBe(false));
        expect(screen.queryByRole('button', { name: /back to anchor/i })).not.toBeInTheDocument();
    });

    // Nothing is running after a failure, and a re-run that got nowhere leaves the
    // install it started from untouched — so "Start over" shouldn't be the only way
    // out of the error screen.
    it('offers it again when the install fails', async () => {
        const user = userEvent.setup();
        invoke.mockImplementation(async (cmd: string) => {
            if (cmd === 'detect_hardware') return HARDWARE;
            if (cmd === 'get_asset_manifest') throw new Error('network is down');
            return null;
        });
        renderWizard({ onExit: vi.fn() });

        await user.click(await screen.findByRole('button', { name: /automatic/i }));

        expect(await screen.findByText(/setup failed/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /back to anchor/i })).toBeInTheDocument();
        expect(getNavState().canExit).toBe(true);
    });
});

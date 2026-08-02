import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import {
    useSetupCheck,
    requestSetupRerun,
    clearSetupRerun,
    FORCE_SETUP_KEY,
} from './useSetupCheck';
import { readSetting, hasSetting } from '../../lib/settings';

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

describe('useSetupCheck', () => {
    it('treats the force_setup flag as incomplete regardless of assets', async () => {
        localStorage.setItem(FORCE_SETUP_KEY, '1');
        localStorage.setItem('model_path', '/m.gguf');
        localStorage.setItem('hardware_backend', 'cuda');
        invoke.mockResolvedValueOnce(true); // check_setup_complete
        const { result } = renderHook(() => useSetupCheck());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.isComplete).toBe(false);
    });

    // The probe is *not* skipped when the flag is set, even though the flag alone
    // decides whether the wizard shows: it is the only thing that distinguishes a
    // re-run the user chose (walkable-away-from) from a broken install (not).
    it('marks a forced run over a working install as cancellable', async () => {
        localStorage.setItem(FORCE_SETUP_KEY, '1');
        localStorage.setItem('model_path', '/m.gguf');
        localStorage.setItem('hardware_backend', 'cuda');
        invoke.mockResolvedValueOnce(true); // check_setup_complete
        const { result } = renderHook(() => useSetupCheck());

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(invoke).toHaveBeenCalledWith('check_setup_complete');
        expect(result.current.canCancelRerun).toBe(true);
    });

    it('does not offer to cancel when the assets are genuinely missing', async () => {
        localStorage.setItem(FORCE_SETUP_KEY, '1');
        invoke.mockResolvedValueOnce(false); // check_setup_complete
        const { result } = renderHook(() => useSetupCheck());

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.isComplete).toBe(false);
        expect(result.current.canCancelRerun).toBe(false);
    });

    it('cancelRerun clears the flag and hands the app back without a reload', async () => {
        localStorage.setItem(FORCE_SETUP_KEY, '1');
        localStorage.setItem('model_path', '/m.gguf');
        localStorage.setItem('hardware_backend', 'cuda');
        invoke.mockResolvedValueOnce(true);
        const { result } = renderHook(() => useSetupCheck());
        await waitFor(() => expect(result.current.canCancelRerun).toBe(true));

        act(() => result.current.cancelRerun());

        expect(localStorage.getItem(FORCE_SETUP_KEY)).toBeNull();
        expect(result.current.isComplete).toBe(true);
        expect(result.current.canCancelRerun).toBe(false);
    });

    it('reports complete when check_setup_complete is true and paths already exist', async () => {
        localStorage.setItem('model_path', '/m.gguf');
        localStorage.setItem('hardware_backend', 'cuda');
        invoke.mockResolvedValueOnce(true); // check_setup_complete
        const { result } = renderHook(() => useSetupCheck());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.isComplete).toBe(true);
        // No heal needed -> get_setup_paths not called.
        expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('auto-heals missing paths and backend from get_setup_paths (F5)', async () => {
        // complete, but localStorage lost its settings.
        invoke
            .mockResolvedValueOnce(true) // check_setup_complete
            .mockResolvedValueOnce({
                llama_server: '/bin/llama',
                model_path: '/models/q.gguf',
                mmproj_path: '/models/mmproj.gguf',
                hardware_backend: 'metal',
            }); // get_setup_paths
        const { result } = renderHook(() => useSetupCheck());
        await waitFor(() => expect(result.current.isComplete).toBe(true));
        expect(readSetting('modelPath')).toBe('/models/q.gguf');
        expect(readSetting('mmprojPath')).toBe('/models/mmproj.gguf');
        expect(hasSetting('hardwareBackend')).toBe(true);
        expect(readSetting('hardwareBackend')).toBe('metal');
    });

    it('falls back to detect_hardware recommendation when no backend was persisted', async () => {
        localStorage.setItem('model_path', '/m.gguf'); // paths fine, only backend missing
        invoke
            .mockResolvedValueOnce(true) // check_setup_complete
            .mockResolvedValueOnce({
                llama_server: '/b',
                model_path: '/m.gguf',
                mmproj_path: '/mm',
                hardware_backend: null,
            }) // get_setup_paths
            .mockResolvedValueOnce({ recommended_backend: 'cuda' }); // detect_hardware
        const { result } = renderHook(() => useSetupCheck());
        await waitFor(() => expect(result.current.isComplete).toBe(true));
        expect(readSetting('hardwareBackend')).toBe('cuda');
    });

    it('reports incomplete when the invoke throws', async () => {
        invoke.mockRejectedValueOnce(new Error('no backend'));
        const { result } = renderHook(() => useSetupCheck());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.isComplete).toBe(false);
    });

    it('requestSetupRerun sets the flag and clearSetupRerun removes it', () => {
        // requestSetupRerun reloads — stub it.
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...window.location, reload: vi.fn() },
        });
        act(() => requestSetupRerun());
        expect(localStorage.getItem(FORCE_SETUP_KEY)).toBe('1');
        clearSetupRerun();
        expect(localStorage.getItem(FORCE_SETUP_KEY)).toBeNull();
    });
});

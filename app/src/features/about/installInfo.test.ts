import { describe, it, expect } from 'vitest';
import {
    osLabel,
    buildLabel,
    graphicsLabel,
    buildDiagnostics,
    formatDiagnostics,
    type InstallInfo,
} from './installInfo';
import type { HardwareInfo } from '../setup/types';

const install = (over: Partial<InstallInfo> = {}): InstallInfo => ({
    os: 'windows',
    arch: 'x86_64',
    data_dir: 'C:\\Users\\a\\AppData\\Roaming\\com.aidenpaleczny.anchor',
    ...over,
});

const hw = (over: Partial<HardwareInfo> = {}): HardwareInfo => ({
    gpu_name: 'NVIDIA GeForce RTX 4070',
    gpu_vendor: 'NVIDIA',
    vram_mb: 12288,
    ram_mb: 32768,
    recommended_backend: 'cuda',
    os: 'windows',
    available_backends: ['cuda', 'cpu'],
    ...over,
});

describe('osLabel', () => {
    it('maps platform and architecture to friendly names', () => {
        expect(osLabel(install())).toBe('Windows · 64-bit (x86-64)');
        expect(osLabel(install({ os: 'macos', arch: 'aarch64' }))).toBe('macOS · 64-bit (ARM)');
    });

    it('passes unrecognized values straight through rather than dropping them', () => {
        expect(osLabel(install({ os: 'freebsd', arch: 'riscv64' }))).toBe('freebsd · riscv64');
    });

    it('is Unknown when the probe failed', () => {
        expect(osLabel(null)).toBe('Unknown');
    });
});

describe('buildLabel', () => {
    it('names each build the wizard can install', () => {
        expect(buildLabel('cpu')).toBe('CPU only');
        expect(buildLabel('cuda')).toBe('CUDA (NVIDIA GPU)');
        expect(buildLabel('rocm')).toBe('ROCm (AMD GPU)');
        expect(buildLabel('metal')).toBe('Metal (Apple Silicon)');
    });

    it('is Unknown when setup never persisted a choice', () => {
        expect(buildLabel(null)).toBe('Unknown');
    });
});

describe('graphicsLabel', () => {
    it('reports the card and its VRAM', () => {
        expect(graphicsLabel(hw())).toBe('NVIDIA GeForce RTX 4070 · 12.0 GB');
    });

    it('omits VRAM when the reading was unreliable', () => {
        expect(graphicsLabel(hw({ vram_mb: null }))).toBe('NVIDIA GeForce RTX 4070');
    });

    it('distinguishes "probed, found nothing" from "probe failed"', () => {
        expect(graphicsLabel(hw({ gpu_name: null }))).toBe('None detected');
        expect(graphicsLabel(null)).toBe('Unknown');
    });
});

describe('buildDiagnostics', () => {
    const full = {
        version: '0.2.0',
        install: install(),
        hardware: hw(),
        backend: 'cuda' as const,
        modelPath: 'C:\\Users\\a\\AppData\\Roaming\\com.aidenpaleczny.anchor\\models\\Qwen3.5-4B-Q4_K_M.gguf',
    };

    it('reports every field when everything probed successfully', () => {
        const byLabel = Object.fromEntries(buildDiagnostics(full).map((f) => [f.label, f.value]));
        expect(byLabel).toMatchObject({
            Version: 'Anchor 0.2.0',
            System: 'Windows · 64-bit (x86-64)',
            'Installed build': 'CUDA (NVIDIA GPU)',
            Graphics: 'NVIDIA GeForce RTX 4070 · 12.0 GB',
            'System memory': '32.0 GB',
            Model: 'Qwen3.5-4B-Q4_K_M.gguf',
            'Data folder': full.install.data_dir,
        });
    });

    it('keeps the installed build and the detected card as separate rows', () => {
        // A CUDA build on an AMD machine runs at CPU speed. Neither row alone
        // shows that; side by side they do.
        const byLabel = Object.fromEntries(
            buildDiagnostics({
                ...full,
                hardware: hw({ gpu_name: 'AMD Radeon RX 7800', gpu_vendor: 'AMD', vram_mb: null }),
            }).map((f) => [f.label, f.value]),
        );
        expect(byLabel['Installed build']).toBe('CUDA (NVIDIA GPU)');
        expect(byLabel.Graphics).toBe('AMD Radeon RX 7800');
    });

    it('marks only the hardware rows as pending while the GPU probe runs', () => {
        const fields = buildDiagnostics({ ...full, hardware: null, hardwarePending: true });
        const byLabel = Object.fromEntries(fields.map((f) => [f.label, f.value]));
        expect(byLabel.Graphics).toBe('Detecting…');
        expect(byLabel['System memory']).toBe('Detecting…');
        // The fast facts are already known and must not be held back with them.
        expect(byLabel.Version).toBe('Anchor 0.2.0');
        expect(byLabel['Installed build']).toBe('CUDA (NVIDIA GPU)');
    });

    it('keeps the row set stable across the pending → resolved transition', () => {
        // Otherwise the panel reflows under the reader when the probe lands.
        const pending = buildDiagnostics({ ...full, hardware: null, hardwarePending: true });
        const resolved = buildDiagnostics(full);
        expect(pending.map((f) => f.label)).toEqual(resolved.map((f) => f.label));
    });

    it('reduces the model path to its filename', () => {
        const posix = buildDiagnostics({ ...full, modelPath: '/Users/a/models/custom.gguf' });
        expect(posix.find((f) => f.label === 'Model')?.value).toBe('custom.gguf');
    });

    it('never emits a blank value when every probe failed', () => {
        const fields = buildDiagnostics({
            version: null,
            install: null,
            hardware: null,
            backend: null,
            modelPath: null,
        });
        expect(fields.every((f) => f.value.trim().length > 0)).toBe(true);
        expect(fields.map((f) => f.label)).toEqual([
            'Version',
            'System',
            'Installed build',
            'Graphics',
            'Model',
        ]);
    });

    it('drops the memory and data-folder rows only when their probe is missing', () => {
        const noHardware = buildDiagnostics({ ...full, hardware: null }).map((f) => f.label);
        expect(noHardware).not.toContain('System memory');
        expect(noHardware).toContain('Data folder');
    });
});

describe('formatDiagnostics', () => {
    it('renders one label: value per line, matching what is on screen', () => {
        const text = formatDiagnostics([
            { label: 'Version', value: 'Anchor 0.2.0' },
            { label: 'Installed build', value: 'CUDA (NVIDIA GPU)' },
        ]);
        expect(text).toBe('Version: Anchor 0.2.0\nInstalled build: CUDA (NVIDIA GPU)');
    });
});

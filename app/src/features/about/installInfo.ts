// Presentation logic for the About screen's "This install" panel. Kept pure and
// out of the component so the label/fallback rules are testable without a DOM —
// this is the block users paste into bug reports, so a silently wrong or blank
// field here costs a round-trip with whoever is debugging.

import { BACKEND_LABEL } from '../setup/backend';
import type { Backend, HardwareInfo } from '../setup/types';

/** Mirrors `InstallInfo` in src-tauri/src/install.rs. */
export interface InstallInfo {
    os: string;
    arch: string;
    data_dir: string;
}

/** Shown when a value couldn't be probed. Deliberately not blank: an empty row
 *  in a pasted report is ambiguous between "not detected" and "not included". */
const UNKNOWN = 'Unknown';

const OS_LABEL: Record<string, string> = {
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
};

const ARCH_LABEL: Record<string, string> = {
    x86_64: '64-bit (x86-64)',
    aarch64: '64-bit (ARM)',
};

export function osLabel(install: InstallInfo | null): string {
    if (!install) return UNKNOWN;
    const os = OS_LABEL[install.os] ?? install.os;
    const arch = ARCH_LABEL[install.arch] ?? install.arch;
    return `${os} · ${arch}`;
}

/**
 * Which build the setup wizard installed — the app's real "install type", since
 * cpu / cuda / rocm / metal are separate downloads chosen during setup, not
 * modes toggled at runtime. Sourced from what the wizard persisted rather than
 * probed, so it reports what is actually on disk even when the hardware since
 * changed (a card pulled, an eGPU unplugged, a disk moved to another machine).
 */
export function buildLabel(backend: Backend | null): string {
    return backend ? BACKEND_LABEL[backend] : UNKNOWN;
}

/** The GPU currently in the machine, which is a separate fact from the build
 *  above — the two disagreeing is exactly the case worth seeing (see
 *  `backendWarning`, which spells that mismatch out under the panel). */
export function graphicsLabel(hardware: HardwareInfo | null): string {
    if (!hardware) return UNKNOWN;
    if (!hardware.gpu_name) return 'None detected';
    const vram = hardware.vram_mb != null ? ` · ${(hardware.vram_mb / 1024).toFixed(1)} GB` : '';
    return `${hardware.gpu_name}${vram}`;
}

export interface DiagnosticField {
    label: string;
    value: string;
    /** Long paths render in a monospace, wrapping style rather than inline. */
    mono?: boolean;
}

/** Placeholder for the one probe slow enough to be worth waiting on visibly. */
const PENDING = 'Detecting…';

export interface DiagnosticsInput {
    version: string | null;
    install: InstallInfo | null;
    hardware: HardwareInfo | null;
    backend: Backend | null;
    modelPath: string | null;
    /** True while the GPU probe is still running. Its rows are rendered as
     *  `Detecting…` rather than omitted, so the panel doesn't reflow under the
     *  reader when the probe lands. */
    hardwarePending?: boolean;
}

/** The rows shown in the panel *and* copied to the clipboard — one source, so
 *  what a user reads is exactly what they paste. */
export function buildDiagnostics({
    version,
    install,
    hardware,
    backend,
    modelPath,
    hardwarePending = false,
}: DiagnosticsInput): DiagnosticField[] {
    const fields: DiagnosticField[] = [
        { label: 'Version', value: version ? `Anchor ${version}` : UNKNOWN },
        { label: 'System', value: osLabel(install) },
        { label: 'Installed build', value: buildLabel(backend) },
        { label: 'Graphics', value: hardwarePending ? PENDING : graphicsLabel(hardware) },
    ];

    if (hardware || hardwarePending) {
        fields.push({
            label: 'System memory',
            value: hardware ? `${(hardware.ram_mb / 1024).toFixed(1)} GB` : PENDING,
        });
    }
    // Basename only: the directory is already shown as "Data folder", and the
    // filename is the part that identifies which model is loaded.
    fields.push({
        label: 'Model',
        value: modelPath ? modelPath.split(/[\\/]/).pop() || UNKNOWN : UNKNOWN,
    });
    if (install) {
        fields.push({ label: 'Data folder', value: install.data_dir, mono: true });
    }
    return fields;
}

/** Plain-text rendering of the panel, for pasting into an issue or an email. */
export function formatDiagnostics(fields: DiagnosticField[]): string {
    return fields.map(({ label, value }) => `${label}: ${value}`).join('\n');
}

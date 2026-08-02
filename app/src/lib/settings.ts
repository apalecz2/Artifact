// Allowed values for the constrained (non-free-text) settings. The union types are
// derived from these arrays so the type and its runtime validator can never drift
// apart — add a value in one place and both the type and validation pick it up.
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const HARDWARE_BACKENDS = ['cpu', 'cuda', 'rocm', 'metal'] as const;
export type HardwareBackend = (typeof HARDWARE_BACKENDS)[number];

// No `llamaServerPath`: `llama.rs` resolves the binary from the canonical AppData
// layout itself (`resolve_llama_server_path`) and never consults a setting, so a
// stored path could only ever disagree with the one actually launched. The model
// paths *are* read — llamaClient passes them to the server, and Settings lets
// them be overridden — which is why those stay.
interface SettingsSchema {
    theme: Theme;
    modelPath: string;
    mmprojPath: string;
    ocrLanguage: string;
    hardwareBackend: HardwareBackend;
}

// 'theme' key is shared with AppLayout.tsx's dark-mode toggle
const STORAGE_KEYS: Record<keyof SettingsSchema, string> = {
    theme: 'theme',
    modelPath: 'model_path',
    mmprojPath: 'mmproj_path',
    ocrLanguage: 'ocr_language',
    hardwareBackend: 'hardware_backend',
};

const DEFAULTS: SettingsSchema = {
    theme: 'dark',
    modelPath: '',
    mmprojPath: '',
    ocrLanguage: 'eng',
    hardwareBackend: 'cpu',
};

// Runtime validators for keys whose value set is constrained. A stored value that
// fails validation — corrupt, hand-edited, or left over from an incompatible build
// — falls back to the default instead of flowing through as a bogusly-typed union
// member (e.g. a stray `hardware_backend` that no llama build matches). Free-text
// keys (paths, language) accept any string, so they need no validator.
const VALIDATORS: Partial<Record<keyof SettingsSchema, (value: string) => boolean>> = {
    theme: (value) => (THEMES as readonly string[]).includes(value),
    hardwareBackend: (value) => (HARDWARE_BACKENDS as readonly string[]).includes(value),
};

export function readSetting<K extends keyof SettingsSchema>(key: K): SettingsSchema[K] {
    const value = localStorage.getItem(STORAGE_KEYS[key]);
    if (value === null) return DEFAULTS[key];
    const validate = VALIDATORS[key];
    if (validate && !validate(value)) return DEFAULTS[key];
    return value as SettingsSchema[K];
}

/** Whether a key has ever been explicitly written for this origin. Distinct from
 *  `readSetting`, which always returns a value (the default) and so can't tell
 *  "never set" from "set to the default" — needed for `hardwareBackend`, whose
 *  default (`cpu`) must not mask a missing value that should be healed from disk. */
export function hasSetting(key: keyof SettingsSchema): boolean {
    return localStorage.getItem(STORAGE_KEYS[key]) !== null;
}

export function writeSetting<K extends keyof SettingsSchema>(key: K, value: SettingsSchema[K]): void {
    localStorage.setItem(STORAGE_KEYS[key], value);
}

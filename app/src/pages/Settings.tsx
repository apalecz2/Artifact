import React, { useState } from 'react';
import { Link } from 'react-router';
import { readSetting, writeSetting, type Theme } from '../lib/settings';
import { eulaAcceptedAt } from '../features/legal/eulaAcceptance';
import { useTheme } from '../hooks/useTheme';
import { requestSetupRerun } from '../features/setup/useSetupCheck';
import { deleteAllSessions } from '../features/sessions/sessionActions';
import ConfirmDialog from '../components/ConfirmDialog';
import Icon from '../components/Icon';
import PageContainer from '../components/PageContainer';
import Section from '../components/PageSection';

/** Label/description on the left, control on the right. Below `sm` the control
 *  drops onto its own line instead of competing with the text for width: at the
 *  narrow end the app supports, a side-by-side row squeezes the description to
 *  one word per line long before the control stops fitting.
 *
 *  `items-start` is load-bearing once stacked: a column flex container stretches
 *  its children to full width, which pulls a control's own border (the theme
 *  toggle's, say) out to the row edge while the buttons inside it stay
 *  content-width. Controls must size to their content in both directions. */
function SettingRow({ label, description, children }: {
    label: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-8 px-5 py-4">
            {/* The text block is the one child that *should* span the row when
                stacked, so it opts back in explicitly. */}
            <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                <p className="font-body-md text-body-md text-on-surface font-medium">{label}</p>
                {description && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{description}</p>
                )}
            </div>
            <div className="sm:shrink-0">{children}</div>
        </div>
    );
}

function PathField({ label, hint, value, onChange, onBrowse, disabled = false }: {
    label: string;
    hint?: string;
    value: string;
    onChange: (v: string) => void;
    onBrowse: () => void;
    disabled?: boolean;
}) {
    return (
        <div className={`flex flex-col gap-1.5 transition-opacity ${disabled ? 'opacity-40 pointer-events-none select-none' : ''}`}>
            <label className="font-label-md text-label-md text-on-surface">{label}</label>
            {hint && <p className="font-body-sm text-body-sm text-on-surface-variant -mt-0.5">{hint}</p>}
            {/* Stacks below `sm`: side by side, the path field shrinks past the
                point where any of the path is readable before Browse gives way. */}
            <div className="flex flex-col sm:flex-row gap-2 mt-0.5">
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Leave blank to use the model installed by setup"
                    disabled={disabled}
                    className="min-w-0 sm:flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
                />
                <button
                    type="button"
                    onClick={onBrowse}
                    disabled={disabled}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container hover:bg-surface-container-high font-label-md text-label-md text-on-surface-variant transition-colors shrink-0"
                >
                    <Icon name="folder_open" size={16} />
                    Browse
                </button>
            </div>
        </div>
    );
}

export default function Settings(): React.ReactElement {
    const [theme, setTheme] = useTheme();

    const [modelPath, setModelPath] = useState(() => readSetting('modelPath'));
    const [mmprojPath, setMmprojPath] = useState(() => readSetting('mmprojPath'));
    const [pathsSaved, setPathsSaved] = useState(false);

    const acceptedAt = eulaAcceptedAt();

    const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteResult, setDeleteResult] = useState<string | null>(null);

    const browseForGguf = async (setter: (path: string) => void) => {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const result = await open({
            filters: [{ name: 'GGUF Model', extensions: ['gguf'] }],
            multiple: false,
        });
        if (typeof result === 'string') {
            setter(result);
            setPathsSaved(false);
        }
    };

    const savePaths = () => {
        writeSetting('modelPath', modelPath);
        writeSetting('mmprojPath', mmprojPath);
        setPathsSaved(true);
    };

    const handleDeleteAllSessions = async () => {
        setConfirmDeleteAll(false);
        setDeleting(true);
        setDeleteResult(null);
        try {
            const count = await deleteAllSessions();
            setDeleteResult(
                count === 0
                    ? 'No sessions to delete.'
                    : `Deleted ${count} session${count === 1 ? '' : 's'}.`,
            );
        } catch (error) {
            console.error('Failed to delete all sessions:', error);
            setDeleteResult('Something went wrong while deleting sessions.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <PageContainer
                title="Settings"
                description="Configure Anchor's appearance, AI model paths, and setup."
            >

                {/* ── Appearance ── */}
                <Section title="Appearance">
                    <div className="rounded-[10px] border border-outline-variant bg-surface-container divide-y divide-outline-variant">
                        <SettingRow label="Theme" description="Choose light or dark mode for the interface.">
                            <div className="flex rounded-lg border border-outline-variant overflow-hidden">
                                {(['light', 'dark'] as Theme[]).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setTheme(t)}
                                        className={`flex items-center gap-1.5 px-4 py-2 font-label-md text-label-md transition-colors ${
                                            theme === t
                                                ? 'bg-primary text-on-primary'
                                                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                                        }`}
                                    >
                                        <Icon name={t === 'light' ? 'light_mode' : 'dark_mode'} size={16} />
                                        {t === 'light' ? 'Light' : 'Dark'}
                                    </button>
                                ))}
                            </div>
                        </SettingRow>
                    </div>
                </Section>

                {/* ── AI Model ── */}
                <Section
                    title="AI model"
                    description="Override the model paths installed by setup. Leave blank to use the downloaded model. Saved paths take effect on next server start."
                    comingSoon
                >
                    <div className="rounded-[10px] border border-outline-variant bg-surface-container p-6 flex flex-col gap-6">
                        <PathField
                            label="Model path"
                            hint="GGUF model file (e.g. Qwen3.5-4B-Q4_K_M.gguf)"
                            value={modelPath}
                            onChange={(v) => { setModelPath(v); setPathsSaved(false); }}
                            onBrowse={() => browseForGguf(setModelPath)}
                        />
                        <PathField
                            label="Multimodal projector path"
                            hint="mmproj GGUF file — required for the vision pipeline"
                            value={mmprojPath}
                            onChange={(v) => { setMmprojPath(v); setPathsSaved(false); }}
                            onBrowse={() => browseForGguf(setMmprojPath)}
                        />
                        <div className="flex items-center gap-3 pt-1 border-t border-outline-variant">
                            <button
                                type="button"
                                onClick={savePaths}
                                className="mt-4 px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary/90 transition-colors"
                            >
                                Save paths
                            </button>
                            {pathsSaved && (
                                <span className="mt-4 flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                                    <Icon name="check_circle" size={16} fill={1} className="text-primary" />
                                    Saved
                                </span>
                            )}
                        </div>
                    </div>
                </Section>

                {/* ── OCR ── */}
                <Section title="OCR" description="Optical character recognition settings." comingSoon>
                    <div className="rounded-[10px] border border-outline-variant bg-surface-container divide-y divide-outline-variant">
                        <SettingRow
                            label="Language"
                            description="This version recognizes English only. Other languages are not yet supported."
                        >
                            <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-outline-variant bg-surface font-label-md text-label-md text-on-surface-variant">
                                <Icon name="translate" size={14} />
                                English only
                            </span>
                        </SettingRow>
                    </div>
                </Section>

                {/* ── Setup ── */}
                <Section
                    title="Setup"
                    description="Re-run the first-run wizard to re-verify or repair the downloaded engine, model, and libraries. Assets you already have are skipped, so this is safe to run any time something seems missing."
                >
                    <div className="rounded-[10px] border border-outline-variant bg-surface-container divide-y divide-outline-variant">
                        <SettingRow
                            label="Re-run setup wizard"
                            description="Re-checks every component and reinstalls anything missing or corrupt."
                        >
                            <button
                                type="button"
                                onClick={requestSetupRerun}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-outline-variant bg-surface-container hover:bg-surface-container-high font-label-md text-label-md text-on-surface transition-colors"
                            >
                                <Icon name="restart_alt" size={16} />
                                Re-run setup
                            </button>
                        </SettingRow>
                    </div>
                </Section>

                {/* ── Data ── */}
                <Section
                    title="Data"
                    description="Manage the extraction data stored on this device."
                >
                    <div className="rounded-[10px] border border-error/40 bg-surface-container divide-y divide-outline-variant">
                        <SettingRow
                            label="Delete all sessions"
                            description="Permanently removes every session and related data from this device. Your original attached files and any outputs you saved elsewhere are left untouched. This cannot be undone."
                        >
                            <div className="flex flex-wrap items-center gap-3">
                                {deleteResult && (
                                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                                        {deleteResult}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => { setDeleteResult(null); setConfirmDeleteAll(true); }}
                                    disabled={deleting}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-error text-on-error font-label-md text-label-md hover:bg-error/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    <Icon name="delete_forever" size={16} />
                                    {deleting ? 'Deleting…' : 'Delete all'}
                                </button>
                            </div>
                        </SettingRow>
                    </div>
                </Section>

                {/* ── Legal ── */}
                <Section
                    title="Legal"
                    description="Anchor's terms, privacy policy, and the licenses of the components it's built with."
                >
                    <div className="rounded-[10px] border border-outline-variant bg-surface-container divide-y divide-outline-variant">
                        {[
                            { to: '/legal/privacy', icon: 'shield', label: 'Privacy Policy' },
                            { to: '/legal/terms', icon: 'gavel', label: 'Terms of Use & EULA' },
                            { to: '/legal/notices', icon: 'balance', label: 'Licenses & Notices' },
                        ].map(({ to, icon, label }) => (
                            <Link
                                key={to}
                                to={to}
                                className="flex items-center gap-3 px-5 py-4 hover:bg-surface-container-high transition-colors no-underline"
                            >
                                <Icon name={icon} size={18} className="text-primary shrink-0" />
                                <span className="min-w-0 flex-1 font-body-md text-body-md text-on-surface font-medium">{label}</span>
                                <Icon name="chevron_right" size={20} className="text-on-surface-variant shrink-0" />
                            </Link>
                        ))}
                    </div>
                    {acceptedAt && (
                        <p className="font-body-sm text-body-sm text-on-surface-variant px-1">
                            You accepted the current Terms &amp; Privacy Policy on {new Date(acceptedAt).toLocaleDateString()}.
                        </p>
                    )}
                </Section>

                <p className="font-body-sm text-body-sm text-on-surface-variant/40 text-center pb-2">
                    <Link to="/about" className="text-inherit no-underline hover:text-on-surface-variant transition-colors">
                        About Anchor &amp; version
                    </Link>
                </p>

            </PageContainer>

            <ConfirmDialog
                open={confirmDeleteAll}
                title="Delete all sessions?"
                description="This permanently deletes every session and the data Anchor has copied for itself. It only touches the app's own data — your original attached files and any outputs you saved elsewhere are left untouched. This cannot be undone."
                confirmLabel="Delete all"
                onConfirm={handleDeleteAllSessions}
                onCancel={() => setConfirmDeleteAll(false)}
            />
        </>
    );
}

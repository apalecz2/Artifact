import React, { useState } from 'react';
import Icon from '../../components/Icon';
import type { HardwareInfo, SetupConfig, SetupMode, SetupStep } from './types';
import WelcomeStep from './steps/WelcomeStep';
import TermsStep from './steps/TermsStep';
import ConfigStep from './steps/ConfigStep';
import DownloadStep from './steps/DownloadStep';
import CompleteStep from './steps/CompleteStep';

interface Props {
    /** False when the user has not accepted the current EULA version, which adds the
     *  Terms step to the run. Owned by App so it can gate the app itself. */
    eulaAccepted: boolean;
    /** Records acceptance (version + timestamp). */
    onAcceptEula: () => void;
    /** False when the assets are already installed and this run exists only to
     *  collect consent for a bumped EULA — then Terms is the whole wizard. */
    installNeeded: boolean;
    onComplete: () => void;
}

const STEP_LABELS: Record<SetupStep, string> = {
    welcome:  'Welcome',
    terms:    'Terms',
    config:   'Configure',
    install:  'Install',
    complete: 'Complete',
};

// The consent gate is a step of this wizard rather than a separate screen, so the
// user sees one numbered list from launch to launch — but it must stay *ahead* of
// `install`, since acceptance is required before anything is downloaded or run.
// Automatic setup skips Configure, and an already-accepted EULA skips Terms, so the
// progress bar reflects whichever path this run actually takes. Download + verify +
// install are a single step (the hash is checked during the download, so there's no
// separate pass).
function stepsFor(mode: SetupMode, needsEula: boolean, needsInstall: boolean): SetupStep[] {
    if (!needsInstall) return ['terms'];
    const steps: SetupStep[] = ['welcome'];
    if (needsEula) steps.push('terms');
    if (mode === 'custom') steps.push('config');
    return [...steps, 'install', 'complete'];
}

export default function SetupWizard({ eulaAccepted, onAcceptEula, installNeeded, onComplete }: Props): React.ReactElement {
    // Both are frozen at mount: accepting the EULA flips `eulaAccepted` mid-run, and
    // recomputing from it would drop the Terms pill out of the progress bar while the
    // user is still walking the list.
    const [needsEula] = useState(!eulaAccepted);
    const [needsInstall] = useState(installNeeded);

    const [step, setStep] = useState<SetupStep>(needsInstall ? 'welcome' : 'terms');
    const [mode, setMode] = useState<SetupMode>('automatic');
    const [hardware, setHardware] = useState<HardwareInfo | null>(null);
    const [config, setConfig] = useState<SetupConfig | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const stepOrder = stepsFor(mode, needsEula, needsInstall);
    const currentIdx = stepOrder.indexOf(step);

    const handleError = (msg: string) => setErrorMsg(msg);

    // One-click automatic path: take the hardware-recommended backend and jump
    // straight to consent + downloading, skipping the Configure step entirely.
    const startAutomatic = (info: HardwareInfo) => {
        setHardware(info);
        setMode('automatic');
        setConfig({ backend: info.recommended_backend });
        setStep(needsEula ? 'terms' : 'install');
    };

    const startCustom = (info: HardwareInfo) => {
        setHardware(info);
        setMode('custom');
        setStep(needsEula ? 'terms' : 'config');
    };

    const acceptTerms = () => {
        onAcceptEula();
        // Consent-only run: App drops the wizard as soon as acceptance is recorded.
        if (needsInstall) setStep(mode === 'custom' ? 'config' : 'install');
    };

    return (
        <div className="h-full bg-surface flex flex-col">
            {/* Step progress bar — pointless when consent is the only step */}
            {stepOrder.length > 1 && (
            <div className="border-b border-outline-variant bg-surface-container px-8 py-4">
                <div className="max-w-2xl mx-auto flex items-center gap-2">
                    {stepOrder.map((s, idx) => {
                        const done = idx < currentIdx;
                        const active = idx === currentIdx;
                        return (
                            <React.Fragment key={s}>
                                {idx > 0 && (
                                    <div className={`flex-1 h-px ${done ? 'bg-primary' : 'bg-outline-variant'}`} />
                                )}
                                <div className="flex flex-col items-center gap-1 shrink-0">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                                        done  ? 'bg-primary text-on-primary' :
                                        active? 'bg-primary/15 border-2 border-primary text-primary' :
                                                'bg-surface-container-high text-on-surface-variant'
                                    }`}>
                                        {done
                                            ? <Icon name="check" size={14} />
                                            : idx + 1
                                        }
                                    </div>
                                    <span className={`font-label-sm text-label-sm ${active ? 'text-primary' : 'text-on-surface-variant'}`}>
                                        {STEP_LABELS[s]}
                                    </span>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
            )}

            {/* Step content */}
            <div className="flex-1 overflow-y-auto flex items-start justify-center p-8">
                <div className="w-full max-w-2xl">
                    {errorMsg ? (
                        <ErrorView message={errorMsg} onRetry={() => { setErrorMsg(null); setStep('welcome'); }} />
                    ) : (
                        <>
                            {step === 'welcome' && (
                                <WelcomeStep onAutomatic={startAutomatic} onCustom={startCustom} />
                            )}
                            {step === 'terms' && (
                                <TermsStep
                                    onAccept={acceptTerms}
                                    onBack={needsInstall ? () => setStep('welcome') : undefined}
                                />
                            )}
                            {step === 'config' && hardware && (
                                <ConfigStep
                                    hardware={hardware}
                                    onNext={cfg => { setConfig(cfg); setStep('install'); }}
                                    onBack={() => setStep('welcome')}
                                />
                            )}
                            {step === 'install' && config && (
                                <DownloadStep
                                    config={config}
                                    onComplete={() => setStep('complete')}
                                    onError={handleError}
                                    onCancel={() => setStep('welcome')}
                                />
                            )}
                            {step === 'complete' && config && (
                                <CompleteStep backend={config.backend} onLaunch={onComplete} />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }): React.ReactElement {
    return (
        <div className="flex flex-col gap-6 items-center text-center py-8">
            <Icon name="error" size={48} className="text-error" />
            <div>
                <h2 className="font-headline-lg text-headline-lg text-on-surface">Setup failed</h2>
                <p className="font-body-md text-body-md text-on-surface-variant mt-2 max-w-md">{message}</p>
            </div>
            <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary/90 transition-colors"
            >
                <Icon name="refresh" size={18} />
                Start over
            </button>
        </div>
    );
}

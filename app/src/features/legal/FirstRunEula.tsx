import React, { useRef, useState } from 'react';
import Icon from '../../components/Icon';
import Markdown from './Markdown';
import { eulaMarkdown, privacyMarkdown } from './legalContent';

interface Props {
    onAccept: () => void;
}

type Tab = 'terms' | 'privacy';

/**
 * First-run consent gate. Shown before the setup wizard (and therefore before any
 * download or execution of the third-party binaries), it presents the full EULA and
 * Privacy Policy text and requires an explicit "I have read and agree" checkbox plus
 * a Continue click — a clean clickwrap acceptance. The user cannot reach the wizard,
 * or the app, without accepting. Declining quits the app.
 */
export default function FirstRunEula({ onAccept }: Props): React.ReactElement {
    const [tab, setTab] = useState<Tab>('terms');
    const [agreed, setAgreed] = useState(false);
    const [declineHint, setDeclineHint] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const decline = async () => {
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().close();
        } catch {
            // Not in a Tauri window (e.g. plain browser dev): show a hint instead.
            setDeclineHint(true);
        }
    };

    const TabButton = ({ id, label }: { id: Tab; label: string }) => (
        <button
            type="button"
            onClick={() => { setTab(id); scrollRef.current?.scrollTo({ top: 0 }); }}
            aria-pressed={tab === id}
            className={`px-4 py-2 rounded-lg font-label-md text-label-md transition-colors ${
                tab === id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className="h-full bg-surface flex flex-col">
            <div className="border-b border-outline-variant bg-surface-container px-8 py-5">
                <div className="max-w-3xl mx-auto flex flex-col gap-1">
                    <h1 className="font-headline-lg text-headline-lg text-on-surface">Before you begin</h1>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                        Please review and accept the Terms of Use and Privacy Policy to continue.
                        The first-run setup downloads and runs required components only after you agree.
                    </p>
                </div>
            </div>

            <div className="px-8 pt-4">
                <div className="max-w-3xl mx-auto flex gap-2">
                    <TabButton id="terms" label="Terms of Use & EULA" />
                    <TabButton id="privacy" label="Privacy Policy" />
                </div>
            </div>

            <div className="flex-1 overflow-hidden px-8 py-4">
                <div
                    ref={scrollRef}
                    className="max-w-3xl mx-auto h-full overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-low px-6 py-4"
                >
                    <Markdown source={tab === 'terms' ? eulaMarkdown : privacyMarkdown} />
                </div>
            </div>

            <div className="border-t border-outline-variant bg-surface-container px-8 py-5">
                <div className="max-w-3xl mx-auto flex flex-col gap-4">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                            className="mt-1 h-4 w-4 shrink-0 accent-primary"
                        />
                        <span className="font-body-md text-body-md text-on-surface">
                            I have read and agree to the Terms of Use &amp; EULA and the Privacy Policy.
                            I understand that Anchor’s extraction is produced by AI and may be inaccurate,
                            and that I am responsible for verifying results before relying on them.
                        </span>
                    </label>

                    <div className="flex items-center justify-between gap-4">
                        <button
                            type="button"
                            onClick={decline}
                            className="px-5 py-2.5 rounded-lg border border-outline-variant bg-surface-container text-on-surface-variant font-label-lg text-label-lg hover:bg-surface-container-high transition-colors"
                        >
                            Decline &amp; quit
                        </button>
                        <button
                            type="button"
                            disabled={!agreed}
                            onClick={onAccept}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            <Icon name="check" size={18} />
                            Agree &amp; continue
                        </button>
                    </div>
                    {declineHint && (
                        <p className="font-body-sm text-body-sm text-on-surface-variant text-right">
                            You can close the application window to decline.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

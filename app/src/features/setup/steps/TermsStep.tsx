import React, { useRef, useState } from 'react';
import Icon from '../../../components/Icon';
import Markdown from '../../legal/Markdown';
import { eulaMarkdown, privacyMarkdown } from '../../legal/legalContent';
import type { ConsentContext } from '../types';

interface Props {
    /** Which run this is, which decides the heading and what the step may claim about
     *  downloads — see COPY below. */
    context: ConsentContext;
    /** Records acceptance and advances the wizard. */
    onAccept: () => void;
    /** Omitted when this is the only step (a post-update re-consent), where there is
     *  nothing to go back to. */
    onBack?: () => void;
}

type Tab = 'terms' | 'privacy';

/** The lead paragraph is per-context because the "nothing is downloaded until you
 *  agree" assurance is only true on a first install. When the EULA version is bumped
 *  the wizard re-runs as a consent-only step on a machine where the ~3.5 GB of assets
 *  are already downloaded and have already been run, so promising that there would be
 *  a false statement in the middle of the clickwrap. */
const COPY: Record<ConsentContext, { heading: string; body: string }> = {
    'first-install': {
        heading: 'Terms & privacy',
        body: 'Please review and accept the Terms of Use and Privacy Policy to continue. '
            + 'Nothing will be downloaded or installed until you agree.',
    },
    'terms-updated': {
        heading: 'Updated terms & privacy',
        body: 'Anchor’s Terms of Use and Privacy Policy have changed since you last accepted them. '
            + 'Please review and accept the updated terms to keep using Anchor. Anchor is already '
            + 'installed, so accepting only records your consent, and your saved sessions are unaffected.',
    },
    reconsent: {
        heading: 'Terms & privacy',
        body: 'Please review and accept the Terms of Use and Privacy Policy to continue using Anchor. '
            + 'Anchor is already installed, so accepting only records your consent, and your saved '
            + 'sessions are unaffected.',
    },
};

/**
 * Clickwrap consent, as a step of the setup wizard. On a first install it sits between
 * Welcome and the first download, so the user has seen what will be installed but
 * nothing has been fetched or executed yet; after an `EULA_VERSION` bump it re-runs
 * alone against an existing installation. Either way the wizard cannot advance past
 * this step without an explicit "I have read and agree" checkbox plus a Continue click.
 */
export default function TermsStep({ context, onAccept, onBack }: Props): React.ReactElement {
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
        <div className="flex flex-col gap-6">
            <div>
                <h2 className="font-headline-lg text-headline-lg text-on-surface">{COPY[context].heading}</h2>
                <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                    {COPY[context].body}
                </p>
            </div>

            <div className="flex gap-2">
                <TabButton id="terms" label="Terms of Use & EULA" />
                <TabButton id="privacy" label="Privacy Policy" />
            </div>

            {/* Bounded, self-scrolling document pane: the wizard's own content column
                scrolls too, so this has to cap its height rather than use h-full. */}
            <div
                ref={scrollRef}
                className="max-h-[48vh] overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-low px-6 py-4"
            >
                <Markdown source={tab === 'terms' ? eulaMarkdown : privacyMarkdown} />
            </div>

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
                {onBack ? (
                    <button
                        type="button"
                        onClick={onBack}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-outline-variant bg-surface-container hover:bg-surface-container-high font-label-md text-label-md text-on-surface-variant transition-colors"
                    >
                        <Icon name="arrow_back" size={18} />
                        Back
                    </button>
                ) : <div />}

                <div className="flex items-center gap-3">
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
            </div>

            {declineHint && (
                <p className="font-body-sm text-body-sm text-on-surface-variant text-right">
                    You can close the application window to decline.
                </p>
            )}
        </div>
    );
}

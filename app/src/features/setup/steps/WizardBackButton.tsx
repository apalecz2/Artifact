import React from 'react';
import Icon from '../../../components/Icon';

/**
 * The wizard's "go back one step" control, shared by every step that has a step
 * to go back to.
 *
 * Distinct from `SetupWizard`'s own *Back to Anchor* button, which leaves the
 * wizard entirely: this one walks the step list, so it is styled as an ordinary
 * secondary action sitting opposite the step's primary one, and the two can
 * appear on the same screen during a re-run.
 */
export default function WizardBackButton({ onBack }: { onBack: () => void }): React.ReactElement {
    return (
        <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-outline-variant bg-surface-container hover:bg-surface-container-high font-label-md text-label-md text-on-surface-variant transition-colors"
        >
            <Icon name="arrow_back" size={18} />
            Back
        </button>
    );
}

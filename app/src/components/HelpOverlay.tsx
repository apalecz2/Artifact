import React from 'react';
import Icon from './Icon';
import { Modal } from './Modal';

// A single help tip: a leading icon (mirroring the matching toolbar control) with a
// short title and description.
export function HelpItem({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }): React.ReactElement {
    return (
        <div className="flex gap-3">
            <Icon name={icon} size={20} className="mt-0.5 shrink-0 text-primary" />
            <div>
                <p className="font-medium text-on-surface">{title}</p>
                <p className="text-on-surface-variant">{children}</p>
            </div>
        </div>
    );
}

// Modal help overlay. Portals to <body> and stays `fixed` so a `container-type`
// ancestor (the @container panes) can't clip or mis-anchor it; closes on backdrop
// click or Escape via the shared Modal/useDialogA11y scaffolding.
//
// `bounds` (from useElementBounds on the calling pane's own container) scopes the
// dimmed backdrop — and therefore the centered panel — to that pane's footprint
// instead of the whole app window, so "Source" help centers over the source pane
// and "Output" help centers over the output pane. Falls back to full-viewport
// centering if bounds aren't available yet.
export function HelpOverlay({ title, onClose, children, bounds }: { title: string; onClose: () => void; children: React.ReactNode; bounds?: DOMRect | null }): React.ReactElement {
    const backdropStyle: React.CSSProperties | undefined = bounds
        ? { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height }
        : undefined;

    return (
        <Modal
            open
            onClose={onClose}
            portal
            labelledBy="help-overlay-title"
            backdropClassName={`fixed z-50 flex items-center justify-center bg-black/50 p-4 ${bounds ? '' : 'inset-0'}`}
            backdropStyle={backdropStyle}
            className="flex max-h-[85%] w-full max-w-lg flex-col rounded-2xl border border-outline-variant bg-surface-bright shadow-xl focus:outline-none"
        >
            <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
                <h2 id="help-overlay-title" className="flex items-center gap-2 text-lg font-bold text-primary">
                    <Icon name="info" size={22} />
                    {title}
                </h2>
                <button
                    onClick={onClose}
                    aria-label="Close help"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                    <Icon name="close" size={20} />
                </button>
            </div>
            <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm">
                {children}
            </div>
        </Modal>
    );
}

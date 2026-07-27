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
// The backdrop spans the full viewport and both dims and blurs everything behind
// it — the whole app window, sidebar included — so the help panel reads as modal
// over the application rather than over one pane. The panel itself is centered on
// that same viewport, so both panes' help opens in the same place.
//
// z-60 clears the sidebar (z-40) and its collapse toggle (z-50), which are fixed
// siblings in the root stacking context; z-50 alone would only win on tree order.
export function HelpOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): React.ReactElement {
    return (
        <Modal
            open
            onClose={onClose}
            portal
            labelledBy="help-overlay-title"
            backdropClassName="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
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

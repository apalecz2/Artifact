import React from 'react';
import Icon from './Icon';

/**
 * A titled block inside `PageContainer`. Shared by Settings and About so their
 * headings, spacing, and "Coming soon" treatment stay identical.
 *
 * `comingSoon` dims and disables the body rather than hiding it: the point is to
 * show what the setting will be, while making it unusable and unfocusable
 * (`pointer-events-none` alone still leaves children in the tab order, hence
 * `aria-disabled` on the wrapper).
 */
export default function PageSection({ title, description, comingSoon = false, children }: {
    title: string;
    description?: string;
    comingSoon?: boolean;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <section className="flex flex-col gap-4">
            <div>
                {/* Wraps so the chip drops below the title instead of squeezing it. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h2 className="font-headline-lg text-headline-lg text-on-surface">{title}</h2>
                    {comingSoon && (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-outline-variant bg-surface-container-high font-label-sm text-label-sm text-on-surface-variant">
                            <Icon name="schedule" size={14} />
                            Coming soon
                        </span>
                    )}
                </div>
                {description && (
                    <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-2xl">{description}</p>
                )}
            </div>
            {comingSoon ? (
                <div className="opacity-40 pointer-events-none select-none" aria-disabled="true">
                    {children}
                </div>
            ) : (
                children
            )}
        </section>
    );
}

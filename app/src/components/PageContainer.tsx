import React from 'react';

/**
 * The shell every full-page settings-style screen sits in (Settings, About).
 *
 * It exists so those pages can't drift apart: width, gutters, vertical rhythm,
 * and the hero treatment are defined once here rather than copied per page,
 * which is how Settings ended up 4xl-wide while About was 3xl.
 *
 * Sizing notes:
 * - `absolute inset-0` (never `h-screen`) because AppShell owns viewport height;
 *   a full-height child would overflow by the title bar's height.
 * - Gutters step 20px → 32px → the 40px page margin token. The flat token alone
 *   ate a quarter of the width on a narrow window, and the app's own minimum
 *   window width leaves roughly 250 CSS px at maximum zoom, so the small end
 *   has to be genuinely small.
 * - `max-w-3xl` over 4xl: these pages are label/value rows and prose, both of
 *   which read worse across a wider measure.
 */
export default function PageContainer({ title, description, children }: {
    title: string;
    description?: string;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <main className="absolute inset-0 overflow-y-auto bg-surface">
            {/* Atmospheric background, matches Dashboard */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(circle_at_top,var(--tw-gradient-stops))] from-primary via-transparent to-transparent" />

            <div className="relative z-10 max-w-3xl mx-auto px-5 sm:px-8 lg:px-[--spacing-margin-page] py-10 sm:py-16 flex flex-col gap-12 sm:gap-16">
                <section className="flex flex-col gap-3">
                    {/* 3rem display type overflows a narrow window; drop a step below sm. */}
                    <h1 className="font-display-lg text-4xl sm:text-display-lg text-primary tracking-tight wrap-break-word">
                        {title}
                    </h1>
                    {description && (
                        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
                            {description}
                        </p>
                    )}
                </section>

                {children}
            </div>
        </main>
    );
}

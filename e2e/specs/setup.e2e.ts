import { browser, $, $$, expect } from '@wdio/globals';

// TEST_PLAN §7 journey 1: First-run setup — automatic.
// Requires a fresh AppData and ANCHOR_R2_BASE pointing at the local fixture
// asset server (small stand-in binaries/models with known SHA-256), so the wizard
// runs end to end without 3.5 GB of real downloads.
describe('First-run setup — automatic', () => {
    it('runs the wizard to completion and loads the main app', async () => {
        // Welcome step is shown on a fresh install.
        const welcome = await $('h1*=Welcome, h2*=Welcome, *=Get started');
        await expect(welcome).toBeExisting();

        // Choose the one-click Automatic path.
        const automatic = await $('button*=Automatic');
        await automatic.click();

        // Consent comes next, before anything is downloaded — the automatic path skips
        // Configure but never skips this. This step used to be missing from the journey,
        // which meant the spec described a first run that cannot happen. The gate itself
        // is asserted in the suite below.
        const agree = await $('button*=Agree');
        await agree.waitForExist({ timeout: 20_000 });
        await (await $('input[type="checkbox"]')).click();
        await agree.click();

        // Install step: the overall progress bar advances against the fixture server.
        const progress = await $('[role="progressbar"], progress');
        await progress.waitForExist({ timeout: 20_000 });
        await expect(progress).toBeExisting();

        // Wait for the Complete step (generous: fixture assets are tiny).
        const launch = await $('button*=Launch');
        await launch.waitForExist({ timeout: 120_000 });
        await launch.click();

        // Main app loaded — the upload/dashboard surface is visible.
        const dashboard = await $('*=Upload, *=Drop, *=New session');
        await expect(dashboard).toBeExisting();
    });
});

// The consent gate is the one behaviour where a regression is a compliance failure
// rather than a bug: acceptance must be recorded before any of the ~3.5 GB of
// third-party binaries is fetched or executed. `SetupWizard.dom.test.tsx` covers the
// step ordering in isolation; this covers it against the real built app, where that
// ordering is what actually keeps the downloader from starting.
//
// Requires a FRESH AppData (no consent.json) and cleared webview storage, so the app
// boots into a genuine first run. Run this spec before the journey above, or reset
// state between them.
describe('Consent gate', () => {
    it('shows the terms before the download step, with Continue disabled until agreed', async () => {
        const automatic = await $('button*=Automatic');
        await automatic.waitForExist({ timeout: 20_000 });
        await automatic.click();

        // Both documents are presented, and the AI-output disclaimer is restated in the
        // checkbox label rather than only being incorporated by reference.
        await expect(await $('button*=Terms of Use')).toBeExisting();
        await expect(await $('button*=Privacy Policy')).toBeExisting();
        await expect(await $('*=produced by AI')).toBeExisting();

        // Nothing may have started yet.
        await expect(await $$('[role="progressbar"], progress')).toBeElementsArrayOfSize(0);

        // Continue is inert until the box is ticked — clicking it must not advance.
        const agree = await $('button*=Agree');
        await expect(agree).toBeDisabled();
        await agree.click();
        await expect(await $$('[role="progressbar"], progress')).toBeElementsArrayOfSize(0);

        // Ticking it enables the button, and only then does the download begin.
        await (await $('input[type="checkbox"]')).click();
        await expect(agree).toBeEnabled();
        await agree.click();

        const progress = await $('[role="progressbar"], progress');
        await progress.waitForExist({ timeout: 20_000 });
    });

    it('survives webview storage being cleared, via the AppData consent record', async () => {
        // Acceptance was recorded by the test above. Wipe only the webview copy —
        // consent.json in AppData is untouched — and reload: the record should heal
        // localStorage and the gate should not reappear. See eulaAcceptance.ts.
        await browser.execute(() => window.localStorage.removeItem('eula_accepted_version'));
        await browser.refresh();

        // The app holds a spinner over the async heal rather than flashing the prompt.
        await browser.pause(2_000);
        await expect(await $$('input[type="checkbox"]')).toBeElementsArrayOfSize(0);
        await expect(await $$('button*=Agree')).toBeElementsArrayOfSize(0);
    });
});

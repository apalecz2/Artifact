import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invoke = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import TermsStep from './TermsStep';
import SetupWizard from '../SetupWizard';
import { EULA_VERSION } from '../../legal/legalContent';

const noop = () => {};

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

describe('TermsStep copy', () => {
    it('promises that nothing is downloaded yet only on a first install', () => {
        render(<TermsStep context="first-install" onAccept={noop} onBack={noop} />);
        expect(screen.getByText(/Nothing will be downloaded or installed until you agree/)).toBeInTheDocument();
    });

    it('does not claim anything about downloads when the assets are already installed', () => {
        for (const context of ['terms-updated', 'reconsent'] as const) {
            const { unmount } = render(<TermsStep context={context} onAccept={noop} />);
            expect(screen.queryByText(/Nothing will be downloaded/)).not.toBeInTheDocument();
            expect(screen.getByText(/already installed/)).toBeInTheDocument();
            unmount();
        }
    });

    it('says the terms changed only when an older acceptance exists', () => {
        const { unmount } = render(<TermsStep context="terms-updated" onAccept={noop} />);
        expect(screen.getByRole('heading', { name: /Updated terms/ })).toBeInTheDocument();
        expect(screen.getByText(/have changed since you last accepted/)).toBeInTheDocument();
        unmount();

        render(<TermsStep context="reconsent" onAccept={noop} />);
        expect(screen.queryByText(/have changed since you last accepted/)).not.toBeInTheDocument();
    });
});

describe('SetupWizard consent context', () => {
    it('shows the download assurance on a fresh first run', async () => {
        invoke.mockResolvedValue({
            gpu_name: null, gpu_vendor: null, vram_mb: null, ram_mb: 16384,
            recommended_backend: 'cpu', os: 'windows', available_backends: ['cpu'],
        });
        render(<SetupWizard eulaAccepted={false} onAcceptEula={noop} installNeeded onComplete={noop} />);

        const automatic = await screen.findByRole('button', { name: /Automatic/ });
        await waitFor(() => expect(automatic).toBeEnabled());
        fireEvent.click(automatic);

        expect(screen.getByText(/Nothing will be downloaded or installed until you agree/)).toBeInTheDocument();
    });

    it('drops the download assurance on a post-bump re-consent run', () => {
        localStorage.setItem('eula_accepted_version', '2000-01-01');
        expect('2000-01-01').not.toBe(EULA_VERSION);

        render(<SetupWizard eulaAccepted={false} onAcceptEula={noop} installNeeded={false} onComplete={noop} />);

        expect(screen.getByRole('heading', { name: /Updated terms/ })).toBeInTheDocument();
        expect(screen.queryByText(/Nothing will be downloaded/)).not.toBeInTheDocument();
    });

    it('falls back to the neutral copy when no acceptance was ever recorded', () => {
        render(<SetupWizard eulaAccepted={false} onAcceptEula={noop} installNeeded={false} onComplete={noop} />);

        expect(screen.getByRole('heading', { name: /Terms & privacy/ })).toBeInTheDocument();
        expect(screen.getByText(/already installed/)).toBeInTheDocument();
        expect(screen.queryByText(/Nothing will be downloaded/)).not.toBeInTheDocument();
    });
});

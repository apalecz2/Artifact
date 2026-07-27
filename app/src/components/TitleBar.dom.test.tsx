import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const minimize = vi.fn();
const toggleMaximize = vi.fn();
const close = vi.fn();
const isMaximized = vi.fn(async () => false);
const onResized = vi.fn(async () => () => {});
vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({ minimize, toggleMaximize, close, isMaximized, onResized }),
}));

import TitleBar, { isMacPlatform, modifierLabel, zoomShortcut } from './TitleBar';

describe('zoomShortcut', () => {
    const event = (over: Partial<Parameters<typeof zoomShortcut>[0]>) => ({
        code: 'KeyA',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        ...over,
    });

    it('maps the zoom keys behind Ctrl and Cmd', () => {
        expect(zoomShortcut(event({ code: 'Equal', ctrlKey: true }))).toBe('in');
        expect(zoomShortcut(event({ code: 'Minus', metaKey: true }))).toBe('out');
        expect(zoomShortcut(event({ code: 'Digit0', ctrlKey: true }))).toBe('reset');
    });

    it('accepts the numpad equivalents', () => {
        expect(zoomShortcut(event({ code: 'NumpadAdd', ctrlKey: true }))).toBe('in');
        expect(zoomShortcut(event({ code: 'NumpadSubtract', ctrlKey: true }))).toBe('out');
        expect(zoomShortcut(event({ code: 'Numpad0', ctrlKey: true }))).toBe('reset');
    });

    it('ignores the keys unmodified, and Alt combinations', () => {
        expect(zoomShortcut(event({ code: 'Equal' }))).toBeNull();
        expect(zoomShortcut(event({ code: 'Equal', ctrlKey: true, altKey: true }))).toBeNull();
        expect(zoomShortcut(event({ code: 'KeyZ', ctrlKey: true }))).toBeNull();
    });
});

describe('platform layout', () => {
    it('detects macOS from the webview user agent', () => {
        expect(isMacPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(true);
        expect(isMacPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    });

    it('labels shortcuts with the platform modifier', () => {
        expect(modifierLabel(true)).toBe('⌘');
        expect(modifierLabel(false)).toBe('Ctrl');
    });
});

describe('<TitleBar />', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        invoke.mockImplementation(async (cmd: string) => (cmd === 'get_app_zoom' ? 1 : 1.1));
    });

    it('steps the zoom from the View menu and shows the new level', async () => {
        const user = userEvent.setup();
        render(<TitleBar />);

        await user.click(screen.getByRole('button', { name: /view/i }));
        await user.click(screen.getByRole('menuitem', { name: /zoom in/i }));

        expect(invoke).toHaveBeenCalledWith('set_app_zoom', { action: 'in' });

        // Menu closes on selection; reopening reports what the backend returned.
        await user.click(screen.getByRole('button', { name: /view/i }));
        expect(screen.getByText(/current zoom: 110%/i)).toBeInTheDocument();
    });

    it('closes the View menu on Escape', async () => {
        const user = userEvent.setup();
        render(<TitleBar />);

        await user.click(screen.getByRole('button', { name: /view/i }));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('zooms from the keyboard without opening the menu', async () => {
        const user = userEvent.setup();
        render(<TitleBar />);

        // `[Equal]` is userEvent's `code` syntax — the handler keys off `code`.
        await user.keyboard('{Control>}[Equal]{/Control}');

        await waitFor(() => expect(invoke).toHaveBeenCalledWith('set_app_zoom', { action: 'in' }));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('drives the window buttons', async () => {
        const user = userEvent.setup();
        render(<TitleBar />);

        await user.click(screen.getByRole('button', { name: 'Minimize' }));
        await user.click(screen.getByRole('button', { name: 'Maximize' }));
        await user.click(screen.getByRole('button', { name: 'Close' }));

        expect(minimize).toHaveBeenCalledOnce();
        expect(toggleMaximize).toHaveBeenCalledOnce();
        expect(close).toHaveBeenCalledOnce();
    });

    it('marks the bar as a drag region so the frameless window can be moved', () => {
        const { container } = render(<TitleBar />);
        expect(container.querySelector('header')).toHaveAttribute('data-tauri-drag-region');
    });
});

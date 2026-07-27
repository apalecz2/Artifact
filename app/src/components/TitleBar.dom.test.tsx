import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

// The bar reads `useLocation`/`useNavigate`, so it only mounts inside a router.
const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react-router')>()),
    useNavigate: () => navigate,
}));

const minimize = vi.fn();
const toggleMaximize = vi.fn();
const close = vi.fn();
const isMaximized = vi.fn(async () => false);
const onResized = vi.fn(async () => () => {});
vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({ minimize, toggleMaximize, close, isMaximized, onResized }),
}));

import TitleBar, {
    historyPosition,
    historyShortcut,
    isMacPlatform,
    modifierLabel,
    zoomShortcut,
} from './TitleBar';

const render = () => rtlRender(<TitleBar />, { wrapper: MemoryRouter });

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

describe('historyShortcut', () => {
    const event = (over: Partial<Parameters<typeof historyShortcut>[0]>) => ({
        code: 'KeyA',
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        ...over,
    });

    it('uses Alt+arrows off macOS', () => {
        expect(historyShortcut(event({ code: 'ArrowLeft', altKey: true }), false)).toBe('back');
        expect(historyShortcut(event({ code: 'ArrowRight', altKey: true }), false)).toBe('forward');
        expect(historyShortcut(event({ code: 'ArrowLeft' }), false)).toBeNull();
    });

    it('uses ⌘brackets on macOS, leaving Alt+arrows to text editing', () => {
        expect(historyShortcut(event({ code: 'BracketLeft', metaKey: true }), true)).toBe('back');
        expect(historyShortcut(event({ code: 'BracketRight', metaKey: true }), true)).toBe(
            'forward',
        );
        expect(historyShortcut(event({ code: 'ArrowLeft', altKey: true }), true)).toBeNull();
    });
});

describe('historyPosition', () => {
    it('reads the router index to tell back from forward', () => {
        expect(historyPosition({ idx: 0 }, 3)).toEqual({ canGoBack: false, canGoForward: true });
        expect(historyPosition({ idx: 1 }, 3)).toEqual({ canGoBack: true, canGoForward: true });
        expect(historyPosition({ idx: 2 }, 3)).toEqual({ canGoBack: true, canGoForward: false });
    });

    it('falls back to the entry count before the router writes its state', () => {
        expect(historyPosition(null, 1)).toEqual({ canGoBack: false, canGoForward: false });
        expect(historyPosition(undefined, 2)).toEqual({ canGoBack: true, canGoForward: false });
        expect(historyPosition({ usr: 'no idx' }, 1)).toEqual({
            canGoBack: false,
            canGoForward: false,
        });
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
        render();

        await user.click(screen.getByRole('button', { name: /view/i }));
        await user.click(screen.getByRole('menuitem', { name: /zoom in/i }));

        expect(invoke).toHaveBeenCalledWith('set_app_zoom', { action: 'in' });

        // Menu closes on selection; reopening reports what the backend returned.
        await user.click(screen.getByRole('button', { name: /view/i }));
        expect(screen.getByText(/current zoom: 110%/i)).toBeInTheDocument();
    });

    it('closes the View menu on Escape', async () => {
        const user = userEvent.setup();
        render();

        await user.click(screen.getByRole('button', { name: /view/i }));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('zooms from the keyboard without opening the menu', async () => {
        const user = userEvent.setup();
        render();

        // `[Equal]` is userEvent's `code` syntax — the handler keys off `code`.
        await user.keyboard('{Control>}[Equal]{/Control}');

        await waitFor(() => expect(invoke).toHaveBeenCalledWith('set_app_zoom', { action: 'in' }));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('drives the window buttons', async () => {
        const user = userEvent.setup();
        render();

        await user.click(screen.getByRole('button', { name: 'Minimize' }));
        await user.click(screen.getByRole('button', { name: 'Maximize' }));
        await user.click(screen.getByRole('button', { name: 'Close' }));

        expect(minimize).toHaveBeenCalledOnce();
        expect(toggleMaximize).toHaveBeenCalledOnce();
        expect(close).toHaveBeenCalledOnce();
    });

    it('navigates back and forward through the router history', async () => {
        const user = userEvent.setup();
        // Two entries, sitting on the first: Back is spent, Forward is live.
        window.history.pushState({ idx: 1 }, '');
        window.history.replaceState({ idx: 0 }, '');
        render();

        const back = screen.getByRole('button', { name: 'Back' });
        const forward = screen.getByRole('button', { name: 'Forward' });
        await waitFor(() => expect(forward).toBeEnabled());
        expect(back).toBeDisabled();

        await user.click(forward);
        expect(navigate).toHaveBeenCalledWith(1);
    });

    it('goes back on the keyboard shortcut', async () => {
        const user = userEvent.setup();
        window.history.pushState({ idx: 1 }, '');
        render();

        await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled());
        await user.keyboard('{Alt>}[ArrowLeft]{/Alt}');

        expect(navigate).toHaveBeenCalledWith(-1);
    });

    // The full disabled/enabled matrix is covered by the `historyPosition` unit
    // tests above — jsdom shares one history across a file, so `history.length`
    // can't be pinned here.

    it('marks the bar as a drag region so the frameless window can be moved', () => {
        const { container } = render();
        expect(container.querySelector('header')).toHaveAttribute('data-tauri-drag-region');
    });
});


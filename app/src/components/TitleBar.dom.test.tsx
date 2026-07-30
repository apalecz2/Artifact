import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { EDIT_COMMANDS, resetEditTarget, setEditTarget } from '../lib/editTarget';
import type { EditAvailability, EditCommand } from '../lib/editTarget';
import { setBackHandler, setRoutesMounted } from '../lib/navState';

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
    appShortcut,
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

describe('appShortcut', () => {
    const event = (over: Partial<Parameters<typeof appShortcut>[0]>) => ({
        code: 'KeyQ',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        ...over,
    });

    it('maps the File/Edit accelerators behind the platform modifier', () => {
        expect(appShortcut(event({ code: 'KeyN', ctrlKey: true }), false)).toBe('new');
        expect(appShortcut(event({ code: 'KeyO', ctrlKey: true }), false)).toBe('open');
        expect(appShortcut(event({ code: 'Comma', ctrlKey: true }), false)).toBe('settings');
        expect(appShortcut(event({ code: 'KeyF', metaKey: true }), true)).toBe('find');
    });

    it('ignores the wrong modifier for the platform', () => {
        expect(appShortcut(event({ code: 'KeyN', metaKey: true }), false)).toBeNull();
        expect(appShortcut(event({ code: 'KeyN', ctrlKey: true }), true)).toBeNull();
    });

    it('leaves Shift and Alt combinations alone', () => {
        expect(appShortcut(event({ code: 'KeyN', ctrlKey: true, shiftKey: true }), false)).toBeNull();
        expect(appShortcut(event({ code: 'KeyN', ctrlKey: true, altKey: true }), false)).toBeNull();
        expect(appShortcut(event({ code: 'KeyN' }), false)).toBeNull();
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
        // The bar refuses to navigate until the app declares its routes are on
        // screen, which is the normal case; the wizard's is covered on its own below.
        setRoutesMounted(true);
        setBackHandler(null);
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

    it('routes the File menu items', async () => {
        const user = userEvent.setup();
        render();

        await user.click(screen.getByRole('button', { name: /file/i }));
        await user.click(screen.getByRole('menuitem', { name: /new extraction/i }));
        expect(navigate).toHaveBeenCalledWith('/');

        await user.click(screen.getByRole('button', { name: /file/i }));
        await user.click(screen.getByRole('menuitem', { name: /settings/i }));
        expect(navigate).toHaveBeenCalledWith('/settings');
    });

    it('closes the window from File ▸ Exit', async () => {
        const user = userEvent.setup();
        render();

        await user.click(screen.getByRole('button', { name: /file/i }));
        // The shortcut hint is part of each item's accessible name ("Exit Alt F4").
        await user.click(screen.getByRole('menuitem', { name: /^exit/i }));

        expect(close).toHaveBeenCalledOnce();
    });

    it('runs Edit ▸ Copy against the focused field', async () => {
        const user = userEvent.setup();
        const execCommand = vi.fn(() => true);
        // jsdom has no execCommand at all, so define rather than spy.
        Object.defineProperty(document, 'execCommand', {
            value: execCommand,
            configurable: true,
            writable: true,
        });
        render();

        await user.click(screen.getByRole('button', { name: /edit/i }));
        await user.click(screen.getByRole('menuitem', { name: /^copy/i }));

        expect(execCommand).toHaveBeenCalledWith('copy');
    });

    describe('Edit menu claims', () => {
        const stubExecCommand = () => {
            const execCommand = vi.fn(() => true);
            Object.defineProperty(document, 'execCommand', {
                value: execCommand,
                configurable: true,
                writable: true,
            });
            return execCommand;
        };

        const claim = (over: Partial<EditAvailability> = {}) => {
            const run = vi.fn();
            act(() => setEditTarget({
                can: {
                    undo: true, redo: true, cut: true, copy: true, paste: true, selectAll: true,
                    ...over,
                },
                run,
            }));
            return run;
        };

        /** Every row's accessible name, so a claimed item can be picked by command. */
        const ROW_NAME: Record<EditCommand, RegExp> = {
            undo: /^undo/i,
            redo: /^redo/i,
            cut: /^cut/i,
            copy: /^copy/i,
            paste: /^paste/i,
            selectAll: /^select all/i,
        };

        const pick = async (user: ReturnType<typeof userEvent.setup>, command: EditCommand) => {
            await user.click(screen.getByRole('button', { name: /edit/i }));
            await user.click(screen.getByRole('menuitem', { name: ROW_NAME[command] }));
        };

        beforeEach(resetEditTarget);

        it('falls back to the focused field when nothing has claimed them', async () => {
            const user = userEvent.setup();
            const execCommand = stubExecCommand();
            render();

            // Paste is the exception on this path and always has been: Chromium
            // refuses `execCommand('paste')`, so runEditCommand reads the
            // clipboard and inserts the text instead.
            for (const command of EDIT_COMMANDS.filter(command => command !== 'paste')) {
                await pick(user, command);
                expect(execCommand).toHaveBeenCalledWith(command);
            }
        });

        it('routes every command to the claimant — the session table while it is focused', async () => {
            const user = userEvent.setup();
            const execCommand = stubExecCommand();
            render();
            const run = claim();

            for (const command of EDIT_COMMANDS) {
                await pick(user, command);
            }

            expect(run.mock.calls.map(([command]) => command)).toEqual([...EDIT_COMMANDS]);
            // The focused field must not be acted on as well.
            expect(execCommand).not.toHaveBeenCalled();
        });

        it('reports what the claimant can actually do by disabling the rest', async () => {
            const user = userEvent.setup();
            render();
            claim({ undo: false, cut: false, copy: false, paste: false });

            await user.click(screen.getByRole('button', { name: /edit/i }));
            expect(screen.getByRole('menuitem', { name: /^undo/i })).toBeDisabled();
            expect(screen.getByRole('menuitem', { name: /^cut/i })).toBeDisabled();
            expect(screen.getByRole('menuitem', { name: /^redo/i })).toBeEnabled();
            expect(screen.getByRole('menuitem', { name: /^select all/i })).toBeEnabled();
        });

        it('hands the menu back to the field once the claim is released', async () => {
            const user = userEvent.setup();
            const execCommand = stubExecCommand();
            render();

            const run = claim();
            act(() => setEditTarget(null));

            await pick(user, 'copy');
            expect(run).not.toHaveBeenCalled();
            expect(execCommand).toHaveBeenCalledWith('copy');
        });
    });

    it('opens one menu at a time, switching on hover', async () => {
        const user = userEvent.setup();
        render();

        await user.click(screen.getByRole('button', { name: /file/i }));
        expect(screen.getByRole('menu', { name: 'File' })).toBeInTheDocument();

        // Hovering a sibling title while a menu is open switches to it, the way
        // a native menu bar does — and only one menu is ever mounted.
        await user.hover(screen.getByRole('button', { name: /view/i }));
        expect(screen.queryByRole('menu', { name: 'File' })).not.toBeInTheDocument();
        expect(screen.getByRole('menu', { name: 'View' })).toBeInTheDocument();
    });

    it('does not open a menu on hover when none is open', async () => {
        const user = userEvent.setup();
        render();

        await user.hover(screen.getByRole('button', { name: /edit/i }));

        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
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

    // Re-running setup reloads the webview, which keeps the session's entries and
    // the `idx` React Router wrote into `history.state` — so the history says Back
    // is live while the wizard is what's on screen. Navigating then moves the entry
    // behind a screen that never changes.
    describe('while the app is not showing its routes', () => {
        beforeEach(() => {
            // A position that would otherwise offer Back.
            window.history.pushState({ idx: 1 }, '');
            setRoutesMounted(false);
        });

        it('disables both navigation buttons when the screen offers no way out', async () => {
            render();

            await waitFor(() => {
                expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
            });
            expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled();
        });

        it('ignores the history accelerators', async () => {
            const user = userEvent.setup();
            render();

            await user.keyboard('{Alt>}[ArrowLeft]{/Alt}');
            await user.keyboard('{Alt>}[ArrowRight]{/Alt}');

            expect(navigate).not.toHaveBeenCalled();
        });

        it('greys out the File items that route, leaving Exit alive', async () => {
            const user = userEvent.setup();
            render();

            await user.click(screen.getByRole('button', { name: /file/i }));
            expect(screen.getByRole('menuitem', { name: /new extraction/i })).toBeDisabled();
            expect(screen.getByRole('menuitem', { name: /open extraction/i })).toBeDisabled();
            expect(screen.getByRole('menuitem', { name: /^settings/i })).toBeDisabled();
            expect(screen.getByRole('menuitem', { name: /about anchor/i })).toBeDisabled();
            expect(screen.getByRole('menuitem', { name: /^exit/i })).toBeEnabled();
        });

        it('keeps the Edit commands, disabling only the one that routes', async () => {
            const user = userEvent.setup();
            render();

            await user.click(screen.getByRole('button', { name: /edit/i }));

            // The six act on the focused field, which the wizard has plenty of.
            expect(screen.getByRole('menuitem', { name: /^select all/i })).toBeEnabled();
            expect(screen.getByRole('menuitem', { name: /^paste/i })).toBeEnabled();
            expect(screen.getByRole('menuitem', { name: /find extractions/i })).toBeDisabled();
        });

        it('still zooms from the View menu', async () => {
            const user = userEvent.setup();
            render();

            await user.click(screen.getByRole('button', { name: /view/i }));
            await user.click(screen.getByRole('menuitem', { name: /zoom in/i }));

            expect(invoke).toHaveBeenCalledWith('set_app_zoom', { action: 'in' });
        });

        // The wizard ends in a reload, but the EULA-only run doesn't: it hands the
        // app back in place, so the bar has to come alive without remounting.
        it('comes back to life when the routes mount', async () => {
            const user = userEvent.setup();
            render();

            const back = screen.getByRole('button', { name: 'Back' });
            expect(back).toBeDisabled();

            act(() => setRoutesMounted(true));

            await waitFor(() => expect(back).toBeEnabled());
            await user.click(back);
            expect(navigate).toHaveBeenCalledWith(-1);
        });

        // What a user pressing Back on the wizard is actually asking for: give me
        // the app back. The wizard registers that when it is a re-run over an
        // install that already works, so there is an app to go back to.
        describe('and the screen registers a way out', () => {
            const exit = vi.fn();

            beforeEach(() => setBackHandler(exit));

            it('offers Back, and leaves the screen instead of moving the history', async () => {
                const user = userEvent.setup();
                render();

                const back = screen.getByRole('button', { name: 'Back' });
                await waitFor(() => expect(back).toBeEnabled());

                await user.click(back);
                expect(exit).toHaveBeenCalledOnce();
                expect(navigate).not.toHaveBeenCalled();
            });

            it('runs it from the accelerator too', async () => {
                const user = userEvent.setup();
                render();

                await user.keyboard('{Alt>}[ArrowLeft]{/Alt}');

                expect(exit).toHaveBeenCalledOnce();
            });

            it('still offers no Forward — there is nothing ahead of a takeover', () => {
                render();
                expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled();

                fireEvent.keyDown(window, { code: 'ArrowRight', altKey: true });
                expect(exit).not.toHaveBeenCalled();
            });

            // The install step withdraws it: a download in flight has to be stopped
            // and confirmed, which that step owns.
            it('takes the offer back when the screen withdraws it', async () => {
                render();

                const back = screen.getByRole('button', { name: 'Back' });
                await waitFor(() => expect(back).toBeEnabled());

                act(() => setBackHandler(null));

                await waitFor(() => expect(back).toBeDisabled());
            });
        });
    });

    it('draws no menus on macOS, where the system menu bar owns them', () => {
        // `userAgent` is a prototype getter, so there is no own descriptor to put
        // back — the override has to be deleted, or every later test in this file
        // keeps thinking it is on a Mac.
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            configurable: true,
        });

        try {
            render();
            for (const name of ['File', 'Edit', 'View', 'Menu']) {
                expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
            }
            // Navigation stays — it has no counterpart in the system menu bar.
            expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
        } finally {
            delete (navigator as Navigator & { userAgent?: string }).userAgent;
        }
    });

    it('lists the categories, not every item, under the hamburger', async () => {
        const user = userEvent.setup();
        render();

        await user.click(screen.getByRole('button', { name: 'Menu' }));
        const menu = screen.getByRole('menu', { name: 'Menu' });

        expect(within(menu).getByRole('menuitem', { name: /^file/i })).toBeInTheDocument();
        expect(within(menu).getByRole('menuitem', { name: /^edit/i })).toBeInTheDocument();
        expect(within(menu).getByRole('menuitem', { name: /^view/i })).toBeInTheDocument();
        // The items themselves stay behind their category until it is opened.
        expect(
            within(menu).queryByRole('menuitem', { name: /new extraction/i }),
        ).not.toBeInTheDocument();
    });

    it('opens a category after the pointer rests on it', async () => {
        const user = userEvent.setup();
        render();

        await user.click(screen.getByRole('button', { name: 'Menu' }));
        await user.hover(screen.getByRole('menuitem', { name: /^file/i }));

        // Deliberately delayed, so passing over a category on the way down the
        // list doesn't flash its panel open.
        expect(screen.queryByRole('menu', { name: 'File' })).not.toBeInTheDocument();
        const submenu = await screen.findByRole('menu', { name: 'File' });
        expect(within(submenu).getByRole('menuitem', { name: /new extraction/i })).toBeVisible();
    });

    it('opens a category immediately on click, and runs its items', async () => {
        const user = userEvent.setup();
        render();

        await user.click(screen.getByRole('button', { name: 'Menu' }));
        await user.click(screen.getByRole('menuitem', { name: /^view/i }));

        const submenu = screen.getByRole('menu', { name: 'View' });
        expect(within(submenu).getByText(/current zoom/i)).toBeInTheDocument();

        await user.click(within(submenu).getByRole('menuitem', { name: /zoom in/i }));
        expect(invoke).toHaveBeenCalledWith('set_app_zoom', { action: 'in' });
        // Selecting an item dismisses the whole stack, not just the submenu.
        expect(screen.queryByRole('menu', { name: 'Menu' })).not.toBeInTheDocument();
    });

    it('keeps the window buttons unshrinkable so a narrow bar cannot clip them', () => {
        const { container } = render();

        // The guarantee is structural: the controls never shrink, and the group
        // that gives way instead is the one holding no dropdowns.
        const controls = container.querySelector('header > div:last-of-type');
        expect(controls?.className).toContain('shrink-0');
        expect(container.querySelector('header > div:first-of-type')?.className).toContain(
            'overflow-hidden',
        );
    });

    it('marks the bar as a drag region so the frameless window can be moved', () => {
        const { container } = render();
        expect(container.querySelector('header')).toHaveAttribute('data-tauri-drag-region');
    });
});


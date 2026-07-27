import type { ReactNode } from 'react';
import { HashRouter } from 'react-router';
import TitleBar from '../components/TitleBar';

/**
 * The window frame: a custom title bar over everything the app renders.
 *
 * This is the only element that owns viewport height. Everything below it sizes
 * with `h-full` against the content pane, so screens don't have to know the bar
 * exists: the one exception is viewport-anchored overlays (modals, context
 * menus), which stay `fixed` and deliberately span the whole window.
 *
 * The router lives here rather than in `App.tsx` because the title bar's
 * back/forward buttons need `useLocation`/`useNavigate`. The pre-router screens
 * (EULA gate, setup wizard) render inside it harmlessly — they simply never
 * navigate, which is also why the buttons sit disabled there.
 *
 * Keeping the bar on top takes two things, because the app's overlays escape in
 * two different ways:
 *
 * 1. `isolate` makes this pane a stacking context, so the `z-50`/`z-60`/`z-70`
 *    overlays *inside* it (backdrops, context menus, the sidebar) are ordered
 *    against each other and can never out-rank the bar, whatever they claim.
 * 2. That alone isn't enough: `Modal` (with `portal`) and the output pane's
 *    tooltip render into `document.body`, outside this pane entirely, so they
 *    compete with the bar in the root stacking context. The bar's `z-100`
 *    out-ranks them there — `#root` deliberately creates no stacking context of
 *    its own, which is what lets that comparison happen.
 *
 * Hit testing follows paint order, so the bar also stays *clickable* under a
 * modal: the window can still be dragged and closed with a dialog open.
 */
export default function AppShell({ children }: { children: ReactNode }) {
    return (
        <HashRouter>
            <div className="flex h-screen flex-col overflow-hidden bg-surface">
                <TitleBar />
                <div className="relative isolate z-0 min-h-0 flex-1">{children}</div>
            </div>
        </HashRouter>
    );
}

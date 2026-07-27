import type { ReactNode } from 'react';
import TitleBar from '../components/TitleBar';

/**
 * The window frame: a custom title bar over everything the app renders.
 *
 * This is the only element that owns viewport height. Everything below it sizes
 * with `h-full` against the content pane, so screens don't have to know the bar
 * exists: the one exception is viewport-anchored overlays (modals, context
 * menus), which stay `fixed` and deliberately span the whole window.
 */
export default function AppShell({ children }: { children: ReactNode }) {
    return (
        <div className="flex h-screen flex-col overflow-hidden bg-surface">
            <TitleBar />
            <div className="relative min-h-0 flex-1">{children}</div>
        </div>
    );
}

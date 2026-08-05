import { useEffect } from 'react';
import { Routes, Route } from 'react-router';
import "./App.css";
import Icon from './components/Icon';
import AppLayout from './layouts/AppLayout';
import Dashboard from './pages/Dashboard';
import Session from './pages/Session';
import Settings from './pages/Settings';
import About from './pages/About';
import Search from './pages/Search';
import Legal from './pages/Legal';
import SetupWizard from './features/setup/SetupWizard';
import { useSetupCheck, clearSetupRerun } from './features/setup/useSetupCheck';
import { useEulaAcceptance } from './features/legal/eulaAcceptance';
import { setRoutesMounted } from './lib/navState';

// The `HashRouter` itself lives in `AppShell`, one level up, so the title bar's
// back/forward buttons are inside it too.
function AppRouter() {
    return (
        <Routes>
            <Route path="/" element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="session/:id" element={<Session />} />
                <Route path="search" element={<Search />} />
                <Route path="settings" element={<Settings />} />
                <Route path="about" element={<About />} />
                <Route path="legal/:doc" element={<Legal />} />
            </Route>
        </Routes>
    );
}

export default function App() {
    // Consent and installation are two steps of one wizard, not two screens: the app
    // is withheld until both are satisfied. The EULA is still gated ahead of every
    // download -- the wizard orders its own steps that way (see SetupWizard). Consent
    // is re-asked only if the user has never accepted the current EULA version, in
    // which case the wizard may consist of that step alone (see eulaAcceptance.ts).
    const { accepted, loading: eulaLoading, accept } = useEulaAcceptance();
    const { isComplete, isLoading: setupLoading, canCancelRerun, cancelRerun } = useSetupCheck();
    // Both probes run concurrently; the spinner covers whichever finishes last. The
    // consent one only runs at all when localStorage came up empty, and it exists so a
    // user whose webview storage was cleared isn't flashed a consent prompt before the
    // AppData record restores it (see eulaAcceptance.ts).
    const isLoading = eulaLoading || setupLoading;

    // The spinner and the wizard below render *instead of* the router, so while
    // either is up there is nowhere for the title bar's back/forward buttons and
    // File items to go. Tell the bar, which sits above this tree and cannot see
    // which branch was taken. The cleanup covers the third case: if this subtree
    // throws, `ErrorBoundary` unmounts it and shows a fallback with no routes
    // either. See lib/navState.ts.
    const routesMounted = !isLoading && accepted && isComplete;
    useEffect(() => {
        setRoutesMounted(routesMounted);
        return () => setRoutesMounted(false);
    }, [routesMounted]);

    if (isLoading) {
        return (
            <div className="h-full bg-surface flex items-center justify-center">
                <Icon name="progress_activity" size={32} className="text-on-surface-variant animate-spin" />
            </div>
        );
    }

    if (!accepted || !isComplete) {
        return (
            <SetupWizard
                eulaAccepted={accepted}
                onAcceptEula={accept}
                installNeeded={!isComplete}
                // Leaving is offered only for a re-run the user started themselves,
                // and never while consent is outstanding — an unaccepted EULA is a
                // gate on the app, not a screen to dismiss.
                onExit={accepted && canCancelRerun ? cancelRerun : undefined}
                onComplete={() => { clearSetupRerun(); window.location.reload(); }}
            />
        );
    }

    return <AppRouter />;
}
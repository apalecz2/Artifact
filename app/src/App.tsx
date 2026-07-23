import { HashRouter, Routes, Route } from 'react-router';
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
import FirstRunEula from './features/legal/FirstRunEula';
import { useEulaAcceptance } from './features/legal/eulaAcceptance';

function AppRouter() {
    return (
        <HashRouter>
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
        </HashRouter>
    );
}

export default function App() {
    // The EULA gate is checked first and synchronously: the user must accept before
    // the setup wizard downloads and runs any third-party binaries -- before
    // reaching the app at all. Re-shown only if they've never accepted the current
    // EULA version (see eulaAcceptance.ts).
    const { accepted, accept } = useEulaAcceptance();
    const { isComplete, isLoading } = useSetupCheck();

    if (!accepted) {
        return <FirstRunEula onAccept={accept} />;
    }

    if (isLoading) {
        return (
            <div className="h-screen bg-surface flex items-center justify-center">
                <Icon name="progress_activity" size={32} className="text-on-surface-variant animate-spin" />
            </div>
        );
    }

    if (!isComplete) {
        return <SetupWizard onComplete={() => { clearSetupRerun(); window.location.reload(); }} />;
    }

    return <AppRouter />;
}
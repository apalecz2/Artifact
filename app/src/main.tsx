import React from "react";
import ReactDOM from "react-dom/client";
// Self-hosted fonts, bundled into the build. These were <link>s to
// fonts.googleapis.com/fonts.gstatic.com, which made every launch hit the
// network and forced both Google origins into the CSP — neither is compatible
// with the on-device claim, and the app rendered in fallback faces offline.
// Imported here rather than from App.css so Vite resolves the bare specifiers
// itself (Tailwind v4 owns the @import graph in that file).
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "material-symbols/outlined.css";
import App from "./App";
import AppShell from "./layouts/AppShell";
import ErrorBoundary from "./components/ErrorBoundary";
import { applyStoredTheme } from "./hooks/useTheme";

// Theme has to be on <html> before the first render, because the components that
// subscribe to it (AppLayout, Settings) live inside the router — without this the
// title bar and every pre-router screen, the setup wizard included, drew in light
// mode regardless of the stored preference.
applyStoredTheme();

// The title bar sits *outside* the error boundary on purpose: the window has no
// OS frame, so if the app tree crashes the bar is the only thing left that can
// move or close the window.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppShell>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </AppShell>
  </React.StrictMode>,
);

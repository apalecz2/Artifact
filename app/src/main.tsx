import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppShell from "./layouts/AppShell";
import ErrorBoundary from "./components/ErrorBoundary";

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

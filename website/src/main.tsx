import React from 'react';
import ReactDOM from 'react-dom/client';
// Self-hosted fonts, bundled into the build — the same three packages, imported
// the same way, as app/src/main.tsx. These were <link>s to fonts.googleapis.com /
// fonts.gstatic.com, which made every visit send the visitor's IP and user-agent
// to Google. The Privacy Policy (§4) tells visitors this site loads no
// third-party resources, so the links had to go rather than be disclosed: the
// site now serves its own fonts and makes no cross-origin request at all.
// Imported here rather than from theme.css so Vite resolves the bare specifiers
// itself (Tailwind v4 owns the @import graph in that file).
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import 'material-symbols/outlined.css';
import App from './App';
import LegalPage from './LegalPage';
import { docIdForPath, LEGAL_DOCS } from './legal/legalContent';
import './theme.css';

// Theme (light/dark) is resolved before first paint by the inline script in
// index.html — a saved choice from localStorage, else the OS preference — and that
// script runs on every served page, including the pre-rendered legal routes. We
// deliberately do NOT re-apply it here: this block ran *after* that script and
// unconditionally re-added `dark` whenever the OS was dark, clobbering a saved
// "light" choice, so the preference wouldn't hold on the legal pages (App.tsx seeds
// its toggle from the class the inline script resolves — it's the source of truth).

// Lightweight path routing: /privacy, /terms, /licenses render the standalone
// legal pages (the permanent URLs the Store listing and the app link to); every
// other path renders the marketing site. Those clean URLs resolve on a direct visit
// or refresh because the build emits each one as a real static file (dist/privacy/
// index.html, …) — see the prerender-legal-routes plugin in vite.config.ts. No
// host-specific redirect config is required.
const legalDoc = docIdForPath(window.location.pathname);

// Canonicalize the address bar. Trailing-slash and alias variants (e.g. /privacy/,
// /notices) are normalized to their canonical path; anything served the SPA shell for
// a path the site doesn't have (e.g. a mistyped link) falls back to "/". This only
// rewrites history — it never reloads — and preserves any query/hash so in-page
// anchors still work.
const canonicalPath = legalDoc ? LEGAL_DOCS[legalDoc].path : '/';
if (window.location.pathname !== canonicalPath) {
    window.history.replaceState(null, '', canonicalPath + window.location.search + window.location.hash);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        {legalDoc ? <LegalPage doc={legalDoc} /> : <App />}
    </React.StrictMode>,
);

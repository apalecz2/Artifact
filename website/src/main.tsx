import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LegalPage from './LegalPage';
import { docIdForPath, LEGAL_DOCS } from './legal/legalContent';
import './theme.css';

// Honour the visitor's OS colour-scheme preference on first paint so the page
// matches the system the way the app does, while still allowing the in-page toggle.
if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
}

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

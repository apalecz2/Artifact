import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { LEGAL_ROUTE_PATHS } from './src/legal/legalRoutes';

// The legal pages live at clean URLs (/privacy, /terms, /licenses) that the Store
// listing and the desktop app link to. This is a single-page app, so those paths
// don't exist as files by default — a direct visit or refresh would 404.
//
// Instead of leaning on host-specific redirect config (Netlify/Cloudflare _redirects,
// GitHub Pages 404.html, Vercel/Azure rewrite files, nginx try_files, …), we emit each
// route as a real static file: dist/privacy/index.html, etc., each a copy of the built
// index.html. Every static host serves an existing file at its own path with a proper
// 200 and no configuration, so the build "just works" dropped into any of them. The
// client router in src/main.tsx then renders the right page from window.location.
//
// The copy uses the *generated* index.html so its hashed asset references are correct.
function prerenderLegalRoutes(): Plugin {
    let outDir = 'dist';
    return {
        name: 'prerender-legal-routes',
        apply: 'build',
        configResolved(cfg) {
            outDir = cfg.build.outDir;
        },
        closeBundle() {
            const index = resolve(outDir, 'index.html');
            if (!existsSync(index)) return;
            for (const route of Object.values(LEGAL_ROUTE_PATHS)) {
                const dir = resolve(outDir, route.replace(/^\/+/, ''));
                mkdirSync(dir, { recursive: true });
                copyFileSync(index, resolve(dir, 'index.html'));
            }
        },
    };
}

// Plain static-site build — no Tauri specifics. Outputs to dist/ for any static host.
export default defineConfig({
    plugins: [react(), tailwindcss(), prerenderLegalRoutes()],
    // Allow importing the canonical legal docs from the repo root (../docs/legal)
    // as ?raw strings, so the website renders the exact same Privacy/EULA text the
    // app does (one source of truth — see docs/compliance-documents.md §2).
    server: {
        fs: {
            allow: [".."],
        },
    },
});

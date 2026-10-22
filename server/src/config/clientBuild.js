import express from 'express';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const defaultClientBuild = fileURLToPath(new URL('../../../client/dist/', import.meta.url));

// Keep in sync with client/src/App.jsx. An allowlist prevents missing scripts
// and misspelled backend routes from receiving a misleading 200 HTML response.
const pageRoute = /^\/(?:login|register|dashboard|activity|my-tasks|profile|boards\/[^/.]+(?:\/activity)?)?\/?$/;

export function mountClientBuild(app, directory) {
    const root = resolve(directory);
    const index = resolve(root, 'index.html');
    try {
        if (!statSync(index).isFile()) throw new Error('Not a file');
    } catch {
        throw new Error('React build missing: build the client before starting the production server');
    }

    // These namespaces belong to the backend even when their route is unknown.
    // Socket.IO intercepts its own traffic on the shared HTTP server.
    app.use(['/api', '/socket.io', '/health'], (req, res) => {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
    });
    app.use(express.static(root, {
        index: false,
        redirect: false,
        dotfiles: 'ignore',
        setHeaders(res, path) {
            // Vite fingerprints generated assets. Public files and HTML may
            // change at the same URL, so they must not inherit that lifetime.
            const assets = resolve(root, 'assets') + '/';
            res.setHeader('Cache-Control', path.startsWith(assets)
                ? 'public, max-age=31536000, immutable' : 'no-cache');
            res.setHeader('X-Content-Type-Options', 'nosniff');
        },
    }));
    app.get(pageRoute, (req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.sendFile(index);
    });
    app.use((req, res) => {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    });
}

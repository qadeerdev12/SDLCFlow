import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { checkAuthDeployment } from '../src/config/authDeployment.js';

// Read files without modifying process.env or displaying their secret values.
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => existsSync(path) ? dotenv.parse(readFileSync(path)) : {};
try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !['--local', '--production'].includes(args[0])) {
        throw new Error('Usage: npm run check:auth-config -- --local|--production');
    }
    const mode = args[0].slice(2);
    const viteMode = mode === 'local' ? 'development' : 'production';
    const server = { ...read(resolve(root, '.env')), ...process.env };
    // Match Vite file precedence; shell variables override files. Expansion is
    // rejected below rather than silently validating a different effective URL.
    const client = Object.assign({}, ...['.env', '.env.local', `.env.${viteMode}`, `.env.${viteMode}.local`]
        .map((name) => read(resolve(root, '../client', name))), process.env);
    for (const value of [server.CLIENT_ORIGIN, server.CLIENT_URL, client.VITE_API_URL, client.VITE_SOCKET_URL]) {
        if (value?.includes('$')) throw new Error('Use explicit URL values for this preflight; variable expansion is not supported');
    }
    const result = checkAuthDeployment({ server, client, mode });
    console.log('Authentication configuration preflight passed. Live authentication was NOT changed.');
    console.log(JSON.stringify(result, null, 2));
    console.log('This validates configuration only, not browser cookies, proxy routing or live connectivity.');
} catch (error) {
    console.error(`Authentication configuration preflight failed: ${error.message}`);
    process.exitCode = 1;
}

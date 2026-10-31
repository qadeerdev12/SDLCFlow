import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const usage = 'Usage: npm --prefix server run check:email -- --send';

// Exporting the command lets tests inject fake credentials and fetch without
// reading private .env files or contacting the provider.
export async function checkEmail({ args, env, fetchImpl = globalThis.fetch }) {
    if (args.length !== 1 || args[0] !== '--send') throw new Error(usage);
    const key = env.BREVO_API_KEY?.trim();
    const name = env.EMAIL_FROM_NAME?.trim();
    const email = env.EMAIL_FROM_ADDRESS?.trim();
    if (!key || /[\r\n]/.test(key)) throw new Error('Set a valid BREVO_API_KEY in server/.env.');
    if (!name || name.length > 128 || /[\r\n]/.test(name)) throw new Error('Set a valid EMAIL_FROM_NAME in server/.env.');
    if (!email || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) {
        throw new Error('Set a valid EMAIL_FROM_ADDRESS in server/.env.');
    }

    let response;
    let result;
    try {
        // One explicit send, no retries: a timeout may happen after acceptance.
        // Disallow redirects so credentials cannot follow a different endpoint.
        response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
            headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
                sender: { name, email },
                to: [{ email }],
                subject: 'SDLCFlow email delivery test',
                textContent: 'This is a manually requested SDLCFlow delivery test. No account or password was changed. If you can read this message, delivery to this inbox succeeded.',
            }),
        });
        if (response.status === 201) result = await response.json();
    } catch {
        // Never expose provider bodies or thrown errors: they may contain secrets
        // or recipient details. Check provider logs before retrying an unknown send.
        throw new Error('Email request failed or timed out. Delivery is unknown; check Brevo logs before retrying.');
    }
    if (response.status !== 201) {
        const hints = {
            400: 'Check the verified sender and request settings.',
            401: 'Check that the API key is valid and has not expired.',
            403: 'Check key permissions, account activation, and authorized IP settings.',
            429: 'Sending is rate limited or quota constrained; check Brevo before retrying.',
        };
        throw new Error(`Brevo returned HTTP ${response.status}. ${hints[response.status] || 'Check transactional logs before retrying.'}`);
    }
    if (typeof result?.messageId !== 'string' || !result.messageId.trim()) {
        throw new Error('Brevo returned an unexpected acceptance response. Check logs before retrying.');
    }
    return 'Brevo accepted the test email. Check your inbox, spam folder, and transactional logs; acceptance does not confirm delivery.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        // Require explicit intent before loading credentials. Shell values win,
        // and resolving relative to this script works from any working directory.
        const args = process.argv.slice(2);
        if (args.length !== 1 || args[0] !== '--send') throw new Error(usage);
        const path = fileURLToPath(new URL('../.env', import.meta.url));
        let fileEnv;
        try {
            fileEnv = existsSync(path) ? dotenv.parse(readFileSync(path)) : {};
        } catch {
            throw new Error('Could not read server/.env. Check file access.');
        }
        console.log(await checkEmail({ args, env: { ...fileEnv, ...process.env } }));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// All API traffic is mocked: this check must never send real email or proof.
const origin = process.argv[2] || 'http://127.0.0.1:5180';
const url = new URL(origin);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'http:') throw new Error('Use local HTTP Vite');
const out = '/private/tmp/sdlcflow-verification-ui';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const token = 'a'.repeat(64);
try {
    for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
        const context = await browser.newContext({ viewport: { width, height } });
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        let confirms = 0, invalid = false;
        await context.route('**/api/v1/**', async (route) => {
            const request = route.request();
            const path = new URL(request.url()).pathname;
            const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
                'access-control-allow-headers': 'Content-Type,X-SDLCFlow-CSRF,Authorization', 'access-control-allow-methods': 'POST,GET,OPTIONS' };
            if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
            let status = 401, body = { error: { code: 'REFRESH_INVALID', message: 'Sign in again' } };
            if (path.endsWith('/verify-email')) {
                confirms++;
                assert.equal(request.postDataJSON().token, token);
                status = invalid ? 400 : 200;
                body = invalid ? { error: { code: 'EMAIL_VERIFICATION_INVALID', message: 'Invalid link' } } : { data: { verified: true } };
            }
            await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.goto(`${origin}/verify-email#token=${token}`);
        await page.getByRole('button', { name: 'Verify email', exact: true }).waitFor();
        assert.equal(new URL(page.url()).hash, '');
        assert.equal(confirms, 0, 'Opening mail must not consume proof');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: `${out}/${label}.png`, fullPage: true });
        await page.getByRole('button', { name: 'Switch to dark theme' }).click();
        await page.screenshot({ path: `${out}/${label}-dark.png`, fullPage: true });
        await page.getByRole('button', { name: 'Verify email', exact: true }).click();
        await page.getByRole('heading', { name: 'Email verified', exact: true }).waitFor();
        assert.equal(confirms, 1);
        assert.ok(await page.evaluate((proof) => !JSON.stringify([localStorage, sessionStorage]).includes(proof), token));
        invalid = true;
        await page.goto(`${origin}/verify-email#token=${token}`);
        await page.getByRole('button', { name: 'Verify email', exact: true }).click();
        await page.getByRole('alert').waitFor();
        assert.equal(confirms, 2);
        await page.reload();
        await page.getByRole('heading', { name: 'Check your verification link' }).waitFor();
        assert.equal(confirms, 2);
        assert.deepEqual(errors, []);
        await context.close();
        console.log(`${label}: explicit confirmation, scrubbing, success, replay, reload and layout passed`);
    }
    console.log(`Screenshots: ${out}`);
} finally { await browser.close(); }

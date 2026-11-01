import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// UI-only check: every API call is intercepted. Never use a real reset token or
// enable email delivery for this script. Its screenshots contain only fake data.
const origin = process.argv[2] || 'http://127.0.0.1:5180';
const url = new URL(origin);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'http:') {
    throw new Error('Use a local HTTP Vite origin');
}
const out = '/private/tmp/sdlcflow-recovery-ui';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const token = 'a'.repeat(64);
let resetCount = 0;
try {
    for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
        const context = await browser.newContext({ viewport: { width, height } });
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        let resetFailure = false;
        await context.route('**/api/v1/**', async (route) => {
            const request = route.request();
            const path = new URL(request.url()).pathname;
            const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
                'access-control-allow-headers': 'Content-Type,X-SDLCFlow-CSRF', 'access-control-allow-methods': 'POST,GET,OPTIONS' };
            if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
            let status = 401, body = { error: { code: 'REFRESH_INVALID', message: 'Sign in again' } };
            if (path.endsWith('/forgot-password')) {
                status = 202; body = { data: { message: 'Generic acknowledgement' } };
            } else if (path.endsWith('/reset-password')) {
                resetCount++;
                assert.equal(request.postDataJSON().token, token);
                status = resetFailure ? 400 : 200;
                body = resetFailure ? { error: { code: 'PASSWORD_RESET_INVALID', message: 'Invalid link' } } : { data: { updated: true } };
            }
            await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
        });
        const fits = async () => {
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: horizontal overflow`);
            for (const input of await page.locator('input').all()) {
                const box = await input.boundingBox();
                assert.ok(box && box.x >= 0 && box.x + box.width <= width, 'Input outside viewport');
            }
        };
        await page.goto(`${origin}/login`);
        await page.getByRole('link', { name: 'Forgot password?' }).click();
        // Both login and recovery have an Email field. Wait for the lazy route
        // before filling so the test cannot target the outgoing login form.
        await page.getByRole('heading', { name: 'Forgot your password?' }).waitFor();
        await page.getByLabel('Email', { exact: true }).fill('test@example.com');
        await fits();
        await page.screenshot({ path: `${out}/${label}-forgot.png`, fullPage: true });
        await page.getByRole('button', { name: 'Send reset link' }).click();
        await page.getByRole('heading', { name: 'Check your email' }).waitFor();

        const before = resetCount;
        await page.goto(`${origin}/reset-password#token=${token}`);
        await page.getByLabel('New password', { exact: true }).waitFor();
        assert.equal(new URL(page.url()).hash, '');
        assert.equal(resetCount, before, 'Opening a link must not submit it');
        await fits();
        await page.screenshot({ path: `${out}/${label}-reset.png`, fullPage: true });
        await page.getByRole('button', { name: 'Switch to dark theme' }).click();
        await fits();
        await page.screenshot({ path: `${out}/${label}-reset-dark.png`, fullPage: true });
        await page.getByLabel('New password', { exact: true }).fill('replacement passphrase');
        await page.getByLabel('Confirm new password').fill('replacement passphrase');
        await page.getByRole('button', { name: 'Update password' }).click();
        await page.getByRole('heading', { name: 'Password updated' }).waitFor();
        assert.equal(resetCount, before + 1);
        assert.ok(await page.evaluate((secret) => !JSON.stringify([localStorage, sessionStorage]).includes(secret), token));

        resetFailure = true;
        await page.goto(`${origin}/reset-password#token=${token}`);
        await page.getByLabel('New password', { exact: true }).fill('replacement passphrase');
        await page.getByLabel('Confirm new password').fill('replacement passphrase');
        await page.getByRole('button', { name: 'Update password' }).click();
        await page.getByRole('link', { name: 'Request a new link', exact: true }).waitFor();
        assert.equal(await page.locator('input').count(), 0);
        await page.reload();
        await page.getByRole('link', { name: 'Request a new link', exact: true }).waitFor();
        assert.deepEqual(errors, []);
        await context.close();
        console.log(`${label}: navigation, URL scrubbing, layout, success, invalid link and reload passed`);
    }
    console.log(`Screenshots: ${out}`);
} finally { await browser.close(); }

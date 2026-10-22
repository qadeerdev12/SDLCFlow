import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function checkLayout(page, scope) {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, 'Authentication page must not scroll horizontally');
  const controls = scope.locator('input, button');
  for (const control of await controls.all()) {
    if (!await control.isVisible()) continue;
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0);
    assert.ok(box.x >= -1 && box.x + box.width <= page.viewportSize().width + 1, 'Control must fit within viewport');
    // Hit-testing catches sticky/fixed elements covering a visible control.
    assert.equal(await control.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit === element || element.contains(hit);
    }), true, 'Control center must not be covered');
  }
}

export async function checkMobileAuth({ newPage, origin, password, browserName }) {
  const screenshots = await mkdtemp(join(tmpdir(), `sdlcflow-auth-${browserName}-`));
  const page = await newPage();
  try {
    // Viewport resizing works in all three engines. It is not touch/keyboard or
    // device emulation, and does not certify an actual iPhone or Android browser.
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [path, heading] of [['login', 'Log in to SDLCFlow'], ['register', 'Create your account']]) {
        await page.goto(`${origin}/${path}`);
        await page.getByRole('heading', { name: heading, exact: true }).waitFor();
        await checkLayout(page, page.locator('form'));
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: join(screenshots, `${path}-${width}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Name', { exact: true }).fill('Mobile Tester');
    await page.getByLabel('Email', { exact: true }).fill('mobile@example.test');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByRole('heading', { name: "Mobile's projects", exact: true }).waitFor();
    await page.locator('button[aria-haspopup="menu"]').click();
    await page.getByRole('menuitem', { name: 'Profile', exact: true }).click();
    await page.getByRole('heading', { name: 'Profile', exact: true }).waitFor();
    await page.getByLabel('Email', { exact: true }).waitFor();
    await checkLayout(page, page.locator('main'));
    await page.getByRole('button', { name: 'Log out everywhere', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.waitFor();
    await checkLayout(page, dialog);
    await page.screenshot({ path: join(screenshots, 'confirmation-390.png') });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('heading', { name: 'Profile', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Profile', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'Mobile Tester');
    console.log('PASS auth layouts at 320/390/768px; mobile-sized signup, profile menu, confirmation cancellation and reload');
    console.log(`Disposable-data screenshots: ${screenshots}`);
  } finally {
    await page.context().close();
  }
}

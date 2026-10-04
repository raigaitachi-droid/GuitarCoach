import { expect, test } from '@playwright/test';
import * as alphaTab from '@coderline/alphatab';

function tabFile() {
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "My saved riff" \\tempo 60 . 0.6.1 | 2.6.1', new alphaTab.Settings());
  return { name: 'saved-riff.gp', mimeType: 'application/octet-stream', buffer: Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore())) };
}

test('My Tabs persists imported files, deduplicates, reopens and removes them', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'My Tabs', exact: true }).click();
  await expect(page.getByText('No saved tabs yet.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles(tabFile());
  await expect(page.getByRole('heading', { name: 'My saved riff' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'My Tabs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open My saved riff' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('my-tabs.png') });
  await page.getByRole('button', { name: 'Open My saved riff' }).click();
  await expect(page.getByRole('heading', { name: 'My saved riff' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue without audio' }).click();
  await expect(page.getByRole('img', { name: /3D guitar note highway/ })).toBeVisible();
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await page.getByRole('button', { name: 'Load another tab' }).click();
  await page.getByRole('button', { name: 'My Tabs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open My saved riff' })).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Open My saved riff' })).toBeInViewport();
  await page.getByRole('button', { name: 'Remove My saved riff' }).click();
  await expect(page.getByText('No saved tabs yet.', { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'My Tabs', exact: true }).click();
  await expect(page.getByText('No saved tabs yet.', { exact: false })).toBeVisible();
});

test('unavailable local storage does not stop importing or playing a tab', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get() { throw new Error('Storage unavailable'); } });
  });
  await page.goto('/');
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles(tabFile());
  await expect(page.getByRole('heading', { name: 'My saved riff' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('couldn’t be saved to My Tabs');
  await page.getByRole('button', { name: 'Continue without audio' }).click();
  await expect(page.getByRole('img', { name: /3D guitar note highway/ })).toBeVisible();
});

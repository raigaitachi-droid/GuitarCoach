import { expect, test } from '@playwright/test';
import { firstHighwayNote, highwayLaneX, highwayNotes, highwayNoteZ } from '../src/utils/noteHighway';
import type { TabNote } from '../src/types';

test('notes reach the hit line at their song time, including chords and rewinds', () => {
  const note = (id: string, string: number, timestampMs: number): TabNote =>
    ({ id, string, timestampMs, fret: 12, durationMs: 500 });
  const source = [note('later', 1, 3000), note('low', 6, 1500), note('high', 1, 1500), note('unsupported', 7, 1000)];
  const sorted = highwayNotes(source);
  expect(sorted.map((n) => n.id)).toEqual(['low', 'high', 'later']);
  expect(source[0].id).toBe('later');
  expect(highwayLaneX(6)).toBeLessThan(highwayLaneX(1));
  expect(new Set([1, 2, 3, 4, 5, 6].map(highwayLaneX)).size).toBe(6);
  expect(highwayNoteZ(1500, 1000)).toBeLessThan(0);
  expect(highwayNoteZ(1500, 1500)).toBeCloseTo(0);
  expect(highwayNoteZ(1500, 1800)).toBeGreaterThan(0);
  expect(firstHighwayNote(sorted, 1600)).toBe(2);
  expect(firstHighwayNote(sorted, 1500)).toBe(0);
  expect(firstHighwayNote(sorted, 4000)).toBe(3);
  expect(firstHighwayNote([], 0)).toBe(0);
});

test('3D scene moves, freezes with transport, resizes, and remounts alongside the tab', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Try demo song' }).click();
  await page.getByRole('button', { name: 'Continue without audio' }).click();
  const highway = page.getByRole('img', { name: /3D guitar note highway/ });
  await expect(highway).toBeVisible();
  await expect(page.getByText('3D view is unavailable.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('img', { name: /Scrolling guitar tablature/ })).toBeVisible();
  const highwayShot = async () => {
    const box = await highway.boundingBox();
    expect(box).not.toBeNull();
    return page.screenshot({
      clip: {
        x: Math.round(box!.x + box!.width * 0.32),
        y: Math.round(box!.y + box!.height * 0.24),
        width: Math.round(box!.width * 0.36),
        height: Math.round(box!.height * 0.32),
      },
    });
  };
  const moving = await highwayShot();
  await page.waitForTimeout(250);
  expect((await highwayShot()).equals(moving)).toBe(false);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const progress = await page.getByRole('progressbar').getAttribute('value');
  await page.waitForTimeout(250);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', progress!);
  await page.getByLabel('Tempo', { exact: true }).fill('60');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', progress!);
  await page.setViewportSize({ width: 480, height: 850 });
  await expect(highway).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const resumed = await highwayShot();
  await page.waitForTimeout(250);
  expect((await highwayShot()).equals(resumed)).toBe(false);
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(highway).toHaveCount(0);
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(highway).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('unavailable WebGL preserves tablature and playback controls', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (kind === 'webgl2' || kind === 'webgl' || kind === 'experimental-webgl') return null;
      return original.apply(this, [kind, ...args] as any);
    } as typeof original;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try demo song' }).click();
  await page.getByRole('button', { name: 'Continue without audio' }).click();
  await expect(page.getByText('3D view is unavailable. Continue with the tablature below.')).toBeVisible();
  await expect(page.getByRole('img', { name: /Scrolling guitar tablature/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Paused');
});

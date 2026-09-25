import { expect, Page, test } from '@playwright/test';
import * as alphaTab from '@coderline/alphatab';

function guitarProFile() {
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Test riff" \\tempo 120 . 0.6.4 2.6.4 3.6.4 0.5.4', new alphaTab.Settings());
  return Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
}

async function silentGuitar(page: Page) {
  // Exercise real AudioContext + worklet setup with a deterministic silent input.
  // No production test hooks and no dependence on the machine's microphone.
  await page.addInitScript(() => {
    const state = { active: 0, inputsAvailable: true, constraints: null as MediaStreamConstraints | null, pluck: (_midi: number, _gain?: number) => {}, chord: (_midis: number[]) => {}, disconnect: () => {} };
    (window as any).testGuitar = state;
    navigator.mediaDevices.enumerateDevices = async () => state.inputsAvailable ? [
      { deviceId: 'usb-guitar', groupId: 'guitar', kind: 'audioinput', label: 'USB test guitar', toJSON: () => ({}) } as MediaDeviceInfo,
    ] : [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      state.constraints = constraints || null;
      const context = new AudioContext();
      const source = context.createConstantSource();
      source.offset.value = 0;
      const destination = context.createMediaStreamDestination();
      source.connect(destination);
      source.start();
      state.pluck = (midi, level = 0.15) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
        gain.gain.value = level;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.3);
      };
      state.chord = (midis) => {
        for (const midi of midis) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
          gain.gain.value = 0.08;
          oscillator.connect(gain).connect(destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 2.8);
        }
      };
      const stream = destination.stream;
      const track = stream.getAudioTracks()[0];
      const stop = track.stop.bind(track);
      let ended = false;
      state.active++;
      track.stop = () => { if (!ended) { ended = true; state.active--; source.stop(); void context.close(); } stop(); };
      state.disconnect = () => { track.dispatchEvent(new Event('ended')); track.stop(); };
      return stream;
    };
  });
}

async function loadRiff(page: Page, extension = '.gp') {
  await page.getByLabel('Guitar Pro file').setInputFiles({ name: `riff${extension}`, mimeType: 'application/octet-stream', buffer: guitarProFile() });
  await expect(page.getByRole('heading', { name: 'Test riff' })).toBeVisible();
}

test('minimal start, demo, pause, result, replay, and new tab', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'GuitarCoach' })).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Try demo song' }).click();
  await page.getByRole('button', { name: 'Continue without audio' }).click();
  await expect(page.getByRole('img', { name: /Scrolling guitar tablature/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Paused');
  const progress = await page.getByRole('progressbar').getAttribute('value');
  await page.getByLabel('Tempo', { exact: true }).fill('84');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', progress!);
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByRole('heading', { name: 'Practice complete' })).toBeVisible();
  await expect(page.getByText('Connect your guitar input to get feedback.')).toBeVisible();
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('84');
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await page.getByRole('button', { name: 'Load another tab' }).click();
  await expect(page.getByRole('button', { name: 'Drop Guitar Pro file', exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test('file errors recover; a real GP file reaches natural completion', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Guitar Pro file').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not a tab') });
  await expect(page.getByRole('alert')).toContainText('Choose a Guitar Pro file');
  await page.getByLabel('Guitar Pro file').setInputFiles({ name: 'bad.gp', mimeType: 'application/octet-stream', buffer: Buffer.from('not a tab') });
  await expect(page.getByRole('alert')).toContainText('We couldn’t open that tab');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Continue without audio' }).click();
  await expect(page.getByRole('heading', { name: 'Test riff' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Practice complete' })).toBeVisible({ timeout: 8000 });
});

test('selected audio input, wait gate, zero score for silence, and cleanup', async ({ page }) => {
  await silentGuitar(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await loadRiff(page, '.gp7');
  await page.getByRole('button', { name: 'Find inputs' }).click();
  await expect(page.getByRole('button', { name: 'Start Practice' })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).testGuitar.active)).toBe(0);
  await page.getByLabel('Guitar input', { exact: true }).selectOption('usb-guitar');
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for', { timeout: 5000 });
  const position = await page.getByRole('progressbar').getAttribute('value');
  await page.getByLabel('Tempo', { exact: true }).fill('96');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', position!);
  expect(await page.evaluate(() => (window as any).testGuitar.constraints.audio.deviceId.exact)).toBe('usb-guitar');
  await page.getByRole('button', { name: 'Wait Mode On' }).click();
  await expect(page.getByRole('heading', { name: '0% accuracy' })).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Weakest section:')).toBeVisible();
  await page.getByRole('button', { name: 'Practice weak section' }).click();
  await expect(page.getByRole('button', { name: 'Loop On' })).toBeVisible();
  await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('84');
  await page.getByRole('button', { name: 'Finish practice' }).click();
  expect(await page.evaluate(() => (window as any).testGuitar.active)).toBe(0);
  await page.getByRole('button', { name: 'Play again' }).click();
  expect(await page.evaluate(() => (window as any).testGuitar.active)).toBe(1);
  await page.getByRole('button', { name: 'Finish practice' }).click();
  expect(await page.evaluate(() => (window as any).testGuitar.active)).toBe(0);
  expect(errors).toEqual([]);
});

test('permission denial keeps the tab and offers playback without a score', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try demo song' }).click();
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('alert')).toHaveText('Allow microphone access in your browser, then try again.');
  await page.getByRole('button', { name: 'Continue without audio' }).click();
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByRole('heading', { name: 'Practice complete' })).toBeVisible();
});

test('a disconnected input pauses practice with a human error', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Listening');
  await page.evaluate(() => (window as any).testGuitar.disconnect());
  await expect(page.getByRole('status')).toHaveText('Your guitar input disconnected. Check the cable and try again.');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
});

test('a removed selected input returns to the default choice', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Find inputs' }).click();
  const input = page.getByLabel('Guitar input', { exact: true });
  await input.selectOption('usb-guitar');
  await page.evaluate(() => {
    (window as any).testGuitar.inputsAvailable = false;
    navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
  });
  await expect(input).toHaveValue('');
});

test('a real worklet pitch event releases the wait gate and appears in the result', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for E2');
  const waitingPosition = await page.getByRole('progressbar').getAttribute('value');
  await page.evaluate(() => (window as any).testGuitar.pluck(41));
  await expect(page.getByRole('status')).toContainText('Wrong note · play E2');
  await page.waitForTimeout(250);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', waitingPosition!);
  await page.evaluate(() => (window as any).testGuitar.pluck(40));
  await expect(page.getByRole('status')).toContainText('Correct note');
  await expect(page.getByText(/Heard E2 · 82\.4 Hz/)).toBeVisible();
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByRole('heading', { name: '100% accuracy' })).toBeVisible();
  await expect(page.getByText('1 of 1 single notes played correctly.')).toBeVisible();
});

test('a quiet guitar-input signal can still release Wait Mode', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for E2');
  await page.evaluate(() => (window as any).testGuitar.pluck(40, 0.006));
  await expect(page.getByRole('status')).toContainText('Correct note');
});

test('Coach Mode turns on a bar loop and keeps BPM directly adjustable', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await page.getByRole('button', { name: 'Coach Mode Off' }).click();
  await expect(page.getByRole('button', { name: 'Coach Mode On' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Loop On' })).toBeVisible();
  await page.getByRole('button', { name: 'Increase tempo' }).click();
  await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('125');
});

test('a loop can be selected by clicking its first and last tab notes', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await page.getByRole('button', { name: 'Loop Off' }).click();
  await expect(page.getByText('Click start note')).toBeVisible();
  const tab = page.locator('canvas');
  const box = await tab.boundingBox();
  if (!box) throw new Error('Tab canvas is not visible');
  let first: { x: number; y: number } | null = null;
  for (let x = 60; x < box.width - 20 && !first; x += 25) {
    for (let y = 45; y < box.height - 25 && !first; y += 35) {
      await tab.click({ position: { x, y } });
      if (await page.getByText('Click end note').count()) first = { x, y };
    }
  }
  if (!first) throw new Error('No rendered tab note could be selected');
  await expect(page.getByText('Click end note')).toBeVisible();
  let completed = false;
  for (let x = first.x + 40; x < box.width - 20 && !completed; x += 25) {
    for (let y = 45; y < box.height - 25 && !completed; y += 35) {
      await tab.click({ position: { x, y } });
      completed = await page.getByText('Select notes').count() > 0;
    }
  }
  await expect(page.getByText(/Loop Note/)).toBeVisible();
});

test('the background polyphonic preview reports a played chord without touching score state', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await page.evaluate(() => (window as any).testGuitar.chord([40, 47, 52]));
  await expect(page.getByText(/Chord preview:/)).toBeVisible({ timeout: 40_000 });
});

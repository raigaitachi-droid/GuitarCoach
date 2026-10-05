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
    const state = { active: 0, inputsAvailable: true, constraints: null as MediaStreamConstraints | null, pluck: (_midi: number, _gain?: number, _duration?: number, _ripple?: boolean) => {}, hold: (_midi: number) => {}, changePitch: (_midi: number) => {}, harmonic: (_openMidi: number) => {}, chord: (_midis: number[], _partials?: boolean) => {}, strum: (_midis: number[], _spacing?: number, _delay?: number) => {}, disconnect: () => {} };
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
      let heldOscillator: OscillatorNode | null = null;
      state.hold = (midi) => {
        heldOscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.value = 0.1;
        heldOscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
        heldOscillator.connect(gain).connect(destination);
        heldOscillator.start();
      };
      state.changePitch = (midi) => {
        heldOscillator?.frequency.linearRampToValueAtTime(440 * Math.pow(2, (midi - 69) / 12), context.currentTime + 0.015);
      };
      state.pluck = (midi, level = 0.15, duration = 0.3, ripple = false) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
        gain.gain.value = level;
        if (ripple) {
          const curve = Float32Array.from({ length: 512 }, (_, index) => {
            const age = index / 511 * duration;
            return level * (0.8 + 0.2 * Math.sin(2 * Math.PI * 7 * age)) * Math.exp(-age / 0.8);
          });
          gain.gain.setValueCurveAtTime(curve, context.currentTime, duration);
        }
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        oscillator.stop(context.currentTime + duration);
      };
      state.harmonic = (openMidi) => {
        const openHz = 440 * Math.pow(2, (openMidi - 69) / 12);
        for (const [multiple, level] of [[3, 0.08], [6, 0.036], [1, 0.024]]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = openHz * multiple;
          gain.gain.value = level;
          oscillator.connect(gain).connect(destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.6);
        }
      };
      state.chord = (midis, partials = false) => {
        for (const midi of midis) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
          if (partials) oscillator.setPeriodicWave(context.createPeriodicWave(new Float32Array(4),
            new Float32Array([0, 1, 0.35, 0.15]), { disableNormalization: true }));
          gain.gain.value = 0.08;
          oscillator.connect(gain).connect(destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 5);
        }
      };
      state.strum = (midis, spacing = 0.11, delay = 0) => {
        const start = context.currentTime + 0.02 + delay;
        midis.forEach((midi, index) => {
          const at = start + index * spacing;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
          gain.gain.setValueAtTime(0.08, at);
          gain.gain.exponentialRampToValueAtTime(0.08 * Math.exp(-5 / 0.8), at + 5);
          oscillator.connect(gain).connect(destination);
          oscillator.start(at); oscillator.stop(at + 5);
        });
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
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: `riff${extension}`, mimeType: 'application/octet-stream', buffer: guitarProFile() });
  await expect(page.getByRole('heading', { name: 'Test riff' })).toBeVisible();
}

test('minimal start, demo, pause, result, replay, and new tab', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'GuitarCoach' })).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(3);
  await page.getByRole('button', { name: 'Try demo song' }).click();
  await page.getByRole('button', { name: 'Continue without audio' }).click();
  await expect(page.getByRole('img', { name: /Scrolling guitar tablature/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Paused');
  const progress = await page.getByRole('progressbar').getAttribute('value');
  await page.getByRole('button', { name: 'Playback speed', exact: true }).click();
  await page.getByLabel('Tempo', { exact: true }).fill('84');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', progress!);
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByRole('heading', { name: 'Practice complete' })).toBeVisible();
  await expect(page.getByText('Connect your guitar input to get feedback.')).toBeVisible();
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Playback speed', exact: true }).click();
  await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('84');
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await page.getByRole('button', { name: 'Load another tab' }).click();
  await expect(page.getByRole('button', { name: 'Drop Guitar Pro file', exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test('file errors recover; a real GP file reaches natural completion', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not a tab') });
  await expect(page.getByRole('alert')).toContainText('Choose a Guitar Pro file');
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'bad.gp', mimeType: 'application/octet-stream', buffer: Buffer.from('not a tab') });
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
  await page.getByRole('button', { name: 'Playback speed', exact: true }).click();
  await page.getByLabel('Tempo', { exact: true }).fill('96');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', position!);
  expect(await page.evaluate(() => (window as any).testGuitar.constraints.audio.deviceId.exact)).toBe('usb-guitar');
  await page.getByRole('button', { name: 'Wait Mode On' }).click();
  await expect(page.getByRole('heading', { name: '0% accuracy' })).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Weakest section:')).toBeVisible();
  await page.getByRole('button', { name: 'Practice weak section' }).click();
  await expect(page.getByRole('button', { name: 'Loop On' })).toBeVisible();
  await page.getByRole('button', { name: 'Playback speed', exact: true }).click();
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
  await expect(page.getByRole('status')).toContainText(/Listening|Waiting for/);
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
  expect(page.workers().some((worker) => worker.url().includes('monoPitchWorker'))).toBeTruthy();
  expect(page.workers().some((worker) => worker.url().includes('polyphonicPitchWorker'))).toBeFalsy();
  // Attack estimates deliberately tolerate one semitone; use a pitch outside
  // that tolerance to test the wrong-note path.
  await page.evaluate(() => (window as any).testGuitar.pluck(43));
  await expect(page.getByRole('status')).toContainText('Waiting for E2');
  await expect(page.getByRole('region', { name: 'Live practice feedback' })).toHaveCount(0);
  await page.waitForTimeout(250);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', waitingPosition!);
  await page.evaluate(() => (window as any).testGuitar.pluck(40));
  await expect(page.getByRole('status')).toContainText('Correct note');
  await expect(page.getByText(/Heard E2 · 82\.4 Hz/)).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('.practice-feedback-burst')).toHaveCount(0, { timeout: 2500 });
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByRole('heading', { name: 'Practice complete' })).toBeVisible();
  await expect(page.getByText('1 note practiced · no timing or score.')).toBeVisible();
  await expect.poll(() => page.workers().filter((worker) => worker.url().includes('monoPitchWorker')).length).toBe(0);
});

test('wait mode recognizes high E and chord tones without a game score', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Wait chord" \\tempo 120 . 0.1.4 (0.6 2.5).4 3.6.4', new alphaTab.Settings());
  const buffer = Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'wait-chord.gp', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for E4');
  // An adjacent fret must never clear the target just because it is an onset.
  await page.evaluate(() => (window as any).testGuitar.pluck(65));
  await page.waitForTimeout(400);
  await expect(page.getByRole('status')).toContainText('Waiting for E4');
  await page.evaluate(() => (window as any).testGuitar.pluck(64));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1500');
  await expect(page.getByRole('status')).toContainText('Waiting for B2');
  const responseMs = await page.evaluate(() => new Promise<number>((resolve) => {
    const status = document.querySelector('[role="status"]')!;
    const started = performance.now();
    const observer = new MutationObserver(() => {
      if (!status.textContent?.includes('Correct note')) return;
      observer.disconnect();
      resolve(performance.now() - started);
    });
    observer.observe(status, { childList: true, subtree: true, characterData: true });
    (window as any).testGuitar.pluck(40);
  }));
  console.info(`Browser guitar-to-feedback response: ${Math.round(responseMs)} ms`);
  expect(responseMs).toBeLessThan(500);
  await expect(page.getByRole('status')).toContainText('Waiting for B2');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1500');
  // Pick individually: overlapping synthesized sines form a polyphonic input.
  await page.waitForTimeout(350);
  await page.evaluate(() => (window as any).testGuitar.pluck(47));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2000');
  await expect(page.getByRole('region', { name: 'Live practice feedback' })).toHaveCount(0);
});

test('turning wait mode off restores game feedback and combo HUD', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for E2');
  await page.getByRole('button', { name: 'Wait Mode On' }).click();
  // Pick immediately after the mode change; checking the HUD first adds
  // an uncontrolled delay to the real-time judgement under rendering load.
  await page.evaluate(() => (window as any).testGuitar.pluck(50));
  await expect(page.getByRole('region', { name: 'Live practice feedback' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Wrong note');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  // The advancing game can also assess a missed note while the assertion waits.
  expect(Number(await page.locator('.hud-grid span').filter({ hasText: 'wrong' }).locator('b').innerText())).toBeGreaterThan(0);
});

test('retry clears judged notes and feedback while keeping the input connected', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for E2');
  await page.evaluate(() => (window as any).testGuitar.pluck(40));
  await expect(page.getByRole('status')).toContainText('Correct note');
  await page.getByRole('button', { name: 'Retry practice' }).click();
  await expect(page.locator('.practice-feedback-burst')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Live practice feedback' })).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Waiting for E2');
  expect(await page.evaluate(() => (window as any).testGuitar.active)).toBe(1);
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByText('0 notes practiced · no timing or score.')).toBeVisible();
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

test('one sustained pick cannot clear successive identical notes', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Repeated E" \\tempo 120 . 0.6.4 0.6.4 0.6.4', new alphaTab.Settings());
  const buffer = Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'repeated.gp', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for E2');
  await page.evaluate(() => (window as any).testGuitar.pluck(40, 0.15, 2));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1500');
  await expect(page.getByRole('status')).toContainText('Waiting for E2');
  const position = await page.getByRole('progressbar').getAttribute('value');
  await page.waitForTimeout(2200);
  await expect(page.getByRole('region', { name: 'Live practice feedback' })).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', position!);
  await page.evaluate(() => (window as any).testGuitar.pluck(40));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2000');
});

test('microphone-like ringing ripples cannot penalize the next different note', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for E2');
  await page.evaluate(() => (window as any).testGuitar.pluck(40, 0.15, 2, true));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1500');
  await expect(page.getByRole('status')).toContainText('Waiting for F♯2');
  await page.waitForTimeout(2200);
  await expect(page.getByRole('region', { name: 'Live practice feedback' })).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Waiting for F♯2');
  await page.evaluate(() => (window as any).testGuitar.pluck(45));
  await expect(page.getByRole('status')).toContainText('Waiting for F♯2');
  await page.waitForTimeout(500);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1500');
});

test('manual loop and BPM controls remain available without Coach Mode', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('button', { name: /Coach Mode/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Loop Off' }).click();
  await expect(page.getByRole('button', { name: 'Loop On' })).toBeVisible();
  await page.getByRole('button', { name: 'Playback speed', exact: true }).click();
  await page.getByRole('button', { name: 'Increase tempo' }).click();
  await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('125');
});

test('a loop snaps to nearby notes when dragged through empty tab space', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  await loadRiff(page);
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await page.getByRole('button', { name: 'Loop Off' }).click();
  await expect(page.getByText('Drag from first note to last note')).toBeVisible();
  const tab = page.getByRole('img', { name: 'Drag from the first note to the last note to set the loop' });
  const box = await tab.boundingBox();
  if (!box) throw new Error('Tab canvas is not visible');
  // Deliberately drag in the empty header area, not over a fret label. The
  // selection should snap to the closest timeline notes at each endpoint.
  await page.mouse.move(box.x + 60, box.y + 18);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(box.width - 40, 500), box.y + 18);
  await page.mouse.up();
  await expect(page.getByText(/Loop Note/)).toBeVisible();
});

test('loop selection scrolls past the visible notes at the edge and with the wheel', async ({ page }) => {
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Long loop" \\tempo 120 . ' + Array(8).fill('0.6.4 2.6.4 3.6.4 5.6.4').join(' | '), new alphaTab.Settings());
  const buffer = Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
  await page.goto('/');
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'long.gp', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('button', { name: 'Continue without audio' }).click();
  await page.getByRole('button', { name: 'Loop Off' }).click();
  const tab = page.getByRole('img', { name: 'Drag from the first note to the last note to set the loop' });
  const box = (await tab.boundingBox())!;
  const position = await page.getByRole('progressbar').getAttribute('value');
  await page.mouse.move(box.x + box.width * 0.18, box.y + 28);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + 28);
  await page.waitForTimeout(2000);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', position!);
  await page.mouse.up();
  const label = await page.locator('.bar-position').innerText();
  const range = label.match(/Loop Note (\d+)–Note (\d+)/)!;
  expect(Number(range[2]) - Number(range[1])).toBeGreaterThan(9);
  await page.getByRole('button', { name: 'Select notes' }).click();
  await page.mouse.move(box.x + box.width * 0.18, box.y + 28);
  await page.mouse.down();
  await page.mouse.wheel(2000, 0);
  await page.waitForTimeout(200);
  await page.mouse.up();
  const wheelRange = (await page.locator('.bar-position').innerText()).match(/Loop Note (\d+)–Note (\d+)/)!;
  expect(Number(wheelRange[2]) - Number(wheelRange[1])).toBeGreaterThan(9);
});

test('realtime polyphonic worker accepts a simultaneously played chord in Wait Mode', async ({ page }) => {
  const modelRequests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/basic-pitch/')) modelRequests.push(request.url()); });
  await silentGuitar(page);
  await page.goto('/');
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Chord preview" \\tempo 120 . (0.6 2.5 2.4).4', new alphaTab.Settings());
  const buffer = Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'chord.gp', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for');
  const responseMs = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const startedAt = performance.now();
    const timer = window.setTimeout(() => { observer.disconnect(); reject(new Error('Chord feedback did not arrive')); }, 3000);
    const observer = new MutationObserver(() => {
      if (!document.body.textContent?.includes('Heard chord: E2 B2 E3')) return;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(performance.now() - startedAt);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    (window as any).testGuitar.chord([40, 47, 52]);
  }));
  await expect(page.getByText('Heard chord: E2 B2 E3')).toBeVisible({ timeout: 3000 });
  console.info(`Browser simultaneous-chord-to-feedback response: ${Math.round(responseMs)} ms`);
  expect(responseMs).toBeLessThan(700);
  expect(modelRequests).toEqual([]);
  await expect.poll(async () => Number(await page.getByRole('progressbar').getAttribute('value'))).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByText('3 notes practiced · no timing or score.')).toBeVisible();
});


test('wait mode accepts seventh-fret B and G harmonics over residual open-string sound', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Harmonic riff" \\tempo 120 . 7.2{nh}.4 7.3{nh}.4 0.6.4', new alphaTab.Settings());
  const buffer = Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'harmonics.gp', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for F♯5');
  await page.evaluate(() => (window as any).testGuitar.pluck(66));
  await page.waitForTimeout(400);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1000');
  await page.evaluate(() => (window as any).testGuitar.harmonic(59));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1500');
  await expect(page.getByRole('status')).toContainText('Waiting for D5');
  await page.evaluate(() => (window as any).testGuitar.harmonic(55));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2000');
  await expect(page.getByRole('status')).toContainText('Waiting for E2');
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByText('2 notes practiced · no timing or score.')).toBeVisible();
});

test('wait mode accepts linked hammer and pull pitch changes without another pick', async ({ page }, testInfo) => {
  await silentGuitar(page);
  await page.goto('/');
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Legato riff" \\tempo 120 . 5.3{h}.4 7.3{h}.4 5.3.4 5.3.4', new alphaTab.Settings());
  const buffer = Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'legato.gp', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for C4');
  await page.evaluate(() => (window as any).testGuitar.hold(60));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1500');
  await expect(page.getByRole('status')).toContainText('Waiting for D4');
  await page.screenshot({ path: testInfo.outputPath('legato-highway.png') });
  await page.evaluate(() => (window as any).testGuitar.changePitch(62));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2000');
  await expect(page.getByRole('status')).toContainText('Waiting for C4');
  await page.evaluate(() => (window as any).testGuitar.changePitch(60));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2500');
  await page.waitForTimeout(1500);
  // Holding the pull-off destination cannot clear the next ordinary repeated note.
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2500');
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByText('3 notes practiced · no timing or score.')).toBeVisible();
});

test('ringing chord tones cannot fill the next chord when only its other string is picked', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Ringing chords" \\tempo 120 . (0.6 2.5).4 (0.6 0.4).4 0.1.4', new alphaTab.Settings());
  const buffer = Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'ringing-chords.gp', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for');
  await page.evaluate(() => (window as any).testGuitar.chord([40, 47]));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1500');
  // Wait for the prior feedback to expire, then verify the persistent gate
  // change instead of polling a readout that later ringing packets replace.
  await expect(page.getByRole('status')).toContainText('Waiting for D3');
  await page.evaluate(() => (window as any).testGuitar.pluck(50, 0.1, 0.7));
  await expect(page.getByRole('status')).toContainText('Waiting for E2');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1500');
  await page.getByRole('button', { name: 'Finish practice' }).click();
  // D3 was newly played; the held E2 must not receive another tick.
  await expect(page.getByText('3 notes practiced · no timing or score.')).toBeVisible();
});

test('game chord feedback credits only detected strings and marks the absent one missed', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Partial chord" \\tempo 120 . (0.6 2.5 2.4).1 | 0.1.1', new alphaTab.Settings());
  const buffer = Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'partial.gp', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Wait Mode'))!.click();
    (window as any).testGuitar.chord([40, 47]);
  });
  await expect(page.getByRole('status')).toContainText('Chord · 2/3');
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByText('67%', { exact: true })).toBeVisible();
});

test('six-string guitar-like open chord is recognized through actual browser capture', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Open E chord" \\tempo 120 . (0.6 2.5 2.4 1.3 0.2 0.1).4 0.6.4', new alphaTab.Settings());
  const buffer = Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'open-e.gp', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for');
  await page.evaluate(() => (window as any).testGuitar.chord([40, 47, 52, 56, 59, 64], true));
  await expect(page.getByText('Heard chord: E2 B2 E3 G♯3 B3 E4')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1500');
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByText('6 notes practiced · no timing or score.')).toBeVisible();
});

test('a held chord cannot clear its repeated bass as the following single note', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Chord then bass" \\tempo 120 . (0.6 2.4).4 0.6.4 0.6.4', new alphaTab.Settings());
  const buffer = Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'held-bass.gp', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for');
  await page.evaluate(() => (window as any).testGuitar.chord([40, 52]));
  await page.waitForTimeout(1000);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1500');
  // A real re-pick must still clear exactly one following ordinary note.
  await page.evaluate(() => (window as any).testGuitar.pluck(40, 0.35));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2000');
  await page.waitForTimeout(700);
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2000');
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByText('3 notes practiced \u00b7 no timing or score.')).toBeVisible();
});

test('game accepts later strings of a strum and counts a repeated chord once', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Repeated strums" \\tempo 120 . (0.6 2.5 2.4).4 r.4 (0.6 2.5 2.4).4 | r.1', new alphaTab.Settings());
  const buffer = Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'strums.gp', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for');
  // Schedule the playing and transport transition in one browser task so
  // renderer/automation overhead cannot shift a real-time audio fixture.
  await page.evaluate(() => {
    const wait = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Wait Mode'))!;
    wait.click();
    (window as any).testGuitar.strum([40, 47, 52]);
    (window as any).testGuitar.strum([40, 47, 52], 0.11, 1);
  });
  await expect(page.getByRole('status')).toContainText('Correct chord \u00b7 3/3');
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await expect(page.getByText('6 of 6 notes played correctly.')).toBeVisible();
});

test('a strum collection window expires and missing strings are still scored as misses', async ({ page }) => {
  await silentGuitar(page);
  await page.goto('/');
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString('\\title "Unfinished strum" \\tempo 120 . (0.6 2.5 2.4).1 | r.1', new alphaTab.Settings());
  const buffer = Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
  await page.getByLabel('Guitar Pro file', { exact: true }).setInputFiles({ name: 'unfinished.gp', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByRole('status')).toContainText('Waiting for');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Wait Mode'))!.click();
    (window as any).testGuitar.strum([40, 47]);
  });
  const hud = page.getByRole('region', { name: 'Live practice feedback' });
  await expect(hud.getByText('2 correct', { exact: true })).toBeVisible();
  await expect(hud.getByText('1 wrong', { exact: true })).toBeVisible({ timeout: 2000 });
  await page.getByRole('button', { name: 'Finish practice' }).click();
  await expect(page.getByText('67%', { exact: true })).toBeVisible();
  await expect(page.getByText('2 of 3 notes played correctly.')).toBeVisible();
});

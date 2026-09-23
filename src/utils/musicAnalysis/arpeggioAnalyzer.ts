import { TabNote, TechniqueAnalysis, TechniqueType } from '../../types';
import { buildDifficultyMap, DifficultyHotspot } from './difficultyMap';

const STANDARD_TUNING_MIDI_BY_STRING: Record<number, number> = {
  1: 64,
  2: 59,
  3: 55,
  4: 50,
  5: 45,
  6: 40,
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

type ChordQuality = 'major' | 'minor' | 'diminished' | 'sus2' | 'sus4';

interface ChordMatch {
  root: number;
  quality: ChordQuality;
  score: number;
  matchedPitchClasses: number;
}

const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};

function getMidi(note: TabNote): number {
  return (STANDARD_TUNING_MIDI_BY_STRING[note.string] ?? 40) + note.fret;
}

function getPitchClass(note: TabNote): number {
  return ((getMidi(note) % 12) + 12) % 12;
}

function getChordName(match: ChordMatch): string {
  const suffixByQuality: Record<ChordQuality, string> = {
    major: '',
    minor: 'm',
    diminished: 'dim',
    sus2: 'sus2',
    sus4: 'sus4',
  };

  return `${NOTE_NAMES[match.root]}${suffixByQuality[match.quality]}`;
}

function compactTechniqueId(type: string, startMs: number, endMs: number): string {
  return `${type}-${Math.round(startMs)}-${Math.round(endMs)}`;
}

function orderedNotes(notes: TabNote[]): TabNote[] {
  return [...notes].sort((a, b) => a.timestampMs - b.timestampMs || a.string - b.string);
}

function getTimeRange(notes: TabNote[]) {
  const ordered = orderedNotes(notes);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  return {
    ordered,
    first,
    last,
    startMs: first.timestampMs,
    endMs: last.timestampMs + last.durationMs,
  };
}

function makeTechnique(
  type: TechniqueType,
  label: string,
  notes: TabNote[],
  confidence: number,
  severity: TechniqueAnalysis['severity'],
  problemTitle: string,
  whyItMatters: string,
  summary: string,
  practiceTip: string
): TechniqueAnalysis {
  const { ordered, first, last, startMs, endMs } = getTimeRange(notes);

  return {
    id: compactTechniqueId(type, startMs, endMs),
    type,
    label,
    startMs,
    endMs,
    startMeasure: first.measureIndex,
    endMeasure: last.measureIndex,
    noteIds: ordered.map((note) => note.id),
    confidence: Number(Math.min(0.99, Math.max(0.45, confidence)).toFixed(2)),
    severity,
    problemTitle,
    whyItMatters,
    summary,
    practiceTip,
  };
}

function findBestChordMatch(notes: TabNote[]): ChordMatch | null {
  const pitchClasses = [...new Set(notes.map(getPitchClass))];
  if (pitchClasses.length < 3) return null;

  let best: ChordMatch | null = null;

  for (let root = 0; root < 12; root += 1) {
    for (const [quality, intervals] of Object.entries(CHORD_INTERVALS) as Array<[ChordQuality, number[]]>) {
      const chordPitchClasses = intervals.map((interval) => (root + interval) % 12);
      const matchedPitchClasses = pitchClasses.filter((pc) => chordPitchClasses.includes(pc)).length;
      const outsidePitchClasses = pitchClasses.length - matchedPitchClasses;
      const score = matchedPitchClasses / pitchClasses.length - outsidePitchClasses * 0.2;

      if (!best || score > best.score) {
        best = { root, quality, score, matchedPitchClasses };
      }
    }
  }

  if (!best || best.matchedPitchClasses < 3 || best.score < 0.72) return null;
  return best;
}

function hasSequentialMotion(notes: TabNote[]): boolean {
  const ordered = orderedNotes(notes);
  const uniqueTimes = new Set(ordered.map((note) => note.timestampMs));
  if (uniqueTimes.size < Math.ceil(ordered.length * 0.7)) return false;

  const midi = ordered.map(getMidi);
  const directionChanges = midi.slice(1).filter((value, index) => {
    const previous = midi[index];
    const next = midi[index + 2];
    if (next === undefined) return false;
    return Math.sign(value - previous) !== Math.sign(next - value);
  }).length;

  return directionChanges <= Math.max(1, Math.floor(notes.length / 2));
}

function createArpeggio(notes: TabNote[], chord: ChordMatch): TechniqueAnalysis {
  const chordName = getChordName(chord);
  const stringSpread = new Set(notes.map((note) => note.string)).size;
  const confidence = 0.72 + chord.score * 0.18 + Math.min(0.08, stringSpread * 0.015);

  return makeTechnique(
    'arpeggio',
    `${chordName} arpeggio`,
    notes,
    confidence,
    stringSpread >= 4 ? 'high' : 'medium',
    'Разложен акорд: риск от неравен ритъм',
    'При арпежа ухото чува акорда като една форма. Ако всяка нота е с различна атака, пасажът звучи накъсано.',
    `Нотите очертават ${chordName} и са изсвирени последователно, не едновременно.`,
    'Първо свири само дясната ръка върху заглушени струни. После добави лявата ръка и пази еднаква сила на всяка нота.'
  );
}

function detectArpeggios(notes: TabNote[]): TechniqueAnalysis[] {
  const ordered = orderedNotes(notes);
  const candidates: TechniqueAnalysis[] = [];

  for (let start = 0; start < ordered.length; start += 1) {
    for (let size = 4; size <= 8; size += 1) {
      const window = ordered.slice(start, start + size);
      if (window.length < 4) continue;

      const first = window[0];
      const last = window[window.length - 1];
      const spanMs = last.timestampMs - first.timestampMs;
      if (spanMs < 250 || spanMs > 2600) continue;

      const hasEnoughStringSpread = new Set(window.map((note) => note.string)).size >= 2;
      if (!hasEnoughStringSpread || !hasSequentialMotion(window)) continue;

      const chord = findBestChordMatch(window);
      if (!chord) continue;

      candidates.push(createArpeggio(window, chord));
    }
  }

  return mergeOverlapping(candidates).slice(0, 20);
}

function detectStringSkips(notes: TabNote[]): TechniqueAnalysis[] {
  const ordered = orderedNotes(notes);
  const candidates: TechniqueAnalysis[] = [];

  for (let i = 0; i < ordered.length - 2; i += 1) {
    const window = ordered.slice(i, i + 4);
    if (window.length < 3) continue;

    const skips = window.slice(1).filter((note, index) => {
      const previous = window[index];
      return Math.abs(note.string - previous.string) >= 2;
    });

    const spanMs = window[window.length - 1].timestampMs - window[0].timestampMs;
    if (skips.length < 2 || spanMs > 2200) continue;

    candidates.push(
      makeTechnique(
        'string-skip',
        'String skipping',
        window,
        0.78 + Math.min(0.15, skips.length * 0.04),
        skips.length >= 3 ? 'high' : 'medium',
        'Прескачане на струни: риск от грешна струна',
        'Това натоварва ориентацията на дясната ръка. Най-честият проблем е удар върху съседна струна или забавяне преди скока.',
        'Има няколко бързи скока през една или повече струни в кратък прозорец.',
        'Изолирай само струните без лява ръка. Свири pattern-а с alternate picking и оставяй китката ниско, без голямо движение.'
      )
    );
  }

  return mergeOverlapping(candidates).slice(0, 16);
}

function detectPositionShifts(notes: TabNote[]): TechniqueAnalysis[] {
  const ordered = orderedNotes(notes);
  const candidates: TechniqueAnalysis[] = [];

  for (let i = 0; i < ordered.length - 2; i += 1) {
    const window = ordered.slice(i, i + 3);
    const fretted = window.filter((note) => note.fret > 0);
    if (fretted.length < 2) continue;

    const fretJump = Math.max(...fretted.map((note) => note.fret)) - Math.min(...fretted.map((note) => note.fret));
    const spanMs = window[window.length - 1].timestampMs - window[0].timestampMs;
    if (fretJump < 5 || spanMs > 1800) continue;

    candidates.push(
      makeTechnique(
        'position-shift',
        'Position shift',
        window,
        0.74 + Math.min(0.18, fretJump * 0.02),
        fretJump >= 8 ? 'high' : 'medium',
        'Смяна на позиция: риск от закъснение',
        'Лявата ръка трябва да премести цялата форма, не само един пръст. Ако погледът и ръката тръгнат късно, следващата нота пада след времето.',
        `Има скок от около ${fretJump} прагчета в много кратък пасаж.`,
        'Тренирай само двете крайни ноти като “цел”. Премести ръката без напрежение, после добави междинните ноти.'
      )
    );
  }

  return mergeOverlapping(candidates).slice(0, 16);
}


function getNotesPerMinute(notes: TabNote[]): number {
  if (notes.length < 2) return 0;
  const { startMs, endMs } = getTimeRange(notes);
  const minutes = Math.max(1 / 60, (endMs - startMs) / 60000);
  return notes.length / minutes;
}

function getNotesPerBeat(notes: TabNote[], tempoBpm: number): number {
  if (notes.length < 2 || tempoBpm <= 0) return 0;
  const { startMs, endMs } = getTimeRange(notes);
  const beats = Math.max(0.25, ((endMs - startMs) / 60000) * tempoBpm);
  return notes.length / beats;
}

function detectHighNpmPassages(notes: TabNote[], tempoBpm: number): TechniqueAnalysis[] {
  const ordered = orderedNotes(notes);
  const candidates: TechniqueAnalysis[] = [];
  const sixteenthNpm = tempoBpm * 4;

  for (let start = 0; start < ordered.length - 5; start += 1) {
    const window = ordered.slice(start, start + 8);
    const { startMs, endMs } = getTimeRange(window);
    const spanMs = endMs - startMs;
    if (spanMs < 500 || spanMs > 4500) continue;

    const npm = getNotesPerMinute(window);
    const notesPerBeat = getNotesPerBeat(window, tempoBpm);
    const isSixteenthThreshold = sixteenthNpm >= 480 && notesPerBeat >= 3.6;
    const isHardSixteenthThreshold = sixteenthNpm >= 576 && notesPerBeat >= 3.6;
    const isObjectivelyFast = npm >= 480;

    if (!isSixteenthThreshold && !isObjectivelyFast) continue;

    const severity = isHardSixteenthThreshold || npm >= 576 ? 'high' : 'medium';
    const startPlan =
      severity === 'high'
        ? 'Първо мини пасажа без темпо 2-3 пъти, после започни на 25%. Когато движението стане спокойно, мини към 50%.'
        : 'Започни на 50%. Качи до 80% през 2%, после от 80% до 100% през 1% само ако няма натрупване на грешки.';

    candidates.push(
      makeTechnique(
        'high-npm',
        `${Math.round(npm)} НВМ`,
        window,
        severity === 'high' ? 0.92 : 0.82,
        severity,
        'Висока НВМ: реалната скорост е трудна',
        'BPM сам по себе си лъже. Тук важната величина е НВМ - колко ноти реално трябва да изсвириш за минута.',
        `Пасажът е около ${Math.round(npm)} ноти в минута при ${tempoBpm} BPM. Това е приблизително ${notesPerBeat.toFixed(1)} ноти за удар.`,
        `${startPlan} Ако грешките се появят около даден процент, не качвай повече - върни се към последното стабилно темпо.`
      )
    );
  }

  return mergeOverlapping(candidates).slice(0, 16);
}

function detectDenseBeatGroups(notes: TabNote[], tempoBpm: number): TechniqueAnalysis[] {
  const ordered = orderedNotes(notes);
  const candidates: TechniqueAnalysis[] = [];

  for (let start = 0; start < ordered.length - 3; start += 1) {
    const first = ordered[start];
    const beatMs = 60000 / Math.max(1, tempoBpm);
    const window = ordered.filter((note) => note.timestampMs >= first.timestampMs && note.timestampMs < first.timestampMs + beatMs);
    if (window.length < 5) continue;

    const notesPerBeat = window.length;
    const severity = notesPerBeat >= 7 ? 'high' : notesPerBeat >= 6 ? 'medium' : 'low';

    candidates.push(
      makeTechnique(
        'dense-beat',
        `${notesPerBeat} notes / beat`,
        window,
        notesPerBeat >= 7 ? 0.9 : 0.78,
        severity,
        'Много ноти за един удар',
        'Това е точно случаят от бележката: темпото може да изглежда лесно, но секстоли, септоли или гъсти групи правят пасажа труден.',
        `В един удар има около ${notesPerBeat} ноти. Това е по-важно от голото BPM число.`,
        'Първо преброй групата на глас без китара. После свири само ритъма на една струна. Добави височините чак когато групата стои равномерно.'
      )
    );
  }

  return mergeOverlapping(candidates).slice(0, 12);
}

function detectPolyphonyStretch(notes: TabNote[]): TechniqueAnalysis[] {
  const ordered = orderedNotes(notes);
  const groups = new Map<number, TabNote[]>();

  for (const note of ordered) {
    const bucket = Math.round(note.timestampMs / 35) * 35;
    groups.set(bucket, [...(groups.get(bucket) || []), note]);
  }

  const candidates: TechniqueAnalysis[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const fretted = group.filter((note) => note.fret > 0);
    const fretStretch =
      fretted.length >= 2
        ? Math.max(...fretted.map((note) => note.fret)) - Math.min(...fretted.map((note) => note.fret))
        : 0;

    if (group.length < 3 && fretStretch <= 2) continue;

    const severity = group.length >= 3 || fretStretch > 4 ? 'high' : 'medium';

    candidates.push(
      makeTechnique(
        'polyphony-stretch',
        `${group.length} voices${fretStretch > 0 ? ` / ${fretStretch} fret stretch` : ''}`,
        group,
        severity === 'high' ? 0.9 : 0.78,
        severity,
        'Многогласие с разтягане',
        'При двуглас, триглас или четириглас трудността не е само “кои ноти”, а дали ръката може да държи форма без напрежение.',
        `Има ${group.length} едновременни ноти${fretStretch > 0 ? ` и разтягане около ${fretStretch} прагчета` : ''}.`,
        'Първо хвани формата без темпо и провери дали палецът и китката са спокойни. Ако разтягането е над 2 прагчета, упражнявай като акордна форма, не като отделни ноти.'
      )
    );
  }

  return mergeOverlapping(candidates).slice(0, 14);
}

function createPracticeStrategy(notes: TabNote[], tempoBpm: number, detectedProblems: TechniqueAnalysis[]): TechniqueAnalysis[] {
  if (notes.length === 0) return [];

  const npm = getNotesPerMinute(notes);
  const highCount = detectedProblems.filter((item) => item.severity === 'high').length;
  const mediumCount = detectedProblems.filter((item) => item.severity === 'medium').length;
  const localHotspots = detectedProblems.length > 0 && detectedProblems.length <= 8;
  const objectivelyHard = npm >= 520 || highCount >= 3;

  const allNotes = orderedNotes(notes);

  const strategy = objectivelyHard
    ? 'Първо мини цялото произведение без темпо, за да знаеш формите. После започни на 25%. Когато движението стане спокойно, премини към 50%.'
    : localHotspots
    ? 'Не тренирай цялото парче еднакво. Работи по hotspot-ите от картата, после върни целия контекст.'
    : 'Започни от 50%. Качи до 80% през 2%, после 80-100% през 1%. Ако грешките се натрупат, спри качването и се върни към стабилното темпо.';

  return [
    makeTechnique(
      'practice-strategy',
      objectivelyHard ? 'Start without tempo' : localHotspots ? 'Hotspot practice' : '50-80-100 ramp',
      allNotes.slice(0, Math.min(12, allNotes.length)),
      0.86,
      objectivelyHard ? 'high' : 'medium',
      'Стратегия за започване на произведението',
      'Бележката е права: първо трябва да решим как да започнем ученето, а не просто да пуснем песента на 100%.',
      `Обща плътност: около ${Math.round(npm)} НВМ при ${tempoBpm} BPM. Открити са ${highCount} тежки и ${mediumCount} средни проблема.`,
      strategy
    ),
  ];
}

function detectSpeedBursts(notes: TabNote[]): TechniqueAnalysis[] {
  const ordered = orderedNotes(notes);
  const candidates: TechniqueAnalysis[] = [];

  for (let start = 0; start < ordered.length - 5; start += 1) {
    const window = ordered.slice(start, start + 6);
    const spanMs = window[window.length - 1].timestampMs - window[0].timestampMs;
    if (spanMs <= 0 || spanMs > 1700) continue;

    const averageGap = spanMs / (window.length - 1);
    const fretSpread = Math.max(...window.map((note) => note.fret)) - Math.min(...window.map((note) => note.fret));
    if (averageGap > 210 || fretSpread < 2) continue;

    candidates.push(
      makeTechnique(
        'speed-burst',
        'Speed burst',
        window,
        averageGap < 150 ? 0.9 : 0.78,
        averageGap < 150 ? 'high' : 'medium',
        'Плътен бърз пасаж: риск от стягане',
        'Тук проблемът рядко е теорията. Проблемът е координация: двете ръце трябва да останат синхронни при малки интервали между нотите.',
        `Средното разстояние между нотите е около ${Math.round(averageGap)}ms.`,
        'Свали темпото до 60-70%. Свири 3 перфектни повторения, после качвай с 5%. Спри веднага щом ръката се стегне.'
      )
    );
  }

  return mergeOverlapping(candidates).slice(0, 12);
}

function mergeOverlapping(items: TechniqueAnalysis[]): TechniqueAnalysis[] {
  const priority: Record<TechniqueAnalysis['severity'] & string, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  const sorted = [...items].sort((a, b) => a.startMs - b.startMs || b.noteIds.length - a.noteIds.length);
  const merged: TechniqueAnalysis[] = [];

  for (const item of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && item.startMs <= previous.endMs + 140 && item.type === previous.type) {
      const itemScore = item.noteIds.length + (priority[item.severity || 'low'] || 1) + item.confidence;
      const previousScore = previous.noteIds.length + (priority[previous.severity || 'low'] || 1) + previous.confidence;
      if (itemScore > previousScore) merged[merged.length - 1] = item;
      continue;
    }
    merged.push(item);
  }

  return merged;
}


function notesFromHotspot(allNotes: TabNote[], hotspot: DifficultyHotspot): TabNote[] {
  const ids = new Set(hotspot.noteIds);
  return orderedNotes(allNotes.filter((note) => ids.has(note.id)));
}

function describeHotspotType(hotspot: DifficultyHotspot): TechniqueType {
  if (hotspot.maxPolyphony >= 2 && hotspot.fretSpan > 2) return 'polyphony-stretch';
  if (hotspot.notesPerBeat >= 5) return 'dense-beat';
  if (hotspot.notesPerMinute >= 480) return 'high-npm';
  if (hotspot.maxFretJump >= 5) return 'position-shift';
  if (hotspot.maxStringJump >= 2) return 'string-skip';
  return 'speed-burst';
}

function createDifficultyTechnique(allNotes: TabNote[], hotspot: DifficultyHotspot): TechniqueAnalysis | null {
  const hotspotNotes = notesFromHotspot(allNotes, hotspot);
  if (hotspotNotes.length === 0) return null;

  const type = describeHotspotType(hotspot);
  const reasonText = hotspot.reasons.join('; ');

  return makeTechnique(
    type,
    `Difficulty ${hotspot.score}/100`,
    hotspotNotes,
    hotspot.severity === 'high' ? 0.93 : hotspot.severity === 'medium' ? 0.82 : 0.7,
    hotspot.severity,
    `Реална трудност: ${hotspot.score}/100`,
    'Това място е избрано след обща оценка, а не само защото има един симптом. Комбинацията от скорост, плътност, скокове, разтягане и контекст го прави важно.',
    reasonText || `Оценка ${hotspot.score}/100 според плътност и движение.`,
    hotspot.severity === 'high'
      ? 'Започни без темпо, после 25%. Не качвай, докато няма 3 чисти повторения без напрежение.'
      : 'Започни на 50%. Качи към 80% през 2%, после към 100% през 1% само при стабилни повторения.'
  );
}

function sortTechniqueMap(items: TechniqueAnalysis[]): TechniqueAnalysis[] {
  const severityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
  return [...items]
    .sort((a, b) => a.startMs - b.startMs || (severityScore[b.severity || 'low'] - severityScore[a.severity || 'low']))
    .slice(0, 36);
}

export function analyzeTechniqueMap(notes: TabNote[], tempoBpm = 120): TechniqueAnalysis[] {
  const difficultyHotspots = buildDifficultyMap(notes, tempoBpm);
  const difficultyTechniques = difficultyHotspots
    .map((hotspot) => createDifficultyTechnique(notes, hotspot))
    .filter((item): item is TechniqueAnalysis => Boolean(item));

  const supportingTechniques = sortTechniqueMap([
    ...detectArpeggios(notes),
    ...detectStringSkips(notes),
    ...detectPositionShifts(notes),
    ...detectHighNpmPassages(notes, tempoBpm),
    ...detectDenseBeatGroups(notes, tempoBpm),
    ...detectPolyphonyStretch(notes),
    ...detectSpeedBursts(notes),
  ]).filter((technique) =>
    difficultyHotspots.some((hotspot) => technique.startMs <= hotspot.endMs && technique.endMs >= hotspot.startMs)
  );

  const problemMap = sortTechniqueMap([
    ...difficultyTechniques,
    ...supportingTechniques,
  ]).slice(0, 8);

  return sortTechniqueMap([
    ...createPracticeStrategy(notes, tempoBpm, problemMap),
    ...problemMap,
  ]);
}

export function detectArpeggioPassages(notes: TabNote[], tempoBpm = 120): TechniqueAnalysis[] {
  return analyzeTechniqueMap(notes, tempoBpm);
}

export async function loadMusic21TheoryEngine(): Promise<unknown | null> {
  try {
    return await import('music21j');
  } catch {
    return null;
  }
}

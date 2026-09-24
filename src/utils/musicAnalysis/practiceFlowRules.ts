import { PracticeFlowAssignment, TechniqueAnalysis } from '../../types';

export const PRACTICE_FLOW_RULES = {
  method: 'Learn a New Piece Flow',
  primaryRule: 'Do not practice mistakes. If mistakes repeat, simplify immediately.',
  tempoRamp: {
    veryDifficult: ['no tempo', '25%', '50%'],
    normalLearning: { from: 50, to: 80, step: 2 },
    refinement: { from: 80, to: 100, step: 1 },
  },
  success: {
    cleanRepetitions: 3,
    criteria: [
      'правилни ноти',
      'стабилен ритъм',
      'чист звук',
      'без видимо напрежение',
      'без повторена грешка на същото място',
    ],
  },
  methods: {
    stop_then_go: {
      label: 'Stop-Then-Go',
      useWhen: ['position-shift', 'chord-change', 'string-skip'],
      instruction: 'Спри точно преди трудното движение, подготви ръката, после изсвири целта чисто.',
    },
    slam_on_the_brakes: {
      label: 'Slam on the Brakes',
      useWhen: ['speed-burst', 'high-npm', 'dense-beat'],
      instruction: 'Забави драматично преди трудното място, за да запазиш контрол вместо да се хвърляш през пасажа.',
    },
    right_hand_alone: {
      label: 'Right Hand Alone',
      useWhen: ['arpeggio', 'string-skip', 'dense-beat'],
      instruction: 'Заглуши струните и упражнявай само дясната ръка, докато pattern-ът стане равен.',
    },
    left_hand_alone: {
      label: 'Left Hand Alone',
      useWhen: ['position-shift', 'polyphony-stretch'],
      instruction: 'Поставяй лявата ръка без звук и без темпо, докато формата стане спокойна.',
    },
    voices_separately: {
      label: 'Voices Separately',
      useWhen: ['polyphony-stretch'],
      instruction: 'Изолирай всеки глас отделно, после комбинирай два гласа, чак след това всички.',
    },
    altered_rhythm: {
      label: 'Altered Rhythms',
      useWhen: ['speed-burst', 'high-npm'],
      instruction: 'Свири пасажа с дълго-късо и късо-дълго, за да разбиеш автоматичната грешна моторика.',
    },
  },
} as const;

const severityScore: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function getHardestTechnique(techniques: TechniqueAnalysis[]): TechniqueAnalysis | undefined {
  return [...techniques]
    .filter((item) => item.type !== 'practice-strategy')
    .sort((a, b) => {
      const severityDiff = (severityScore[b.severity || 'low'] || 1) - (severityScore[a.severity || 'low'] || 1);
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    })[0];
}

function getRecommendedMethods(technique?: TechniqueAnalysis): PracticeFlowAssignment['recommendedMethods'] {
  if (!technique) return [];

  return Object.entries(PRACTICE_FLOW_RULES.methods)
    .filter(([, method]) => (method.useWhen as readonly string[]).includes(technique.type))
    .map(([id, method]) => ({
      id,
      label: method.label,
      instruction: method.instruction,
    }))
    .slice(0, 3);
}

export function buildPracticeFlowAssignment(
  techniques: TechniqueAnalysis[],
  tempoBpm: number
): PracticeFlowAssignment | undefined {
  if (techniques.length === 0) return undefined;

  const hardest = getHardestTechnique(techniques) || techniques[0];
  const highCount = techniques.filter((item) => item.severity === 'high').length;
  const hasGlobalStrategy = techniques.some((item) => item.type === 'practice-strategy' && item.severity === 'high');
  const isVeryDifficult = highCount >= 3 || hasGlobalStrategy;
  const hasFewHotspots = techniques.filter((item) => item.type !== 'practice-strategy').length <= 8;

  const startTempoPercent = isVeryDifficult ? 25 : hardest.severity === 'high' ? 40 : 50;
  const chunk =
    hardest.startMeasure && hardest.endMeasure
      ? hardest.endMeasure !== hardest.startMeasure
        ? `M${hardest.startMeasure}-M${hardest.endMeasure}`
        : `M${hardest.startMeasure}`
      : `${Math.round(hardest.startMs / 1000)}s-${Math.round(hardest.endMs / 1000)}s`;

  const firstAssignment = isVeryDifficult
    ? `Първо мини ${chunk} без темпо, после го пусни на ${startTempoPercent}%.`
    : hasFewHotspots
    ? `Започни от hotspot-а ${chunk}, не от началото на песента.`
    : `Започни с малка клетка ${chunk} на ${startTempoPercent}%.`;

  const reason = `${hardest.problemTitle || hardest.label}: ${hardest.summary}`;

  return {
    method: PRACTICE_FLOW_RULES.method,
    stage: isVeryDifficult ? 'no_tempo_then_25_percent' : hasFewHotspots ? 'hardest_hotspot_first' : 'small_cell_at_50_percent',
    firstAssignment,
    reason,
    startTempoPercent,
    chunk,
    successCriteria: [...PRACTICE_FLOW_RULES.success.criteria],
    failureAction:
      'Ако повториш същата грешка, не качвай темпото. Намали скоростта, скъси клетката или упражни ръката/гласа отделно.',
    nextStep:
      startTempoPercent < 80
        ? 'След 3 чисти повторения качи с 2%. От 80% нагоре качвай само с 1%.'
        : 'Добави един удар преди и след клетката, после върни пасажа в контекст.',
    recommendedMethods: getRecommendedMethods(hardest),
  };
}

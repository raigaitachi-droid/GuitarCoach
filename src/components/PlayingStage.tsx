import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Headphones,
  Mic,
  Sliders,
  Music,
  Flame,
  Star,
  CheckCircle2,
  ChevronDown,
  Sparkles,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Info,
  Bot,
  Zap,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Minus,
  Plus,
  Gauge,
  Check,
} from 'lucide-react';
import { TabNote, SongMetadata, FeedbackData, SongSection, CoachEvaluation, SongAnalysis } from '../types';
import { GuitarTuner } from './GuitarTuner';
import { guitarSynth } from '../utils/guitarSynth';
import { micDetector } from '../utils/pitchDetector';
import { SONG_CATALOG, SONG_TABS } from '../data/songTabs';
import { AICoachChat } from './AICoachChat';
import { AdaptiveTempoDebrief } from './AdaptiveTempoDebrief';

interface PlayingStageProps {
  selectedSong?: SongMetadata | null;
  selectedNotes?: TabNote[] | null;
  selectedSections?: SongSection[] | null;
  selectedAnalysis?: SongAnalysis | null;
  tempoPercent?: number;
  onTempoPercentChange?: (newTempoPercent: number) => void;
  onOpenLibrary: () => void;
  onOpenCoachChat?: () => void;
}

const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];
const STRING_COLORS = [
  '#FF5E7E', // 1: high E - neon coral red
  '#FFA938', // 2: B - warm gold
  '#2ED573', // 3: G - electric green
  '#1E90FF', // 4: D - vibrant cyan blue
  '#A55EEA', // 5: A - purple
  '#FF7F50', // 6: Low E - amber orange
];
const STRING_GAUGES = [1.5, 2, 2.5, 3.5, 4, 5];

const STRING_GRADIENTS = [
  'linear-gradient(90deg, #CBD5E1, #FFFFFF, #CBD5E1)', // 1: high E - fine chrome steel
  'linear-gradient(90deg, #94A3B8, #E2E8F0, #94A3B8)', // 2: B - steel wire
  'linear-gradient(90deg, #64748B, #CBD5E1, #64748B)', // 3: G - nickel steel
  'linear-gradient(90deg, #B45309, #F59E0B, #B45309)', // 4: D - phosphor bronze
  'linear-gradient(90deg, #92400E, #D97706, #92400E)', // 5: A - warm bronze wound
  'linear-gradient(90deg, #78350F, #B45309, #78350F)', // 6: Low E - deep bronze wound
];

const SECTION_GRADIENTS = [
  'linear-gradient(135deg, #00E5BE, #2ED573)',
  'linear-gradient(135deg, #38BDF8, #1E90FF)',
  'linear-gradient(135deg, #FFD32A, #F59E0B)',
  'linear-gradient(135deg, #FF7F50, #FF5E7E)',
  'linear-gradient(135deg, #A55EEA, #7C3AED)',
  'linear-gradient(135deg, #94A3B8, #475569)',
];

const TOTAL_SONG_DURATION_MS = 13500;

function formatTime(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Demo song sequence: Canon in D / melodic arpeggio pattern
const INITIAL_DEMO_NOTES: TabNote[] = [
  { id: '1', string: 1, fret: 2, timestampMs: 1200, durationMs: 400 },
  { id: '2', string: 2, fret: 3, timestampMs: 1800, durationMs: 450 },
  { id: '3', string: 3, fret: 2, timestampMs: 2400, durationMs: 500 },
  { id: '4', string: 4, fret: 0, timestampMs: 3000, durationMs: 650 }, // open D!
  { id: '5', string: 2, fret: 2, timestampMs: 3800, durationMs: 400 },
  { id: '6', string: 3, fret: 2, timestampMs: 4400, durationMs: 450 },
  { id: '7', string: 5, fret: 0, timestampMs: 5000, durationMs: 600 }, // open A!
  { id: '8', string: 1, fret: 0, timestampMs: 5700, durationMs: 400 }, // open high E!
  { id: '9', string: 2, fret: 3, timestampMs: 6300, durationMs: 500 },
  { id: '10', string: 3, fret: 0, timestampMs: 6900, durationMs: 550 },
  { id: '11', string: 4, fret: 2, timestampMs: 7600, durationMs: 450 },
  { id: '12', string: 1, fret: 5, timestampMs: 8300, durationMs: 700 }, // sustained note!
  { id: '13', string: 2, fret: 7, timestampMs: 9200, durationMs: 600 },
  { id: '14', string: 3, fret: 7, timestampMs: 9900, durationMs: 500 },
  { id: '15', string: 1, fret: 3, timestampMs: 10600, durationMs: 450 },
  { id: '16', string: 2, fret: 5, timestampMs: 11200, durationMs: 600 },
  { id: '17', string: 6, fret: 3, timestampMs: 11900, durationMs: 700 },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BASE_STRING_MIDIS = [64, 59, 55, 50, 45, 40]; // 1:E4, 2:B3, 3:G3, 4:D3, 5:A2, 6:E2

function getExpectedMidi(stringNum: number, fret: number): number {
  return BASE_STRING_MIDIS[stringNum - 1] + fret;
}

function getNoteNameFromMidi(midi: number): string {
  const note = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function getExpectedNoteName(stringNum: number, fret: number): string {
  return getNoteNameFromMidi(getExpectedMidi(stringNum, fret));
}

export const PlayingStage: React.FC<PlayingStageProps> = ({
  selectedSong,
  selectedNotes,
  selectedSections,
  selectedAnalysis,
  tempoPercent = 100,
  onTempoPercentChange,
  onOpenLibrary,
  onOpenCoachChat,
}) => {
  const activeSong = selectedSong || SONG_CATALOG[0];
  const currentSongDurationMs = activeSong.durationMs || TOTAL_SONG_DURATION_MS;
  const songSections = selectedSections && selectedSections.length > 0 ? selectedSections : [];
  const detectedTechniques = selectedAnalysis?.techniques || [];
  const activeTabList =
    selectedNotes && selectedNotes.length > 0
      ? selectedNotes
      : SONG_TABS[activeSong.id] || INITIAL_DEMO_NOTES;
  // Avoid an empty tail where every visible note has already become a miss.
  // 350ms leaves enough time to score the final note, then loops immediately.
  const noteSequenceDurationMs = Math.min(
    currentSongDurationMs,
    Math.max(...activeTabList.map((note) => note.timestampMs)) + 350
  );

  const [notes, setNotes] = useState<TabNote[]>(() => {
    return activeTabList.map((n) => ({ ...n }));
  });

  // Keep playback paused by default on load so it NEVER starts playing by itself unexpectedly!
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMs, setPlaybackMs] = useState(0);
  const [isTechniqueMapOpen, setIsTechniqueMapOpen] = useState(false);
  const [tempoFactor, setTempoFactor] = useState(() =>
    typeof tempoPercent === 'number' ? Math.max(0, Math.min(200, tempoPercent)) / 100 : 1.0
  );

  // Synchronize when parent tempoPercent state changes (e.g. from AI Coach logic or external controls)
  useEffect(() => {
    if (typeof tempoPercent === 'number' && tempoPercent >= 0) {
      setTempoFactor(Math.max(0, Math.min(200, tempoPercent)) / 100);
    }
  }, [tempoPercent]);

  // Current integer tempo percentage (0 to 200)
  const currentTempoPercent = Math.max(0, Math.min(200, Math.round(tempoFactor * 100)));

  // Fine-grained setter for tempoPercent (0% to 200% in 1% increments)
  const changeTempoPercent = (newPercent: number) => {
    const clamped = Math.max(0, Math.min(200, Math.round(newPercent)));
    setTempoFactor(clamped / 100);
    onTempoPercentChange?.(clamped);
  };

  // Central helper to update tempo factor and notify parent callback
  const changeTempoFactor = (updaterOrValue: number | ((prev: number) => number)) => {
    setTempoFactor((prev) => {
      const next = typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue;
      const clamped = Math.max(0, Math.min(2.0, Number(next.toFixed(2))));
      onTempoPercentChange?.(Math.round(clamped * 100));
      return clamped;
    });
  };
  // Auto-scroll continuously by default; Wait For Me can still be enabled manually.
  const [waitForMeMode, setWaitForMeMode] = useState(false);
  const [isFrozenWaiting, setIsFrozenWaiting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Auto-Demo vs Practice mode toggle
  const [isAutoDemo, setIsAutoDemo] = useState(false);

  // Mute synthetic speaker sound when using real guitar mic to eliminate microphone acoustic feedback loop
  const [synthSoundWithMic, setSynthSoundWithMic] = useState(false);

  // Update notes whenever a new song is selected from the menu
  useEffect(() => {
    if (selectedSong) {
      setNotes(activeTabList.map((n) => ({ ...n })));
      setPlaybackMs(0);
      setIsPlaying(false);
      setIsFrozenWaiting(false);
    }
  }, [selectedSong, selectedNotes]);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Score & Gamification (3 Stars & Combo Multiplier)
  const [score, setScore] = useState(0);
  const [stars, setStars] = useState(0); // 0, 1, 2, or 3
  const [streak, setStreak] = useState(0);
  const [multiplier, setMultiplier] = useState(1); // 1x to 4x
  const [stats, setStats] = useState({ hits: 0, close: 0, misses: 0 });

  // Live Microphone Listening state
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [micRms, setMicRms] = useState(0);
  const [micNotice, setMicNotice] = useState<string | null>(null);

  // Guitar Audio Calibration & Latency Settings
  const [latencyOffsetMs, setLatencyOffsetMs] = useState(65); // 65ms compensates browser audio buffer delay
  const [hitTolerance, setHitTolerance] = useState<'tight' | 'normal' | 'relaxed'>('normal');
  const [micSensitivity, setMicSensitivity] = useState(7);
  const [showAudioSettings, setShowAudioSettings] = useState(false);

  const getToleranceWindowMs = (tol: 'tight' | 'normal' | 'relaxed') => {
    switch (tol) {
      case 'tight': return 160;
      case 'relaxed': return 320;
      default: return 240;
    }
  };

  const sourceIsReliableForLatency = (confidence: number, onset: boolean) => {
    return onset && confidence >= 0.62;
  };

  // Live Tuner state
  const [pitchData, setPitchData] = useState({
    pitch: '---',
    frequency: 0,
    cents: 0,
    inTune: false,
  });
  const lastPluckTimeRef = useRef(0);
  const playbackMsRef = useRef(0);
  const isPlayingRef = useRef(isPlaying);
  const isAutoDemoRef = useRef(isAutoDemo);
  const isFrozenWaitingRef = useRef(isFrozenWaiting);
  const activeTargetNoteRef = useRef<TabNote | null>(null);
  const notesRef = useRef<TabNote[]>([]);
  const latencyOffsetRef = useRef(latencyOffsetMs);
  const hitToleranceRef = useRef(hitTolerance);
  const timingDriftSamplesRef = useRef<number[]>([]);
  const highwayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Current active note near hit zone
  const [activeTargetNote, setActiveTargetNote] = useState<TabNote | null>(null);

  // Floating feedback popups
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);

  const [activeFlashes, setActiveFlashes] = useState<Record<number, boolean>>({});
  const [missFlash, setMissFlash] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; text: string; color: string }>>([]);

  const hitZoneFraction = 0.22;
  const visibleWindowMs = 5500;

  useEffect(() => {
    playbackMsRef.current = playbackMs;
  }, [playbackMs]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isAutoDemoRef.current = isAutoDemo;
  }, [isAutoDemo]);

  useEffect(() => {
    isFrozenWaitingRef.current = isFrozenWaiting;
  }, [isFrozenWaiting]);

  useEffect(() => {
    activeTargetNoteRef.current = activeTargetNote;
  }, [activeTargetNote]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    latencyOffsetRef.current = latencyOffsetMs;
  }, [latencyOffsetMs]);

  useEffect(() => {
    hitToleranceRef.current = hitTolerance;
  }, [hitTolerance]);

  // Adaptive Tempo & AI Coach State
  const [isAdaptiveCoachOn, setIsAdaptiveCoachOn] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pickhero_auto_adapt_tempo');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [coachEvaluation, setCoachEvaluation] = useState<CoachEvaluation | null>(null);
  const [showDebriefModal, setShowDebriefModal] = useState(false);
  const [showCoachChatDrawer, setShowCoachChatDrawer] = useState(false);
  const [isEvaluatingCoach, setIsEvaluatingCoach] = useState(false);
  const [lastEvaluatedAccuracy, setLastEvaluatedAccuracy] = useState<number | null>(null);
  const [coachToast, setCoachToast] = useState<{
    message: string;
    sub: string;
    tempo: number;
    change: number;
  } | null>(null);
  const [isCustomTempoOpen, setIsCustomTempoOpen] = useState(false);
  const lastRunEvaluatedAtRef = useRef<number>(0);
  const tempoFactorRef = useRef<number>(tempoFactor);
  const statsRef = useRef(stats);
  const streakRef = useRef(streak);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    streakRef.current = streak;
  }, [streak]);

  useEffect(() => {
    tempoFactorRef.current = tempoFactor;
  }, [tempoFactor]);

  const toggleAutoAdapt = (enabled: boolean) => {
    setIsAdaptiveCoachOn(enabled);
    try {
      localStorage.setItem('pickhero_auto_adapt_tempo', String(enabled));
    } catch {}
  };

  const evaluatePerformanceAndAdaptTempo = async (
    runStats: { hits: number; close: number; misses: number; streak: number },
    currentFactor: number,
    source: 'loop_completion' | 'manual' = 'loop_completion'
  ) => {
    const totalAttempted = runStats.hits + runStats.close + runStats.misses;
    if (totalAttempted < 2 && source === 'loop_completion') return;

    const currentTempoPct = Math.round(currentFactor * 100);
    const accuracy = totalAttempted > 0
      ? Math.round(((runStats.hits + runStats.close * 0.6) / totalAttempted) * 100)
      : 0;

    setLastEvaluatedAccuracy(accuracy);
    setIsEvaluatingCoach(true);

    try {
      const response = await fetch('/api/coach/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songTitle: activeSong.title,
          difficulty: activeSong.difficulty,
          currentTempo: currentTempoPct,
          accuracy,
          hits: runStats.hits,
          close: runStats.close,
          misses: runStats.misses,
          streak: runStats.streak,
          notesTotal: totalAttempted,
        }),
      });

      const data: CoachEvaluation = await response.json();
      setCoachEvaluation(data);

      if (isAdaptiveCoachOn && data.recommendedTempo) {
        const nextFactor = data.recommendedTempo / 100;
        changeTempoFactor(nextFactor);

        const change = data.tempoChange;
        const changeStr = change > 0 ? `+${change}%` : `${change}%`;
        setCoachToast({
          message: change > 0 ? 'AI Coach: Увеличаване на темпото!' : change < 0 ? 'AI Coach: Намаляване на темпото!' : 'AI Coach: Темпото е потвърдено!',
          sub: `${currentTempoPct}% ➔ ${data.recommendedTempo}% (${changeStr}) • ${data.encouragement}`,
          tempo: data.recommendedTempo,
          change,
        });
        setTimeout(() => setCoachToast(null), 5500);
      }

      setShowDebriefModal(true);
    } catch (err) {
      console.error('Coach evaluation error:', err);
    } finally {
      setIsEvaluatingCoach(false);
    }
  };

  const handleManualCoachEvaluation = () => {
    evaluatePerformanceAndAdaptTempo({ ...statsRef.current, streak: streakRef.current }, tempoFactor, 'manual');
  };

  // Event-driven microphone processing. Audio capture runs in AudioWorklet;
  // React receives only completed pitch events instead of polling every frame.
  useEffect(() => {
    if (!isListeningMic) return;

    const unsubscribe = micDetector.subscribe((result) => {
      setMicRms(result?.volumeRms ?? micDetector.getVolumeRms());
      if (!result) return;

      setPitchData({
        pitch: result.noteName,
        frequency: result.frequency,
        cents: result.cents,
        inTune: result.inTune,
      });

      const currentPlaybackMs = playbackMsRef.current;
      const currentLatencyOffsetMs = latencyOffsetRef.current;
      const currentNotes = notesRef.current;
      const currentTargetNote = activeTargetNoteRef.current;

      if (!isPlayingRef.current && currentPlaybackMs <= 50 && !isAutoDemoRef.current) {
        setIsPlaying(true);
      }

      const now = performance.now();
      if (now - lastPluckTimeRef.current <= 90) return;

      const effectiveTime = currentPlaybackMs - currentLatencyOffsetMs;
      const windowMs = getToleranceWindowMs(hitToleranceRef.current);
      const candidateNotes =
        isFrozenWaitingRef.current && currentTargetNote
          ? [currentTargetNote]
          : currentNotes.filter(
              (note) =>
                !note.hitState &&
                Math.abs(note.timestampMs - effectiveTime) <= windowMs
            );

      const matched = candidateNotes.find((candidate) => {
        const expectedMidi = getExpectedMidi(candidate.string, candidate.fret);
        const midiDifference = Math.abs(result.midiNumber - expectedMidi);
        return midiDifference % 12 === 0;
      });

      if (matched) {
        lastPluckTimeRef.current = now;
        const timingOffset = Math.round(effectiveTime - matched.timestampMs);
        const absTimingOffset = Math.abs(timingOffset);

        if (sourceIsReliableForLatency(result.confidence, result.onset) && absTimingOffset >= 70 && absTimingOffset <= 180) {
          timingDriftSamplesRef.current = [
            ...timingDriftSamplesRef.current.slice(-7),
            timingOffset,
          ];
          const samples = timingDriftSamplesRef.current;
          if (samples.length >= 5) {
            const averageDrift =
              samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
            const sameDirection = samples.every((sample) => Math.sign(sample) === Math.sign(averageDrift));
            if (sameDirection && Math.abs(averageDrift) >= 45) {
              setLatencyOffsetMs((offset) => {
                const nextOffset = Math.max(0, Math.min(180, Math.round(offset + averageDrift * 0.35)));
                latencyOffsetRef.current = nextOffset;
                return nextOffset;
              });
              timingDriftSamplesRef.current = [];
            }
          }
        } else if (absTimingOffset < 70) {
          timingDriftSamplesRef.current = [];
        }

        handleHitExecution(
          matched.id,
          matched.string,
          matched.fret,
          timingOffset,
          'mic'
        );
      }
    });

    return unsubscribe;
  }, [isListeningMic]);

  const handleToggleMic = async () => {
    if (isListeningMic) {
      micDetector.stopListening();
      setIsListeningMic(false);
      setMicNotice(null);
    } else {
      const started = await micDetector.startListening();
      if (started) {
        setIsListeningMic(true);
        const measuredLatency = micDetector.getEstimatedInputLatencyMs();
        if (measuredLatency > 0) {
          setLatencyOffsetMs(Math.max(0, Math.min(160, measuredLatency)));
        }
        setMicNotice(
          measuredLatency > 0
            ? `Микрофонът е активен • измерена латентност: ${measuredLatency} ms`
            : 'Микрофонът е активен! Свирете на китарата си.'
        );
        setTimeout(() => setMicNotice(null), 4000);
      } else {
        setMicNotice('Моля, разрешете достъп до микрофона в браузъра си.');
      }
    }
  };

  // Main playback animation loop
  useEffect(() => {
    let lastTime = performance.now();
    let frameId: number;

    const loop = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;

      if (isPlaying && !isFrozenWaiting) {
        setPlaybackMs((prev) => {
          const next = prev + delta * tempoFactor;
          if (next >= noteSequenceDurationMs) {
            // Trigger AI Coach adaptive tempo evaluation after playing!
            const now = Date.now();
            if (now - lastRunEvaluatedAtRef.current > 4000) {
              lastRunEvaluatedAtRef.current = now;
              evaluatePerformanceAndAdaptTempo({ ...statsRef.current, streak: streakRef.current }, tempoFactorRef.current, 'loop_completion');
            }

            // Keep playback running so the note highway auto-scrolls from the beginning.
            playbackMsRef.current = 0;
            setNotes(activeTabList.map((n) => ({ ...n })));
            setIsFrozenWaiting(false);
            setActiveTargetNote(null);
            setFeedback(null);
            setParticles([]);
            setActiveFlashes({});
            setMissFlash(false);
            setStreak(0);
            setMultiplier(1);
            setScore(0);
            setStars(0);
            setStats({ hits: 0, close: 0, misses: 0 });
            return 0;
          }
          playbackMsRef.current = next;
          return next;
        });
      }

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, tempoFactor, isFrozenWaiting, noteSequenceDurationMs, activeSong.id]);

  // Handle Wait-For-Me freezing and active target note detection
  useEffect(() => {
    // Pause and timeline seeking must always release the practice gate.
    if (!isPlaying) {
      if (isFrozenWaiting) setIsFrozenWaiting(false);
      return;
    }

    // When in Auto-Demo mode, do not freeze; let the computer demonstrate the song continuously
    if (isAutoDemo) {
      if (isFrozenWaiting) setIsFrozenWaiting(false);
      const upcoming = notes.find(
        (n) => n.timestampMs >= playbackMs - 120 && n.timestampMs <= playbackMs + 700
      );
      setActiveTargetNote(upcoming || null);
      return;
    }

    // Only capture a note that is actually crossing the hit line now.
    // Without the lower bound, seeking forward snaps back to the oldest missed note.
    const unhitNoteAtLine = notes.find(
      (n) =>
        !n.hitState &&
        n.timestampMs >= playbackMs - 120 &&
        n.timestampMs <= playbackMs + 25
    );

    if (waitForMeMode && unhitNoteAtLine) {
      // Freeze playback right at the target note timestamp until user plays it
      setPlaybackMs(unhitNoteAtLine.timestampMs);
      setIsFrozenWaiting(true);
      setActiveTargetNote(unhitNoteAtLine);
    } else {
      if (isFrozenWaiting && !unhitNoteAtLine) {
        setIsFrozenWaiting(false);
      }
      const upcoming = notes.find(
        (n) => n.timestampMs >= playbackMs - 120 && n.timestampMs <= playbackMs + 700
      );
      setActiveTargetNote(upcoming || null);
    }
  }, [playbackMs, waitForMeMode, notes, isFrozenWaiting, isAutoDemo, isPlaying]);

  // Auto-Demo mode: plays notes when user requests a computer demonstration
  useEffect(() => {
    if (!isPlaying || !isAutoDemo) return;

    const unhitNoteAtLine = notes.find(
      (n) => !n.hitState && Math.abs(n.timestampMs - playbackMs) <= 35
    );

    if (unhitNoteAtLine) {
      handleHitExecution(unhitNoteAtLine.id, unhitNoteAtLine.string, unhitNoteAtLine.fret, 0, 'demo');
    }
  }, [playbackMs, isPlaying, isAutoDemo, notes]);

  // Handle MISS detection when NOT in wait-for-me mode (real-time free play)
  useEffect(() => {
    if (waitForMeMode || isAutoDemo) return;

    let hasMiss = false;
    const windowMs = getToleranceWindowMs(hitTolerance);
    const effectiveTime = playbackMs - latencyOffsetMs;

    const updatedNotes = notes.map((note) => {
      // Mark as miss only after the note has completely left the hit tolerance window (+60ms grace)
      if (!note.hitState && effectiveTime - note.timestampMs > windowMs + 60) {
        hasMiss = true;
        return { ...note, hitState: 'miss' as const };
      }
      return note;
    });

    if (hasMiss) {
      setNotes(updatedNotes);
      setStreak(0);
      setMultiplier(1);
      setStats((s) => ({ ...s, misses: s.misses + 1 }));
      setMissFlash(true);
      setTimeout(() => setMissFlash(false), 360);

      const pId = Date.now();
      setParticles((prev) => [
        ...prev.slice(-6),
        {
          id: pId,
          text: 'MISS! ✕',
          color: '#EF4444',
        },
      ]);
      setTimeout(() => {
        setParticles((prev) => prev.filter((p) => p.id !== pId));
      }, 900);

      setFeedback({
        matchType: 'MISS',
        headline: 'MISSED',
        expectedNote: '--',
        playedNote: '--',
        timingErrorMs: 0,
        timingLabel: 'late',
        timestamp: Date.now(),
      });
    }
  }, [playbackMs, waitForMeMode, isAutoDemo, notes, latencyOffsetMs, hitTolerance]);

  const handleHitExecution = (
    noteId: string | undefined,
    stringNum: number,
    fret: number,
    offsetMs: number,
    source: 'mic' | 'manual' | 'demo' = 'manual'
  ) => {
    // Determine whether to play synthetic plucked sound from speakers:
    // When plucking a REAL guitar with the microphone: do NOT blast synthetic speaker sound
    // (the user already hears their real guitar, and computer speakers feedback into the microphone!)
    const shouldPlaySpeakerSound =
      source === 'demo' ||
      (source === 'manual' && (!isListeningMic || synthSoundWithMic)) ||
      (source === 'mic' && synthSoundWithMic);

    if (shouldPlaySpeakerSound) {
      guitarSynth.playGuitarNote(stringNum, fret);
      micDetector.notifySpeakerPlayed(350); // Echo gate refractory window
    }

    // Mark note as hit in state
    if (noteId) {
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, hitState: 'hit' as const } : n))
      );
    }

    // Unfreeze if in wait-for-me mode
    if (isFrozenWaiting) {
      setIsFrozenWaiting(false);
    }

    // Trigger visual string lane flash
    setActiveFlashes((prev) => ({ ...prev, [stringNum]: true }));
    setTimeout(() => {
      setActiveFlashes((prev) => ({ ...prev, [stringNum]: false }));
    }, 180);

    const absOffset = Math.abs(offsetMs);
    const isPerfect = absOffset <= 60;
    const isClose = absOffset > 170;
    const noteName = getExpectedNoteName(stringNum, fret);

    // Update streak & multiplier
    setStreak((s) => {
      const nextStreak = s + 1;
      if (nextStreak >= 20) setMultiplier(4);
      else if (nextStreak >= 10) setMultiplier(3);
      else if (nextStreak >= 5) setMultiplier(2);
      else setMultiplier(1);
      return nextStreak;
    });

    const pointsEarned = (isPerfect ? 300 : isClose ? 100 : 200) * multiplier;
    setScore((sc) => {
      const newScore = sc + pointsEarned;
      if (newScore > 6000) setStars(3);
      else if (newScore > 3500) setStars(2);
      else if (newScore > 1500) setStars(1);
      return newScore;
    });

    setStats((prev) => ({
      ...prev,
      hits: isClose ? prev.hits : prev.hits + 1,
      close: isClose ? prev.close + 1 : prev.close,
    }));

    // Trigger particle burst
    const pId = Date.now();
    setParticles((prev) => [
      ...prev,
      {
        id: pId,
        text: isPerfect ? 'PERFECT! +300' : 'GREAT! +200',
        color: isPerfect ? '#2ED573' : '#00E5BE',
      },
    ]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== pId));
    }, 900);

    // Update tuner with played pitch
    setPitchData({
      pitch: noteName,
      frequency: 146.8 + fret * 8,
      cents: Math.round(offsetMs * 0.4),
      inTune: Math.abs(offsetMs) < 30,
    });

    setFeedback({
      matchType: isClose ? 'CLOSE' : 'HIT',
      headline: isPerfect ? 'PERFECT' : 'GOOD',
      expectedNote: `${STRING_NAMES[stringNum - 1]}+${fret}`,
      playedNote: `${STRING_NAMES[stringNum - 1]}+${fret}`,
      timingErrorMs: Math.round(offsetMs),
      timingLabel: offsetMs > 0 ? 'late' : 'early',
      timestamp: Date.now(),
    });
  };

  const handleManualFretClick = (stringNum: number, fret: number) => {
    if (activeTargetNote && activeTargetNote.string === stringNum) {
      handleHitExecution(activeTargetNote.id, stringNum, fret, Math.round((Math.random() - 0.5) * 20), 'manual');
    } else {
      handleHitExecution(undefined, stringNum, fret, 0, 'manual');
    }
  };

  const togglePlayback = () => {
    setIsPlaying((playing) => !playing);
  };

  const resetPlaybackJudgement = () => {
    setNotes(activeTabList.map((note) => ({ ...note })));
    setFeedback(null);
    setParticles([]);
    setMissFlash(false);
    setActiveFlashes({});
    setActiveTargetNote(null);
    setIsFrozenWaiting(false);
    setStreak(0);
    setMultiplier(1);
    setStats({ hits: 0, close: 0, misses: 0 });
  };

  const seekTo = (nextPlaybackMs: number, shouldPlay = false) => {
    const clampedPlaybackMs = Math.max(0, Math.min(noteSequenceDurationMs, nextPlaybackMs));
    resetPlaybackJudgement();
    setIsPlaying(shouldPlay);
    playbackMsRef.current = clampedPlaybackMs;
    setPlaybackMs(clampedPlaybackMs);
  };

  const playTechniqueFocus = () => {
    if (!focusTechnique) return;
    setIsAutoDemo(true);
    setWaitForMeMode(false);
    seekTo(Math.max(0, focusTechnique.startMs - 450), true);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '6') {
        const stringNum = parseInt(e.key, 10);
        // Play note on target fret or open string
        const fret = activeTargetNote?.string === stringNum ? activeTargetNote.fret : 0;
        const noteId = activeTargetNote?.string === stringNum ? activeTargetNote.id : undefined;
        handleHitExecution(noteId, stringNum, fret, 0, 'manual');
      } else if (e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
      } else if (e.key.toLowerCase() === 'w') {
        setWaitForMeMode((enabled) => {
          if (enabled) {
            setIsFrozenWaiting(false);
            setActiveTargetNote(null);
          }
          return !enabled;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTargetNote]);

  const totalHits = stats.hits + stats.close + stats.misses;
  const accuracyPct = Math.round(((stats.hits + stats.close * 0.5) / Math.max(1, totalHits)) * 100);

  // Compute bouncing ball position for playhead indicator
  const currentApproachingNote = activeTargetNote || INITIAL_DEMO_NOTES[0];
  const ballStringIndex = currentApproachingNote ? currentApproachingNote.string - 1 : 2;
  const ballYPercent = (ballStringIndex + 0.5) * (100 / 6);

  // Pre-render the next loop before the current one ends, so new notes are
  // already entering from the right instead of leaving an empty highway.
  const scrollingNotes: TabNote[] = [
    ...notes,
    ...notes.map((note) => ({
      ...note,
      id: `${note.id}-next-loop`,
      timestampMs: note.timestampMs + noteSequenceDurationMs,
      hitState: undefined,
    })),
  ];
  useEffect(() => {
    const canvas = highwayCanvasRef.current;
    if (!canvas) return;

    let frameId = 0;

    const draw = () => {
      const parent = canvas.parentElement;
      const rect = parent?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        frameId = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = Math.floor(rect.width * dpr);
      const height = Math.floor(rect.height * dpr);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const stageGradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
      stageGradient.addColorStop(0, '#05070B');
      stageGradient.addColorStop(0.48, '#07111C');
      stageGradient.addColorStop(1, '#05070B');
      ctx.fillStyle = stageGradient;
      ctx.fillRect(0, 0, rect.width, rect.height);

      const vanishingX = rect.width * 0.92;
      const hitX = rect.width * hitZoneFraction;
      const laneHeight = rect.height / 6;

      for (let i = 0; i < 6; i += 1) {
        const y = laneHeight * (i + 0.5);
        const laneTop = laneHeight * i;

        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(255,255,255,0.035)';
        ctx.fillRect(0, laneTop, rect.width, laneHeight);

        ctx.strokeStyle = 'rgba(255,255,255,0.055)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, laneTop);
        ctx.lineTo(rect.width, laneTop);
        ctx.stroke();

        const wireGradient = ctx.createLinearGradient(40, y, vanishingX, y);
        wireGradient.addColorStop(0, `${STRING_COLORS[i]}44`);
        wireGradient.addColorStop(0.5, 'rgba(255,255,255,0.72)');
        wireGradient.addColorStop(1, `${STRING_COLORS[i]}22`);

        ctx.strokeStyle = wireGradient;
        ctx.lineWidth = STRING_GAUGES[i];
        ctx.beginPath();
        ctx.moveTo(76, y);
        ctx.quadraticCurveTo(rect.width * 0.55, y - laneHeight * 0.05, vanishingX, y);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.58)';
        ctx.font = '700 11px JetBrains Mono, monospace';
        ctx.fillText(STRING_NAMES[i], 16, y + 4);
      }

      const glow = ctx.createLinearGradient(hitX - 12, 0, hitX + 12, 0);
      glow.addColorStop(0, 'rgba(0,229,190,0)');
      glow.addColorStop(0.5, 'rgba(0,229,190,0.32)');
      glow.addColorStop(1, 'rgba(0,229,190,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(hitX - 14, 0, 28, rect.height);

      ctx.strokeStyle = '#00E5BE';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hitX, 0);
      ctx.lineTo(hitX, rect.height);
      ctx.stroke();

      const now = playbackMsRef.current;
      for (const note of scrollingNotes) {
        const diffMs = note.timestampMs - now;
        const x = hitX + (diffMs / visibleWindowMs) * ((1 - hitZoneFraction) * rect.width);
        if (x < -80 || x > rect.width + 120) continue;

        const stringIdx = note.string - 1;
        const y = laneHeight * (stringIdx + 0.5);
        const color = note.hitState === 'hit' ? '#10B981' : note.hitState === 'miss' ? '#EF4444' : STRING_COLORS[stringIdx];
        const isOpen = note.fret === 0;
        const radius = isOpen ? 15 : 18;
        const sustain = Math.max(0, (note.durationMs / visibleWindowMs) * 300);

        if (sustain > 24) {
          ctx.fillStyle = `${color}24`;
          ctx.strokeStyle = `${color}88`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(x + radius - 2, y - 7, sustain, 14, 7);
          ctx.fill();
          ctx.stroke();
        }

        ctx.shadowColor = color;
        ctx.shadowBlur = note.hitState ? 18 : 10;
        ctx.fillStyle = isOpen ? '#05070B' : color;
        ctx.strokeStyle = note.hitState === 'miss' ? '#FFD1D1' : 'rgba(255,255,255,0.85)';
        ctx.lineWidth = isOpen ? 2 : 1.5;
        ctx.beginPath();
        ctx.roundRect(x - radius, y - 16, radius * 2, 32, 10);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 14px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(note.hitState === 'hit' ? '✓' : note.hitState === 'miss' ? '✕' : String(note.fret), x, y + 0.5);
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [scrollingNotes, visibleWindowMs, hitZoneFraction]);

  const timingCueNote = notes.find(
    (note) =>
      !note.hitState &&
      note.timestampMs >= playbackMs - 140 &&
      note.timestampMs <= playbackMs + 1800
  );
  const timingCueDiffMs = timingCueNote ? timingCueNote.timestampMs - playbackMs : null;
  const timingCueWindowMs = getToleranceWindowMs(hitTolerance);
  const timingCueUrgency =
    timingCueDiffMs === null
      ? 'idle'
      : Math.abs(timingCueDiffMs) <= 95
      ? 'hit'
      : timingCueDiffMs <= 420
      ? 'ready'
      : 'wait';
  const timingCueProgress =
    timingCueDiffMs === null
      ? 0
      : Math.max(0, Math.min(100, ((1800 - timingCueDiffMs) / 1800) * 100));
  const timingCueLabel =
    timingCueUrgency === 'hit'
      ? 'УДАРИ СЕГА'
      : timingCueUrgency === 'ready'
      ? 'ГОТОВ'
      : timingCueUrgency === 'wait'
      ? 'СЛЕДИ НОТАТА'
      : 'ЧАКА СЛЕДВАЩА НОТА';
  const activeSection = songSections.find(
    (section) => playbackMs >= section.startMs && playbackMs <= section.endMs
  );
  const sectionProgressPct =
    activeSection
      ? Math.round(
          ((playbackMs - activeSection.startMs) /
            Math.max(1, activeSection.endMs - activeSection.startMs)) *
            100
        )
      : 0;
  const completedSectionCount = songSections.filter((section) => playbackMs > section.endMs).length;
  const activeTechnique =
    detectedTechniques.find(
      (technique) => playbackMs >= technique.startMs - 120 && playbackMs <= technique.endMs + 120
    ) || null;
  const focusTechnique = activeTechnique || selectedAnalysis?.primaryFocus || detectedTechniques[0] || null;

  return (
    <div
      id="playing-stage-container"
      className="relative flex flex-col h-full bg-[#05070B] text-[#E2E8F0] select-none overflow-hidden font-sans"
    >
      {/* Top HUD Bar */}
      <header
        id="playing-stage-header"
        className="h-16 bg-[#05070B]/95 backdrop-blur-md border-b border-white/5 px-6 flex items-center justify-between z-20 shrink-0"
      >
        {/* Left: Song details & Rating Stars */}
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-[#00E5BE] shrink-0">
            <Music className="w-5 h-5" />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-white tracking-tight">{activeSong.title}</span>
              <span aria-hidden="true" className="text-[#43556B]">·</span>
              <span className="text-xs font-mono text-[#00E5BE] font-semibold">{activeSong.tuning}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#71849A] mt-0.5">
              <span>{activeSong.artist}</span>
              <span aria-hidden="true">·</span>
              {/* 3 Gold Stars Rating Meter */}
              <span className="text-[11px] font-mono text-[#6F7D8C] tabular-nums">
                {score.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Tuner Widget & Streak Flame Multiplier */}
        <div className="hidden lg:flex items-center gap-3">
          <GuitarTuner
            currentPitch={pitchData.pitch}
            frequencyHz={pitchData.frequency}
            centsOffset={pitchData.cents}
            inTune={pitchData.inTune}
            isListening={isListeningMic}
            volumeRms={micRms}
            onToggleMic={handleToggleMic}
          />

          {/* Combo Multiplier Flame Pill with Framer Motion Bounce */}
          <motion.div
            id="streak-multiplier-badge"
            key={streak}
            animate={{ scale: streak > 0 ? [1, 1.08, 1] : 1 }}
            transition={{ duration: 0.2 }}
            className="hidden xl:flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-full px-3 py-1.5"
          >
            <div className="w-6 h-6 rounded-lg bg-[#FF6B35]/15 flex items-center justify-center text-[#FF6B35]">
              <Flame className="w-3.5 h-3.5 animate-pulse fill-[#FF6B35]" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[9px] uppercase font-mono font-bold text-[#FF8F6B]">
                {streak}x COMBO
              </span>
              <span className="text-xs font-black text-white font-mono tracking-tight mt-0.5 tabular-nums">
                {multiplier}X MULTIPLIER
              </span>
            </div>
          </motion.div>
        </div>

        {/* Right: Accuracy card & Action triggers */}
        <div className="flex items-center gap-2.5">
          <div className="bg-transparent border-0 px-1 py-1 text-right font-mono">
            <div className="text-xs font-bold tracking-tight text-[#00E5BE] tabular-nums">
              ТОЧНОСТ {accuracyPct}%
            </div>
            <div className="hidden">
              Hits <span className="text-white font-semibold">{stats.hits}</span> · Close{' '}
              <span className="text-[#F59E0B] font-semibold">{stats.close}</span> · Miss{' '}
              <span className="text-[#EF4444] font-semibold">{stats.misses}</span>
            </div>
          </div>

          <motion.button
            id="btn-open-audio-settings"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowAudioSettings(true)}
            className="bg-white/[0.03] hover:bg-white/[0.07] text-[#DDE4EE] border border-white/10 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Калибрация на латентността и чувствителността на китарата"
          >
            <Sliders className="w-3.5 h-3.5 text-[#00E5BE]" />
            <span>Калибрация</span>
          </motion.button>

          <motion.button
            id="btn-open-songs-library"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={onOpenLibrary}
            className="bg-[#101724] hover:bg-[#162132] text-[#DDE4EE] border border-[#1E2C40] hover:border-[#00E5BE]/50 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Music className="w-3.5 h-3.5 text-[#00E5BE]" />
            <span>Песни</span>
          </motion.button>
        </div>
      </header>

      {/* Mic Status Banner with Framer Motion AnimatePresence */}
      <AnimatePresence>
        {!isListeningMic ? (
          <motion.div
            key="banner-off"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            id="mic-enable-banner"
            onClick={handleToggleMic}
            className="bg-[#05070B] border-b border-white/5 px-6 py-1.5 flex items-center justify-between text-[11px] text-[#6F7D8C] cursor-pointer hover:bg-white/[0.02] transition-colors shrink-0"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
              <span>
                <strong className="text-white">Микрофонът е изключен:</strong> Кликнете тук за вход от истинска китара или включете режим Демо.
              </span>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleMic();
              }}
              className="px-3 py-1 bg-white/[0.05] hover:bg-white/[0.09] text-[#E2E8F0] font-semibold rounded-full text-[11px] border border-white/10 transition-colors cursor-pointer"
            >
              Включи микрофона
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="banner-on"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            id="mic-live-banner"
            className="bg-[#09111D] border-b border-[#00E5BE]/20 px-6 py-1.5 flex items-center justify-between text-xs shrink-0"
          >
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#00E5BE] animate-ping" />
              <span className="text-[#8FA5BF] font-medium">
                Аудио сигнал на живо:
              </span>
              <span className="font-mono font-bold bg-[#070B12] border border-[#00E5BE]/30 px-2 py-0.5 rounded-md text-[#00E5BE] tabular-nums">
                {pitchData.frequency > 0 ? `${pitchData.pitch} (${pitchData.frequency.toFixed(1)} Hz)` : 'Свирете за засичане...'}
              </span>
              {activeTargetNote && (
                <span className="text-[#63768D] hidden md:inline">
                  · Очаква се тон: <strong className="text-white font-mono">{getExpectedNoteName(activeTargetNote.string, activeTargetNote.fret)}</strong> (струна {activeTargetNote.string}, праг {activeTargetNote.fret})
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAudioSettings(true)}
                className="text-xs text-[#00E5BE] hover:underline font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Sliders className="w-3 h-3" />
                <span>Калибрация ({latencyOffsetMs}ms)</span>
              </button>
              <button
                onClick={handleToggleMic}
                className="text-xs text-[#71849A] hover:text-white transition-colors cursor-pointer"
              >
                Спри микрофона
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Track Stage (Scrolling Tabs with Laser Target & Bouncing Ball) */}
      <main className="flex-1 relative flex flex-col px-4 pt-3 pb-2 overflow-hidden">
        {/* The Track Container */}
        <div
          id="guitar-scrolling-stage"
          className="relative w-full h-full bg-[#080C14] border border-[#182335] rounded-xl shadow-2xl overflow-hidden flex flex-col justify-between"
        >
          {/* Studio Fret Position Markers */}
          <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-around opacity-40">
            {[
              { label: '3', name: 'III' },
              { label: '5', name: 'V' },
              { label: '7', name: 'VII' },
              { label: '9', name: 'IX' },
              { label: '12', name: 'XII', double: true },
              { label: '15', name: 'XV' },
            ].map((fret) => (
              <div key={fret.label} className="flex flex-col items-center gap-1.5">
                <div className="h-full w-px bg-gradient-to-b from-transparent via-[#1E2D42]/60 to-transparent" />
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3B4E68]" />
                  {fret.double && <span className="w-1.5 h-1.5 rounded-full bg-[#3B4E68]" />}
                </div>
                <span className="text-[9px] text-[#485D75] font-mono font-bold">{fret.label}</span>
              </div>
            ))}
          </div>

          {/* Laser Target Zone Line */}
          <div
            id="guitar-laser-hit-zone"
            className="absolute top-0 bottom-0 z-20 pointer-events-none"
            style={{ left: `${hitZoneFraction * 100}%` }}
          >
            <div
              className={`absolute top-4 bottom-4 -translate-x-1/2 rounded-3xl border transition-all duration-150 ${
                timingCueUrgency === 'hit'
                  ? 'w-20 bg-[#00E5BE]/18 border-[#00E5BE]/70 shadow-[0_0_30px_rgba(0,229,190,0.28)]'
                  : 'w-14 bg-[#00E5BE]/8 border-[#00E5BE]/25'
              }`}
            />

            <div
              className={`absolute -left-20 top-4 w-40 rounded-2xl border px-3 py-2 text-center shadow-xl backdrop-blur-md transition-all duration-150 ${
                timingCueUrgency === 'hit'
                  ? 'bg-[#00E5BE] text-[#061014] border-white/70 scale-105 shadow-[0_0_28px_rgba(0,229,190,0.42)]'
                  : timingCueUrgency === 'ready'
                  ? 'bg-[#101A28]/95 text-white border-[#FFD32A]/60 shadow-[0_0_20px_rgba(255,211,42,0.18)]'
                  : 'bg-[#080D16]/90 text-[#9CB1C8] border-[#21324A]'
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.18em]">
                {timingCueLabel}
              </div>
              {timingCueNote && (
                <div className="mt-1 flex items-center justify-center gap-2 text-xs font-black">
                  <span>Струна {timingCueNote.string}</span>
                  <span className="opacity-60">•</span>
                  <span>Прагче {timingCueNote.fret}</span>
                </div>
              )}
              <div className="mt-1 text-[9px] font-mono opacity-70">
                точен прозорец ±{timingCueWindowMs}ms
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-black/25 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    timingCueUrgency === 'hit' ? 'bg-white' : 'bg-[#00E5BE]'
                  }`}
                  style={{ width: `${timingCueProgress}%` }}
                />
              </div>
            </div>

            {/* Top Laser Emitter Stud */}
            <div
              className={`absolute -top-1 -left-1.5 w-3 h-3 rounded-full transition-colors duration-150 ${
                missFlash ? 'bg-[#EF4444] shadow-[0_0_14px_#EF4444]' : 'bg-[#00E5BE] shadow-[0_0_12px_#00E5BE]'
              }`}
            />

            {/* Glowing laser aura */}
            <div
              className={`absolute -left-5 top-0 bottom-0 w-10 blur-[3px] transition-all duration-150 ${
                missFlash
                  ? 'bg-gradient-to-r from-transparent via-[#EF4444]/40 to-transparent'
                  : 'bg-gradient-to-r from-transparent via-[#00E5BE]/30 to-transparent'
              }`}
            />
            {/* Crisp vertical beam */}
            <div
              className={`absolute left-0 top-0 bottom-0 w-[2.5px] transition-all duration-150 ${
                missFlash
                  ? 'bg-gradient-to-b from-[#EF4444] via-white to-[#EF4444] shadow-[0_0_24px_#EF4444]'
                  : 'bg-gradient-to-b from-[#00E5BE] via-white to-[#00E5BE] shadow-[0_0_16px_#00E5BE]'
              }`}
            />

            {/* Bottom Laser Emitter Stud */}
            <div
              className={`absolute -bottom-1 -left-1.5 w-3 h-3 rounded-full transition-colors duration-150 ${
                missFlash ? 'bg-[#EF4444] shadow-[0_0_14px_#EF4444]' : 'bg-[#00E5BE] shadow-[0_0_12px_#00E5BE]'
              }`}
            />

            {/* Bouncing Ball / Playhead Indicator */}
            <div
              id="guitar-bouncing-ball"
              className={`absolute -left-3.5 w-7 h-7 rounded-full border-2 border-white flex items-center justify-center transition-all duration-150 transform -translate-y-1/2 ${
                missFlash
                  ? 'bg-gradient-to-tr from-[#DC2626] via-[#EF4444] to-white shadow-[0_0_28px_#EF4444]'
                  : 'bg-gradient-to-tr from-[#00E5BE] via-[#2ED573] to-white shadow-[0_0_24px_#00E5BE]'
              }`}
              style={{
                top: `${ballYPercent}%`,
              }}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_white] animate-ping ${
                  missFlash ? 'bg-[#FFA3A3]' : 'bg-white'
                }`}
              />
            </div>

            {/* Live Feedback Popover Badge */}
            <AnimatePresence>
              {feedback && Date.now() - feedback.timestamp < 1000 && (
                <motion.div
                  key={feedback.timestamp}
                  initial={{ scale: 0.7, y: 8, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  className={`absolute -left-10 -top-8 px-2.5 py-0.5 rounded-lg font-mono text-[11px] font-black tracking-wider uppercase shadow-xl z-30 pointer-events-none transition-colors ${
                    feedback.matchType === 'MISS'
                      ? 'bg-[#EF4444] text-white border border-[#FFA3A3] shadow-[0_0_16px_rgba(239,68,68,0.4)]'
                      : feedback.matchType === 'HIT'
                      ? 'bg-[#10B981] text-[#071610] font-black border border-[#A7F3D0] shadow-[0_0_16px_rgba(16,185,129,0.4)]'
                      : 'bg-[#F59E0B] text-black border border-[#FDE68A] shadow-[0_0_16px_rgba(245,158,11,0.4)]'
                  }`}
                >
                  {feedback.headline} {feedback.matchType === 'MISS' ? '✕' : '✓'}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Ready-to-Play start prompt overlay when song is at 0:00 and paused */}
          <AnimatePresence>
            {!isPlaying && playbackMs === 0 && (
              <motion.div
                key="ready-overlay"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.16 }}
                id="ready-to-play-overlay"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-[#090E18]/95 border border-[#1E2B3E] hover:border-[#00E5BE]/40 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center backdrop-blur-xl max-w-md w-full"
              >
                <motion.div
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  className="w-14 h-14 rounded-2xl bg-[#00E5BE] text-[#070B12] flex items-center justify-center shadow-lg shadow-[#00E5BE]/30 mb-3 cursor-pointer"
                  onClick={() => setIsPlaying(true)}
                >
                  <Play className="w-7 h-7 fill-current ml-0.5" />
                </motion.div>
                <h3 className="text-lg font-extrabold text-white tracking-tight">
                  {activeSong.title}
                </h3>
                <p className="text-xs text-[#71849A] mt-1">
                  {activeSong.artist} · {activeSong.tuning} · {activeSong.difficulty}
                </p>
                <div className="mt-4 flex items-center gap-3 w-full justify-center">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setIsPlaying(true)}
                    className="px-5 py-2 rounded-xl bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#070B12] font-black text-xs shadow-md shadow-[#00E5BE]/30 flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Старт на песента</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      setIsAutoDemo(true);
                      setIsPlaying(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#111824] hover:bg-[#182335] text-[#9FB3C9] hover:text-white border border-[#202E42] text-xs font-semibold flex items-center gap-2 cursor-pointer"
                    title="Компютърът ще изсвири песента за демонстрация"
                  >
                    <Headphones className="w-3.5 h-3.5 text-[#00E5BE]" />
                    <span>Демо</span>
                  </motion.button>
                </div>
                <span className="text-[11px] text-[#556980] font-mono mt-3">
                  Или натиснете клавиш <kbd className="px-1.5 py-0.5 bg-[#121926] border border-[#253549] rounded text-[#8FA5BF] font-mono">Space</kbd>
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Wait-for-Me Live Instruction Card when frozen waiting for player */}
          <AnimatePresence>
            {isFrozenWaiting && activeTargetNote && (
              <motion.div
                key="wait-card"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                id="wait-for-me-instruction-card"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-[#090E18]/95 border border-[#00E5BE]/60 rounded-2xl p-6 shadow-2xl flex items-center gap-6 backdrop-blur-xl pointer-events-auto max-w-xl w-full"
              >
              {/* String Number Badge */}
              <div
                className="w-18 h-18 rounded-2xl flex flex-col items-center justify-center text-[#070D16] font-black shadow-xl shrink-0 transition-transform transform hover:scale-105"
                style={{
                  background: `linear-gradient(135deg, ${STRING_COLORS[activeTargetNote.string - 1]}, #FFFFFF)`,
                  boxShadow: `0 0 24px ${STRING_COLORS[activeTargetNote.string - 1]}66`,
                }}
              >
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-85">СТРУНА</span>
                <span className="text-4xl leading-none font-mono font-black">{activeTargetNote.string}</span>
              </div>

              <div className="flex flex-col flex-1">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00E5BE] animate-ping shadow-[0_0_8px_#00E5BE]" />
                  <span className="text-xs uppercase font-black text-[#00E5BE] tracking-widest">
                    ЧАКА ВАШАТА КИТАРА (WAIT FOR ME)
                  </span>
                </div>

                <div className="text-white font-extrabold text-xl mt-1 tracking-tight">
                  {activeTargetNote.fret === 0 ? (
                    <span>
                      Дръпнете <strong className="text-[#00E5BE]">свободна струна {STRING_NAMES[activeTargetNote.string - 1]}</strong> (Прагче 0)
                    </span>
                  ) : (
                    <span>
                      Натиснете <strong className="text-[#00E5BE]">прагче {activeTargetNote.fret}</strong> на струна {STRING_NAMES[activeTargetNote.string - 1]}
                    </span>
                  )}
                </div>

                {/* Expected note badge & live wave bars */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1C283C]">
                  <div className="text-xs text-[#8BA0B8] flex items-center space-x-3 font-mono">
                    <span>
                      Очакван тон:{' '}
                      <strong className="text-white bg-[#141C2B] px-2.5 py-0.5 rounded-md border border-[#2B3B52]">
                        {getExpectedNoteName(activeTargetNote.string, activeTargetNote.fret)}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Микрофон:{' '}
                      {isListeningMic ? (
                        pitchData.frequency > 0 ? (
                          <span className="text-[#00E5BE] font-bold">
                            {pitchData.pitch} ({pitchData.frequency.toFixed(1)}Hz)
                          </span>
                        ) : (
                          <span className="text-[#FFB142] animate-pulse">Слуша звука...</span>
                        )
                      ) : (
                        <span className="text-[#FF5E7E] font-bold">ИЗКЛЮЧЕН</span>
                      )}
                    </span>
                  </div>

                  {/* Dynamic Mic Wave Bars */}
                  {isListeningMic && (
                    <div className="flex items-center space-x-1 h-5">
                      {[0.3, 0.7, 1.0, 0.5, 0.8, 0.4].map((ratio, i) => (
                        <span
                          key={i}
                          className="w-1 bg-[#00E5BE] rounded-full transition-all duration-75"
                          style={{
                            height: `${Math.max(4, (micRms > 0.01 ? micRms * 150 : 4) * ratio)}px`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {!isListeningMic && (
                <button
                  onClick={handleToggleMic}
                  className="px-4 py-3 bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#070D16] font-black text-xs rounded-xl shadow-lg shadow-[#00E5BE]/25 transition shrink-0 cursor-pointer active:scale-95"
                >
                  Включи микрофон
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

          <canvas
            ref={highwayCanvasRef}
            id="canvas-guitar-highway"
            className="absolute inset-0 z-0 pointer-events-none"
            aria-hidden="true"
          />

          {/* Floating particle bursts */}
          <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
            {particles.map((p) => (
              <div
                key={p.id}
                className="absolute text-sm font-black tracking-wider animate-out fade-out slide-out-to-top duration-700 pointer-events-none drop-shadow-md font-mono"
                style={{
                  left: `${hitZoneFraction * 100 + 2}%`,
                  top: `${ballYPercent - 10}%`,
                  color: p.color,
                }}
              >
                {p.text}
              </div>
            ))}
          </div>

          {/* 6 String Lanes */}
          {STRING_NAMES.map((name, index) => {
            const stringNum = index + 1;
            const color = STRING_COLORS[index];
            const gauge = STRING_GAUGES[index];
            const isFlashed = activeFlashes[stringNum];

            return (
              <div
                key={name}
                id={`lane-row-${stringNum}`}
                onClick={() => handleManualFretClick(stringNum, activeTargetNote?.fret || 0)}
                className={`relative flex-1 flex items-center transition-colors cursor-pointer border-b border-white/[0.03] bg-transparent ${
                  index % 2 === 0 ? 'bg-transparent' : 'bg-transparent'
                } ${isFlashed ? 'bg-[#00E5BE]/10' : 'hover:bg-white/[0.02]'}`}
              >
                {/* String Studio Channel Badge */}
                <div
                  id={`string-pill-${stringNum}`}
                  className="z-30 ml-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#05070B]/80 border border-white/10 transition-transform hover:scale-105 active:scale-95"
                  style={{
                    borderColor: isFlashed ? color : undefined,
                    boxShadow: isFlashed ? `0 0 14px ${color}` : undefined,
                  }}
                  title={`String ${stringNum}: ${name} (Click or press key ${stringNum})`}
                >
                  <span className="w-1.5 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs font-mono font-bold text-white">{name}</span>
                  <span className="text-[9px] font-mono text-[#526680]">s{stringNum}</span>
                </div>

                {/* Authentic Metallic String Wire */}
                <div
                  className="absolute left-20 right-4 rounded-full transition-all duration-100"
                  style={{
                    height: `${gauge}px`,
                    background: STRING_GRADIENTS[index],
                    boxShadow: isFlashed ? `0 0 16px ${color}, 0 0 8px white` : '0 1px 2px rgba(0,0,0,0.8)',
                  }}
                />

                {/* Hit Zone Target Diamond Indicator */}
                <div
                  className="absolute z-20 w-3 h-3 rotate-45 bg-[#080C14] border-2 -translate-x-1.5 pointer-events-none"
                  style={{
                    left: `${hitZoneFraction * 100}%`,
                    borderColor: color,
                  }}
                />
              </div>
            );
          })}

          {/* Animated Scrolling Notes with Sustain Trails */}
          <div id="scrolling-notes-container" className="absolute inset-0 pointer-events-none z-10 overflow-hidden opacity-35">
            {scrollingNotes.map((note) => {
              const diffMs = note.timestampMs - playbackMs;
              const xPercent =
                hitZoneFraction * 100 + (diffMs / visibleWindowMs) * ((1 - hitZoneFraction) * 100);

              if (xPercent < -15 || xPercent > 115) return null;

              const stringIdx = note.string - 1;
              const color = STRING_COLORS[stringIdx];
              const laneHeightPercent = 100 / 6;
              const yPercent = stringIdx * laneHeightPercent + laneHeightPercent * 0.16;
              const noteHeightPercent = laneHeightPercent * 0.68;
              const isOpenString = note.fret === 0;

              const isPast = diffMs < 0;
              const hasSustain = note.durationMs > 400;
              const sustainWidthPx = Math.max(30, (note.durationMs / visibleWindowMs) * 320);

              const isHit = note.hitState === 'hit';
              const isMiss = note.hitState === 'miss';
              const isWaitingThisNote = isFrozenWaiting && activeTargetNote?.id === note.id;

              // Keep a missed note visible only briefly at the hit line.
              // This prevents old crosses from filling the scrolling highway.
              if (isMiss && diffMs < -450) return null;

              return (
                <div
                  key={note.id}
                  className={`absolute flex items-center ${
                    isMiss ? 'opacity-95' : isPast && !isHit ? 'opacity-35' : 'opacity-100'
                  }`}
                  style={{
                    left: `${xPercent}%`,
                    top: `${yPercent}%`,
                    height: `${noteHeightPercent}%`,
                    willChange: 'left',
                  }}
                >
                  {/* Translucent Sustain Trail Ribbon */}
                  {hasSustain && (
                    <div
                      className="absolute left-4 rounded-r-lg pointer-events-none transition-all"
                      style={{
                        width: `${sustainWidthPx}px`,
                        height: '52%',
                        backgroundColor: isHit ? '#2ED57335' : isMiss ? '#EF444435' : `${color}25`,
                        borderTop: isHit ? '1px solid #2ED573' : isMiss ? '1px solid #EF4444' : `1px solid ${color}88`,
                        borderRight: isHit ? '1px solid #2ED573' : isMiss ? '1px solid #EF4444' : `1px solid ${color}88`,
                        borderBottom: isHit ? '1px solid #2ED573' : isMiss ? '1px solid #EF4444' : `1px solid ${color}88`,
                      }}
                    />
                  )}

                  {/* Note Head Capsule */}
                  <div
                    id={`note-head-${note.id}`}
                    className={`relative w-10 h-full rounded-xl flex items-center justify-center z-10 transition-all ${
                      isWaitingThisNote
                        ? 'ring-4 ring-[#00E5BE] scale-110 shadow-[0_0_20px_#00E5BE]'
                        : isMiss
                        ? 'scale-105 shadow-[0_0_16px_#EF4444]'
                        : ''
                    }`}
                    style={{
                      backgroundColor: isHit
                        ? '#10B981'
                        : isMiss
                        ? '#DC2626'
                        : isOpenString
                        ? '#0A0F19'
                        : color,
                      border: isHit
                        ? '2px solid #FFFFFF'
                        : isMiss
                        ? '2px solid #FFA3A3'
                        : isOpenString
                        ? `2px solid ${color}`
                        : '1.5px solid rgba(255,255,255,0.75)',
                      boxShadow: isHit
                        ? '0 0 16px #10B981'
                        : isMiss
                        ? '0 0 16px #EF4444'
                        : isOpenString
                        ? `0 0 10px ${color}66`
                        : `0 4px 12px rgba(0,0,0,0.5), 0 0 8px ${color}44`,
                    }}
                  >
                    {/* Fret Number Label, Checkmark, or Red Cross */}
                    <span className="font-mono font-black text-sm text-white drop-shadow-sm">
                      {isHit ? '✓' : isMiss ? '✕' : note.fret}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>


      {/* Imported Tab Technique Map Trigger */}
      {detectedTechniques.length > 0 && (
        <div className="bg-[#05070B] border-t border-white/5 px-6 py-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsTechniqueMapOpen(true)}
            className="w-full flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] px-4 py-2 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Sparkles className="w-4 h-4 text-[#00E5BE] shrink-0" />
              <div className="min-w-0 text-left">
                <div className="text-xs font-bold text-white truncate">
                  Technique Map
                  {focusTechnique ? ` · ${focusTechnique.problemTitle || focusTechnique.label}` : ''}
                </div>
                <div className="text-[11px] text-[#7D8FA6] truncate">
                  {detectedTechniques.length} открити места · клик за карта, обяснение и упражнения
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-1.5">
              {detectedTechniques.slice(0, 8).map((technique) => {
                const color =
                  technique.severity === 'high'
                    ? '#FF5E7E'
                    : technique.severity === 'medium'
                    ? '#F59E0B'
                    : '#00E5BE';

                return (
                  <span
                    key={technique.id}
                    className="h-1.5 w-6 rounded-full"
                    style={{ backgroundColor: color }}
                    title={technique.problemTitle || technique.label}
                  />
                );
              })}
            </div>
          </button>
        </div>
      )}

      <AnimatePresence>
        {isTechniqueMapOpen && detectedTechniques.length > 0 && (
          <motion.div
            id="technique-problem-map-drawer"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 28 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-x-3 bottom-[116px] z-40 max-h-[58vh] overflow-hidden rounded-xl border border-white/10 bg-[#070A10]/98 shadow-2xl shadow-black/60 backdrop-blur-md"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[#070A10]/95 px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#00E5BE]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Technique Map</span>
                  <span className="text-[#5F7186] normal-case tracking-normal">
                    {detectedTechniques.length} открити места
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#8EA1B8]">
                  Скролни картата и избери проблем, за да го покажеш или изсвириш.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsTechniqueMapOpen(false)}
                className="h-8 px-3 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-semibold text-[#DDE4EE] transition-colors cursor-pointer"
              >
                Затвори
              </button>
            </div>

            <div className="max-h-[calc(58vh-64px)] overflow-y-auto px-4 py-3">
              {selectedAnalysis?.practiceFlow && (
                <div className="mb-3 rounded-xl border border-[#00E5BE]/25 bg-[#00E5BE]/[0.06] p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#00E5BE]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>First Assignment</span>
                        <span className="text-[#8EA1B8] normal-case tracking-normal">
                          {selectedAnalysis.practiceFlow.method}
                        </span>
                      </div>
                      <h2 className="mt-1 text-sm font-bold text-white">
                        {selectedAnalysis.practiceFlow.firstAssignment}
                      </h2>
                      <p className="mt-1 text-xs text-[#D7DEE8]">
                        <strong className="text-white">Защо:</strong> {selectedAnalysis.practiceFlow.reason}
                      </p>
                      <p className="mt-1 text-xs text-[#9AAABC]">
                        <strong className="text-[#CBD5E1]">Ако стане:</strong> {selectedAnalysis.practiceFlow.nextStep}
                      </p>
                      <p className="mt-1 text-xs text-[#9AAABC]">
                        <strong className="text-[#FFB86B]">Ако не стане:</strong> {selectedAnalysis.practiceFlow.failureAction}
                      </p>
                      {selectedAnalysis.practiceFlow.recommendedMethods.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {selectedAnalysis.practiceFlow.recommendedMethods.map((method) => (
                            <span
                              key={method.id}
                              className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-[#DDE4EE]"
                              title={method.instruction}
                            >
                              {method.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => changeTempoPercent(selectedAnalysis.practiceFlow?.startTempoPercent || 50)}
                      className="shrink-0 rounded-full bg-[#00E5BE] px-3 py-2 text-xs font-black text-[#061014] hover:bg-[#00E5BE]/90 transition-colors cursor-pointer"
                    >
                      Темпо {selectedAnalysis.practiceFlow.startTempoPercent}%
                    </button>
                  </div>
                </div>
              )}

              <div className="h-2 rounded-full bg-white/10 overflow-hidden relative">
                {detectedTechniques.map((technique) => {
                  const left = Math.max(0, Math.min(100, (technique.startMs / noteSequenceDurationMs) * 100));
                  const width = Math.max(
                    1.5,
                    Math.min(18, ((technique.endMs - technique.startMs) / noteSequenceDurationMs) * 100)
                  );
                  const color =
                    technique.severity === 'high'
                      ? '#FF5E7E'
                      : technique.severity === 'medium'
                      ? '#F59E0B'
                      : '#00E5BE';

                  return (
                    <button
                      key={technique.id}
                      type="button"
                      onClick={() => seekTo(technique.startMs)}
                      className="absolute top-0 h-full rounded-full cursor-pointer hover:brightness-125 transition"
                      style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
                      title={`${technique.problemTitle || technique.label}: ${formatTime(technique.startMs)}`}
                      aria-label={`Покажи ${technique.problemTitle || technique.label}`}
                    />
                  );
                })}
              </div>

              {focusTechnique && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                            focusTechnique.severity === 'high'
                              ? 'bg-[#FF5E7E]/15 text-[#FF8EA3] border border-[#FF5E7E]/30'
                              : focusTechnique.severity === 'medium'
                              ? 'bg-[#F59E0B]/15 text-[#F8C064] border border-[#F59E0B]/30'
                              : 'bg-[#00E5BE]/12 text-[#6EF5DA] border border-[#00E5BE]/25'
                          }`}
                        >
                          {focusTechnique.severity || 'medium'}
                        </span>
                        <h2 className="text-sm font-bold text-white">
                          {focusTechnique.problemTitle || focusTechnique.label}
                        </h2>
                        <span className="text-xs text-[#8293A7]">
                          {formatTime(focusTechnique.startMs)}-{formatTime(focusTechnique.endMs)}
                          {focusTechnique.startMeasure ? ` · M${focusTechnique.startMeasure}${focusTechnique.endMeasure && focusTechnique.endMeasure !== focusTechnique.startMeasure ? `-${focusTechnique.endMeasure}` : ''}` : ''}
                          {' · '}
                          {Math.round(focusTechnique.confidence * 100)}%
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-[#D7DEE8] max-w-4xl">
                        <strong className="text-white">Открито:</strong> {focusTechnique.summary}
                      </p>
                      {focusTechnique.whyItMatters && (
                        <p className="mt-1 text-xs text-[#9AAABC] max-w-4xl">
                          <strong className="text-[#CBD5E1]">Защо е проблем:</strong> {focusTechnique.whyItMatters}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-[#D7DEE8] max-w-4xl">
                        <strong className="text-[#00E5BE]">Как да го упражняваш:</strong> {focusTechnique.practiceTip}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => seekTo(focusTechnique.startMs)}
                        className="px-3 py-2 rounded-full bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-xs font-semibold text-[#DDE4EE] transition-colors cursor-pointer"
                      >
                        Покажи
                      </button>
                      <button
                        type="button"
                        onClick={playTechniqueFocus}
                        className="px-3 py-2 rounded-full bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#061014] text-xs font-black transition-colors cursor-pointer"
                      >
                        Изсвири
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {detectedTechniques.map((technique, index) => {
                  const isActive = focusTechnique?.id === technique.id;
                  return (
                    <button
                      key={technique.id}
                      type="button"
                      onClick={() => seekTo(technique.startMs)}
                      className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                        isActive
                          ? 'border-[#00E5BE]/50 bg-[#00E5BE]/10'
                          : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.055]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-[#7D8FA6]">
                          #{index + 1} · {formatTime(technique.startMs)}
                        </span>
                        <span className="text-[10px] uppercase font-black text-[#8293A7]">
                          {technique.type}
                        </span>
                      </div>
                      <div className="mt-1 text-xs font-bold text-white">
                        {technique.problemTitle || technique.label}
                      </div>
                      <div className="mt-1 text-[11px] text-[#9AAABC]">
                        {technique.practiceTip}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Song Structure Map */}
      {songSections.length > 0 && (
        <div
          id="song-section-map"
          className="px-6 py-2 bg-[#05070B] border-t border-white/5 shrink-0"
        >
          <div className="hidden">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00E5BE] shadow-[0_0_12px_#00E5BE]" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#00E5BE]">
                  Smart Song Map
                </span>
              </div>
              <div className="h-5 w-px bg-[#223147]" />
              <span className="text-[11px] text-[#8EA4BC]">
                {completedSectionCount}/{songSections.length} части • клик върху блок за упражняване
              </span>
            </div>
            {activeSection && (
              <div className="flex items-center gap-2 rounded-full bg-[#0D1522] border border-[#253850] px-3 py-1 shadow-inner">
                <span className="text-[10px] uppercase font-black tracking-wider text-[#6EE7D8]">
                  Coach focus
                </span>
                <span className="text-xs text-white font-black">
                  {activeSection.name}
                </span>
                <span className="text-[10px] text-[#7F94AC] font-mono">
                  {Math.max(0, Math.min(100, sectionProgressPct))}%
                </span>
              </div>
            )}
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-white/10">
            {songSections.map((section, index) => {
              const width = Math.max(
                7,
                ((section.endMs - section.startMs) / Math.max(1, noteSequenceDurationMs)) * 100
              );
              const isActive = activeSection?.id === section.id;
              const isPast = playbackMs > section.endMs;
              const sectionColor = SECTION_GRADIENTS[index % SECTION_GRADIENTS.length];
              const activeProgress =
                isActive
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        ((playbackMs - section.startMs) /
                          Math.max(1, section.endMs - section.startMs)) *
                          100
                      )
                    )
                  : 0;

              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => seekTo(section.startMs)}
                  className={`relative h-full min-w-0 border-r border-[#05070B] transition-opacity cursor-pointer overflow-hidden group ${
                    isActive
                      ? 'opacity-100 z-10'
                      : isPast
                      ? 'opacity-70'
                      : 'opacity-45 hover:opacity-80'
                  }`}
                  style={{
                    flexBasis: `${width}%`,
                    background: isActive
                      ? sectionColor
                      : isPast
                      ? 'linear-gradient(135deg, rgba(0,229,190,0.22), rgba(46,213,115,0.10))'
                      : 'linear-gradient(135deg, rgba(18,27,42,0.96), rgba(11,17,28,0.98))',
                  }}
                  title={`${section.name}: тактове ${section.startMeasure}-${section.endMeasure}`}
                >
                  {!isActive && (
                    <span
                      className="absolute inset-x-0 bottom-0 h-1 opacity-70 group-hover:opacity-100 transition-opacity"
                      style={{ background: sectionColor }}
                    />
                  )}
                  {isActive && (
                    <span
                      className="absolute left-0 bottom-0 h-1.5 bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.7)]"
                      style={{ width: `${activeProgress}%` }}
                    />
                  )}
                  <span className="sr-only">
                    {section.name} M{section.startMeasure}-{section.endMeasure}
                  </span>
                  {section.confidence === 'marker' && (
                    <span className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-white/80" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Song Timeline & Scrub Bar */}
      <div
        id="song-timeline-scrub-bar"
        className="px-6 py-2 bg-[#05070B] border-t border-white/5 flex items-center space-x-3 shrink-0"
      >
        <span className="text-[11px] font-mono font-bold text-[#8FA5BF] w-9 text-right">
          {formatTime(playbackMs)}
        </span>

        <div
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickFraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            seekTo(clickFraction * noteSequenceDurationMs);
          }}
          className="flex-1 h-2 bg-[#121926] hover:h-2.5 rounded-full relative cursor-pointer group transition-all"
        >
          <div
            className="h-full bg-[#00E5BE] rounded-full relative"
            style={{
              width: `${Math.min(100, (playbackMs / noteSequenceDurationMs) * 100)}%`,
            }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_8px_#00E5BE] opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        <span className="text-[11px] font-mono font-bold text-[#56687D] w-9">
          {formatTime(noteSequenceDurationMs)}
        </span>
      </div>

      {/* Bottom Practice Toolbar & Controls */}
      <footer
        id="guitar-footer-controls"
        className="h-14 bg-[#05070B] border-t border-white/5 px-6 flex items-center justify-between shrink-0 z-20"
      >
        {/* Play / Pause / Restart */}
        <div className="flex items-center gap-2.5">
          <motion.button
            id="btn-play-pause-toggle"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
            onClick={togglePlayback}
            className="w-10 h-10 rounded-full bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#070B12] flex items-center justify-center font-black transition-colors cursor-pointer"
            title="Space: Play / Pause"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </motion.button>

          <motion.button
            id="btn-restart-song"
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              setIsPlaying(true);
              setPlaybackMs(0);
              setNotes(activeTabList.map((n) => ({ ...n })));
              setWaitForMeMode(false);
              setIsFrozenWaiting(false);
              setActiveTargetNote(null);
              setFeedback(null);
              setParticles([]);
              setActiveFlashes({});
              setMissFlash(false);
              setStreak(0);
              setMultiplier(1);
              setScore(0);
              setStars(0);
              setStats({ hits: 0, close: 0, misses: 0 });
            }}
            className="w-9 h-9 rounded-full bg-white/[0.03] hover:bg-white/[0.07] text-[#9FB0C4] hover:text-white flex items-center justify-center border border-white/10 transition-colors cursor-pointer"
            title="Рестартирай песента от началото"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </motion.button>

          {/* Wait-for-Me Practice Mode Toggle */}
          <motion.button
            id="btn-wait-for-me"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              const next = !waitForMeMode;
              setWaitForMeMode(next);
              if (!next) {
                setIsFrozenWaiting(false);
                setActiveTargetNote(null);
              }
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border hidden md:flex items-center gap-2 transition-colors cursor-pointer ${
              waitForMeMode
                ? 'bg-[#F59E0B] text-[#080C12] border-[#F59E0B]'
                : 'bg-white/[0.03] text-[#8EA1B8] border-white/10 hover:text-white'
            }`}
            title="Wait for me: автоматично спира на всяка нота, докато не я изсвирите правилно"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                waitForMeMode ? 'bg-[#080C12] animate-ping' : 'bg-[#586A7E]'
              }`}
            />
            <span>Wait For Me {waitForMeMode ? 'ON' : 'OFF'}</span>
          </motion.button>

          {/* Auto-Demo Toggle */}
          <motion.button
            id="btn-auto-demo"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              const next = !isAutoDemo;
              setIsAutoDemo(next);
              if (next) {
                setIsFrozenWaiting(false);
                if (!isPlaying) setIsPlaying(true);
              }
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border hidden md:flex items-center gap-1.5 transition-colors cursor-pointer ${
              isAutoDemo
                ? 'bg-[#8B5CF6] text-white border-[#8B5CF6]'
                : 'bg-white/[0.03] text-[#8EA1B8] border-white/10 hover:text-white'
            }`}
            title="Демо режим: симулаторът автоматично показва правилното свирене"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Демо {isAutoDemo ? 'ВКЛ' : 'ИЗКЛ'}</span>
          </motion.button>

          {/* Anti-Feedback Speaker Sound Toggle */}
          <motion.button
            id="btn-speaker-sound-toggle"
            whileTap={{ scale: 0.95 }}
            onClick={() => setSynthSoundWithMic(!synthSoundWithMic)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border hidden lg:flex items-center gap-1.5 transition-colors cursor-pointer ${
              synthSoundWithMic
                ? 'bg-white/[0.03] text-[#00E5BE] border-[#00E5BE]/30'
                : 'bg-white/[0.03] text-[#8EA1B8] border-white/10 hover:text-white'
            }`}
            title={
              synthSoundWithMic
                ? 'Колонки: ВКЛЮЧЕНИ'
                : 'Колонки: ИЗКЛЮЧЕНИ (предпазва от ехо в микрофона)'
            }
          >
            {synthSoundWithMic ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-[#00E5BE]" />
                <span className="hidden xl:inline text-[11px]">Звук: Вкл</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span className="hidden xl:inline text-[11px] text-[#F59E0B]">Без ехо</span>
              </>
            )}
          </motion.button>
        </div>

        {/* Dynamic Continuous Tempo Controller (0% - 200% in 1% increments) & AI Coach Controls */}
        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 p-1.5 rounded-full relative">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#63768D] font-mono font-medium pl-1 hidden sm:inline">Скорост:</span>
            
            {/* Step Down 1% */}
            <button
              onClick={() => changeTempoPercent(currentTempoPercent - 1)}
              className="w-6 h-6 rounded-full bg-transparent hover:bg-white/[0.06] text-[#93A6BD] hover:text-white flex items-center justify-center transition-colors cursor-pointer text-xs"
              title="Намали темпото с 1%"
              aria-label="Намали темпото с 1%"
            >
              <Minus className="w-3 h-3" />
            </button>

            {/* Fine-grained slider control for tempoPercent (0% to 200% in 1% increments) */}
            <div className="flex items-center gap-2 px-1">
              <input
                id="tempo-percent-slider"
                type="range"
                min="0"
                max="200"
                step="1"
                value={currentTempoPercent}
                onChange={(e) => changeTempoPercent(parseInt(e.target.value, 10))}
                className="w-24 sm:w-32 md:w-36 lg:w-44 h-1.5 bg-[#1B293E] rounded-lg appearance-none cursor-pointer accent-[#00E5BE] hover:accent-[#00FAD0] transition-all"
                title={`Скорост: ${currentTempoPercent}% (0% - 200%, стъпка 1%)`}
                aria-label="Фино регулиране на темпото от 0% до 200%"
              />
            </div>

            {/* Step Up 1% */}
            <button
              onClick={() => changeTempoPercent(currentTempoPercent + 1)}
              className="w-6 h-6 rounded-full bg-transparent hover:bg-white/[0.06] text-[#93A6BD] hover:text-white flex items-center justify-center transition-colors cursor-pointer text-xs"
              title="Увеличи темпото с 1%"
              aria-label="Увеличи темпото с 1%"
            >
              <Plus className="w-3 h-3" />
            </button>

            {/* Clickable Current Tempo & BPM Badge */}
            <button
              onClick={() => setIsCustomTempoOpen(!isCustomTempoOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold transition-all cursor-pointer ${
                isCustomTempoOpen
                  ? 'bg-[#00E5BE] text-[#070A10]'
                  : 'bg-transparent hover:bg-white/[0.06] text-[#00E5BE] border border-white/10'
              }`}
              title="Отвори меню за бързи пресети и прецизен контрол"
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>{currentTempoPercent}%</span>
              {activeSong.tempo && (
                <span className="text-[10px] opacity-75 font-normal hidden lg:inline">
                  ({Math.round((activeSong.tempo || 120) * (currentTempoPercent / 100))} BPM)
                </span>
              )}
            </button>
          </div>

          {/* Quick Preset Buttons */}
          <div className="hidden 2xl:flex items-center gap-1 pl-1 border-l border-white/10">
            {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => {
              const targetPct = Math.round(rate * 100);
              const isActive = currentTempoPercent === targetPct;
              return (
                <button
                  key={rate}
                  onClick={() => changeTempoPercent(targetPct)}
                  className={`text-[11px] px-2 py-0.5 rounded-md font-mono font-semibold transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#00E5BE] text-[#070A10] shadow-sm'
                      : 'text-[#6D839E] hover:text-white hover:bg-[#152132]'
                  }`}
                >
                  {targetPct}%
                </button>
              );
            })}
          </div>

          {/* Precision Slider Popover */}
          <AnimatePresence>
            {isCustomTempoOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-14 left-0 z-50 bg-[#0C1322] border border-[#1E2E46] p-4 rounded-2xl shadow-2xl w-80 text-white space-y-3.5 backdrop-blur-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <Sliders className="w-3.5 h-3.5 text-[#00E5BE]" />
                    <span>Прецизен контрол (0% - 200%, стъпка 1%)</span>
                  </div>
                  <button
                    onClick={() => setIsCustomTempoOpen(false)}
                    className="text-[#647890] hover:text-white text-xs cursor-pointer p-0.5"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs font-mono bg-[#070B12] p-2 rounded-xl border border-[#182335]">
                  <span className="text-[#71859D]">Скорост:</span>
                  <span className="text-[#00E5BE] font-bold text-base">
                    {currentTempoPercent}%
                  </span>
                  <span className="text-[#71859D]">
                    {Math.round((activeSong.tempo || 120) * (currentTempoPercent / 100))} BPM
                  </span>
                </div>

                {/* Fine-grained Range Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-[#61748D]">
                    <span>0% (Пауза/Анализ)</span>
                    <span>100% (Нормално)</span>
                    <span>200% (Двойно)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="1"
                    value={currentTempoPercent}
                    onChange={(e) => changeTempoPercent(parseInt(e.target.value, 10))}
                    className="w-full h-2 bg-[#1B293E] rounded-lg appearance-none cursor-pointer accent-[#00E5BE]"
                  />
                </div>

                {/* Quick Presets Grid */}
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {[0, 25, 50, 75, 100, 125, 150, 200].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => changeTempoPercent(pct)}
                      className={`text-[10px] py-1 rounded-md font-mono transition-colors cursor-pointer border ${
                        currentTempoPercent === pct
                          ? 'bg-[#00E5BE] text-[#070A10] font-bold border-[#00E5BE]'
                          : 'bg-[#121A28] text-[#869AB1] hover:text-white border-[#1F2C41]'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* AI Coach Adaptive Tempo Trigger & Actions */}
        <div className="flex items-center gap-1.5">
          {/* Adaptive Auto-Coach Toggle Button */}
          <button
            onClick={() => toggleAutoAdapt(!isAdaptiveCoachOn)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
              isAdaptiveCoachOn
                ? 'bg-[#00E5BE]/15 text-[#00E5BE] border-[#00E5BE]/40 shadow-sm shadow-[#00E5BE]/10'
                : 'bg-[#101724] text-[#697D96] border-[#1C283B] hover:text-[#91A5BD]'
            }`}
            title="Автоматично адаптиране на темпото след всяко изсвирване"
          >
            <Bot className={`w-3.5 h-3.5 ${isAdaptiveCoachOn ? 'text-[#00E5BE] animate-pulse' : ''}`} />
            <span className="hidden sm:inline">
              {isAdaptiveCoachOn ? 'AI Адаптивно' : 'Ръчно'}
            </span>
          </button>

          {/* Manual Coach Evaluation Button */}
          <button
            onClick={handleManualCoachEvaluation}
            disabled={isEvaluatingCoach}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#101724] hover:bg-[#162132] text-white border border-[#1E2B3E] hover:border-[#00E5BE]/40 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Оцени текущото свирене и получи препоръчано темпо"
          >
            <Zap className={`w-3.5 h-3.5 text-[#F59E0B] ${isEvaluatingCoach ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">Оцени дубъл</span>
          </button>

          {/* Open AI Coach Chat Drawer */}
          <button
            onClick={() => {
              if (onOpenCoachChat) {
                onOpenCoachChat();
              } else {
                setShowCoachChatDrawer(!showCoachChatDrawer);
              }
            }}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#101724] hover:bg-[#162132] text-white border border-[#1E2B3E] hover:border-[#00E5BE]/40 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Отвори чат с AI треньора"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#00E5BE]" />
            <span className="hidden md:inline">AI Чат</span>
          </button>
        </div>

        {/* Fullscreen & Keyboard Hints */}
        <div className="flex items-center gap-3">
          <motion.button
            id="btn-fullscreen-toggle"
            whileTap={{ scale: 0.95 }}
            onClick={toggleFullscreen}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border bg-[#101724] text-white border-[#1E2B3E] hover:border-[#00E5BE]/40 hover:bg-[#162132] flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Преглед на цял екран"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-[#00E5BE]" />
                <span>Изход</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-[#00E5BE]" />
                <span>Цял екран</span>
              </>
            )}
          </motion.button>

          <span className="text-xs text-[#526377] hidden lg:inline font-mono">
            Клавиши <kbd className="px-1.5 py-0.5 bg-[#101724] border border-[#1E2B3E] rounded text-[#CBD5E1]">1-6</kbd>
          </span>
        </div>
      </footer>

      {/* Audio Calibration & Guitar Settings Modal with Framer Motion AnimatePresence */}
      <AnimatePresence>
        {showAudioSettings && (
          <div
            id="audio-settings-modal-backdrop"
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowAudioSettings(false)}
          >
            <motion.div
              id="audio-settings-modal"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.16 }}
              className="bg-[#0B101A] border border-[#1E2B3E] rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#182335] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#00E5BE]/10 flex items-center justify-center text-[#00E5BE] border border-[#00E5BE]/30">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Аудио калибрация за китара</h3>
                    <p className="text-xs text-[#63768D]">Настройка на латентността и чувствителността</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAudioSettings(false)}
                  className="w-7 h-7 rounded-lg bg-[#111824] hover:bg-[#182335] text-[#71849A] hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Latency Compensation Slider */}
              <div className="space-y-2 bg-[#070A10] border border-[#162132] p-3 rounded-xl">
                <div className="flex justify-between items-baseline">
                  <label className="text-xs font-semibold text-white">
                    Компенсация на латентността (Audio Latency):
                  </label>
                  <span className="font-mono text-xs font-bold text-[#00E5BE] tabular-nums">
                    {latencyOffsetMs} ms
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="160"
                  step="5"
                  value={latencyOffsetMs}
                  onChange={(e) => setLatencyOffsetMs(parseInt(e.target.value, 10))}
                  className="w-full accent-[#00E5BE] cursor-pointer"
                />
                <p className="text-[11px] text-[#63768D]">
                  Компенсира забавянето на звуковата карта (обикновено 50–90 ms), за да се засича тонът точно на лазера.
                </p>
              </div>

              {/* Mic Sensitivity Slider */}
              <div className="space-y-2 bg-[#070A10] border border-[#162132] p-3 rounded-xl">
                <div className="flex justify-between items-baseline">
                  <label className="text-xs font-semibold text-white">
                    Чувствителност на микрофона:
                  </label>
                  <span className="font-mono text-xs font-bold text-[#00E5BE] tabular-nums">
                    Ниво {micSensitivity} / 10
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={micSensitivity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setMicSensitivity(val);
                    const threshold = 0.015 - ((val - 1) / 9) * 0.013;
                    micDetector.setNoiseThreshold(threshold);
                  }}
                  className="w-full accent-[#00E5BE] cursor-pointer"
                />
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[10px] text-[#556980]">Входно ниво:</span>
                  <div className="flex-1 h-1.5 bg-[#121926] rounded-full overflow-hidden border border-[#1E2B3E]">
                    <div
                      className="h-full bg-gradient-to-r from-[#00E5BE] to-[#10B981] transition-all duration-75"
                      style={{ width: `${Math.min(100, (micRms / 0.035) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Hit Window Tolerance */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white">Времеви толеранс за уцелване:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'tight', label: 'Професионален', desc: '±160 ms' },
                    { id: 'normal', label: 'Балансиран', desc: '±240 ms' },
                    { id: 'relaxed', label: 'Прощаващ', desc: '±320 ms' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setHitTolerance(item.id as 'tight' | 'normal' | 'relaxed')}
                      className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                        hitTolerance === item.id
                          ? 'bg-[#00E5BE]/10 border-[#00E5BE] text-white shadow-sm'
                          : 'bg-[#0E1522] border-[#1C283A] text-[#7E93AC] hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className="text-[10px] font-mono opacity-70 mt-0.5">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Realtime Live Test Meter */}
              <div className="bg-[#070A10] border border-[#162132] rounded-xl p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isListeningMic ? 'bg-[#00E5BE] animate-ping' : 'bg-[#EF4444]'}`} />
                  <span className="text-[#8EA2B9]">
                    {isListeningMic ? 'Тест на живо:' : 'Микрофонът е изключен'}
                  </span>
                </div>
                <div className="font-mono font-bold text-white tabular-nums">
                  {isListeningMic && pitchData.frequency > 0 ? (
                    <span className="text-[#00E5BE]">
                      {pitchData.pitch} ({pitchData.frequency.toFixed(1)} Hz, {pitchData.cents > 0 ? `+${pitchData.cents}c` : `${pitchData.cents}c`})
                    </span>
                  ) : (
                    <span className="text-[#556980]">
                      {isListeningMic ? 'Дръпнете струна...' : 'Включете микрофона от сцената'}
                    </span>
                  )}
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowAudioSettings(false)}
                className="w-full py-2 bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#070B12] font-extrabold rounded-xl text-xs transition-colors cursor-pointer shadow-sm shadow-[#00E5BE]/25"
              >
                Запази и затвори
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating AI Coach Adaptive Notification Toast */}
      <AnimatePresence>
        {coachToast && (
          <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.95 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0A101C]/95 border border-[#00E5BE]/60 text-white rounded-2xl px-5 py-3 shadow-2xl backdrop-blur-xl flex items-center gap-3 max-w-md w-[92%] sm:w-auto"
          >
            <div className="w-8 h-8 rounded-xl bg-[#00E5BE] text-[#070B12] flex items-center justify-center shrink-0 shadow-md shadow-[#00E5BE]/30">
              <Bot className="w-4 h-4 stroke-[2.4]" />
            </div>
            <div className="flex-1 min-w-0 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[#00E5BE] truncate">{coachToast.message}</span>
                <span className="font-mono text-[11px] font-bold text-white bg-[#142033] px-2 py-0.5 rounded border border-[#213452]">
                  {coachToast.tempo}%
                </span>
              </div>
              <p className="text-[#9DB0C6] text-[11px] truncate mt-0.5">{coachToast.sub}</p>
            </div>
            <button
              onClick={() => {
                setShowDebriefModal(true);
                setCoachToast(null);
              }}
              className="px-2.5 py-1 rounded-lg bg-[#00E5BE]/15 hover:bg-[#00E5BE]/25 text-[#00E5BE] font-bold text-[11px] border border-[#00E5BE]/40 shrink-0 cursor-pointer transition-colors"
            >
              Анализ
            </button>
            <button
              onClick={() => setCoachToast(null)}
              className="text-[#647890] hover:text-white text-xs cursor-pointer p-1"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Coach Post-Run Adaptive Tempo Debrief Modal */}
      <AdaptiveTempoDebrief
        isOpen={showDebriefModal}
        evaluation={coachEvaluation}
        accuracy={
          lastEvaluatedAccuracy !== null
            ? lastEvaluatedAccuracy
            : stats.hits + stats.close + stats.misses > 0
            ? Math.round(((stats.hits + stats.close * 0.6) / (stats.hits + stats.close + stats.misses)) * 100)
            : 0
        }
        stats={{
          hits: stats.hits,
          close: stats.close,
          misses: stats.misses,
          streak,
        }}
        songTitle={activeSong.title}
        onApplyTempo={(newTempo) => {
          changeTempoPercent(newTempo);
          setShowDebriefModal(false);
        }}
        onKeepCurrentTempo={() => setShowDebriefModal(false)}
        onOpenCoachChat={() => {
          setShowDebriefModal(false);
          if (onOpenCoachChat) {
            onOpenCoachChat();
          } else {
            setShowCoachChatDrawer(true);
          }
        }}
        autoAdaptEnabled={isAdaptiveCoachOn}
        onToggleAutoAdapt={toggleAutoAdapt}
      />

      {/* Slide-out AI Coach Chat Drawer on Stage */}
      <AnimatePresence>
        {showCoachChatDrawer && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[420px] z-50 shadow-2xl"
          >
            <AICoachChat
              currentSong={activeSong}
              currentTempoPercent={currentTempoPercent}
              lastAccuracy={lastEvaluatedAccuracy}
              lastStats={{ ...stats, streak }}
              onApplyRecommendedTempo={(newTempo) => {
                changeTempoPercent(newTempo);
                setCoachToast({
                  message: 'Темпото е приложено от чата!',
                  sub: `Ново темпо: ${newTempo}%`,
                  tempo: newTempo,
                  change: newTempo - currentTempoPercent,
                });
                setTimeout(() => setCoachToast(null), 4000);
              }}
              isCompact={true}
              onCloseCompact={() => setShowCoachChatDrawer(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

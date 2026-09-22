import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { TabNote, SongMetadata, FeedbackData, SongSection } from '../types';
import { GuitarTuner } from './GuitarTuner';
import { guitarSynth } from '../utils/guitarSynth';
import { micDetector } from '../utils/pitchDetector';
import { SONG_CATALOG, SONG_TABS } from '../data/songTabs';

interface PlayingStageProps {
  selectedSong?: SongMetadata | null;
  selectedNotes?: TabNote[] | null;
  selectedSections?: SongSection[] | null;
  onOpenLibrary: () => void;
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
  onOpenLibrary,
}) => {
  const activeSong = selectedSong || SONG_CATALOG[0];
  const currentSongDurationMs = activeSong.durationMs || TOTAL_SONG_DURATION_MS;
  const songSections = selectedSections && selectedSections.length > 0 ? selectedSections : [];
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
  const [tempoFactor, setTempoFactor] = useState(1.0);
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

  // Live Tuner state
  const [pitchData, setPitchData] = useState({
    pitch: '---',
    frequency: 0,
    cents: 0,
    inTune: false,
  });
  const lastPluckTimeRef = useRef(0);

  // Current active note near hit zone
  const [activeTargetNote, setActiveTargetNote] = useState<TabNote | null>(null);

  // Floating feedback popups
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);

  const [activeFlashes, setActiveFlashes] = useState<Record<number, boolean>>({});
  const [missFlash, setMissFlash] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; text: string; color: string }>>([]);

  const hitZoneFraction = 0.22;
  const visibleWindowMs = 5500;

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

      if (!isPlaying && playbackMs <= 50 && !isAutoDemo) {
        setIsPlaying(true);
      }

      const now = performance.now();
      if (now - lastPluckTimeRef.current <= 90) return;

      const effectiveTime = playbackMs - latencyOffsetMs;
      const windowMs = getToleranceWindowMs(hitTolerance);
      const candidateNotes =
        isFrozenWaiting && activeTargetNote
          ? [activeTargetNote]
          : notes.filter(
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
  }, [
    isListeningMic,
    isFrozenWaiting,
    activeTargetNote,
    playbackMs,
    notes,
    latencyOffsetMs,
    hitTolerance,
    isPlaying,
    isAutoDemo,
  ]);

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
            // Keep playback running so the note highway auto-scrolls from the beginning.
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

  const seekTo = (nextPlaybackMs: number) => {
    setIsPlaying(false);
    setIsFrozenWaiting(false);
    setActiveTargetNote(null);
    setPlaybackMs(Math.max(0, Math.min(noteSequenceDurationMs, nextPlaybackMs)));
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

  return (
    <div
      id="playing-stage-container"
      className="flex flex-col h-full bg-[radial-gradient(circle_at_20%_0%,rgba(0,229,190,0.12),transparent_30%),#0B0F17] text-[#E2E8F0] select-none overflow-hidden font-sans"
    >
      {/* Top HUD Bar */}
      <header
        id="playing-stage-header"
        className="h-[82px] bg-[#070B12]/92 backdrop-blur-xl border-b border-[#1C2B3E] px-5 flex items-center justify-between z-20 shrink-0 shadow-[0_18px_45px_rgba(0,0,0,0.35)]"
      >
        {/* Left: Song details & Rating Stars */}
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00E5BE] via-[#0F766E] to-[#0F172A] border border-[#61FFE6]/40 flex items-center justify-center text-white shadow-[0_0_24px_rgba(0,229,190,0.22)] shrink-0">
            <Music className="w-5 h-5 drop-shadow-[0_0_6px_rgba(0,229,190,0.5)]" />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-extrabold text-white tracking-tight">{activeSong.title}</span>
              <span className="text-[10px] text-[#00E5BE] font-bold bg-[#00E5BE]/10 px-2 py-0.5 rounded-md border border-[#00E5BE]/30">
                {activeSong.tuning}
              </span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-[#7E91A7] mt-0.5">
              <span>{activeSong.artist}</span>
              <span>•</span>
              {/* 3 Gold Stars Rating Meter */}
              <div className="flex items-center space-x-1">
                {[1, 2, 3].map((starIdx) => (
                  <Star
                    key={starIdx}
                    className={`w-3.5 h-3.5 transition-all duration-300 ${
                      starIdx <= stars
                        ? 'text-[#FFD32A] fill-[#FFD32A] drop-shadow-[0_0_6px_rgba(255,211,42,0.8)]'
                        : 'text-[#2D394C] fill-[#18202E]'
                    }`}
                  />
                ))}
                <span className="text-xs font-black text-white font-mono ml-1">
                  {score.toLocaleString()} PTS
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Tuner Widget & Streak Flame Multiplier */}
        <div className="flex items-center space-x-3.5">
          <GuitarTuner
            currentPitch={pitchData.pitch}
            frequencyHz={pitchData.frequency}
            centsOffset={pitchData.cents}
            inTune={pitchData.inTune}
            isListening={isListeningMic}
            volumeRms={micRms}
            onToggleMic={handleToggleMic}
          />

          {/* Combo Multiplier Flame Pill */}
          <div
            id="streak-multiplier-badge"
            className="flex items-center space-x-2.5 bg-gradient-to-r from-[#171622] via-[#241B2F] to-[#2A1820] border border-[#FF7F50]/60 rounded-2xl px-3.5 py-2 shadow-[0_0_28px_rgba(255,107,53,0.16)]"
          >
            <div className="w-7 h-7 rounded-xl bg-[#FF6B35]/20 flex items-center justify-center border border-[#FF6B35]/40 shadow-[0_0_8px_rgba(255,107,53,0.3)]">
              <Flame className="w-4 h-4 text-[#FF6B35] animate-pulse fill-[#FF6B35]" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[9px] uppercase font-black text-[#FFA07A] tracking-wider">
                {streak}x COMBO
              </span>
              <span className="text-sm font-black text-white font-mono tracking-tight mt-0.5">
                {multiplier}X MULTIPLIER
              </span>
            </div>
          </div>
        </div>

        {/* Right: Accuracy card & Song Library toggle */}
        <div className="flex items-center space-x-3">
          <div className="bg-[#0D131D]/90 border border-[#243650] rounded-2xl px-3.5 py-1.5 text-right shadow-inner">
            <div className="text-[11px] font-black tracking-wider text-[#00E5BE] font-mono">
              ACCURACY {accuracyPct}%
            </div>
            <div className="text-[10px] text-[#7A8EAA] font-mono mt-0.5">
              Hits <span className="text-white font-bold">{stats.hits}</span> • Close{' '}
              <span className="text-[#FFD32A] font-bold">{stats.close}</span> • Miss{' '}
              <span className="text-[#EF4444] font-bold">{stats.misses}</span>
            </div>
          </div>

          <button
            id="btn-open-audio-settings"
            onClick={() => setShowAudioSettings(true)}
            className="bg-[#121A26] hover:bg-[#1C2738] text-white border border-[#2B3C52] hover:border-[#00E5BE]/50 px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center space-x-2 transition shadow-md cursor-pointer active:scale-95"
            title="Калибрация на латентността и чувствителността на китарата"
          >
            <Sliders className="w-3.5 h-3.5 text-[#00E5BE]" />
            <span>Калибрация</span>
          </button>

          <button
            id="btn-open-songs-library"
            onClick={onOpenLibrary}
            className="bg-[#121A26] hover:bg-[#1C2738] text-white border border-[#2B3C52] hover:border-[#00E5BE]/50 px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center space-x-2 transition shadow-md cursor-pointer active:scale-95"
          >
            <Music className="w-3.5 h-3.5 text-[#00E5BE]" />
            <span>Песни</span>
          </button>
        </div>
      </header>

      {/* Mic Status Banner */}
      {!isListeningMic ? (
        <div
          id="mic-enable-banner"
          onClick={handleToggleMic}
          className="bg-gradient-to-r from-[#141B26] via-[#1A2434] to-[#141B26] border-b border-[#25364D] px-5 py-2 flex items-center justify-between text-xs text-[#8FA5BF] cursor-pointer hover:bg-[#1C2738] transition shrink-0"
        >
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5E7E] animate-pulse shadow-[0_0_8px_#FF5E7E]" />
            <span>
              <strong className="text-white">Микрофонът е изключен:</strong> Кликнете тук или на бутона{' '}
              <strong className="text-[#00E5BE]">"MIC: OFF"</strong>, за да включите микрофона и да свирите с вашата китара в реално време!
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleMic();
            }}
            className="px-3.5 py-1 bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#070B12] font-black rounded-lg text-xs shadow-md shadow-[#00E5BE]/20 transition active:scale-95 cursor-pointer"
          >
            Включи микрофона
          </button>
        </div>
      ) : (
        <div
          id="mic-live-banner"
          className="bg-[#0A1320] border-b border-[#00E5BE]/30 px-5 py-1.5 flex items-center justify-between text-xs shrink-0"
        >
          <div className="flex items-center space-x-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00E5BE] animate-ping shadow-[0_0_6px_#00E5BE]" />
            <span className="text-white font-bold">
              Микрофонът слуша на живо (суров инструментален сигнал):
            </span>
            <span className="font-mono font-bold bg-[#070B12] border border-[#00E5BE]/40 px-2.5 py-0.5 rounded-md text-[#00E5BE] shadow-sm">
              {pitchData.frequency > 0 ? `${pitchData.pitch} (${pitchData.frequency.toFixed(1)} Hz)` : 'Чака тон от китарата...'}
            </span>
            {activeTargetNote && (
              <span className="text-[#7D93AA] hidden md:inline">
                • Очакван тон: <strong className="text-white bg-[#111A28] px-2 py-0.5 rounded border border-[#213146] font-mono">{getExpectedNoteName(activeTargetNote.string, activeTargetNote.fret)}</strong> (струна {activeTargetNote.string}, прагче {activeTargetNote.fret})
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowAudioSettings(true)}
              className="text-xs text-[#00E5BE] hover:underline font-bold flex items-center space-x-1.5 bg-[#00E5BE]/10 hover:bg-[#00E5BE]/20 px-2.5 py-1 rounded-lg border border-[#00E5BE]/30 cursor-pointer transition"
            >
              <Sliders className="w-3 h-3" />
              <span>Калибрация ({latencyOffsetMs}ms)</span>
            </button>
            <button
              onClick={handleToggleMic}
              className="text-[11px] text-[#7A98B2] hover:text-white underline font-medium cursor-pointer"
            >
              Спри микрофона
            </button>
          </div>
        </div>
      )}

      {/* Main Track Stage (Scrolling Tabs with Laser Target & Bouncing Ball) */}
      <main className="flex-1 relative flex flex-col px-4 pt-3 pb-2 overflow-hidden">
        {/* The Track Container */}
        <div
          id="guitar-scrolling-stage"
          className="relative w-full h-full bg-[#0B0F17] border-2 border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden flex flex-col justify-between"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(11, 15, 23, 0.98), rgba(15, 22, 34, 0.92)), repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 100px, transparent 100px, transparent 200px)',
          }}
        >
          {/* Subtle Fret Markers (Pearloid Inlays on 3rd, 5th, 7th, 9th, 12th frets) */}
          <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-around opacity-30">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-slate-300 shadow-[0_0_8px_white]" />
              <span className="text-[9px] text-slate-500 font-mono mt-1 font-bold">III</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-slate-300 shadow-[0_0_8px_white]" />
              <span className="text-[9px] text-slate-500 font-mono mt-1 font-bold">V</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-slate-300 shadow-[0_0_8px_white]" />
              <span className="text-[9px] text-slate-500 font-mono mt-1 font-bold">VII</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-slate-300 shadow-[0_0_8px_white]" />
              <span className="text-[9px] text-slate-500 font-mono mt-1 font-bold">IX</span>
            </div>
            <div className="flex flex-col items-center space-y-1">
              <div className="flex space-x-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300 shadow-[0_0_8px_white]" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300 shadow-[0_0_8px_white]" />
              </div>
              <span className="text-[9px] text-slate-500 font-mono font-bold">XII</span>
            </div>
          </div>

          {/* Laser Target Zone Line */}
          <div
            id="guitar-laser-hit-zone"
            className="absolute top-0 bottom-0 z-20 pointer-events-none"
            style={{ left: `${hitZoneFraction * 100}%` }}
          >
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
            {feedback && Date.now() - feedback.timestamp < 1000 && (
              <div
                className={`absolute -left-10 -top-8 px-2.5 py-0.5 rounded-lg font-mono text-[11px] font-black tracking-wider uppercase shadow-xl z-30 pointer-events-none transition-all transform animate-in fade-in zoom-in-95 duration-100 ${
                  feedback.matchType === 'MISS'
                    ? 'bg-[#DC2626] text-white border border-[#FFA3A3] shadow-[0_0_18px_#EF4444]'
                    : feedback.matchType === 'HIT'
                    ? 'bg-[#10B981] text-white border border-[#A7F3D0] shadow-[0_0_18px_#10B981]'
                    : 'bg-[#F59E0B] text-black border border-[#FDE68A] shadow-[0_0_18px_#F59E0B]'
                }`}
              >
                {feedback.headline} {feedback.matchType === 'MISS' ? '✕' : '✓'}
              </div>
            )}
          </div>

          {/* Ready-to-Play start prompt overlay when song is at 0:00 and paused */}
          {!isPlaying && playbackMs === 0 && (
            <div
              id="ready-to-play-overlay"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-[#090D18]/95 border border-[#202E44] hover:border-[#00E5BE]/50 rounded-3xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.85)] flex flex-col items-center text-center backdrop-blur-xl max-w-md w-full transition-all"
            >
              <div
                className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#00A389] to-[#00E5BE] text-[#070B12] flex items-center justify-center shadow-lg shadow-[#00E5BE]/30 mb-3 cursor-pointer hover:scale-105 active:scale-95 transition"
                onClick={() => setIsPlaying(true)}
              >
                <Play className="w-8 h-8 fill-current ml-1" />
              </div>
              <h3 className="text-lg font-black text-white tracking-tight">
                {activeSong.title}
              </h3>
              <p className="text-xs text-[#8BA0B8] mt-1">
                {activeSong.artist} • {activeSong.tuning} • {activeSong.difficulty}
              </p>
              <div className="mt-4 flex items-center space-x-3 w-full justify-center">
                <button
                  onClick={() => setIsPlaying(true)}
                  className="px-6 py-2.5 rounded-xl bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#070B12] font-extrabold text-sm shadow-lg shadow-[#00E5BE]/30 flex items-center space-x-2 transition cursor-pointer active:scale-95"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Старт на песента</span>
                </button>
                <button
                  onClick={() => {
                    setIsAutoDemo(true);
                    setIsPlaying(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#131B29] hover:bg-[#1A2638] text-[#9FB3C9] hover:text-white border border-[#24344A] text-xs font-bold flex items-center space-x-2 transition cursor-pointer"
                  title="Компютърът ще изсвири песента за демонстрация"
                >
                  <Headphones className="w-4 h-4 text-[#00E5BE]" />
                  <span>Демо</span>
                </button>
              </div>
              <span className="text-[11px] text-[#556980] font-mono mt-3">
                Или натиснете клавиш <kbd className="px-1.5 py-0.5 bg-[#121926] border border-[#253549] rounded text-[#8FA5BF] font-mono">Space</kbd>
              </span>
            </div>
          )}

          {/* Wait-for-Me Live Instruction Card when frozen waiting for player */}
          {isFrozenWaiting && activeTargetNote && (
            <div
              id="wait-for-me-instruction-card"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-[#090D18]/95 border-2 border-[#00E5BE] rounded-3xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_40px_rgba(0,229,190,0.25)] flex items-center space-x-6 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 pointer-events-auto max-w-xl w-full"
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
            </div>
          )}

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
                className={`relative flex-1 flex items-center transition-colors cursor-pointer ${
                  index % 2 === 0 ? 'bg-[#0E131C]/90' : 'bg-[#121926]/90'
                } ${isFlashed ? 'bg-[#00E5BE]/20' : 'hover:bg-[#182233]'}`}
              >
                {/* String Label Tuning Peg Badge */}
                <div
                  id={`string-pill-${stringNum}`}
                  className="z-30 ml-4 w-8 h-8 rounded-full bg-gradient-to-b from-[#1E2738] to-[#0D121B] border-2 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
                  style={{
                    borderColor: color,
                    boxShadow: isFlashed ? `0 0 16px ${color}` : `0 2px 8px rgba(0,0,0,0.5)`,
                  }}
                  title={`String ${stringNum}: ${name} (Click or press key ${stringNum})`}
                >
                  <span className="text-xs font-black text-white leading-none font-mono">{name}</span>
                </div>

                {/* Authentic Metallic String Wire */}
                <div
                  className="absolute left-16 right-4 rounded-full transition-all duration-100"
                  style={{
                    height: `${gauge}px`,
                    background: STRING_GRADIENTS[index],
                    boxShadow: isFlashed ? `0 0 16px ${color}, 0 0 8px white` : '0 1px 2px rgba(0,0,0,0.8)',
                  }}
                />

                {/* Hit Zone Target Diamond Indicator */}
                <div
                  className="absolute z-20 w-3.5 h-3.5 rotate-45 bg-[#090D14] border-2 -translate-x-1.5 pointer-events-none shadow-md"
                  style={{
                    left: `${hitZoneFraction * 100}%`,
                    borderColor: color,
                  }}
                />
              </div>
            );
          })}

          {/* Animated Scrolling Notes with Sustain Trails */}
          <div id="scrolling-notes-container" className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
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
                      className="absolute left-4 rounded-r-xl pointer-events-none transition-all"
                      style={{
                        width: `${sustainWidthPx}px`,
                        height: '58%',
                        backgroundColor: isHit ? '#2ED57340' : isMiss ? '#EF444445' : `${color}35`,
                        border: isHit ? '1.5px solid #2ED57399' : isMiss ? '1.5px solid #EF4444CC' : `1.5px solid ${color}88`,
                        borderLeft: 'none',
                        boxShadow: isHit ? '0 0 12px #2ED57333' : isMiss ? '0 0 14px #EF444455' : `0 0 10px ${color}25`,
                      }}
                    />
                  )}

                  {/* Note Head Capsule */}
                  <div
                    id={`note-head-${note.id}`}
                    className={`relative w-10 h-full rounded-2xl flex items-center justify-center shadow-2xl z-10 transition-all ${
                      isWaitingThisNote
                        ? 'ring-4 ring-[#00E5BE] scale-115 shadow-[0_0_24px_#00E5BE]'
                        : isMiss
                        ? 'scale-105 shadow-[0_0_24px_#EF4444]'
                        : ''
                    }`}
                    style={{
                      backgroundColor: isHit
                        ? '#10B981'
                        : isMiss
                        ? '#DC2626'
                        : isOpenString
                        ? '#0E1420'
                        : color,
                      border: isHit
                        ? '2px solid #FFFFFF'
                        : isMiss
                        ? '2.5px solid #FFA3A3'
                        : isOpenString
                        ? `3px solid ${color}`
                        : '2px solid rgba(255,255,255,0.85)',
                      boxShadow: isHit
                        ? '0 0 20px #10B981'
                        : isMiss
                        ? '0 0 24px #EF4444, 0 0 12px #FF4D4D'
                        : isOpenString
                        ? `0 0 14px ${color}99`
                        : `0 4px 14px rgba(0,0,0,0.7), 0 0 12px ${color}66`,
                    }}
                  >
                    {/* Glossy top bevel reflection */}
                    {!isOpenString && !isHit && !isMiss && (
                      <div className="absolute top-0.5 left-2 right-2 h-1 bg-white/60 rounded-full" />
                    )}

                    {/* Fret Number Label, Checkmark, or Red Cross */}
                    <span className="font-black text-sm text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] font-mono">
                      {isHit ? '✓' : isMiss ? '✕' : note.fret}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Song Structure Map */}
      {songSections.length > 0 && (
        <div
          id="song-section-map"
          className="px-5 py-3 bg-[#060A10]/98 border-t border-[#172235] shrink-0 shadow-[0_-12px_35px_rgba(0,0,0,0.28)]"
        >
          <div className="flex items-center justify-between mb-2">
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
          <div className="flex h-11 rounded-2xl overflow-hidden border border-[#21324A] bg-[#0B111C] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
                  className={`relative h-full px-2 text-[10px] font-black uppercase tracking-wide border-r border-[#070A10] transition-all cursor-pointer overflow-hidden group ${
                    isActive
                      ? 'text-[#061014] shadow-[0_0_22px_rgba(0,229,190,0.32)] scale-[1.01] z-10'
                      : isPast
                      ? 'text-[#C9FFF0]'
                      : 'text-[#D5E2F2] hover:text-white'
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
                  <span className="relative z-10 truncate block">
                    {section.name}
                  </span>
                  <span className={`relative z-10 mt-0.5 block text-[8px] font-mono ${
                    isActive ? 'text-[#061014]/70' : 'text-[#8EA4BC]'
                  }`}>
                    M{section.startMeasure}-{section.endMeasure}
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
        className="px-5 py-1.5 bg-[#070A10] border-t border-[#151D2A] flex items-center space-x-3 shrink-0"
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
            className="h-full bg-gradient-to-r from-[#00A389] via-[#00E5BE] to-[#2ED573] rounded-full relative shadow-[0_0_10px_#00E5BE]"
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
        className="h-[64px] bg-[#070A10] border-t border-[#182333] px-5 flex items-center justify-between shrink-0 z-20 shadow-inner"
      >
        {/* Play / Pause / Restart */}
        <div className="flex items-center space-x-2.5">
          <button
            id="btn-play-pause-toggle"
            onClick={togglePlayback}
            className="w-11 h-11 rounded-2xl bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#070B12] flex items-center justify-center font-black shadow-lg shadow-[#00E5BE]/30 transition active:scale-95 cursor-pointer"
            title="Space: Play / Pause"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button
            id="btn-restart-song"
            onClick={() => {
              // Restart immediately and keep the note highway auto-scrolling.
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
            className="w-10 h-10 rounded-2xl bg-[#121A26] hover:bg-[#1A2638] text-[#9FB0C4] hover:text-white flex items-center justify-center border border-[#233348] transition active:scale-95 cursor-pointer shadow"
            title="Restart song"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Wait-for-Me Practice Mode Toggle */}
          <button
            id="btn-wait-for-me"
            onClick={() => {
              const next = !waitForMeMode;
              setWaitForMeMode(next);
              if (!next) {
                setIsFrozenWaiting(false);
                setActiveTargetNote(null);
              }
            }}
            className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold border flex items-center space-x-2 transition cursor-pointer shadow active:scale-95 ${
              waitForMeMode
                ? 'bg-[#FFD32A] text-[#080C12] border-[#FFD32A] shadow-md shadow-[#FFD32A]/25'
                : 'bg-[#101722] text-[#8EA1B8] border-[#223044] hover:text-white'
            }`}
            title="Wait for me: automatically pauses until you pluck the correct fret on your guitar"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                waitForMeMode ? 'bg-[#080C12] animate-ping' : 'bg-[#586A7E]'
              }`}
            />
            <span>Wait For Me {waitForMeMode ? 'ON' : 'OFF'}</span>
          </button>

          {/* Auto-Demo Toggle */}
          <button
            id="btn-auto-demo"
            onClick={() => {
              const next = !isAutoDemo;
              setIsAutoDemo(next);
              if (next) {
                setIsFrozenWaiting(false);
                if (!isPlaying) setIsPlaying(true);
              }
            }}
            className={`px-3 py-2 rounded-2xl text-xs font-extrabold border flex items-center space-x-1.5 transition cursor-pointer shadow active:scale-95 ${
              isAutoDemo
                ? 'bg-[#A55EEA] text-white border-[#A55EEA] shadow-md shadow-[#A55EEA]/30'
                : 'bg-[#101722] text-[#8EA1B8] border-[#223044] hover:text-white'
            }`}
            title="Демо режим: компютърът автоматично показва свиренето на песента"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Демо {isAutoDemo ? 'ВКЛ' : 'ИЗКЛ'}</span>
          </button>

          {/* Anti-Feedback Speaker Sound Toggle */}
          <button
            id="btn-speaker-sound-toggle"
            onClick={() => setSynthSoundWithMic(!synthSoundWithMic)}
            className={`px-3 py-2 rounded-2xl text-xs font-bold border flex items-center space-x-1.5 transition cursor-pointer shadow active:scale-95 ${
              synthSoundWithMic
                ? 'bg-[#182536] text-[#00E5BE] border-[#00E5BE]/40 shadow-sm'
                : 'bg-[#101722] text-[#8EA1B8] border-[#202D3E] hover:text-white'
            }`}
            title={
              synthSoundWithMic
                ? 'Колонки: ВКЛЮЧЕНИ (внимание: синтезаторът може да се чуе от микрофона)'
                : 'Колонки: ИЗКЛЮЧЕНИ (предпазва микрофона от повторно засичане и самосвирене)'
            }
          >
            {synthSoundWithMic ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-[#00E5BE]" />
                <span className="hidden xl:inline text-[11px]">Колонки: Вкл</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-[#FF7F50]" />
                <span className="hidden xl:inline text-[11px] text-[#FF7F50]">Защита от ехо</span>
              </>
            )}
          </button>
        </div>

        {/* Speed Stepper (Tempo controls: 25%, 50%, 75%, 100%) */}
        <div className="flex items-center space-x-2 bg-[#0E1420] border border-[#1E2B3E] px-3.5 py-1.5 rounded-2xl shadow-inner">
          <Sliders className="w-3.5 h-3.5 text-[#00E5BE]" />
          <span className="text-xs text-[#7A8EA8] font-bold">Speed:</span>
          {[0.25, 0.5, 0.75, 1.0].map((rate) => (
            <button
              key={rate}
              onClick={() => setTempoFactor(rate)}
              className={`text-xs px-2.5 py-1 rounded-xl font-black font-mono transition cursor-pointer ${
                tempoFactor === rate
                  ? 'bg-[#00E5BE] text-[#070B12] shadow-sm shadow-[#00E5BE]/30'
                  : 'text-[#7A8EA8] hover:text-white'
              }`}
            >
              {Math.round(rate * 100)}%
            </button>
          ))}
        </div>

        {/* Fullscreen Big Screen Toggle & Keyboard shortcut hint */}
        <div className="flex items-center space-x-3">
          <button
            id="btn-fullscreen-toggle"
            onClick={toggleFullscreen}
            className="px-4 py-2 rounded-2xl text-xs font-bold border bg-[#111824] text-white border-[#243346] hover:border-[#00E5BE]/40 hover:bg-[#182333] flex items-center space-x-2 transition shadow cursor-pointer active:scale-95"
            title="Toggle Big Screen Fullscreen"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-[#00E5BE]" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-[#00E5BE]" />
                <span>Big Screen View</span>
              </>
            )}
          </button>

          <span className="text-xs text-[#5D6F83] hidden lg:inline font-mono">
            Press <kbd className="px-1.5 py-0.5 bg-[#121926] border border-[#253549] rounded text-white font-mono">1-6</kbd> to pluck
          </span>
        </div>
      </footer>

      {/* Audio Calibration & Guitar Settings Modal */}
      {showAudioSettings && (
        <div
          id="audio-settings-modal-backdrop"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowAudioSettings(false)}
        >
          <div
            id="audio-settings-modal"
            className="bg-[#0C121D] border-2 border-[#203046] rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1E2B3E] pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-[#00E5BE]/20 flex items-center justify-center text-[#00E5BE] border border-[#00E5BE]/40">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Аудио калибрация за китара</h3>
                  <p className="text-xs text-[#7E93AC]">Настройка на латентността и чувствителността за професионална игра</p>
                </div>
              </div>
              <button
                onClick={() => setShowAudioSettings(false)}
                className="w-8 h-8 rounded-lg bg-[#141E2C] hover:bg-[#1E2B3E] text-[#7E93AC] hover:text-white flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Latency Compensation Slider */}
            <div className="space-y-2 bg-[#080D15] border border-[#1B2738] p-3.5 rounded-2xl">
              <div className="flex justify-between items-baseline">
                <label className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <span>Компенсация на закъснението (Audio Latency):</span>
                </label>
                <span className="font-mono text-sm font-black text-[#00E5BE]">
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
              <p className="text-[11px] text-[#6E839B]">
                Компенсира естественото хардуерно забавяне на микрофона и звуковата карта (обикновено 50–90 ms). Когато свирите точно в ритъм, тонът се засича точно на лентата!
              </p>
            </div>

            {/* Mic Sensitivity Slider */}
            <div className="space-y-2 bg-[#080D15] border border-[#1B2738] p-3.5 rounded-2xl">
              <div className="flex justify-between items-baseline">
                <label className="text-xs font-bold text-white">
                  Чувствителност на микрофона:
                </label>
                <span className="font-mono text-sm font-black text-[#00E5BE]">
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
                  // Map 1-10 to noiseThreshold 0.015 down to 0.002
                  const threshold = 0.015 - ((val - 1) / 9) * 0.013;
                  micDetector.setNoiseThreshold(threshold);
                }}
                className="w-full accent-[#00E5BE] cursor-pointer"
              />
              <div className="flex items-center space-x-2 pt-1">
                <span className="text-[10px] text-[#556980]">Входно ниво:</span>
                <div className="flex-1 h-2 bg-[#141C2B] rounded-full overflow-hidden border border-[#233348]">
                  <div
                    className="h-full bg-gradient-to-r from-[#00E5BE] to-[#2ED573] transition-all duration-75"
                    style={{ width: `${Math.min(100, (micRms / 0.035) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Hit Window Tolerance */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-white">Времеви толеранс за уцелване:</label>
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
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      hitTolerance === item.id
                        ? 'bg-[#00E5BE]/15 border-[#00E5BE] text-white shadow-sm'
                        : 'bg-[#121A26] border-[#223146] text-[#7E93AC] hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-black">{item.label}</div>
                    <div className="text-[10px] font-mono opacity-80 mt-0.5">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Realtime Live Test Meter */}
            <div className="bg-[#080D15] border border-[#1C2838] rounded-2xl p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${isListeningMic ? 'bg-[#00E5BE] animate-ping' : 'bg-[#FF5E7E]'}`} />
                <span className="text-[#8EA2B9]">
                  {isListeningMic ? 'Тест на живо:' : 'Микрофонът е изключен'}
                </span>
              </div>
              <div className="font-mono font-bold text-white">
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

            <button
              onClick={() => setShowAudioSettings(false)}
              className="w-full py-2.5 bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#070B12] font-black rounded-xl text-xs transition active:scale-98 cursor-pointer shadow-lg shadow-[#00E5BE]/20"
            >
              Запази и продължи
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

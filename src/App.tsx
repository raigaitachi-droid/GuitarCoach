import React, { useState, useEffect } from 'react';
import { PlayingStage } from './components/PlayingStage';
import { SongMenu } from './components/SongMenu';
import { StudioTuner } from './components/StudioTuner';
import { AICoachChat } from './components/AICoachChat';
import { ImportedSong, SongAnalysis, SongMetadata, SongSection, TabNote } from './types';
import { Play, Music, SlidersHorizontal, Bot, Mic, MicOff, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { micDetector } from './utils/pitchDetector';
import { SONG_CATALOG } from './data/songTabs';

const IMPORTED_SONGS_STORAGE_KEY = 'guitar-coach-imported-songs';

function sanitizeImportedSong(song: ImportedSong): ImportedSong {
  const harmonicNotes = song.notes.filter((note) => note.isHarmonic);
  if (song.notes.length === 0 || harmonicNotes.length === 0) return song;

  const harmonicRatio = harmonicNotes.length / song.notes.length;
  const unknownRatio =
    harmonicNotes.filter((note) => !note.harmonicType || note.harmonicType === 'unknown').length /
    harmonicNotes.length;

  if (harmonicRatio < 0.75 && unknownRatio < 0.8) return song;

  return {
    ...song,
    notes: song.notes.map(({ isHarmonic, harmonicType, ...note }) => note),
  };
}

function loadImportedSongs(): ImportedSong[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(IMPORTED_SONGS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];

    const sanitized = parsed.map((song) => sanitizeImportedSong(song));
    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      localStorage.setItem(IMPORTED_SONGS_STORAGE_KEY, JSON.stringify(sanitized));
    }
    return sanitized;
  } catch {
    return [];
  }
}

export default function App() {
  const [currentView, setCurrentView] = useState<'stage' | 'coach' | 'menu' | 'tuner'>('stage');
  const [tempoPercent, setTempoPercent] = useState(100);
  const [selectedSong, setSelectedSong] = useState<SongMetadata | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<TabNote[] | null>(null);
  const [selectedSections, setSelectedSections] = useState<SongSection[] | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<SongAnalysis | null>(null);

  const activeSong = selectedSong || SONG_CATALOG[0];

  const [importedSongs, setImportedSongs] = useState<ImportedSong[]>(loadImportedSongs);

  // Global pitch monitoring for Tuner & HUD
  const [tunerPitch, setTunerPitch] = useState({
    pitch: 'E2',
    frequency: 82.4,
    cents: 0,
    inTune: false,
  });
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [volumeRms, setVolumeRms] = useState(0);

  useEffect(() => {
    const unsub = micDetector.subscribe((res) => {
      if (res) {
        setTunerPitch({
          pitch: res.noteName,
          frequency: res.frequency,
          cents: res.cents,
          inTune: res.inTune,
        });
        setVolumeRms(res.volumeRms);
        setIsListeningMic(true);
      }
    });
    return () => unsub();
  }, []);

  const handleToggleMic = async () => {
    if (isListeningMic) {
      micDetector.stopListening();
      setIsListeningMic(false);
    } else {
      try {
        const ok = await micDetector.startListening();
        setIsListeningMic(ok);
      } catch (err) {
        console.error('Mic access error:', err);
      }
    }
  };

  const handleSelectSong = (song: SongMetadata) => {
    setSelectedSong(song);
    const imported = importedSongs.find((candidate) => candidate.id === song.id);
    setSelectedNotes(imported?.notes || null);
    setSelectedSections(imported?.sections || null);
    setSelectedAnalysis(imported?.analysis || null);
    setCurrentView('stage');
  };

  const handleImportSong = (song: ImportedSong) => {
    const sanitizedSong = sanitizeImportedSong(song);
    setImportedSongs((current) => {
      const updated = [sanitizedSong, ...current];
      localStorage.setItem(IMPORTED_SONGS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    setSelectedSong(sanitizedSong);
    setSelectedNotes(sanitizedSong.notes);
    setSelectedSections(sanitizedSong.sections);
    setSelectedAnalysis(sanitizedSong.analysis || null);
    setCurrentView('stage');
  };

  const navItems = [
    { id: 'stage' as const, label: 'Сцена', icon: Play, desc: 'Интерактивни табове' },
    { id: 'coach' as const, label: 'AI Треньор', icon: Bot, desc: 'Анализ и съвети' },
    { id: 'menu' as const, label: 'Песни', icon: Music, desc: 'Библиотека' },
    { id: 'tuner' as const, label: 'Тунер', icon: SlidersHorizontal, desc: 'Настройка на китара' },
  ];

  return (
    <div id="guitar-trainer-app" className="flex flex-col h-screen w-screen bg-[#030508] text-[#E2E8F0] overflow-hidden select-none font-sans">
      {/* Unified Single Studio Top Bar */}
      <header id="app-top-nav" className="h-12 bg-[#030508]/95 border-b border-white/5 px-4 sm:px-5 flex items-center justify-between z-30 shrink-0 backdrop-blur-md">
        {/* Left: Brand & Active Song Badge */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => setCurrentView('stage')}
            title="Към сцената"
          >
            <div className="w-7 h-7 rounded-full bg-[#00E5BE] flex items-center justify-center font-black text-[#070B12] text-xs group-hover:scale-105 transition-transform">
              P
            </div>
            <span className="font-extrabold text-sm tracking-tight text-white hidden md:inline">
              PickHero
            </span>
          </div>

          <div className="h-4 w-px bg-[#1C293D] hidden sm:block" />

          {/* Quick Active Song Indicator & Switcher */}
          <button
            onClick={() => setCurrentView('menu')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-xs transition-colors cursor-pointer group"
            title="Кликни за избор на друга песен от библиотеката"
          >
            <Music className="w-3.5 h-3.5 text-[#00E5BE]" />
            <span className="font-semibold text-white truncate max-w-[140px] sm:max-w-[180px]">
              {activeSong.title}
            </span>
            <span className="text-[#596E84] font-mono text-[11px] hidden lg:inline">
              {activeSong.tempo} BPM
            </span>
            <ChevronRight className="w-3 h-3 text-[#596E84] group-hover:text-white transition-colors" />
          </button>
        </div>

        {/* Center: Clean Primary Navigation Tabs */}
        <nav id="view-tabs" className="flex items-center bg-white/[0.03] p-0.5 rounded-full border border-white/10">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                onClick={() => setCurrentView(item.id)}
                className={`relative flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  isActive ? 'text-[#070B12]' : 'text-[#8295AB] hover:text-white'
                }`}
                title={item.desc}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav-indicator"
                    className="absolute inset-0 bg-[#00E5BE] rounded-full"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* Right: Single Clear Microphone Input Controller */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleMic}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-all cursor-pointer ${
              isListeningMic
                ? 'bg-[#00E5BE]/10 border-[#00E5BE]/40 text-[#00E5BE] shadow-sm shadow-[#00E5BE]/20'
                : 'bg-[#101726] border-[#1E2E44] text-[#71859D] hover:text-white hover:border-[#2C3E5B]'
            }`}
            title={
              isListeningMic
                ? 'Микрофонът слуша на живо. Кликнете, за да го спрете.'
                : 'Кликнете, за да активирате микрофона и засичането на китарата.'
            }
          >
            {isListeningMic ? (
              <>
                <span className="w-2 h-2 rounded-full bg-[#00E5BE] animate-ping" />
                <Mic className="w-3.5 h-3.5 text-[#00E5BE]" />
                <span className="font-bold">
                  {tunerPitch.frequency > 0 ? `${tunerPitch.pitch} (${tunerPitch.frequency.toFixed(0)}Hz)` : 'Слуша...'}
                </span>
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5 text-[#71859D]" />
                <span>Микрофон: Изкл</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main View Area */}
      <main id="app-view-container" className="flex-1 relative overflow-hidden bg-[#030508]">
        <AnimatePresence mode="wait">
          {currentView === 'stage' && (
            <motion.div
              key="stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="h-full w-full"
            >
              <PlayingStage
                selectedSong={selectedSong}
                selectedNotes={selectedNotes}
                selectedSections={selectedSections}
                selectedAnalysis={selectedAnalysis}
                tempoPercent={tempoPercent}
                onTempoPercentChange={setTempoPercent}
                onOpenLibrary={() => setCurrentView('menu')}
                onOpenCoachChat={() => setCurrentView('coach')}
              />
            </motion.div>
          )}

          {currentView === 'coach' && (
            <motion.div
              key="coach"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="h-full w-full max-w-4xl mx-auto p-3 sm:p-5"
            >
              <AICoachChat
                currentSong={selectedSong}
                currentTempoPercent={tempoPercent}
                onApplyRecommendedTempo={(newTempo) => {
                  setTempoPercent(newTempo);
                  setCurrentView('stage');
                }}
              />
            </motion.div>
          )}

          {currentView === 'menu' && (
            <motion.div
              key="menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="h-full w-full"
            >
              <SongMenu
                onSelectSong={handleSelectSong}
                onImportSong={handleImportSong}
                importedSongs={importedSongs}
                onBackToStage={() => setCurrentView('stage')}
              />
            </motion.div>
          )}

          {currentView === 'tuner' && (
            <motion.div
              key="tuner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="h-full w-full"
            >
              <StudioTuner
                currentPitch={tunerPitch.pitch}
                frequencyHz={tunerPitch.frequency}
                centsOffset={tunerPitch.cents}
                inTune={tunerPitch.inTune}
                isListening={isListeningMic}
                volumeRms={volumeRms}
                onToggleMic={handleToggleMic}
                onClose={() => setCurrentView('stage')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

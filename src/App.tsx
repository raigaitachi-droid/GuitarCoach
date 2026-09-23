import React, { useState, useEffect } from 'react';
import { PlayingStage } from './components/PlayingStage';
import { SongMenu } from './components/SongMenu';
import { StudioTuner } from './components/StudioTuner';
import { AICoachChat } from './components/AICoachChat';
import { ImportedSong, SongMetadata, SongSection, TabNote } from './types';
import { Play, Music, SlidersHorizontal, Bot, Mic, MicOff, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { micDetector } from './utils/pitchDetector';
import { SONG_CATALOG } from './data/songTabs';

export default function App() {
  const [currentView, setCurrentView] = useState<'stage' | 'coach' | 'menu' | 'tuner'>('stage');
  const [tempoPercent, setTempoPercent] = useState(100);
  const [selectedSong, setSelectedSong] = useState<SongMetadata | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<TabNote[] | null>(null);
  const [selectedSections, setSelectedSections] = useState<SongSection[] | null>(null);

  const activeSong = selectedSong || SONG_CATALOG[0];

  const [importedSongs, setImportedSongs] = useState<ImportedSong[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('guitar-coach-imported-songs') || '[]');
    } catch {
      return [];
    }
  });

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
    setCurrentView('stage');
  };

  const handleImportSong = (song: ImportedSong) => {
    setImportedSongs((current) => {
      const updated = [song, ...current];
      localStorage.setItem('guitar-coach-imported-songs', JSON.stringify(updated));
      return updated;
    });
    setSelectedSong(song);
    setSelectedNotes(song.notes);
    setSelectedSections(song.sections);
    setCurrentView('stage');
  };

  const navItems = [
    { id: 'stage' as const, label: 'Сцена', icon: Play, desc: 'Интерактивни табове' },
    { id: 'coach' as const, label: 'AI Треньор', icon: Bot, desc: 'Анализ и съвети' },
    { id: 'menu' as const, label: 'Песни', icon: Music, desc: 'Библиотека' },
    { id: 'tuner' as const, label: 'Тунер', icon: SlidersHorizontal, desc: 'Настройка на китара' },
  ];

  return (
    <div id="guitar-trainer-app" className="flex flex-col h-screen w-screen bg-[#06090F] text-[#E2E8F0] overflow-hidden select-none font-sans">
      {/* Unified Single Studio Top Bar */}
      <header id="app-top-nav" className="h-14 bg-[#080D16] border-b border-[#141F30] px-4 sm:px-6 flex items-center justify-between z-30 shrink-0">
        {/* Left: Brand & Active Song Badge */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => setCurrentView('stage')}
            title="Към сцената"
          >
            <div className="w-7 h-7 rounded-lg bg-[#00E5BE] flex items-center justify-center font-black text-[#070B12] text-xs shadow-sm shadow-[#00E5BE]/30 group-hover:scale-105 transition-transform">
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
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#0E1524] hover:bg-[#162136] border border-[#1E2E44] text-xs transition-colors cursor-pointer group"
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
        <nav id="view-tabs" className="flex items-center bg-[#0C121E] p-1 rounded-xl border border-[#1C293D]">
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
                    className="absolute inset-0 bg-[#00E5BE] rounded-lg shadow-sm shadow-[#00E5BE]/30"
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
      <main id="app-view-container" className="flex-1 relative overflow-hidden bg-[#06090F]">
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

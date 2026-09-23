import React, { useState, useEffect } from 'react';
import { PlayingStage } from './components/PlayingStage';
import { SongMenu } from './components/SongMenu';
import { StudioTuner } from './components/StudioTuner';
import { ProSubscription } from './components/ProSubscription';
import { DesktopGuide } from './components/DesktopGuide';
import { ImportedSong, SongMetadata, SongSection, TabNote } from './types';
import { Play, Music, Sparkles, Radio, HelpCircle, X, SlidersHorizontal, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { micDetector } from './utils/pitchDetector';

export default function App() {
  const [currentView, setCurrentView] = useState<'stage' | 'menu' | 'tuner' | 'pro'>('stage');
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [selectedSong, setSelectedSong] = useState<SongMetadata | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<TabNote[] | null>(null);
  const [selectedSections, setSelectedSections] = useState<SongSection[] | null>(null);

  const [isPro, setIsPro] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pickhero_pro_member') === 'true';
    } catch {
      return false;
    }
  });

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

  const handleUpgradePro = () => {
    setIsPro(true);
    try {
      localStorage.setItem('pickhero_pro_member', 'true');
    } catch {
      // ignore
    }
  };

  const navItems = [
    { id: 'stage' as const, label: 'Сцена', icon: Play },
    { id: 'menu' as const, label: 'Библиотека', icon: Music },
    { id: 'tuner' as const, label: 'Студиен Тунер', icon: SlidersHorizontal },
    { id: 'pro' as const, label: 'PRO План', icon: Sparkles },
  ];

  return (
    <div id="guitar-trainer-app" className="flex flex-col h-screen w-screen bg-[#06090F] text-[#E2E8F0] overflow-hidden select-none font-sans">
      {/* Top Studio Bar: Strict 3-Zone Commercial Contract */}
      <header id="app-top-nav" className="h-13 bg-[#080D16]/95 backdrop-blur-md border-b border-[#141F30] px-6 flex items-center justify-between z-30 shrink-0">
        {/* Zone 1: Wordmark & Brand Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setCurrentView('stage')}>
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#00E5BE] to-[#00A88B] flex items-center justify-center font-black text-[#070B12] text-xs shadow-md shadow-[#00E5BE]/25">
              P
            </div>
            <span className="font-extrabold text-sm tracking-tight text-white">PickHero Studio</span>
          </div>
          {isPro ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00E5BE]/15 border border-[#00E5BE]/40 text-[#00E5BE] text-[10px] font-mono font-bold tracking-wide">
              <ShieldCheck className="w-3 h-3" />
              <span>PRO</span>
            </span>
          ) : (
            <button
              onClick={() => setCurrentView('pro')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[#F59E0B] hover:bg-[#F59E0B]/25 text-[10px] font-mono font-bold tracking-wide transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              <span>UPGRADE</span>
            </button>
          )}
        </div>

        {/* Zone 2: Animated Segmented Nav Tabs */}
        <nav id="view-tabs" className="flex items-center bg-[#0C121E] p-1 rounded-xl border border-[#1C293D]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                onClick={() => setCurrentView(item.id)}
                className={`relative flex items-center gap-2 px-3.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  isActive ? 'text-[#070B12]' : 'text-[#7D91A8] hover:text-white'
                }`}
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

        {/* Zone 3: Audio Engine Status & Settings Trigger */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-[#62768E]">
            <Radio className={`w-3.5 h-3.5 ${isListeningMic ? 'text-[#00E5BE] animate-pulse' : 'text-[#48596E]'}`} />
            <span>{isListeningMic ? 'AI Pitch: Активен (12ms)' : 'Аудио: Изчаква сигнал'}</span>
          </div>

          <button
            onClick={() => setShowGuideModal(true)}
            className="w-8 h-8 rounded-lg bg-[#0F1626] hover:bg-[#162136] border border-[#1E2B40] flex items-center justify-center text-[#7E91A6] hover:text-white transition-colors cursor-pointer"
            title="Инструкции за настолна инсталация и аудио драйвери"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main View Area */}
      <main id="app-view-container" className="flex-1 relative overflow-hidden bg-[#06090F]">
        <AnimatePresence mode="wait">
          {currentView === 'stage' && (
            <motion.div
              key="stage"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full"
            >
              <PlayingStage
                selectedSong={selectedSong}
                selectedNotes={selectedNotes}
                selectedSections={selectedSections}
                onOpenLibrary={() => setCurrentView('menu')}
                isPro={isPro}
                onOpenPro={() => setCurrentView('pro')}
              />
            </motion.div>
          )}

          {currentView === 'menu' && (
            <motion.div
              key="menu"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
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
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
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

          {currentView === 'pro' && (
            <motion.div
              key="pro"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full"
            >
              <ProSubscription
                isPro={isPro}
                onUpgradePro={handleUpgradePro}
                onClose={() => setCurrentView('stage')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Desktop & Audio Guide Modal */}
      <AnimatePresence>
        {showGuideModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-[#090E17] border border-[#1A2638] rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-[#141F30] flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-base text-white">Инструкции за настолна инсталация</h3>
                  <p className="text-xs text-[#71849A] mt-0.5">Конфигурация на микрофон и ниска латентност</p>
                </div>
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="w-8 h-8 rounded-xl bg-[#101724] hover:bg-[#182436] flex items-center justify-center text-[#8293A7] hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <DesktopGuide />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

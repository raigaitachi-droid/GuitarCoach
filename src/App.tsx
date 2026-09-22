import React, { useState } from 'react';
import { PlayingStage } from './components/PlayingStage';
import { SongMenu } from './components/SongMenu';
import { DesktopGuide } from './components/DesktopGuide';
import { ImportedSong, SongMetadata, SongSection, TabNote } from './types';
import { Play, Music, Terminal } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<'stage' | 'menu' | 'guide'>('stage');
  const [selectedSong, setSelectedSong] = useState<SongMetadata | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<TabNote[] | null>(null);
  const [selectedSections, setSelectedSections] = useState<SongSection[] | null>(null);
  const [importedSongs, setImportedSongs] = useState<ImportedSong[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('guitar-coach-imported-songs') || '[]');
    } catch {
      return [];
    }
  });

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

  return (
    <div id="guitar-trainer-app" className="flex flex-col h-screen w-screen bg-[#090C12] text-white overflow-hidden select-none">
      {/* Top Universal App Navigation Bar */}
      <nav id="app-top-nav" className="h-[48px] bg-[#07090F]/95 backdrop-blur-md border-b border-[#172130] px-5 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#00E5BE] to-[#00A389] flex items-center justify-center font-black text-[#07090E] text-[11px] shadow-sm shadow-[#00E5BE]/30">
            GT
          </div>
          <span className="font-extrabold text-sm tracking-tight text-white font-sans">Guitar Trainer</span>
          <span className="text-[10px] font-mono font-bold text-[#00E5BE] bg-[#00E5BE]/10 px-2.5 py-0.5 rounded-full border border-[#00E5BE]/30">
            v7-arpeggio
          </span>
        </div>

        {/* View Switcher Segmented Tabs */}
        <div id="view-tabs" className="flex items-center space-x-1 bg-[#0D121B] p-1 rounded-xl border border-[#1E293B] shadow-inner">
          <button
            id="tab-stage"
            onClick={() => setCurrentView('stage')}
            className={`flex items-center space-x-2 px-3.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentView === 'stage'
                ? 'bg-[#00E5BE] text-[#070A10] shadow-md shadow-[#00E5BE]/20 scale-[1.02]'
                : 'text-[#8293A7] hover:text-white'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Сцена (Practice Stage)</span>
          </button>

          <button
            id="tab-menu"
            onClick={() => setCurrentView('menu')}
            className={`flex items-center space-x-2 px-3.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentView === 'menu'
                ? 'bg-[#00E5BE] text-[#070A10] shadow-md shadow-[#00E5BE]/20 scale-[1.02]'
                : 'text-[#8293A7] hover:text-white'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Песни (Song Menu)</span>
          </button>

          <button
            id="tab-guide"
            onClick={() => setCurrentView('guide')}
            className={`flex items-center space-x-2 px-3.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentView === 'guide'
                ? 'bg-[#00E5BE] text-[#070A10] shadow-md shadow-[#00E5BE]/20 scale-[1.02]'
                : 'text-[#8293A7] hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Компютър (Python Guide)</span>
          </button>
        </div>

        <div className="text-[11px] font-mono text-[#586C82] hidden md:flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00E5BE] animate-pulse" />
          <span>Realtime Audio & Tabs</span>
        </div>
      </nav>

      {/* Main View Area */}
      <div id="app-view-container" className="flex-1 relative overflow-hidden">
        {currentView === 'stage' && (
          <PlayingStage
            selectedSong={selectedSong}
            selectedNotes={selectedNotes}
            selectedSections={selectedSections}
            onOpenLibrary={() => setCurrentView('menu')}
          />
        )}
        {currentView === 'menu' && (
          <SongMenu
            onSelectSong={handleSelectSong}
            onImportSong={handleImportSong}
            importedSongs={importedSongs}
            onBackToStage={() => setCurrentView('stage')}
          />
        )}
        {currentView === 'guide' && <DesktopGuide />}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Search, Play, ArrowLeft, Mic, SlidersHorizontal, Award, Music, Sparkles } from 'lucide-react';
import { SongMetadata } from '../types';

interface SongMenuProps {
  onSelectSong: (song: SongMetadata) => void;
  onBackToStage: () => void;
}

const SAMPLE_SONGS: SongMetadata[] = [
  {
    id: 'canon-in-d',
    title: 'Canon in D',
    artist: 'Johann Pachelbel',
    tempo: 120,
    durationMs: 180000,
    difficulty: 'Intermediate',
    tuning: 'Standard EADGBE',
    key: 'D Major',
    attempts: 14,
    bestAccuracy: 96,
    measures: 64,
  },
  {
    id: 'stairway-intro',
    title: 'Stairway to Heaven (Intro)',
    artist: 'Led Zeppelin',
    tempo: 74,
    durationMs: 140000,
    difficulty: 'Intermediate',
    tuning: 'Standard EADGBE',
    key: 'A Minor',
    attempts: 9,
    bestAccuracy: 92,
    measures: 32,
  },
  {
    id: 'nothing-else-matters',
    title: 'Nothing Else Matters',
    artist: 'Metallica',
    tempo: 142,
    durationMs: 240000,
    difficulty: 'Beginner',
    tuning: 'Standard EADGBE',
    key: 'E Minor',
    attempts: 21,
    bestAccuracy: 98,
    measures: 48,
  },
  {
    id: 'sweet-child-o-mine',
    title: "Sweet Child O' Mine (Riff)",
    artist: "Guns N' Roses",
    tempo: 128,
    durationMs: 95000,
    difficulty: 'Advanced',
    tuning: 'Eb Standard',
    key: 'Db Major',
    attempts: 18,
    bestAccuracy: 88,
    measures: 36,
  },
  {
    id: 'hotel-california-arpeggios',
    title: 'Hotel California (Acoustic Intro)',
    artist: 'Eagles',
    tempo: 78,
    durationMs: 160000,
    difficulty: 'Advanced',
    tuning: 'Standard (Capo 7)',
    key: 'B Minor',
    attempts: 6,
    bestAccuracy: 84,
    measures: 40,
  },
  {
    id: 'blackbird',
    title: 'Blackbird',
    artist: 'The Beatles',
    tempo: 94,
    durationMs: 135000,
    difficulty: 'Intermediate',
    tuning: 'Standard EADGBE',
    key: 'G Major',
    attempts: 11,
    bestAccuracy: 94,
    measures: 52,
  },
];

export const SongMenu: React.FC<SongMenuProps> = ({ onSelectSong, onBackToStage }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sortMode, setSortMode] = useState<'name' | 'tempo' | 'accuracy'>('name');

  const filteredSongs = SAMPLE_SONGS.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    if (sortMode === 'tempo') return a.tempo - b.tempo;
    if (sortMode === 'accuracy') return b.bestAccuracy - a.bestAccuracy;
    return a.title.localeCompare(b.title);
  });

  return (
    <div id="guitar-trainer-menu" className="flex flex-col h-full bg-[#080B11] text-[#E2E8F0] select-none font-sans overflow-hidden">
      {/* Menu Header */}
      <header id="menu-header" className="h-[88px] bg-[#07090F]/95 backdrop-blur-md border-b border-[#182333] px-8 flex items-center justify-between shrink-0 shadow-lg shadow-black/20">
        <div className="flex items-center space-x-4">
          <button
            id="btn-back-to-stage"
            onClick={onBackToStage}
            className="w-10 h-10 rounded-2xl bg-[#121926] hover:bg-[#1A2536] border border-[#233246] hover:border-[#00E5BE]/40 flex items-center justify-center text-[#8EA1B8] hover:text-white transition shadow cursor-pointer active:scale-95"
            title="Върни се към сцената за свирене"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] tracking-wider font-extrabold text-[#00E5BE] uppercase bg-[#00E5BE]/10 px-2.5 py-0.5 rounded-full border border-[#00E5BE]/30">
                PRACTICE LIBRARY
              </span>
              <span className="text-xs text-[#71849A] font-mono">{filteredSongs.length} песни</span>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-white mt-0.5">Изберете песен за упражнение</h1>
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#5B6D83] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="song-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Търсене на песен или изпълнител..."
              className="w-72 bg-[#0E1522] border border-[#213044] rounded-2xl pl-10 pr-3 py-2 text-xs text-white placeholder-[#5B6D83] focus:outline-none focus:border-[#00E5BE] transition shadow-inner"
            />
          </div>

          <button
            id="btn-toggle-sort"
            onClick={() => setSortMode(sortMode === 'name' ? 'tempo' : sortMode === 'tempo' ? 'accuracy' : 'name')}
            className="bg-[#121926] hover:bg-[#1A2536] border border-[#233246] hover:border-[#00E5BE]/40 px-3.5 py-2 rounded-2xl text-xs font-bold text-[#CBD5E1] flex items-center space-x-2 transition cursor-pointer active:scale-95 shadow"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#00E5BE]" />
            <span>Сортиране: {sortMode === 'name' ? 'Име А-Я' : sortMode === 'tempo' ? 'Темпо (BPM)' : 'Най-висока точност'}</span>
          </button>
        </div>
      </header>

      {/* Songs List */}
      <main id="menu-song-list" className="flex-1 overflow-y-auto px-8 py-6 space-y-3">
        {filteredSongs.map((song, idx) => {
          const isSelected = idx === selectedIndex;

          return (
            <div
              key={song.id}
              id={`song-card-${song.id}`}
              onClick={() => {
                setSelectedIndex(idx);
                onSelectSong(song);
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                isSelected
                  ? 'bg-gradient-to-r from-[#141E2C] to-[#111925] border-[#00E5BE] shadow-xl shadow-[#00E5BE]/10 translate-x-1.5'
                  : 'bg-[#0D121B] border-[#1D2838] hover:border-[#2D3F58] hover:bg-[#101722]'
              }`}
            >
              {/* Left: Play marker & Song Details */}
              <div className="flex items-center space-x-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-[#00E5BE] text-[#070A10] shadow-lg shadow-[#00E5BE]/25'
                      : 'bg-[#151D2A] text-[#7A8EA4]'
                  }`}
                >
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </div>

                <div>
                  <h3 className={`text-base font-bold tracking-tight ${isSelected ? 'text-white' : 'text-[#E2E8F0]'}`}>
                    {song.title}
                  </h3>
                  <div className="flex items-center space-x-2.5 text-xs text-[#7A8DA3] mt-0.5">
                    <span className="text-white font-medium">{song.artist}</span>
                    <span>•</span>
                    <span className="font-mono text-[#00E5BE] font-bold">{song.tempo} BPM</span>
                    <span>•</span>
                    <span>{song.tuning}</span>
                  </div>
                </div>
              </div>

              {/* Right: Difficulty, Attempts & Best Accuracy */}
              <div className="flex items-center space-x-4">
                <span
                  className={`text-[11px] font-bold px-3 py-1 rounded-xl border font-mono ${
                    song.difficulty === 'Beginner'
                      ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30'
                      : song.difficulty === 'Intermediate'
                      ? 'bg-[#00E5BE]/10 text-[#00E5BE] border-[#00E5BE]/30'
                      : 'bg-[#FF5E7E]/10 text-[#FF5E7E] border-[#FF5E7E]/30'
                  }`}
                >
                  {song.difficulty}
                </span>

                <div className="text-right">
                  <div className="text-xs font-bold text-white flex items-center space-x-1 justify-end font-mono">
                    <Award className="w-3.5 h-3.5 text-[#FFD32A]" />
                    <span>Best: {song.bestAccuracy}%</span>
                  </div>
                  <div className="text-[11px] text-[#63758B] font-mono">{song.attempts} опита</div>
                </div>

                {isSelected && (
                  <button
                    id={`btn-play-song-${song.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSong(song);
                    }}
                    className="bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#070A10] text-xs font-black px-4 py-2 rounded-xl shadow-lg shadow-[#00E5BE]/25 transition active:scale-95 ml-2 cursor-pointer"
                  >
                    Свири сега
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </main>

      {/* Footer Status */}
      <footer id="menu-footer" className="h-[60px] bg-[#07090F] border-t border-[#182333] px-8 flex items-center justify-between shrink-0 shadow-inner">
        <div className="flex items-center space-x-2.5 bg-[#0E1420] border border-[#1E2B3E] px-3.5 py-1.5 rounded-xl">
          <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
          <span className="text-xs text-[#CBD5E1] font-mono">АУДИО СИСТЕМА: Realtime Pitch Engine (Active)</span>
        </div>

        <div className="text-xs text-[#63758B] flex items-center space-x-3 font-mono">
          <span>
            <kbd className="px-1.5 py-0.5 bg-[#121926] border border-[#233246] rounded text-white font-mono">ENTER</kbd> Започни
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-[#121926] border border-[#233246] rounded text-white font-mono">F</kbd> Търси
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-[#121926] border border-[#233246] rounded text-white font-mono">ESC</kbd> Назад
          </span>
        </div>
      </footer>
    </div>
  );
};

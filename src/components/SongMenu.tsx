import React, { useRef, useState } from 'react';
import { Search, Play, ArrowLeft, Award, UploadCloud, FileMusic, LoaderCircle, Music, Clock, Gauge } from 'lucide-react';
import { ImportedSong, SongMetadata } from '../types';
import { importGuitarProFile, isSupportedGuitarProFile } from '../utils/guitarProImporter';
import { motion, AnimatePresence } from 'framer-motion';

interface SongMenuProps {
  onSelectSong: (song: SongMetadata) => void;
  onImportSong: (song: ImportedSong) => void;
  importedSongs: ImportedSong[];
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

export const SongMenu: React.FC<SongMenuProps> = ({
  onSelectSong,
  onImportSong,
  importedSongs,
  onBackToStage,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sortMode, setSortMode] = useState<'name' | 'tempo' | 'accuracy'>('name');
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setImportError(null);
    if (!isSupportedGuitarProFile(file)) {
      setImportError('Изберете валиден Guitar Pro файл: .gp, .gpx, .gp3, .gp4 или .gp5');
      return;
    }

    setIsImporting(true);
    try {
      const importedSong = await importGuitarProFile(file);
      onImportSong(importedSong);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Файлът не можа да бъде импортиран.');
    } finally {
      setIsImporting(false);
    }
  };

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Beginner' | 'Intermediate' | 'Advanced' | 'imported'>('all');

  const allSongs: SongMetadata[] = [...importedSongs, ...SAMPLE_SONGS];

  const filteredSongs = allSongs
    .filter((s) => {
      const matchesSearch =
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.artist.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (categoryFilter === 'imported') {
        return importedSongs.some((imp) => imp.id === s.id);
      }
      if (categoryFilter !== 'all') {
        return s.difficulty === categoryFilter;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortMode === 'tempo') return a.tempo - b.tempo;
      if (sortMode === 'accuracy') return b.bestAccuracy - a.bestAccuracy;
      return a.title.localeCompare(b.title);
    });

  const featuredSong = allSongs[0];

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'Beginner':
        return 'text-[#10B981]';
      case 'Intermediate':
        return 'text-[#00E5BE]';
      case 'Advanced':
        return 'text-[#F59E0B]';
      default:
        return 'text-[#94A3B8]';
    }
  };

  return (
    <div
      id="guitar-trainer-menu"
      className={`flex flex-col h-full bg-[#070A10] text-[#E2E8F0] select-none font-sans overflow-hidden ${
        isDragging ? 'ring-2 ring-inset ring-[#00E5BE]' : ''
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setIsDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
    >
      {/* Menu Header */}
      <header id="menu-header" className="h-20 bg-[#090E17]/95 backdrop-blur-md border-b border-[#182436] px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <motion.button
            id="btn-back-to-stage"
            whileTap={{ scale: 0.94 }}
            onClick={onBackToStage}
            className="w-10 h-10 rounded-xl bg-[#111824] hover:bg-[#182335] border border-[#202E42] flex items-center justify-center text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            title="Върни се към сцената за свирене"
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>
          <div>
            <div className="flex items-center gap-2 text-xs text-[#63768D]">
              <span className="font-semibold text-white">Каталог с песни</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{filteredSongs.length} песни</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white mt-0.5">Изберете таблатура за тренировка</h1>
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#5B6D83] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="song-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Търсене по заглавие или автор..."
              className="w-64 bg-[#0F1624] border border-[#202E42] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#5B6D83] focus:outline-none focus:border-[#00E5BE] transition-colors"
            />
          </div>

          {/* Segmented Sort Controls with Framer Motion Layout Animation */}
          <div className="flex items-center bg-[#0F1624] p-1 rounded-xl border border-[#202E42]">
            {(
              [
                { id: 'name', label: 'Име' },
                { id: 'tempo', label: 'BPM' },
                { id: 'accuracy', label: 'Точност' },
              ] as const
            ).map((mode) => {
              const isActive = sortMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setSortMode(mode.id)}
                  className={`relative px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    isActive ? 'text-[#070A10]' : 'text-[#8293A7] hover:text-white'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-sort-tab"
                      className="absolute inset-0 bg-[#00E5BE] rounded-lg"
                      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="menu-song-list" className="flex-1 overflow-y-auto px-8 py-6 space-y-3">
        {/* Featured Masterclass Banner */}
        {featuredSong && searchQuery === '' && categoryFilter === 'all' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onSelectSong(featuredSong)}
            className="relative rounded-2xl bg-gradient-to-r from-[#0C1626] via-[#0E1B2E] to-[#0A111C] border border-[#1E2E46] p-6 shadow-2xl overflow-hidden cursor-pointer group hover:border-[#00E5BE]/50 transition-all"
          >
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-[#00E5BE]/10 to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#00E5BE]/10 border border-[#00E5BE]/30 text-[#00E5BE] text-[10px] font-mono font-bold uppercase tracking-wider">
                  ★ Избор на редакцията • Мастърклас
                </div>
                <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight group-hover:text-[#00E5BE] transition-colors">
                  {featuredSong.title}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-[#8293A7]">
                  <span className="text-white font-semibold">{featuredSong.artist}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[#00E5BE] font-bold">{featuredSong.tempo} BPM</span>
                  <span aria-hidden="true">·</span>
                  <span>{featuredSong.tuning}</span>
                  <span aria-hidden="true">·</span>
                  <span>{featuredSong.measures} такта</span>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-mono font-bold text-white">{featuredSong.bestAccuracy}% рекордна точност</div>
                  <div className="text-[11px] font-mono text-[#586A7E]">{featuredSong.attempts} изсвирвания</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSong(featuredSong);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#00E5BE] text-[#070A10] font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-[#00E5BE]/25 hover:bg-[#00FAD0] transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Започни урок</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Category Filter Pills & Drag Drop */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all' as const, label: 'Всички песни' },
              { id: 'Beginner' as const, label: 'Начинаещи' },
              { id: 'Intermediate' as const, label: 'Средно ниво' },
              { id: 'Advanced' as const, label: 'Напреднали' },
              { id: 'imported' as const, label: `Guitar Pro (${importedSongs.length})` },
            ].map((cat) => {
              const active = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#00E5BE] text-[#070A10] shadow-sm shadow-[#00E5BE]/20'
                      : 'bg-[#0E1522] text-[#7E91A6] hover:text-white border border-[#1A2536]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111A27] hover:bg-[#162234] disabled:opacity-60 disabled:cursor-wait border border-[#202E42] text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            {isImporting ? (
              <LoaderCircle className="w-3.5 h-3.5 text-[#00E5BE] animate-spin" />
            ) : (
              <UploadCloud className="w-3.5 h-3.5 text-[#00E5BE]" />
            )}
            <span>{isImporting ? 'Импортира...' : 'Импорт на GP таблатура'}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".gp,.gpx,.gp3,.gp4,.gp5"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = '';
            }}
          />
        </div>

        {importError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 py-2.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#FCA5A5] text-xs font-semibold"
          >
            {importError}
          </motion.div>
        )}

        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="px-4 py-3 rounded-xl bg-[#00E5BE]/10 border border-[#00E5BE]/35 text-[#BFFEF2] text-xs font-semibold flex items-center gap-2"
            >
              <UploadCloud className="w-4 h-4 text-[#00E5BE]" />
              <span>Пусни Guitar Pro файла тук, за да го анализирам.</span>
            </motion.div>
          )}
        </AnimatePresence>

        {importedSongs.length > 0 && (
          <div className="flex items-center gap-2 pt-2 text-xs font-bold text-[#00E5BE]">
            <FileMusic className="w-4 h-4" />
            <span>Импортирани таблатури ({importedSongs.length})</span>
          </div>
        )}

        {/* Songs List with Framer Motion Stagger */}
        <div className="space-y-2">
          {filteredSongs.map((song, idx) => {
            const isSelected = idx === selectedIndex;
            const diffColor = getDifficultyColor(song.difficulty);

            return (
              <motion.div
                key={song.id}
                id={`song-card-${song.id}`}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: idx * 0.02 }}
                onClick={() => {
                  setSelectedIndex(idx);
                  onSelectSong(song);
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? 'bg-[#101724] border-[#00E5BE]/60 shadow-lg shadow-black/40'
                    : 'bg-[#0A0F18] border-[#182333] hover:border-[#223146] hover:bg-[#0D1420]'
                }`}
              >
                {/* Left: Play Icon & Song Details */}
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-[#00E5BE] text-[#070A10] shadow-sm shadow-[#00E5BE]/30'
                        : 'bg-[#131C2A] text-[#71849A]'
                    }`}
                  >
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>

                  <div>
                    <h3 className={`text-sm font-bold tracking-tight ${isSelected ? 'text-white' : 'text-[#DDE4EE]'}`}>
                      {song.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-[#71849A] mt-0.5">
                      <span className="text-white font-medium">{song.artist}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-[#00E5BE] font-semibold">{song.tempo} BPM</span>
                      <span aria-hidden="true">·</span>
                      <span>{song.tuning}</span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-semibold ${diffColor}`}>{song.difficulty}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Accuracy & Action Button */}
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs font-bold text-white flex items-center gap-1 justify-end font-mono tabular-nums">
                      <Award className="w-3.5 h-3.5 text-[#F59E0B]" />
                      <span>{song.bestAccuracy}% точност</span>
                    </div>
                    <div className="text-[11px] text-[#55677B] font-mono tabular-nums">{song.attempts} изсвирвания</div>
                  </div>

                  {isSelected && (
                    <motion.button
                      id={`btn-play-song-${song.id}`}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSong(song);
                      }}
                      className="bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#070A10] text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm shadow-[#00E5BE]/30 transition-colors cursor-pointer"
                    >
                      Свири сега
                    </motion.button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>

      {/* Clean Footer Navigation Hints */}
      <footer id="menu-footer" className="h-11 bg-[#090E17] border-t border-[#182436] px-8 flex items-center justify-between shrink-0 text-xs text-[#63768D] font-mono">
        <div className="flex items-center gap-2">
          <span>Сцена за интерактивна китарна таблатура</span>
        </div>

        <div className="flex items-center gap-4">
          <span><kbd className="px-1.5 py-0.5 bg-[#111824] border border-[#202E42] rounded text-white">Enter</kbd> Избери</span>
          <span><kbd className="px-1.5 py-0.5 bg-[#111824] border border-[#202E42] rounded text-white">Esc</kbd> Назад към сцената</span>
        </div>
      </footer>
    </div>
  );
};

import React, { useRef, useState } from 'react';
import { Search, Play, ArrowLeft, Award, UploadCloud, FileMusic, LoaderCircle, Clock, Gauge, Music2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImportedSong, SongMetadata } from '../types';
import { importGuitarProFile, isSupportedGuitarProFile } from '../utils/guitarProImporter';

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
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Beginner' | 'Intermediate' | 'Advanced' | 'imported'>('all');
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

  const featuredSong = importedSongs[0] ?? allSongs[0];

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'Beginner':
        return 'text-emerald-300';
      case 'Intermediate':
        return 'text-cyan-300';
      case 'Advanced':
        return 'text-amber-300';
      default:
        return 'text-slate-300';
    }
  };

  const getDifficultyBg = (diff: string) => {
    switch (diff) {
      case 'Beginner':
        return 'bg-emerald-400/10 border-emerald-300/20';
      case 'Intermediate':
        return 'bg-cyan-400/10 border-cyan-300/20';
      case 'Advanced':
        return 'bg-amber-400/10 border-amber-300/20';
      default:
        return 'bg-white/5 border-white/10';
    }
  };

  const isImported = (song: SongMetadata) => importedSongs.some((imp) => imp.id === song.id);

  return (
    <div
      id="guitar-trainer-menu"
      className={`flex h-full flex-col overflow-hidden bg-[#020409] text-slate-100 select-none ${
        isDragging ? 'ring-2 ring-inset ring-cyan-300' : ''
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

      <header className="shrink-0 border-b border-white/5 bg-[#020409]/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <motion.button
              id="btn-back-to-stage"
              whileTap={{ scale: 0.94 }}
              onClick={onBackToStage}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-400 transition-colors hover:border-white/20 hover:text-white"
              title="Върни се към сцената за свирене"
            >
              <ArrowLeft className="h-4 w-4" />
            </motion.button>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300/80">GuitarCoach</p>
              <h1 className="truncate text-lg font-black tracking-tight text-white md:text-xl">Choose your session</h1>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <div className="relative hidden w-56 sm:block lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                id="song-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search songs"
                className="h-9 w-full rounded-full border border-white/10 bg-white/[0.04] pl-9 pr-3 text-xs font-semibold text-white placeholder:text-slate-600 focus:border-cyan-300/60 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex h-9 items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 transition-colors hover:bg-cyan-300/15 disabled:cursor-wait disabled:opacity-60"
            >
              {isImporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              <span className="hidden sm:inline">{isImporting ? 'Importing' : 'Import GP'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
            <motion.button
              type="button"
              whileTap={{ scale: 0.99 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className={`group relative min-h-[250px] overflow-hidden rounded-2xl border p-6 text-left transition-all ${
                isDragging
                  ? 'border-cyan-200 bg-cyan-300/15 shadow-2xl shadow-cyan-300/10'
                  : 'border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.14),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] hover:border-cyan-300/40'
              }`}
            >
              <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
              <div className="relative flex h-full flex-col justify-between gap-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-300 text-[#020409] shadow-xl shadow-cyan-300/20">
                    {isImporting ? <LoaderCircle className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                    .gp .gpx .gp3 .gp4 .gp5
                  </span>
                </div>

                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.26em] text-cyan-200/80">Drop zone</p>
                  <h2 className="max-w-xl text-4xl font-black leading-none tracking-tight text-white md:text-5xl">
                    Drop a Guitar Pro file.
                  </h2>
                  <p className="mt-4 max-w-lg text-sm font-medium leading-6 text-slate-400">
                    Ще го превърнем в playable таблатура с карта на техниките, трудностите и упражненията.
                  </p>
                </div>
              </div>
            </motion.button>

            {featuredSong && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative min-h-[250px] overflow-hidden rounded-2xl border border-white/10 bg-[#070b13] p-6"
              >
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-cyan-300/10 to-transparent" />
                <div className="relative flex h-full flex-col justify-between gap-8">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                      {isImported(featuredSong) ? 'Latest import' : 'Continue'}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${getDifficultyBg(featuredSong.difficulty)} ${getDifficultyColor(featuredSong.difficulty)}`}>
                      {featuredSong.difficulty}
                    </span>
                  </div>

                  <div>
                    <h2 className="text-3xl font-black leading-tight tracking-tight text-white">{featuredSong.title}</h2>
                    <p className="mt-1 text-sm font-bold text-slate-400">{featuredSong.artist}</p>
                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                        <Clock className="mb-2 h-4 w-4 text-cyan-300" />
                        <p className="font-mono text-sm font-black text-white">{featuredSong.tempo}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">BPM</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                        <Music2 className="mb-2 h-4 w-4 text-cyan-300" />
                        <p className="font-mono text-sm font-black text-white">{featuredSong.measures}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">bars</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                        <Award className="mb-2 h-4 w-4 text-amber-300" />
                        <p className="font-mono text-sm font-black text-white">{featuredSong.bestAccuracy}%</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">best</p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectSong(featuredSong)}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 font-black text-[#020409] shadow-xl shadow-cyan-300/15 transition-colors hover:bg-cyan-200"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Play session
                  </button>
                </div>
              </motion.div>
            )}
          </section>

          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-3 text-xs font-bold text-cyan-100"
              >
                Пусни файла където и да е върху менюто.
              </motion.div>
            )}
          </AnimatePresence>

          {importError && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-200"
            >
              {importError}
            </motion.div>
          )}

          <section className="flex flex-col gap-3 border-y border-white/5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'all' as const, label: 'All' },
                { id: 'Beginner' as const, label: 'Beginner' },
                { id: 'Intermediate' as const, label: 'Intermediate' },
                { id: 'Advanced' as const, label: 'Advanced' },
                { id: 'imported' as const, label: `Imported ${importedSongs.length}` },
              ].map((cat) => {
                const active = categoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`rounded-full px-4 py-2 text-xs font-black transition-colors ${
                      active ? 'bg-white text-[#020409]' : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              {(
                [
                  { id: 'name', label: 'Name' },
                  { id: 'tempo', label: 'BPM' },
                  { id: 'accuracy', label: 'Best' },
                ] as const
              ).map((mode) => {
                const active = sortMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setSortMode(mode.id)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-black transition-colors ${
                      active ? 'bg-cyan-300 text-[#020409]' : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredSongs.map((song, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <motion.button
                  key={song.id}
                  id={`song-card-${song.id}`}
                  type="button"
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: idx * 0.02 }}
                  onClick={() => {
                    setSelectedIndex(idx);
                    onSelectSong(song);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`group min-h-[172px] rounded-2xl border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-cyan-300/45 bg-cyan-300/[0.08] shadow-xl shadow-cyan-300/[0.04]'
                      : 'border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.055]'
                  }`}
                >
                  <div className="flex h-full flex-col justify-between gap-5">
                    <div>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${getDifficultyBg(song.difficulty)} ${getDifficultyColor(song.difficulty)}`}>
                          {song.difficulty}
                        </span>
                        {isImported(song) && (
                          <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-cyan-200">
                            <FileMusic className="h-3.5 w-3.5" />
                            GP
                          </span>
                        )}
                      </div>
                      <h3 className="line-clamp-2 text-xl font-black leading-tight tracking-tight text-white">{song.title}</h3>
                      <p className="mt-1 truncate text-sm font-bold text-slate-500">{song.artist}</p>
                    </div>

                    <div className="flex items-end justify-between gap-3">
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="font-mono font-black text-white">{song.tempo}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">BPM</p>
                        </div>
                        <div>
                          <p className="font-mono font-black text-white">{song.measures}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">bars</p>
                        </div>
                        <div>
                          <p className="font-mono font-black text-white">{song.bestAccuracy}%</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">best</p>
                        </div>
                      </div>

                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                        isSelected ? 'bg-cyan-300 text-[#020409]' : 'bg-white/[0.06] text-slate-500 group-hover:text-white'
                      }`}>
                        <Play className="h-4 w-4 fill-current" />
                      </span>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </section>

          {filteredSongs.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
              <Gauge className="mx-auto mb-3 h-8 w-8 text-slate-600" />
              <p className="text-sm font-black text-white">Няма намерени таблатури.</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Опитайте друго търсене или пуснете Guitar Pro файл.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

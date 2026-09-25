import React, { useState } from 'react';
import { Mic, MicOff, Volume2, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface StudioTunerProps {
  currentPitch: string;
  frequencyHz: number;
  centsOffset: number;
  inTune: boolean;
  isListening: boolean;
  volumeRms: number;
  onToggleMic: () => void;
  onClose?: () => void;
}

const PRESET_TUNINGS = [
  { id: 'standard', name: 'Standard E', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'drop_d', name: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'half_step', name: 'Eb / Half-Step Down', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
  { id: 'd_standard', name: 'D Standard', notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
  { id: 'open_g', name: 'Open G', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
  { id: 'dadgad', name: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
];

export const StudioTuner: React.FC<StudioTunerProps> = ({
  currentPitch,
  frequencyHz,
  centsOffset,
  inTune,
  isListening,
  volumeRms,
  onToggleMic,
}) => {
  const [selectedTuning, setSelectedTuning] = useState('standard');
  const clampedCents = Math.max(-50, Math.min(50, centsOffset));
  const isSignalActive = isListening && frequencyHz > 0;
  const activePreset = PRESET_TUNINGS.find((p) => p.id === selectedTuning) || PRESET_TUNINGS[0];

  return (
    <div id="studio-tuner-full-view" className="h-full w-full overflow-y-auto bg-[#070A10] text-[#E2E8F0] p-6 lg:p-10 select-none flex flex-col justify-center items-center">
      <div className="max-w-xl w-full bg-[#090E17] border border-[#182538] rounded-3xl p-8 shadow-2xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#141F30] pb-5">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#00E5BE] font-bold">
              PRECISION STROBE ENGINE
            </div>
            <h2 className="text-xl font-extrabold text-white mt-0.5">Студиен китарен тунер</h2>
          </div>

          {/* Tuning Preset Selector */}
          <div className="relative">
            <select
              value={selectedTuning}
              onChange={(e) => setSelectedTuning(e.target.value)}
              className="bg-[#0F1626] border border-[#202E44] rounded-xl px-3 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-[#00E5BE] cursor-pointer"
            >
              {PRESET_TUNINGS.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0B101C]">
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Big Strobe Pitch Display */}
        <div className="flex flex-col items-center justify-center py-4">
          <div className="relative flex items-center justify-center">
            {/* Ambient radial aura */}
            <div
              className={`absolute w-44 h-44 rounded-full blur-3xl transition-all duration-300 ${
                inTune && isSignalActive
                  ? 'bg-[#00E5BE]/25'
                  : isSignalActive
                  ? 'bg-[#F59E0B]/15'
                  : 'bg-transparent'
              }`}
            />

            <div
              className={`w-36 h-36 rounded-full border-4 flex flex-col items-center justify-center relative z-10 transition-colors duration-200 ${
                inTune && isSignalActive
                  ? 'border-[#00E5BE] bg-[#00E5BE]/10 shadow-[0_0_30px_rgba(0,229,190,0.3)]'
                  : isSignalActive
                  ? 'border-[#F59E0B] bg-[#F59E0B]/10'
                  : 'border-[#1C2B3E] bg-[#0B101A]'
              }`}
            >
              <span className="text-5xl font-black font-mono text-white tracking-tighter">
                {isListening ? (frequencyHz > 0 ? currentPitch : '---') : 'OFF'}
              </span>
              <span className="text-xs font-mono text-[#8293A7] mt-1 tabular-nums">
                {isSignalActive ? `${frequencyHz.toFixed(1)} Hz` : 'Изчаква сигнал'}
              </span>
            </div>
          </div>

          {/* Cents indicator badge */}
          <div className="mt-4 flex items-center gap-2">
            {inTune && isSignalActive && (
              <CheckCircle2 className="w-4 h-4 text-[#00E5BE] animate-bounce" />
            )}
            <span
              className={`font-mono font-bold text-sm tabular-nums ${
                inTune && isSignalActive
                  ? 'text-[#00E5BE]'
                  : isSignalActive
                  ? Math.abs(centsOffset) < 15
                    ? 'text-[#F59E0B]'
                    : 'text-[#EF4444]'
                  : 'text-[#56687D]'
              }`}
            >
              {isSignalActive ? (centsOffset > 0 ? `+${centsOffset} цента` : `${centsOffset} цента`) : '0 цента'}
            </span>
          </div>
        </div>

        {/* Circular / Linear Cents Scale */}
        <div className="space-y-2">
          <div className="flex justify-between text-[11px] font-mono text-[#63768D]">
            <span>-50c (Ниско)</span>
            <span className="text-[#00E5BE] font-bold">Идеално (0c)</span>
            <span>+50c (Високо)</span>
          </div>

          <div className="w-full h-3.5 bg-[#0C121E] border border-[#1F2C40] rounded-full relative overflow-hidden flex items-center px-1">
            <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-[#00E5BE] -translate-x-1/2 z-10 shadow-[0_0_8px_#00E5BE]" />
            <motion.div
              className={`h-2 rounded-full transition-colors ${
                inTune && isSignalActive
                  ? 'w-4 bg-[#00E5BE] shadow-[0_0_12px_#00E5BE]'
                  : isSignalActive
                  ? 'w-3.5 bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]'
                  : 'w-2 bg-[#2D3E54]'
              }`}
              animate={{
                left: isSignalActive ? `${50 + (clampedCents / 50) * 45}%` : '50%',
              }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              style={{ position: 'absolute', transform: 'translateX(-50%)' }}
            />
          </div>
        </div>

        {/* String Reference Buttons for Chosen Preset */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[#63768D]">
            <span>Целеви тонове за настройка:</span>
            <span className="text-[10px] font-mono text-[#4A5D73]">Кликнете за преглед</span>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {activePreset.notes.map((noteName, idx) => {
              const stringNum = 6 - idx;
              const isMatch = isSignalActive && currentPitch.toUpperCase() === noteName.replace(/[0-9]/g, '').toUpperCase();
              return (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all ${
                    isMatch
                      ? 'bg-[#00E5BE]/20 border-[#00E5BE] text-white shadow-md shadow-[#00E5BE]/30 scale-105'
                      : 'bg-[#0C1320] border-[#1C2A3D] text-[#8EA0B8]'
                  }`}
                >
                  <span className="text-[10px] font-mono text-[#54687F] font-bold">s{stringNum}</span>
                  <span className="text-sm font-bold font-mono text-white mt-0.5">{noteName}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 flex items-center justify-between border-t border-[#141F30]">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-[#00E5BE]" />
            <span className="text-xs text-[#71849A]">Входящо ниво: {(volumeRms * 100).toFixed(0)}%</span>
          </div>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onToggleMic}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              isListening
                ? 'bg-[#00E5BE] text-[#070A10] shadow-md shadow-[#00E5BE]/30'
                : 'bg-[#141C2A] text-white hover:bg-[#1E2B3E] border border-[#25364C]'
            }`}
          >
            {isListening ? (
              <>
                <Mic className="w-3.5 h-3.5" />
                <span>Микрофонът работи</span>
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5 text-[#EF4444]" />
                <span>Включи микрофона</span>
              </>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
};

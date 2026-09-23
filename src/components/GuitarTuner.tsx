import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import { motion } from 'framer-motion';

interface GuitarTunerProps {
  currentPitch: string;
  frequencyHz: number;
  centsOffset: number;
  inTune: boolean;
  isListening: boolean;
  volumeRms: number;
  onToggleMic: () => void;
}

export const GuitarTuner: React.FC<GuitarTunerProps> = ({
  currentPitch,
  frequencyHz,
  centsOffset,
  inTune,
  isListening,
  volumeRms,
  onToggleMic,
}) => {
  const isSignalActive = isListening && frequencyHz > 0;
  const clampedCents = Math.max(-50, Math.min(50, centsOffset));
  const needlePercent = 50 + (clampedCents / 50) * 44;

  return (
    <div
      id="guitar-tuner-widget"
      className="bg-[#0A0F18] border border-[#1A2638] rounded-xl px-3 py-1.5 flex items-center gap-3.5 shadow-lg shadow-black/40 select-none"
    >
      {/* Mic Toggle Button */}
      <motion.button
        id="btn-toggle-microphone"
        whileTap={{ scale: 0.95 }}
        onClick={onToggleMic}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
          isListening
            ? 'bg-[#00E5BE]/10 text-[#00E5BE] border-[#00E5BE]/40 shadow-sm shadow-[#00E5BE]/20 hover:bg-[#00E5BE]/15'
            : 'bg-[#121926] text-[#7A8C9E] border-[#202E42] hover:text-white hover:border-[#314560]'
        }`}
        title={isListening ? 'Микрофонът слуша на живо' : 'Включете микрофона'}
      >
        {isListening ? (
          <>
            <div className="relative flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-[#00E5BE]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#00E5BE] absolute -top-0.5 -right-0.5 animate-ping" />
            </div>
            <span className="text-[11px] font-mono font-bold tracking-tight">MIC ON</span>
          </>
        ) : (
          <>
            <MicOff className="w-3.5 h-3.5 text-[#EF4444]" />
            <span className="text-[11px] font-mono font-bold tracking-tight text-[#EF4444]">MIC OFF</span>
          </>
        )}
      </motion.button>

      {/* Note Name & Frequency */}
      <div className="flex items-center gap-2.5 border-l border-[#1A2638] pl-3.5">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[#56687D] font-mono font-semibold">Pitch</span>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-base font-extrabold leading-none font-mono tabular-nums ${
                isSignalActive ? (inTune ? 'text-[#00E5BE]' : 'text-white') : 'text-[#47576B]'
              }`}
            >
              {isListening ? (frequencyHz > 0 ? currentPitch : '---') : 'OFF'}
            </span>
            <span className="text-[10px] font-mono text-[#63768D] tabular-nums">
              {isSignalActive ? `${frequencyHz.toFixed(1)}Hz` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Cents Meter Needle Gauge */}
      <div className="flex flex-col items-center px-1">
        <div className="flex items-center justify-between w-28 text-[9px] font-mono text-[#56687D] leading-none mb-1 tabular-nums">
          <span>-50</span>
          <span
            className={`font-bold ${
              isSignalActive
                ? inTune
                  ? 'text-[#00E5BE]'
                  : Math.abs(centsOffset) < 20
                  ? 'text-[#F59E0B]'
                  : 'text-[#EF4444]'
                : 'text-[#425265]'
            }`}
          >
            {isSignalActive ? (centsOffset > 0 ? `+${centsOffset}c` : `${centsOffset}c`) : '0c'}
          </span>
          <span>+50</span>
        </div>

        {/* Gauge Track */}
        <div className="w-28 h-2 bg-[#0E1522] border border-[#1E2B3E] rounded-full relative overflow-hidden flex items-center">
          {/* Center Target Mark */}
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-[#00E5BE] -translate-x-1/2 z-10 shadow-[0_0_4px_#00E5BE]" />
          {/* Intermediate Guideline Ticks */}
          <div className="absolute left-1/4 top-0.5 bottom-0.5 w-px bg-[#202E42]" />
          <div className="absolute left-3/4 top-0.5 bottom-0.5 w-px bg-[#202E42]" />

          {/* Smooth Tuning Needle */}
          <motion.div
            className={`absolute top-0 bottom-0 w-2 rounded-full shadow-sm ${
              inTune && isSignalActive
                ? 'bg-[#00E5BE] shadow-[0_0_8px_#00E5BE]'
                : isSignalActive
                ? 'bg-[#F59E0B] shadow-[0_0_6px_#F59E0B]'
                : 'bg-[#2A3B52]'
            }`}
            animate={{
              left: isSignalActive ? `${needlePercent}%` : '50%',
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            style={{ transform: 'translateX(-50%)' }}
          />
        </div>
      </div>

      {/* Real-Time VU Meter & Status */}
      <div className="flex items-center gap-3 pl-3 border-l border-[#1A2638]">
        <div className="flex flex-col items-center" title={`Входящ сигнал: ${(volumeRms * 100).toFixed(0)}%`}>
          <div className="flex items-end gap-0.5 h-3.5 w-7">
            {[0.003, 0.012, 0.025, 0.05, 0.085].map((threshold, idx) => {
              const active = isListening && volumeRms >= threshold;
              return (
                <div
                  key={idx}
                  className={`w-1 rounded-sm transition-all duration-75 ${
                    active
                      ? idx === 4
                        ? 'bg-[#EF4444] h-3.5 shadow-[0_0_4px_#EF4444]'
                        : idx >= 3
                        ? 'bg-[#F59E0B] h-3 shadow-[0_0_4px_#F59E0B]'
                        : idx >= 2
                        ? 'bg-[#00E5BE] h-2.5 shadow-[0_0_4px_#00E5BE]'
                        : 'bg-[#00E5BE]/80 h-1.5'
                      : 'bg-[#151F2E] h-1'
                  }`}
                />
              );
            })}
          </div>
          <span className="text-[7px] text-[#556982] uppercase font-mono font-semibold tracking-wider mt-0.5">VU</span>
        </div>

        <span
          className={`text-[10px] font-mono font-bold tracking-tight px-2 py-0.5 rounded-md ${
            !isListening
              ? 'text-[#5A6C82] bg-[#101724]'
              : inTune && isSignalActive
              ? 'text-[#00E5BE] bg-[#00E5BE]/10 border border-[#00E5BE]/30'
              : isSignalActive
              ? 'text-[#F59E0B] bg-[#F59E0B]/10'
              : 'text-[#63768D]'
          }`}
        >
          {!isListening ? 'STANDBY' : inTune && isSignalActive ? 'IN TUNE' : isSignalActive ? 'TUNING' : 'IDLE'}
        </span>
      </div>
    </div>
  );
};

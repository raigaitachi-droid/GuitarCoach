import React from 'react';
import { Mic, MicOff } from 'lucide-react';

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

  return (
    <div
      id="guitar-tuner-widget"
      className="bg-[#0A0E17] border border-[#1E2B3E] rounded-2xl px-3.5 py-2 flex items-center space-x-3.5 shadow-xl shadow-black/40 select-none backdrop-blur-sm"
    >
      {/* Mic toggle button & status */}
      <button
        id="btn-toggle-microphone"
        onClick={onToggleMic}
        className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer active:scale-95 ${
          isListening
            ? 'bg-[#00E5BE]/10 text-[#00E5BE] border-[#00E5BE]/40 shadow-[0_0_12px_rgba(0,229,190,0.18)] hover:bg-[#00E5BE]/20'
            : 'bg-[#151D2A] text-[#8699B0] border-[#253448] hover:text-white hover:border-[#384D6A]'
        }`}
        title={isListening ? 'Микрофонът слуша на живо (кликнете за изключване)' : 'Кликнете, за да включите микрофона'}
      >
        {isListening ? (
          <>
            <div className="relative flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-[#00E5BE]" />
              <span className="w-2 h-2 rounded-full bg-[#00E5BE] absolute -top-0.5 -right-0.5 animate-ping opacity-75" />
            </div>
            <span className="text-[10px] tracking-wider uppercase font-black">MIC: ON</span>
          </>
        ) : (
          <>
            <MicOff className="w-3.5 h-3.5 text-[#FF5E7E]" />
            <span className="text-[10px] tracking-wider uppercase font-black text-[#FF5E7E]">MIC: OFF</span>
          </>
        )}
      </button>

      {/* Note Name & Frequency Display */}
      <div className="flex items-center space-x-2.5 border-l border-[#1A2536] pl-3.5">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[#63768D] font-bold">TUNER</span>
          <div className="flex items-baseline space-x-1.5">
            <span className={`text-base font-black leading-none font-mono ${
              isSignalActive ? (inTune ? 'text-[#00E5BE]' : 'text-white') : 'text-[#47576B]'
            }`}>
              {isListening ? (frequencyHz > 0 ? currentPitch : '---') : 'OFF'}
            </span>
            <span className="text-[10px] font-mono text-[#768AA0]">
              {isSignalActive ? `${frequencyHz.toFixed(1)}Hz` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Cents Meter Needle Gauge */}
      <div className="flex flex-col items-center px-1">
        <div className="flex items-center justify-between w-28 text-[9px] font-mono text-[#6C8097] leading-none mb-1">
          <span>-50</span>
          <span className={`font-bold ${
            isSignalActive
              ? inTune
                ? 'text-[#00E5BE]'
                : Math.abs(centsOffset) < 25
                ? 'text-[#FFD32A]'
                : 'text-[#FF5E7E]'
              : 'text-[#48596E]'
          }`}>
            {isSignalActive ? (centsOffset > 0 ? `+${centsOffset}c` : `${centsOffset}c`) : '0'}
          </span>
          <span>+50</span>
        </div>

        {/* Needle Gauge Bar */}
        <div className="w-28 h-2 bg-[#121924] border border-[#1E2C3F] rounded-full relative overflow-hidden flex items-center shadow-inner">
          {/* Tick center mark */}
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-[#00E5BE] -translate-x-1/2 z-10 shadow-[0_0_4px_#00E5BE]" />
          
          {/* Subtle 5-tick scale */}
          <div className="absolute left-1/4 top-0.5 bottom-0.5 w-px bg-[#26354A]" />
          <div className="absolute left-3/4 top-0.5 bottom-0.5 w-px bg-[#26354A]" />

          {/* Glowing Tuning Needle */}
          <div
            className={`absolute top-0 bottom-0 w-2.5 rounded-full transition-all duration-75 shadow-md ${
              inTune && isSignalActive
                ? 'bg-[#00E5BE] shadow-[0_0_8px_#00E5BE]'
                : isSignalActive
                ? 'bg-[#FFD32A] shadow-[0_0_8px_#FFD32A]'
                : 'bg-[#31435B]'
            }`}
            style={{
              left: isSignalActive
                ? `calc(50% + ${(Math.max(-50, Math.min(50, centsOffset)) / 50) * 44}%)`
                : '50%',
              transform: 'translateX(-50%)',
            }}
          />
        </div>
      </div>

      {/* Tuner Status Pill & Real-Time Audio Level Meter */}
      <div className="flex items-center space-x-2.5 pl-3 border-l border-[#1A2536]">
        {/* Real-time 5-Segment Mic Signal VU Meter */}
        <div className="flex flex-col items-center" title={`Входящ сигнал: ${(volumeRms * 100).toFixed(0)}%`}>
          <div className="flex items-end space-x-0.5 h-4 w-7">
            {[0.003, 0.012, 0.028, 0.055, 0.09].map((threshold, idx) => (
              <div
                key={idx}
                className={`w-1 rounded-sm transition-all duration-75 ${
                  isListening && volumeRms >= threshold
                    ? idx === 4
                      ? 'bg-[#FF5E7E] h-4 shadow-[0_0_6px_#FF5E7E]'
                    : idx >= 3
                      ? 'bg-[#FFD32A] h-3.5 shadow-[0_0_4px_#FFD32A]'
                    : idx >= 2
                      ? 'bg-[#00E5BE] h-2.5 shadow-[0_0_4px_#00E5BE]'
                    : 'bg-[#00E5BE]/80 h-1.5'
                    : 'bg-[#151D2A] h-1'
                }`}
              />
            ))}
          </div>
          <span className="text-[7px] text-[#556982] uppercase font-mono font-bold tracking-wider mt-0.5">LEVEL</span>
        </div>

        <span
          className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border transition ${
            !isListening
              ? 'bg-[#141B26] text-[#5A6C82] border-[#222E40]'
              : inTune && isSignalActive
              ? 'bg-[#00E5BE]/15 text-[#00E5BE] border-[#00E5BE]/40 shadow-[0_0_8px_rgba(0,229,190,0.2)]'
              : isSignalActive
              ? 'bg-[#FFD32A]/15 text-[#FFD32A] border-[#FFD32A]/30'
              : 'bg-[#141B26] text-[#71849C] border-[#202C3D]'
          }`}
        >
          {!isListening ? 'STANDBY' : inTune && isSignalActive ? 'IN TUNE' : isSignalActive ? 'TUNE' : 'WAIT'}
        </span>
      </div>
    </div>
  );
};

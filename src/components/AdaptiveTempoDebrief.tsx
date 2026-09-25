import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Bot,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  CheckCircle2,
  X,
  Gauge,
  Lightbulb,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { CoachEvaluation } from '../types';

interface AdaptiveTempoDebriefProps {
  isOpen: boolean;
  evaluation: CoachEvaluation | null;
  accuracy: number;
  stats: { hits: number; close: number; misses: number; streak: number };
  songTitle: string;
  onApplyTempo: (newTempo: number) => void;
  onKeepCurrentTempo: () => void;
  onOpenCoachChat: () => void;
  autoAdaptEnabled: boolean;
  onToggleAutoAdapt: (enabled: boolean) => void;
}

export const AdaptiveTempoDebrief: React.FC<AdaptiveTempoDebriefProps> = ({
  isOpen,
  evaluation,
  accuracy,
  stats,
  songTitle,
  onApplyTempo,
  onKeepCurrentTempo,
  onOpenCoachChat,
  autoAdaptEnabled,
  onToggleAutoAdapt,
}) => {
  if (!isOpen || !evaluation) return null;

  const isSpeedUp = evaluation.tempoChange > 0;
  const isSlowDown = evaluation.tempoChange < 0;

  return (
    <AnimatePresence>
      <div
        id="adaptive-tempo-modal-backdrop"
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      >
        <motion.div
          id="adaptive-tempo-debrief-card"
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ duration: 0.2 }}
          className="bg-[#0A0F1A] border border-[#1E2E47] rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 text-white relative overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Neon background ambient glow */}
          <div
            className="absolute -top-24 -right-24 w-60 h-60 rounded-full blur-3xl pointer-events-none opacity-25"
            style={{
              backgroundColor: isSpeedUp ? '#00E5BE' : isSlowDown ? '#F59E0B' : '#38BDF8',
            }}
          />

          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#18253A] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#00E5BE] to-[#00A88B] text-[#070B12] flex items-center justify-center shadow-lg shadow-[#00E5BE]/30">
                <Bot className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold tracking-tight">AI Coach: Анализ на свиренето</h3>
                  <span className="px-2 py-0.5 rounded-full bg-[#00E5BE]/10 border border-[#00E5BE]/30 text-[#00E5BE] text-[10px] font-mono font-bold">
                    POST-RUN
                  </span>
                </div>
                <p className="text-xs text-[#71859E]">
                  Песен: <span className="font-semibold text-white">{songTitle}</span>
                </p>
              </div>
            </div>

            <button
              onClick={onKeepCurrentTempo}
              className="w-8 h-8 rounded-xl bg-[#111A2B] hover:bg-[#18263D] text-[#788DA6] hover:text-white flex items-center justify-center transition-colors cursor-pointer text-xs font-bold"
              title="Затвори"
            >
              ✕
            </button>
          </div>

          {/* Performance Stats Pill Grid */}
          <div className="grid grid-cols-4 gap-2 text-center bg-[#070B14] p-3 rounded-2xl border border-[#162338]">
            <div>
              <span className="block text-[10px] text-[#61768F] font-mono uppercase">Точност</span>
              <span
                className={`text-lg font-black font-mono ${
                  accuracy >= 85 ? 'text-[#00E5BE]' : accuracy >= 65 ? 'text-[#F59E0B]' : 'text-[#EF4444]'
                }`}
              >
                {accuracy}%
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-[#61768F] font-mono uppercase">Уцелени</span>
              <span className="text-lg font-black font-mono text-white">{stats.hits}</span>
            </div>
            <div>
              <span className="block text-[10px] text-[#61768F] font-mono uppercase">Пропуснати</span>
              <span className="text-lg font-black font-mono text-[#EF4444]">{stats.misses}</span>
            </div>
            <div>
              <span className="block text-[10px] text-[#61768F] font-mono uppercase">Серия</span>
              <span className="text-lg font-black font-mono text-[#FFB142]">{stats.streak}x</span>
            </div>
          </div>

          {/* Adaptive Tempo Change Showcase Card */}
          <div className="bg-gradient-to-r from-[#0C1524] to-[#0E1B2E] border border-[#1F334E] rounded-2xl p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#7187A2] block font-medium">Предишно темпо</span>
              <span className="text-2xl font-black font-mono text-[#94A7BF]">
                {evaluation.previousTempo}%
              </span>
            </div>

            <div className="flex flex-col items-center px-3">
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono ${
                  isSpeedUp
                    ? 'bg-[#00E5BE]/15 text-[#00E5BE] border border-[#00E5BE]/40'
                    : isSlowDown
                    ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/40'
                    : 'bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/40'
                }`}
              >
                {isSpeedUp ? <TrendingUp className="w-3.5 h-3.5" /> : isSlowDown ? <TrendingDown className="w-3.5 h-3.5" /> : null}
                <span>
                  {isSpeedUp
                    ? `+${evaluation.tempoChange}% По-бързо`
                    : isSlowDown
                    ? `${evaluation.tempoChange}% По-бавно`
                    : 'Запазва темпо'}
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-[#495E78] mt-1" />
            </div>

            <div className="text-right">
              <span className="text-[11px] text-[#00E5BE] block font-bold">Адаптирано темпо</span>
              <span className="text-3xl font-black font-mono text-[#00E5BE] drop-shadow-[0_0_12px_#00E5BE88]">
                {evaluation.recommendedTempo}%
              </span>
            </div>
          </div>

          {/* AI Coach Feedback & Technique Advice */}
          <div className="space-y-2.5 bg-[#070C16] border border-[#162236] p-4 rounded-2xl text-xs leading-relaxed">
            <div className="flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-[#00E5BE] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-bold mb-0.5">Оценка на треньора:</strong>
                <p className="text-[#A2B5CC]">{evaluation.evaluation}</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 pt-2 border-t border-[#131E30]">
              <Lightbulb className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-bold mb-0.5">Съвет за техника:</strong>
                <p className="text-[#A2B5CC]">{evaluation.techniqueTip}</p>
              </div>
            </div>

            <p className="text-[11px] text-[#00E5BE] font-semibold italic pt-1">
              "{evaluation.encouragement}"
            </p>
          </div>

          {/* Auto-adapt checkbox setting */}
          <div className="flex items-center justify-between px-2 text-xs text-[#7187A2]">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoAdaptEnabled}
                onChange={(e) => onToggleAutoAdapt(e.target.checked)}
                className="w-4 h-4 accent-[#00E5BE] rounded cursor-pointer"
              />
              <span>Автоматично адаптирай темпото след всяко изсвирване</span>
            </label>

            <button
              onClick={onOpenCoachChat}
              className="text-[#00E5BE] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Попитай в чата</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={onKeepCurrentTempo}
              className="py-2.5 px-4 rounded-xl bg-[#121A2A] hover:bg-[#182337] border border-[#21324B] text-[#93A6BD] hover:text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Запази текущото ({evaluation.previousTempo}%)
            </button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onApplyTempo(evaluation.recommendedTempo)}
              className="py-2.5 px-4 rounded-xl bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#070B12] text-xs font-black shadow-lg shadow-[#00E5BE]/30 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Приложи {evaluation.recommendedTempo}% & Свири</span>
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

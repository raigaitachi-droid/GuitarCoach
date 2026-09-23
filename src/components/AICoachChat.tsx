import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Sparkles,
  Bot,
  User,
  RotateCcw,
  Gauge,
  Music,
  CheckCircle2,
  AlertCircle,
  Zap,
  TrendingUp,
  Sliders,
  Copy,
  Check,
} from 'lucide-react';
import { ChatMessage, SongMetadata } from '../types';

interface AICoachChatProps {
  currentSong?: SongMetadata | null;
  currentTempoPercent: number;
  lastAccuracy?: number | null;
  lastStats?: { hits: number; close: number; misses: number; streak: number } | null;
  onApplyRecommendedTempo?: (newTempoPercent: number) => void;
  isCompact?: boolean;
  onCloseCompact?: () => void;
}

const STORAGE_KEY = 'pickhero_coach_chat_history_v1';

const QUICK_PROMPTS = [
  '🎸 Как да изградя скорост без мускулно напрежение?',
  '⏱ Обясни защо адаптивното темпо след свирене е по-ефективно',
  '🎯 Анализирай последната ми точност и ми дай съвет за техника',
  '🖐 Как да държа перцето за по-бързо свирене на съседни струни?',
  '🎼 Какво темпо е най-добро за започване на тази песен?',
];

const INITIAL_WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome-1',
  role: 'model',
  content: `Здравей! Аз съм твоят **PickHero AI Guitar Coach** 🎸

Следя всяка изсвирена нота, твоята точност и ритмичност. След като изсвириш такт или цяла песен, анализирам представянето ти и **автоматично адаптирам темпото** (от 10% до над 200%), за да изградиш чиста мускулна памет без фалшиви тонове.

Попитай ме за китарни техники, табулатури, пръстовка или защо съм избрал конкретно темпо за теб!`,
  timestamp: Date.now(),
};

export const AICoachChat: React.FC<AICoachChatProps> = ({
  currentSong,
  currentTempoPercent,
  lastAccuracy,
  lastStats,
  onApplyRecommendedTempo,
  isCompact = false,
  onCloseCompact,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [INITIAL_WELCOME_MESSAGE];
  });

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'gemini-3.5-flash' | 'gemini-3.1-flash-lite'>('gemini-3.5-flash');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Save conversation history
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          model: selectedModel,
          context: {
            songTitle: currentSong?.title || 'Freestyle Practice',
            difficulty: currentSong?.difficulty || 'Medium',
            tuning: currentSong?.tuning || 'Standard E',
            bpm: currentSong?.tempo || 120,
            currentTempo: currentTempoPercent,
            lastAccuracy: lastAccuracy !== null && lastAccuracy !== undefined ? lastAccuracy : undefined,
            stats: lastStats || undefined,
          },
        }),
      });

      const data = await response.json();
      const replyContent = data.reply || data.fallback || 'AI треньорът анализира твоята сесия. Опитай отново.';

      const coachMessage: ChatMessage = {
        id: `coach-${Date.now()}`,
        role: 'model',
        content: replyContent,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, coachMessage]);
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'model',
        content: '🎸 В момента връзката с AI треньора е затруднена. Препоръчвам да направиш още един дубъл на текущото темпо, като се концентрираш върху точността на тоновете!',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Искате ли да изчистите историята на чата с треньора?')) {
      const reset = [INITIAL_WELCOME_MESSAGE];
      setMessages(reset);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reset));
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to detect if message suggests a tempo e.g. "темпо от 75%" or "темпо 85%"
  const extractSuggestedTempo = (content: string): number | null => {
    const match = content.match(/темпо(?:\s+от|\s+на|\s+към)?\s+(\d{2,3})%/i);
    if (match && match[1]) {
      const val = parseInt(match[1], 10);
      if (val >= 10 && val <= 250) return val;
    }
    return null;
  };

  return (
    <div
      id="ai-coach-chat-container"
      className={`flex flex-col h-full bg-[#070A10] text-[#E2E8F0] ${
        isCompact ? 'rounded-2xl border border-[#1C293D] shadow-2xl overflow-hidden' : 'w-full'
      }`}
    >
      {/* Header Bar */}
      <div className="bg-[#0A0F1A] border-b border-[#162338] px-5 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#00E5BE] to-[#00A88B] flex items-center justify-center text-[#070B12] shadow-md shadow-[#00E5BE]/30">
              <Bot className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#00E5BE] border-2 border-[#0A0F1A] animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">PickHero AI Guitar Coach</h2>
              <span className="px-2 py-0.5 rounded-md bg-[#00E5BE]/10 border border-[#00E5BE]/30 text-[#00E5BE] text-[10px] font-mono font-bold">
                ADAPTIVE
              </span>
            </div>
            <p className="text-[11px] text-[#71859D]">
              Персонален анализ на свиренето, темпото и китарната техника
            </p>
          </div>
        </div>

        {/* Model Switcher & Actions */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center bg-[#070D17] border border-[#1B293F] rounded-lg p-0.5 text-[11px] font-mono">
            <button
              onClick={() => setSelectedModel('gemini-3.5-flash')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                selectedModel === 'gemini-3.5-flash'
                  ? 'bg-[#152338] text-[#00E5BE] font-bold shadow-sm'
                  : 'text-[#6A7F97] hover:text-white'
              }`}
              title="Стандартен модел за задълбочени обяснения"
            >
              3.5 Flash
            </button>
            <button
              onClick={() => setSelectedModel('gemini-3.1-flash-lite')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                selectedModel === 'gemini-3.1-flash-lite'
                  ? 'bg-[#152338] text-[#00E5BE] font-bold shadow-sm'
                  : 'text-[#6A7F97] hover:text-white'
              }`}
              title="Бърз модел за светкавични съвети"
            >
              <Zap className="w-2.5 h-2.5" />
              <span>Lite</span>
            </button>
          </div>

          <button
            onClick={handleClearHistory}
            className="w-8 h-8 rounded-lg bg-[#0F1626] hover:bg-[#162136] text-[#71859D] hover:text-white border border-[#1A263A] flex items-center justify-center transition-colors cursor-pointer"
            title="Изчисти чата"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {isCompact && onCloseCompact && (
            <button
              onClick={onCloseCompact}
              className="w-8 h-8 rounded-lg bg-[#0F1626] hover:bg-[#162136] text-[#71859D] hover:text-white border border-[#1A263A] flex items-center justify-center transition-colors cursor-pointer font-bold text-sm"
              title="Затвори панела"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Live Session Context Pill Ribbon */}
      <div className="bg-[#080D17] border-b border-[#131D2E] px-5 py-2 flex items-center justify-between gap-3 text-xs overflow-x-auto shrink-0 scrollbar-none">
        <div className="flex items-center gap-2 shrink-0">
          <Music className="w-3.5 h-3.5 text-[#00E5BE]" />
          <span className="text-[#8EA2B9] text-[11px]">Текуща песен:</span>
          <span className="font-bold text-white text-[11px] truncate max-w-[140px]">
            {currentSong?.title || 'Freestyle'}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0D1626] border border-[#1B2B44]">
            <Gauge className="w-3 h-3 text-[#38BDF8]" />
            <span className="text-[#7A8FA7]">Темпо:</span>
            <span className="font-bold text-white">{currentTempoPercent}%</span>
            {currentSong?.tempo && (
              <span className="text-[#51647A] text-[10px]">
                ({Math.round((currentSong.tempo * currentTempoPercent) / 100)} BPM)
              </span>
            )}
          </div>

          {lastAccuracy !== null && lastAccuracy !== undefined && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0D1626] border border-[#1B2B44]">
              <TrendingUp className={`w-3 h-3 ${lastAccuracy >= 80 ? 'text-[#00E5BE]' : 'text-[#F59E0B]'}`} />
              <span className="text-[#7A8FA7]">Точност:</span>
              <span
                className={`font-bold ${
                  lastAccuracy >= 80 ? 'text-[#00E5BE]' : lastAccuracy >= 60 ? 'text-[#F59E0B]' : 'text-[#EF4444]'
                }`}
              >
                {lastAccuracy}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Message Thread */}
      <div
        id="coach-chat-message-thread"
        className="flex-1 overflow-y-auto px-5 py-4 space-y-4 select-text"
      >
        {messages.map((msg) => {
          const isCoach = msg.role === 'model';
          const suggestedTempo = isCoach ? extractSuggestedTempo(msg.content) : null;

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={`flex gap-3 ${isCoach ? 'justify-start' : 'justify-end'}`}
            >
              {isCoach && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#00E5BE] to-[#00A88B] flex items-center justify-center text-[#070B12] shadow-sm shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 stroke-[2.2]" />
                </div>
              )}

              <div className={`max-w-[85%] sm:max-w-[78%] flex flex-col ${isCoach ? 'items-start' : 'items-end'}`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-xs sm:text-[13px] leading-relaxed relative group shadow-md ${
                    isCoach
                      ? 'bg-[#0E1626] border border-[#1E2E47] text-[#E2E8F0]'
                      : 'bg-[#00E5BE] text-[#070B12] font-medium border border-[#00E5BE]'
                  }`}
                >
                  {/* Message Content with basic Markdown formatting */}
                  <div className="whitespace-pre-wrap space-y-1">
                    {msg.content.split('\n\n').map((paragraph, idx) => (
                      <p key={idx} className="break-words">
                        {paragraph.split('**').map((seg, i) =>
                          i % 2 === 1 ? (
                            <strong
                              key={i}
                              className={isCoach ? 'text-white font-bold' : 'text-[#070B12] font-black'}
                            >
                              {seg}
                            </strong>
                          ) : (
                            seg
                          )
                        )}
                      </p>
                    ))}
                  </div>

                  {/* If coach mentions a recommended tempo and callback exists */}
                  {isCoach && suggestedTempo && onApplyRecommendedTempo && (
                    <div className="mt-3 pt-2.5 border-t border-[#1C2C45] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-[#00E5BE] font-mono">
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Препоръчано темпо: {suggestedTempo}%</span>
                      </div>
                      <button
                        onClick={() => onApplyRecommendedTempo(suggestedTempo)}
                        className="px-2.5 py-1 rounded-lg bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#070B12] text-[11px] font-bold shadow-sm transition-colors cursor-pointer"
                      >
                        Приложи ({suggestedTempo}%)
                      </button>
                    </div>
                  )}

                  {/* Copy button */}
                  <button
                    onClick={() => handleCopyMessage(msg.id, msg.content)}
                    className="absolute -top-2 -right-2 p-1 rounded-md bg-[#090E18] border border-[#21324B] text-[#71859D] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-sm"
                    title="Копирай отговора"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3 h-3 text-[#00E5BE]" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>

                <span className="text-[10px] text-[#556980] mt-1 px-1 font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {!isCoach && (
                <div className="w-8 h-8 rounded-xl bg-[#162238] border border-[#233757] flex items-center justify-center text-[#A6BCD6] shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Typing Loading Indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#00E5BE] to-[#00A88B] flex items-center justify-center text-[#070B12] shadow-sm shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-[#0E1626] border border-[#1E2E47] rounded-2xl px-4 py-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00E5BE] animate-ping" />
              <span className="text-xs text-[#8FA5BF] font-mono">AI треньорът анализира тактовете...</span>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompt Chips */}
      <div className="px-4 py-2 bg-[#080D17] border-t border-[#131D2E] flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
        <span className="text-[10px] uppercase font-bold text-[#556980] shrink-0 font-mono">
          Съвет:
        </span>
        {QUICK_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            onClick={() => handleSendMessage(prompt)}
            disabled={isLoading}
            className="text-[11px] px-2.5 py-1 rounded-full bg-[#0D1524] hover:bg-[#152136] text-[#9FB3C9] hover:text-white border border-[#1D2C42] hover:border-[#00E5BE]/40 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Composer */}
      <div className="p-3 bg-[#0A0F1A] border-t border-[#162338] shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-end gap-2 bg-[#070A10] border border-[#1C2C45] focus-within:border-[#00E5BE]/70 rounded-2xl p-2 transition-all shadow-inner"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Попитай AI треньора за табулатура, темпо, грешки или техника..."
            disabled={isLoading}
            className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-[#51657D] outline-none resize-none px-2 py-1 max-h-24 overflow-y-auto"
          />

          <motion.button
            type="submit"
            whileTap={{ scale: 0.94 }}
            disabled={!inputText.trim() || isLoading}
            className="w-9 h-9 rounded-xl bg-[#00E5BE] hover:bg-[#00E5BE]/90 disabled:bg-[#121A28] text-[#070B12] disabled:text-[#45576E] flex items-center justify-center transition-colors cursor-pointer shrink-0 shadow-sm shadow-[#00E5BE]/20"
            title="Изпрати съобщение (Enter)"
          >
            <Send className="w-4 h-4 fill-current" />
          </motion.button>
        </form>
        <div className="flex items-center justify-between mt-1.5 px-2 text-[10px] text-[#4F637A] font-mono">
          <span>Натисни <kbd className="text-[#8DA3BD]">Enter</kbd> за изпращане, <kbd className="text-[#8DA3BD]">Shift+Enter</kbd> за нов ред</span>
          <span>Задвижван от Gemini 3</span>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Terminal, Copy, Check, FileCode, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

export const DesktopGuide: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const steps = [
    {
      title: '1. Изтегляне на промените от хранилището',
      desc: 'Всички файлове за десктоп симулатора се намират в клона на проекта.',
      cmd: 'git checkout main && git status',
    },
    {
      title: '2. Инсталиране на аудио зависимости (PyAudio, Pygame)',
      desc: 'Ако пускате модула локално на Python, уверете се че библиотеките са налични:',
      cmd: 'pip install -r requirements.txt',
    },
    {
      title: '3. Стартиране на Guitar Trainer локално',
      desc: 'Стартирайте аудио модула директно от главната директория:',
      cmd: 'python -m pickhero',
    },
    {
      title: '4. Компилиране на самостоятелен Windows .exe',
      desc: 'За създаване на самостоятелна програма без инсталиран Python:',
      cmd: 'build.bat',
    },
  ];

  return (
    <div id="desktop-guide-view" className="flex flex-col h-full bg-[#070A10] text-[#E2E8F0] p-8 overflow-y-auto font-sans">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#00E5BE] font-semibold">
            <Terminal className="w-3.5 h-3.5" />
            <span>Локално изпълнение на Python</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white mt-1">
            Инструкции за стартиране на десктоп версията
          </h2>
          <p className="text-sm text-[#8293A7] mt-1">
            Освен уеб сцената, можете да пуснете и оригиналния локален графичен двигател на Python + Pygame от папката <code className="text-[#00E5BE] font-mono text-xs">guitar-trainer/</code>:
          </p>
        </div>

        {/* Steps Cards with Framer Motion */}
        <div className="space-y-3">
          {steps.map((step, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-[#0B101A] border border-[#1A2536] rounded-xl p-4 shadow-sm"
            >
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[#00E5BE]/10 text-[#00E5BE] text-xs flex items-center justify-center font-mono font-bold">
                  {idx + 1}
                </span>
                <span>{step.title}</span>
              </h3>
              <p className="text-xs text-[#7A8EA8] mt-1 ml-7">{step.desc}</p>

              <div className="mt-2.5 ml-7 bg-[#070A10] border border-[#182335] rounded-lg p-2.5 flex items-center justify-between font-mono text-xs">
                <span className="text-[#00E5BE] select-all">{step.cmd}</span>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => copyToClipboard(step.cmd, idx)}
                  className="text-[#64748B] hover:text-white flex items-center gap-1.5 transition-colors ml-3 cursor-pointer"
                  title="Копирай командата"
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#10B981]" />
                      <span className="text-[11px] text-[#10B981] font-sans">Копирано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-sans">Копирай</span>
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* System Architecture Card */}
        <div className="bg-[#0B101A] border border-[#1A2536] rounded-xl p-4">
          <h4 className="text-xs font-semibold text-white flex items-center gap-2 mb-2">
            <FileCode className="w-4 h-4 text-[#00E5BE]" />
            <span>Архитектура на аудио и визуалните модули:</span>
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-[#8293A7]">
            <div className="bg-[#070A10] p-2.5 rounded-lg border border-[#141C2A]">
              <div className="font-mono text-[#00E5BE] font-bold">audio/detector.py</div>
              <div className="text-[11px] mt-0.5">YIN pitch detection алгоритъм за извличане на основна честота</div>
            </div>
            <div className="bg-[#070A10] p-2.5 rounded-lg border border-[#141C2A]">
              <div className="font-mono text-[#00E5BE] font-bold">ui/scrolling.py</div>
              <div className="text-[11px] mt-0.5">Рендиране на 6 струни с реалистични дебелини и времева линия</div>
            </div>
            <div className="bg-[#070A10] p-2.5 rounded-lg border border-[#141C2A]">
              <div className="font-mono text-[#00E5BE] font-bold">ui/feedback.py</div>
              <div className="text-[11px] mt-0.5">Оценка на тайминга с микросекундна прецизност и визуални ефекти</div>
            </div>
            <div className="bg-[#070A10] p-2.5 rounded-lg border border-[#141C2A]">
              <div className="font-mono text-[#00E5BE] font-bold">tabs/loader.py</div>
              <div className="text-[11px] mt-0.5">Парсване на таблатури и синхронизация по темпо</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

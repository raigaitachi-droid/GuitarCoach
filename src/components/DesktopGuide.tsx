import React, { useState } from 'react';
import { Terminal, Copy, Check, FileCode, Monitor, Laptop, Play, Info } from 'lucide-react';

export const DesktopGuide: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const steps = [
    {
      title: '1. Синхронизиране или изтегляне на промените от Git',
      desc: 'Всички нови файлове и промени по дизайна се намират в директорията на клона v7-arpeggio.',
      cmd: 'git checkout v7-arpeggio && git status',
    },
    {
      title: '2. Инсталиране на зависимости (Pygame, PyAudio и др.)',
      desc: 'Ако все още нямате инсталирани библиотеките за аудио и графичния интерфейс:',
      cmd: 'pip install -r requirements.txt',
    },
    {
      title: '3. Стартиране на Guitar Trainer локално на компютъра',
      desc: 'Стартирайте модула директно от главната директория с Python:',
      cmd: 'python -m pickhero',
    },
    {
      title: '4. (Опционално) Компилиране на самостоятелен Windows .exe',
      desc: 'Ако искате да направите готова десктоп програма (.exe) за Windows:',
      cmd: 'build.bat',
    },
  ];

  return (
    <div id="desktop-guide-view" className="flex flex-col h-full bg-[#0D1017] text-[#E2E8F0] p-8 overflow-y-auto font-sans">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        <div>
          <span className="text-[10px] tracking-wider font-semibold text-[#00E5BE] uppercase bg-[#00E5BE]/10 px-2.5 py-1 rounded-full border border-[#00E5BE]/30">
            DESKTOP PYTHON INSTRUCTIONS
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-white mt-2">
            Как да пуснете обновения дизайн локално на вашия компютър
          </h2>
          <p className="text-sm text-[#94A3B8] mt-1">
            Кодът е написан на Python + Pygame и се намира в папката <code className="text-[#00E5BE]">guitar-trainer/</code>. Ето лесните стъпки да го стартирате в пълен екран на вашия компютър:
          </p>
        </div>

        {/* Steps Cards */}
        <div className="space-y-4">
          {steps.map((step, idx) => (
            <div key={idx} className="bg-[#10151E] border border-[#222E3E] rounded-xl p-5 shadow-md">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-[#00E5BE]/20 text-[#00E5BE] text-xs flex items-center justify-center font-bold">
                  {idx + 1}
                </span>
                <span>{step.title}</span>
              </h3>
              <p className="text-xs text-[#8292A6] mt-1 ml-7">{step.desc}</p>

              <div className="mt-3 ml-7 bg-[#0A0D13] border border-[#1C2634] rounded-lg p-3 flex items-center justify-between font-mono text-xs">
                <span className="text-[#00E5BE] select-all">{step.cmd}</span>
                <button
                  onClick={() => copyToClipboard(step.cmd, idx)}
                  className="text-[#7F90A6] hover:text-white flex items-center space-x-1 transition ml-3"
                  title="Копирай командата"
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#2ED573]" />
                      <span className="text-[11px] text-[#2ED573]">Копирано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Копирай</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Modified Files Overview */}
        <div className="bg-[#121824] border border-[#233144] rounded-xl p-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#A0B0C4] flex items-center space-x-2 mb-3">
            <FileCode className="w-4 h-4 text-[#00E5BE]" />
            <span>Променени файлове в хранилището (Готови и валидирани с python -m py_compile):</span>
          </h4>
          <ul className="text-xs text-[#CBD5E1] space-y-1.5 list-disc list-inside">
            <li>
              <code className="text-[#00E5BE] font-mono">pickhero/ui/colors.py</code> – нова Studio Dark цветова схема, струнни оттенъци и контрасти
            </li>
            <li>
              <code className="text-[#00E5BE] font-mono">pickhero/ui/scrolling.py</code> – реалистични дебелини на струните, лазерна линия, заоблени ноти с прагче 0 като пръстен
            </li>
            <li>
              <code className="text-[#00E5BE] font-mono">pickhero/ui/feedback.py</code> – плаващ бадж с микро-метър за тайминг (+/- ms) и индикаторна игла
            </li>
            <li>
              <code className="text-[#00E5BE] font-mono">pickhero/ui/menu.py</code> – студийни карти за песните, статус за активен микрофон и клавишни команди
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Check, Sparkles, ShieldCheck, Zap, Music, Star, ArrowRight, Lock } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProSubscriptionProps {
  isPro: boolean;
  onUpgradePro: () => void;
  onClose: () => void;
}

export const ProSubscription: React.FC<ProSubscriptionProps> = ({
  isPro,
  onUpgradePro,
  onClose,
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const handleSubscribe = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onUpgradePro();
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    }, 800);
  };

  const proFeatures = [
    {
      title: 'Неограничен Guitar Pro импорт',
      description: 'Качвайте всякакви .gp, .gpx, .gp3, .gp4 и .gp5 файлове без лимит.',
      icon: Music,
    },
    {
      title: 'AI Pitch анализ с 0ms закъснение',
      description: 'Микрофонен филтър с автокорекция за електрическа и акустична китара.',
      icon: Zap,
    },
    {
      title: 'Интелигентен режим "Изчакай ме"',
      description: 'Песента спира и чака, докато не изсвирите правилната струна и праг.',
      icon: Sparkles,
    },
    {
      title: 'Промяна на темпото без разстройване',
      description: 'Забавяйте трудни сола до 25% скорост със запазване на точната височина.',
      icon: Star,
    },
  ];

  return (
    <div id="pro-subscription-view" className="h-full w-full overflow-y-auto bg-[#070A10] text-[#E2E8F0] p-6 lg:p-10 select-none">
      <div className="max-w-4xl mx-auto space-y-10">
        {/* Header Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00E5BE]/10 border border-[#00E5BE]/30 text-[#00E5BE] text-xs font-mono font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>PICKHERO PRO MEMBERSHIP</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
            Овладейте китарата с професионално студио
          </h1>
          <p className="text-sm text-[#8293A7] max-w-xl mx-auto leading-relaxed">
            Пълен достъп до интерактивния алгоритъм за разпознаване на ноти, неограничени таблатури и персонални тренировъчни сесии.
          </p>
        </div>

        {/* Billing Cycle Switcher */}
        <div className="flex items-center justify-center">
          <div className="flex items-center bg-[#0C121E] border border-[#1E2B3E] p-1 rounded-xl">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                billingCycle === 'monthly' ? 'bg-[#182335] text-white shadow-sm' : 'text-[#7A8C9E] hover:text-white'
              }`}
            >
              Месечен план
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`relative px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                billingCycle === 'annual' ? 'bg-[#00E5BE] text-[#070A10] shadow-md shadow-[#00E5BE]/30' : 'text-[#7A8C9E] hover:text-white'
              }`}
            >
              <span>Годишен план</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-extrabold uppercase ${
                billingCycle === 'annual' ? 'bg-[#070A10] text-[#00E5BE]' : 'bg-[#00E5BE]/20 text-[#00E5BE]'
              }`}>
                -40%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Free Tier Card */}
          <div className="bg-[#0B101A] border border-[#1A2536] rounded-2xl p-6 flex flex-col justify-between shadow-xl">
            <div className="space-y-4">
              <div>
                <span className="text-xs uppercase font-mono tracking-wider text-[#63768D]">Стартов план</span>
                <h3 className="text-xl font-bold text-white mt-1">Безплатен достъп</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white font-mono">0.00</span>
                  <span className="text-xs text-[#63768D]">лв / завинаги</span>
                </div>
              </div>

              <div className="h-px bg-[#182436]" />

              <ul className="space-y-2.5 text-xs text-[#8E9FBA]">
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-[#00E5BE] shrink-0" />
                  <span>3 демонстрационни песни</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-[#00E5BE] shrink-0" />
                  <span>Базово микрофонно засичане</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-[#00E5BE] shrink-0" />
                  <span>Вграден китарен тунер</span>
                </li>
                <li className="flex items-center gap-2.5 text-[#516379] line-through">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Guitar Pro импортиране (.gp, .gpx)</span>
                </li>
                <li className="flex items-center gap-2.5 text-[#516379] line-through">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Контрол на темпото без изкривяване</span>
                </li>
              </ul>
            </div>

            <button
              onClick={onClose}
              className="mt-6 w-full py-2.5 rounded-xl border border-[#223348] text-xs font-bold text-white hover:bg-[#121B2A] transition-colors cursor-pointer"
            >
              {isPro ? 'Продължи към сцената' : 'Текущ план'}
            </button>
          </div>

          {/* Pro Tier Card - Highlighted */}
          <div className="relative bg-gradient-to-b from-[#0E1726] to-[#0A101C] border-2 border-[#00E5BE] rounded-2xl p-6 flex flex-col justify-between shadow-2xl shadow-[#00E5BE]/10 overflow-hidden">
            {/* Best Value Ribbon */}
            <div className="absolute top-4 right-4 bg-[#00E5BE] text-[#070A10] text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full shadow-md shadow-[#00E5BE]/40 tracking-wider">
              Най-популярен
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-xs uppercase font-mono tracking-wider text-[#00E5BE]">PickHero Studio Pro</span>
                <h3 className="text-xl font-bold text-white mt-1">Неограничен Pro Достъп</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white font-mono">
                    {billingCycle === 'annual' ? '14.99' : '24.99'}
                  </span>
                  <span className="text-xs text-[#8293A7]">лв / месец</span>
                  {billingCycle === 'annual' && (
                    <span className="text-[11px] font-mono text-[#00E5BE] ml-2">таксувано годишно</span>
                  )}
                </div>
              </div>

              <div className="h-px bg-[#1F2E44]" />

              <ul className="space-y-2.5 text-xs text-white">
                {proFeatures.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#00E5BE] shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold text-white block">{feat.title}</strong>
                      <span className="text-[11px] text-[#8293A7]">{feat.description}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 space-y-2">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleSubscribe}
                disabled={isProcessing || isPro}
                className={`w-full py-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
                  isPro
                    ? 'bg-[#00E5BE]/20 text-[#00E5BE] border border-[#00E5BE]/50 cursor-default'
                    : 'bg-[#00E5BE] hover:bg-[#00FAD0] text-[#070A10] shadow-[#00E5BE]/30'
                }`}
              >
                {isProcessing ? (
                  <span>Обработка...</span>
                ) : isPro ? (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Вие имате активен PRO абонамент</span>
                  </>
                ) : (
                  <>
                    <span>Започнете 14-дневен безплатен тест</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
              <div className="flex items-center justify-center gap-2 text-[10px] text-[#556980]">
                <ShieldCheck className="w-3 h-3 text-[#00E5BE]" />
                <span>30-дневна гаранция за възстановяване на средствата</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="pt-4 border-t border-[#141F30] flex flex-wrap items-center justify-around gap-4 text-xs text-[#71849A]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#00E5BE]" />
            <span>256-bit SSL сигурно плащане</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#00E5BE]" />
            <span>Моментален достъп без инсталация</span>
          </div>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-[#F59E0B]" />
            <span>4.9 / 5 оценка от 12,000+ музиканти</span>
          </div>
        </div>

        {showSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-6 right-6 bg-[#00E5BE] text-[#070A10] font-bold px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs z-50"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Честито! Вашият PRO достъп е активиран успешно!</span>
          </motion.div>
        )}
      </div>
    </div>
  );
};

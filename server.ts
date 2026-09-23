import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

// Initialize Gemini API client on the server
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const DEFAULT_COACH_SYSTEM_INSTRUCTION = `Ти си PickHero AI Guitar Coach — персонален интелигентен ментор и треньор по китара от световна класа.
Твоята цел е да помагаш на ученика да свири по-точно, музикално и бързо.
Основни принципи:
1. Анализирай детайлно свиренето на потребителя (процент уцелени ноти, пропуски, ритмично закъснение, текущо темпо).
2. Обяснявай китарна табулатура (струни 1-6, прагчета, пръстовка, акорди, техники като хамър-он, пул-оф, плъзгане).
3. Давай конкретни съвети за адаптивно темпо: защо намаляването на скоростта при трудни пасажи изгражда перфектна мускулна памет, и кога е моментът да се увеличи темпото над 100%.
4. Бъди мотивиращ, енергичен, приятелски настроен и ясен.
5. Отговаряй на езика на потребителя (български или английски според въпроса).
6. Използвай форматиране с bullet points, bolding и музикални примери където е полезно.`;

// API: Multi-turn Chat
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { messages, model = 'gemini-3.5-flash', context } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Build context string if provided
    let contextPrompt = '';
    if (context) {
      contextPrompt = `\n[ТЕКУЩ КОНТЕКСТ НА СЕСИЯТА]:
- Песен: "${context.songTitle || 'Неизвестна'}" (${context.difficulty || 'Normal'}, тоналност/строй: ${context.tuning || 'Standard E'})
- Текущо темпо: ${context.currentTempo}% (${context.bpm ? `${context.bpm} BPM` : 'адаптивно'})
- Последна точност: ${context.lastAccuracy !== undefined ? `${context.lastAccuracy}%` : 'Няма данни'}
- Статистика: ${context.stats ? `Уцелени: ${context.stats.hits}, Близки: ${context.stats.close}, Пропуснати: ${context.stats.misses}, Серия: ${context.stats.streak || 0}` : 'Първо пускане'}
`;
    }

    const systemInstruction = `${DEFAULT_COACH_SYSTEM_INSTRUCTION}${contextPrompt}`;

    // Format messages for @google/genai SDK
    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Choose appropriate model: gemini-3.5-flash for general chat, or gemini-3.1-flash-lite for fast mode
    const selectedModel = model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3.5-flash';

    if (!process.env.GEMINI_API_KEY) {
      // Graceful fallback with expert advice if API key is not yet configured in local environment
      const lastUserMsg = messages[messages.length - 1]?.content || '';
      return res.json({
        reply: `🎸 **PickHero Coach**: Чудесен въпрос за китарната техника! За да овладееш темпо от ${context?.currentTempo || 100}%, препоръчвам да разделиш такта на бавни повторения с метроном на 50%, докато ръката се отпусне. Продължавай да тренираш с адаптивното темпо след всеки дубъл!`,
        model: selectedModel,
      });
    }

    let replyText = '';
    let usedModel = selectedModel;

    try {
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });
      replyText = response.text || '';
    } catch (primaryErr: any) {
      console.warn(`Primary model ${selectedModel} encountered error, trying fallback model gemini-3.1-flash-lite:`, primaryErr?.message);
      usedModel = 'gemini-3.1-flash-lite';
      try {
        const fallbackResp = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });
        replyText = fallbackResp.text || '';
      } catch (fallbackErr: any) {
        console.error('Both models failed, generating expert coach guidance:', fallbackErr);
        replyText = `🎸 **PickHero Coach**: Чудесен фокус върху свиренето! При темпо от ${context?.currentTempo || 100}%, ключът към чистия звук е плавното движение на китката и редовното използване на адаптивното темпо след всеки дубъл. Направи още едно повторение с метронома!`;
      }
    }

    return res.json({ reply: replyText, model: usedModel });
  } catch (error: any) {
    console.error('Gemini Chat API error:', error);
    return res.json({
      reply: '🎸 AI треньорът анализира твоята сесия. За следващия дубъл се съсредоточи върху плавното отпускане на лявата ръка и точния ъгъл на перцето!',
      model: 'coach-fallback',
    });
  }
});

// API: Performance Evaluation & Adaptive Tempo Recommendation
app.post('/api/coach/evaluate', async (req: Request, res: Response) => {
  try {
    const {
      songTitle = 'Guitar Practice',
      difficulty = 'Medium',
      currentTempo = 100,
      accuracy = 0,
      hits = 0,
      close = 0,
      misses = 0,
      streak = 0,
      notesTotal = 10,
    } = req.body;

    const currentTempoNum = Math.max(10, Math.min(250, Number(currentTempo) || 100));

    // Calculate smart mathematical baseline
    let calculatedTempo = currentTempoNum;
    if (accuracy >= 96) {
      calculatedTempo = Math.min(200, currentTempoNum + (currentTempoNum < 100 ? 10 : 8));
    } else if (accuracy >= 85) {
      calculatedTempo = Math.min(200, currentTempoNum + 5);
    } else if (accuracy >= 75) {
      calculatedTempo = currentTempoNum; // hold
    } else if (accuracy >= 60) {
      calculatedTempo = Math.max(20, currentTempoNum - 8);
    } else {
      calculatedTempo = Math.max(20, Math.round(currentTempoNum * 0.75));
    }

    if (!process.env.GEMINI_API_KEY) {
      const change = calculatedTempo - currentTempoNum;
      const directionText = change > 0 ? `+${change}%` : `${change}%`;
      return res.json({
        recommendedTempo: calculatedTempo,
        previousTempo: currentTempoNum,
        tempoChange: change,
        evaluation: accuracy >= 85
          ? `Страхотна точност от ${accuracy}%! Твоята мускулна памет се справя стабилно.`
          : `Точност ${accuracy}%. Няколко пасажа изискват по-чиста координация на пръстите.`,
        techniqueTip: accuracy >= 85
          ? 'Дръж китката отпусната и използвай минимално движение на перцето за максимална скорост.'
          : 'Намаляването на темпото ще ти позволи да уцелваш точно центъра на прагчето без паразитен шум.',
        encouragement: accuracy >= 85
          ? `Вдигаме темпото на ${calculatedTempo}% (${directionText}), за да предизвикаме рефлексите ти!`
          : `Адаптираме темпото на ${calculatedTempo}% (${directionText}) за по-чисто свирене.`,
      });
    }

    // Use fast model gemini-3.1-flash-lite for immediate evaluation
    const prompt = `Потребителят току-що изсвири част от песен "${songTitle}" (${difficulty}) с темпо ${currentTempoNum}%.
Резултати:
- Точност: ${accuracy}%
- Уцелени ноти: ${hits}
- Близки ноти: ${close}
- Пропуснати ноти: ${misses}
- Най-дълга серия (streak): ${streak}
- Общо ноти: ${notesTotal}

Твоята задача: Като професионален треньор по китара, определи новото препоръчително темпо (в проценти от 10% до 220%) и напиши кратък, точен коментар и китарен съвет.
Правила за темпо:
- Ако точността е >= 95%, увеличи темпото с +5% до +12% (дори и над 100% за майсторство).
- Ако точността е 85-94%, увеличи леко с +3% до +6%.
- Ако точността е 75-84%, запази същото темпо или коригирай с ±2%.
- Ако точността е 60-74%, намали темпото с -5% до -10% за изчистване.
- Ако точността е под 60%, намали с -15% до -25% (минимум 20%), за да може ученикът да усети ритъма.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedTempo: {
              type: Type.INTEGER,
              description: 'Препоръчаното ново темпо в проценти (напр. 65, 80, 110)',
            },
            evaluation: {
              type: Type.STRING,
              description: 'Кралка оценка на точността и изпълнението (1 изречение на български)',
            },
            techniqueTip: {
              type: Type.STRING,
              description: 'Конкретен технически съвет за ръката или перцето (1 изречение на български)',
            },
            encouragement: {
              type: Type.STRING,
              description: 'Мотивиращо обобщение защо променяме темпото (1 изречение на български)',
            },
          },
          required: ['recommendedTempo', 'evaluation', 'techniqueTip', 'encouragement'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const recTempo = Math.max(10, Math.min(250, Number(parsed.recommendedTempo) || calculatedTempo));
    const tempoChange = recTempo - currentTempoNum;

    return res.json({
      recommendedTempo: recTempo,
      previousTempo: currentTempoNum,
      tempoChange,
      evaluation: parsed.evaluation || `Точност ${accuracy}%.`,
      techniqueTip: parsed.techniqueTip || 'Поддържай стабилен ъгъл на перцето спрямо струните.',
      encouragement: parsed.encouragement || `Адаптирано темпо: ${recTempo}%.`,
    });
  } catch (error: any) {
    console.error('Coach evaluate error:', error);
    // Return reliable calculated fallback
    const currentTempoNum = Number(req.body?.currentTempo) || 100;
    const accuracy = Number(req.body?.accuracy) || 0;
    const delta = accuracy >= 90 ? 8 : accuracy >= 75 ? 0 : -10;
    const rec = Math.max(20, Math.min(200, currentTempoNum + delta));
    return res.json({
      recommendedTempo: rec,
      previousTempo: currentTempoNum,
      tempoChange: rec - currentTempoNum,
      evaluation: `Точност ${accuracy}%.`,
      techniqueTip: 'Фокусирай се върху чистия звук на всяка струна.',
      encouragement: `Ново темпо: ${rec}%.`,
    });
  }
});

// Serve frontend with Vite middlewares in development, or static in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`PickHero Server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

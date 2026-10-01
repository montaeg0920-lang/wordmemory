import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.set('trust proxy', true);
app.use('/api/ai/extract-vocab', express.json({ limit: '25mb' }));
app.use(express.json({ limit: '100kb' }));

/**
 * Simple in-memory rate limit for the AI endpoints so that nobody can burn the
 * Gemini quota by calling /api/ai/* in a loop. (Per server instance, per IP.)
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REQUESTS = 300;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
app.use('/api/ai', (req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (rateBuckets.size > 5000) {
      for (const [k, b] of rateBuckets) if (b.resetAt < now) rateBuckets.delete(k);
    }
    return next();
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX_REQUESTS) {
    res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000).toString());
    return res.status(429).json({ error: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
  }
  next();
});

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', ja: 'Japanese', es: 'Spanish', de: 'German', fr: 'French', zh: 'Chinese',
  he: 'Biblical Hebrew', el: 'Koine (Biblical) Greek', ko: 'Korean', other: 'the source language',
};

/**
 * Calls Gemini for a JSON answer. Word extraction does not need long "thinking",
 * so we ask for a low thinking level (much faster). If the model rejects that
 * option, we retry once without it.
 */
async function generateJson(contents: any, responseSchema: any): Promise<any> {
  if (!ai) throw new Error('AI_NOT_CONFIGURED');
  const base = { responseMimeType: 'application/json', responseSchema };
  let response;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: { ...base, thinkingConfig: { thinkingLevel: 'low' } } as any,
    });
  } catch (err: any) {
    if (!/thinking/i.test(String(err?.message || ''))) throw err;
    response = await ai.models.generateContent({ model: 'gemini-3.8-flash', contents, config: base });
  }
  return JSON.parse(response.text || '{}');
}

const WORD_LIST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    words: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          meaning: { type: Type.STRING },
          partOfSpeech: { type: Type.STRING },
          pronunciation: { type: Type.STRING },
        },
        required: ['term', 'meaning'],
      },
    },
  },
  required: ['words'],
};

// Initialize GoogleGenAI client strictly according to skill guidelines
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

/**
 * AI Vocabulary Analysis Endpoint
 * Generates lemma, partOfSpeech, pronunciation, alternativeMeanings,
 * difficulty (1-5), commonCollocations, example sentence with translation,
 * and high quality distractors for multiple choice.
 */
app.post('/api/ai/analyze-word', async (req, res) => {
  try {
    const { term, userMeaning, sourceLanguage = 'en', targetLanguage = 'ko' } = req.body;

    if (!term || typeof term !== 'string' || term.length > 120) {
      return res.status(400).json({ error: 'INVALID_TERM' });
    }
    if (typeof userMeaning === 'string' && userMeaning.length > 300) {
      return res.status(400).json({ error: 'INVALID_MEANING' });
    }

    if (!ai) {
      return res.status(503).json({ error: 'AI_NOT_CONFIGURED' });
    }

    const langName = LANGUAGE_NAMES[sourceLanguage] || sourceLanguage;
    const prompt = `Analyze the vocabulary word "${term}" (source language: ${langName}, target language: ${targetLanguage === 'ko' ? 'Korean' : targetLanguage}).
User provided primary meaning: "${userMeaning || ''}".
Generate educational data for spaced repetition learning:
1. lemma (base form / lexicon root)
2. partOfSpeech (in Korean, e.g. 명사, 동사, 형용사, 부사, 전치사)
3. pronunciation (phonetic reading and romanization: for Hebrew provide Korean/Latin transliteration like "샬롬 [shalom]"; for Greek/헬라어 provide transliteration like "아가페 [agape]"; for Japanese provide Hiragana+Romaji like "たべる (taberu)"; for English/Spanish/German provide phonetic IPA like /dɪˈraɪv/)
4. alternativeMeanings: up to 3 distinct valid Korean meanings other than the user's primary meaning.
5. difficulty: 1 (elementary) to 5 (advanced)
6. collocations: 2-3 natural collocations or biblical/classical usages if ancient language
7. exampleSentence: an authentic, clear sentence demonstrating the word in its source language (${sourceLanguage}), plus natural Korean translation. (en field should contain the source language sentence, ko field should contain the Korean translation)
8. distractors: 4 plausible Korean definitions of OTHER similar-level words that are definitively NOT valid definitions of "${term}" or "${userMeaning}". Avoid ambiguous synonyms.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            lemma: { type: Type.STRING },
            partOfSpeech: { type: Type.STRING },
            pronunciation: { type: Type.STRING },
            alternativeMeanings: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            difficulty: { type: Type.INTEGER },
            collocations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            exampleSentence: {
              type: Type.OBJECT,
              properties: {
                en: { type: Type.STRING },
                ko: { type: Type.STRING },
              },
              required: ['en', 'ko'],
            },
            distractors: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['lemma', 'partOfSpeech', 'alternativeMeanings', 'difficulty', 'distractors'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, aiData: parsed });
  } catch (err: any) {
    console.error('Gemini analyze error:', err);
    return res.status(500).json({ error: 'AI_FAILED' });
  }
});

/**
 * Extract a vocabulary list from a photo, a PDF, or plain text (documents, slides, notes).
 * Body: { mimeType, data: base64 } or { text }, plus sourceLanguage.
 */
const EXTRACT_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
app.post('/api/ai/extract-vocab', async (req, res) => {
  try {
    const { mimeType, data, text, sourceLanguage = 'en' } = req.body || {};
    const isText = typeof text === 'string' && text.trim().length > 0;
    if (!isText && (!EXTRACT_MIME.has(mimeType) || typeof data !== 'string' || data.length < 10)) {
      return res.status(400).json({ error: 'INVALID_FILE' });
    }
    if (isText && text.length > 80000) {
      return res.status(413).json({ error: 'TOO_LARGE' });
    }
    if (!ai) {
      return res.status(503).json({ error: 'AI_NOT_CONFIGURED' });
    }

    const langName = LANGUAGE_NAMES[sourceLanguage] || 'the foreign language';
    const source = isText ? 'text' : mimeType === 'application/pdf' ? 'document' : 'photo';
    const prompt = `You extract vocabulary for a Korean learner of ${langName}.
The ${source} below is a word list, textbook page, handout or notes. Return every vocabulary entry as { term, meaning }.
Rules:
- term: the ${langName} word or phrase exactly as written (keep accents, Hebrew vowel points, Greek accents). Only ${langName} entries.
- meaning: the Korean meaning as written. If none is written, give a short natural Korean meaning.
- partOfSpeech (Korean, e.g. 명사/동사/형용사/부사) and pronunciation: only if written or obvious; otherwise omit.
- Remove numbering, bullets, page numbers, headings, instructions and example sentences.
- Keep the original order. Do not invent entries. Maximum 300 entries.
- If the photo is rotated, blurry or partly cut off, still read what is legible.`;

    const parts: any[] = isText ? [{ text: prompt + '\n\n--- TEXT ---\n' + text }] : [{ inlineData: { mimeType, data } }, { text: prompt }];
    const parsed = await generateJson([{ role: 'user', parts }], WORD_LIST_SCHEMA);
    const words = Array.isArray(parsed.words) ? parsed.words.slice(0, 300) : [];
    return res.json({ success: true, words });
  } catch (err: any) {
    console.error('Gemini extract error:', err);
    const status = Number(err?.status || err?.code);
    if (status === 429) return res.status(429).json({ error: 'RATE_LIMITED' });
    if (status === 413) return res.status(413).json({ error: 'TOO_LARGE' });
    return res.status(500).json({ error: 'AI_FAILED' });
  }
});

/**
 * Starter deck for a language that has no built-in deck (e.g. 프랑스어, 스페인어).
 * Body: { sourceLanguage, level: 'beginner'|'elementary'|'intermediate', topic?: string, count?: number }
 */
app.post('/api/ai/starter-deck', async (req, res) => {
  try {
    const { sourceLanguage = 'en', level = 'beginner', topic = '', count = 30 } = req.body || {};
    if (!LANGUAGE_NAMES[sourceLanguage] || sourceLanguage === 'ko' || sourceLanguage === 'other') {
      return res.status(400).json({ error: 'INVALID_LANGUAGE' });
    }
    if (typeof topic !== 'string' || topic.length > 60) return res.status(400).json({ error: 'INVALID_TOPIC' });
    if (!ai) return res.status(503).json({ error: 'AI_NOT_CONFIGURED' });

    const n = Math.max(10, Math.min(50, Number(count) || 30));
    const levelText = { beginner: 'absolute beginner (A1)', elementary: 'elementary (A2)', intermediate: 'intermediate (B1)' }[level as string] || 'beginner (A1)';
    const prompt = `Create a list of the ${n} most useful ${langNameOf(sourceLanguage)} words for a Korean ${levelText} learner${topic ? ` about "${topic}"` : ''}.
For each word give: term (in ${langNameOf(sourceLanguage)}, with articles/accents where natural), meaning (short Korean), partOfSpeech (Korean), pronunciation (Korean-friendly reading or IPA), exampleEn (one short, natural ${langNameOf(sourceLanguage)} example sentence using the word), exampleKo (Korean translation).
Use only ${langNameOf(sourceLanguage)} words. No duplicates. Order from most to least useful.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        words: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING },
              meaning: { type: Type.STRING },
              partOfSpeech: { type: Type.STRING },
              pronunciation: { type: Type.STRING },
              exampleEn: { type: Type.STRING },
              exampleKo: { type: Type.STRING },
            },
            required: ['term', 'meaning'],
          },
        },
      },
      required: ['words'],
    };
    const parsed = await generateJson(prompt, schema);
    return res.json({ success: true, words: Array.isArray(parsed.words) ? parsed.words.slice(0, n) : [] });
  } catch (err: any) {
    console.error('Gemini starter deck error:', err);
    return res.status(500).json({ error: 'AI_FAILED' });
  }
});

function langNameOf(code: string) {
  return LANGUAGE_NAMES[code] || 'the language';
}

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VocaCurve server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

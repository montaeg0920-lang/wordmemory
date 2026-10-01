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

app.use(express.json({ limit: '10mb' }));

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

    if (!term) {
      return res.status(400).json({ error: 'Term is required' });
    }

    if (!ai) {
      return res.json({
        success: true,
        aiData: {
          lemma: term.toLowerCase().trim(),
          partOfSpeech: '단어',
          pronunciation: '',
          alternativeMeanings: [],
          difficulty: 3,
          collocations: [],
          exampleSentence: null,
          distractors: ['유지하다', '설명하다', '비교하다'],
        },
        fallback: true,
      });
    }

    const prompt = `Analyze the vocabulary word "${term}" (source language: ${sourceLanguage}, target language: ${targetLanguage}).
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
    return res.status(500).json({ error: err.message || 'AI analysis failed' });
  }
});

/**
 * Generate Context Sentences for Level 4
 */
app.post('/api/ai/generate-context', async (req, res) => {
  try {
    const { term, userMeaning } = req.body;
    if (!term) return res.status(400).json({ error: 'Term is required' });

    if (!ai) {
      return res.json({
        success: true,
        sentence: `The research team was able to ______ the necessary data from multiple sources.`,
        targetWord: term,
        correctInflection: term,
        translationKo: `연구팀은 여러 출처에서 필요한 데이터를 얻어낼 수 있었다.`,
        hint: userMeaning || '',
      });
    }

    const prompt = `Create a natural fill-in-the-blank (cloze) English sentence for the word "${term}" (Korean meaning: "${userMeaning || ''}").
The blank should be represented as "______".
Provide:
- sentenceWithBlank: English sentence with "______"
- targetWord: the base word
- correctInflection: the exact inflected form that grammatically fits into the blank (e.g. "derives", "derived", "deriving", or "derive")
- translationKo: Korean translation of the full completed sentence
- hint: gentle Korean meaning hint`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sentenceWithBlank: { type: Type.STRING },
            targetWord: { type: Type.STRING },
            correctInflection: { type: Type.STRING },
            translationKo: { type: Type.STRING },
            hint: { type: Type.STRING },
          },
          required: ['sentenceWithBlank', 'correctInflection', 'translationKo'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, ...parsed });
  } catch (err: any) {
    console.error('Gemini context generation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate context' });
  }
});

/**
 * Semantic Meaning Matching (Level 2: Meaning recall Korean semantic check)
 */
app.post('/api/ai/semantic-match', async (req, res) => {
  try {
    const { userResponse, targetMeaning, alternativeMeanings = [] } = req.body;
    if (!userResponse || !targetMeaning) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const cleanUser = userResponse.trim().toLowerCase();
    const cleanTarget = targetMeaning.trim().toLowerCase();

    // Fast heuristic match first
    if (cleanUser === cleanTarget) {
      return res.json({ isMatch: true, explanation: 'Exact match' });
    }

    // Substring or token overlap
    const targetTokens = cleanTarget.split(/[\s,~./]+/).filter(Boolean);
    const userTokens = cleanUser.split(/[\s,~./]+/).filter(Boolean);
    const hasOverlap = targetTokens.some((t: string) => cleanUser.includes(t)) || userTokens.some((u: string) => cleanTarget.includes(u));

    if (hasOverlap) {
      return res.json({ isMatch: true, explanation: 'Token overlap' });
    }

    const altMatches = (alternativeMeanings as string[]).some((alt: string) => {
      const cleanAlt = alt.trim().toLowerCase();
      return cleanAlt === cleanUser || cleanAlt.includes(cleanUser) || cleanUser.includes(cleanAlt);
    });

    if (altMatches) {
      return res.json({ isMatch: true, explanation: 'Alternative meaning match' });
    }

    if (!ai) {
      return res.json({ isMatch: false, explanation: 'No semantic match found' });
    }

    // Call Gemini for nuanced Korean semantic equivalence
    const prompt = `Evaluate if the Korean student's answer "${userResponse}" is semantically acceptable for the expected meaning "${targetMeaning}" (or alternatives: ${alternativeMeanings.join(', ')}).
Respond in JSON with isMatch (boolean) and a brief Korean feedback.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isMatch: { type: Type.BOOLEAN },
            feedback: { type: Type.STRING },
          },
          required: ['isMatch'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{"isMatch":false}');
    return res.json(parsed);
  } catch (err: any) {
    console.error('Semantic match error:', err);
    return res.json({ isMatch: false, fallback: true });
  }
});

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

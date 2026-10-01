/**
 * AI Client for VocaCurve
 * Interfaces with server-side Gemini API endpoints with robust heuristic fallbacks.
 */

export interface AIWordAnalysisResult {
  lemma: string;
  partOfSpeech: string;
  pronunciation?: string;
  alternativeMeanings: string[];
  difficulty: number;
  collocations: string[];
  exampleSentence?: {
    en: string;
    ko: string;
  };
  distractors: string[];
}

export interface AIContextResult {
  sentenceWithBlank: string;
  targetWord: string;
  correctInflection: string;
  translationKo: string;
  hint: string;
}

export async function analyzeWordWithAI(
  term: string,
  userMeaning: string,
  sourceLanguage?: string
): Promise<AIWordAnalysisResult | null> {
  try {
    const res = await fetch('/api/ai/analyze-word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term, userMeaning, sourceLanguage: sourceLanguage || 'ja' }),
    });

    if (!res.ok) {
      throw new Error(`AI request failed: ${res.status}`);
    }

    const data = await res.json();
    return data.aiData;
  } catch (err) {
    console.warn('AI analysis fallback triggered:', err);
    // Robust heuristic fallback so the app continues seamlessly
    return {
      lemma: term.toLowerCase().trim(),
      partOfSpeech: '단어',
      pronunciation: '',
      alternativeMeanings: [],
      difficulty: 3,
      collocations: [`${term} in use`],
      distractors: ['극복하다', '형성하다', '설명하다'],
    };
  }
}

export async function generateContextSentenceWithAI(
  term: string,
  userMeaning: string
): Promise<AIContextResult | null> {
  try {
    const res = await fetch('/api/ai/generate-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term, userMeaning }),
    });

    if (!res.ok) {
      throw new Error(`AI request failed: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.warn('AI context generation fallback:', err);
    return {
      sentenceWithBlank: `The researcher tried to ______ the key conclusions from the data.`,
      targetWord: term,
      correctInflection: term,
      translationKo: `연구원은 데이터로부터 핵심 결론을 얻어내고자(인출하고자) 시도했다.`,
      hint: userMeaning,
    };
  }
}

export async function checkSemanticMeaningMatch(
  userResponse: string,
  targetMeaning: string,
  alternativeMeanings: string[] = []
): Promise<boolean> {
  // Quick direct client check first
  const cleanUser = userResponse.trim().toLowerCase().replace(/하다$/, '');
  const cleanTarget = targetMeaning.trim().toLowerCase().replace(/하다$/, '');

  if (cleanUser === cleanTarget) return true;

  // Check substring overlap
  if (cleanTarget.includes(cleanUser) || cleanUser.includes(cleanTarget)) {
    return true;
  }

  // Check alternative meanings
  for (const alt of alternativeMeanings) {
    const cleanAlt = alt.trim().toLowerCase().replace(/하다$/, '');
    if (cleanAlt === cleanUser || cleanAlt.includes(cleanUser) || cleanUser.includes(cleanAlt)) {
      return true;
    }
  }

  try {
    const res = await fetch('/api/ai/semantic-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userResponse, targetMeaning, alternativeMeanings }),
    });

    if (res.ok) {
      const data = await res.json();
      return Boolean(data.isMatch);
    }
  } catch {
    // ignore fetch error and use client-side comparison
  }

  return false;
}

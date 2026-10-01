/**
 * AI client for VocaCurve (talks to the server-side Gemini endpoints).
 *
 * When AI is unavailable these functions return an error result instead of
 * inventing data — nothing fake is ever saved into a word.
 */

export interface AIWordAnalysisResult {
  lemma: string;
  partOfSpeech: string;
  pronunciation?: string;
  alternativeMeanings: string[];
  difficulty: number;
  collocations: string[];
  exampleSentence?: { en: string; ko: string } | null;
  distractors: string[];
}

export interface ExtractedWord {
  term: string;
  meaning: string;
  partOfSpeech?: string;
  pronunciation?: string;
}

import { ImagePrepError, prepareImageForUpload } from './imageTools';

export type AIResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Friendly message + a short code in brackets so problems can be reported precisely. */
function describeError(status: number, code?: string): string {
  const tag = ` (오류 ${code || status || 'NETWORK'})`;
  if (code === 'AI_NOT_CONFIGURED') return 'AI 기능이 설정되어 있지 않습니다. Gemini API 키를 확인해 주세요.' + tag;
  if (status === 429 || code === 'RATE_LIMITED') return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' + tag;
  if (status === 413 || code === 'TOO_LARGE') return '파일이 너무 큽니다. 페이지를 나누거나 더 작은 파일로 시도해 주세요.' + tag;
  if (code === 'INVALID_FILE') return '이 파일은 읽을 수 없습니다.' + tag;
  if (code === 'TIMEOUT') return '응답이 너무 오래 걸립니다. 사진을 한 장씩 넣거나 잠시 후 다시 시도해 주세요.' + tag;
  if (code === 'NO_TEXT') return '글자를 찾지 못했습니다. 밝은 곳에서 글자가 크게 보이도록 다시 찍어 주세요.' + tag;
  if (status === 0) return '인터넷 연결을 확인하고 다시 시도해 주세요.' + tag;
  return 'AI 분석에 실패했습니다. 다시 시도해 주세요.' + tag;
}

async function postJson<T>(url: string, body: unknown, timeoutMs = 30000, retries = 1): Promise<AIResult<T>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, data: data as T };
      // Retry once on temporary server errors.
      if (res.status >= 500 && res.status !== 503 && attempt < retries) continue;
      return { ok: false, error: describeError(res.status, data?.error) };
    } catch (e) {
      clearTimeout(timer);
      if (attempt < retries) continue;
      return { ok: false, error: describeError(0, (e as Error)?.name === 'AbortError' ? 'TIMEOUT' : undefined) };
    }
  }
  return { ok: false, error: describeError(0) };
}

export async function analyzeWordWithAI(
  term: string,
  userMeaning: string,
  sourceLanguage: string
): Promise<AIResult<AIWordAnalysisResult>> {
  const res = await postJson<{ aiData: AIWordAnalysisResult }>('/api/ai/analyze-word', {
    term,
    userMeaning,
    sourceLanguage,
  });
  if (!res.ok) return res;
  if (!res.data?.aiData) return { ok: false, error: describeError(500) };
  const d = res.data.aiData;
  return {
    ok: true,
    data: {
      ...d,
      alternativeMeanings: Array.isArray(d.alternativeMeanings) ? d.alternativeMeanings : [],
      collocations: Array.isArray(d.collocations) ? d.collocations : [],
      distractors: Array.isArray(d.distractors) ? d.distractors : [],
    },
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const MAX_PDF_BYTES = 15 * 1024 * 1024;

function cleanWords(words: ExtractedWord[]): ExtractedWord[] {
  const seen = new Set<string>();
  const out: ExtractedWord[] = [];
  for (const w of words || []) {
    const term = String(w?.term || '').trim();
    const meaning = String(w?.meaning || '').trim();
    if (!term || !meaning) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      term,
      meaning,
      partOfSpeech: w.partOfSpeech?.trim() || undefined,
      pronunciation: w.pronunciation?.trim() || undefined,
    });
  }
  return out;
}

/** Sends a photo or PDF to Gemini and returns the vocabulary found in it. */
export async function extractVocabularyFromFile(file: File, sourceLanguage: string): Promise<AIResult<ExtractedWord[]>> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  let blob: Blob = file;
  let mimeType = 'application/pdf';
  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) return { ok: false, error: describeError(413) };
  } else {
    try {
      const prepared = await prepareImageForUpload(file);
      blob = prepared.blob;
      mimeType = prepared.mimeType;
    } catch (e) {
      const code = e instanceof ImagePrepError ? e.code : 'DECODE_FAILED';
      return {
        ok: false,
        error:
          code === 'HEIC_UNSUPPORTED'
            ? '이 브라우저는 아이폰 HEIC 사진을 열 수 없어요. 아이폰 설정 → 카메라 → 포맷 → "높은 호환성"으로 바꾸거나 스크린샷으로 넣어 주세요. (오류 HEIC)'
            : describeError(413, 'TOO_LARGE'),
      };
    }
  }
  const data = await blobToBase64(blob);
  const res = await postJson<{ words: ExtractedWord[] }>(
    '/api/ai/extract-vocab',
    { mimeType, data, sourceLanguage },
    isPdf ? 120000 : 60000
  );
  if (!res.ok) return res;
  const words = cleanWords(res.data.words);
  if (words.length === 0) return { ok: false, error: describeError(200, 'NO_TEXT') };
  return { ok: true, data: words };
}

/** Lets Gemini pick out word–meaning pairs from messy text (documents, notes, slides). */
export async function extractVocabularyFromText(text: string, sourceLanguage: string): Promise<AIResult<ExtractedWord[]>> {
  const trimmed = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 60000);
  if (!trimmed) return { ok: false, error: describeError(200, 'NO_TEXT') };
  const res = await postJson<{ words: ExtractedWord[] }>('/api/ai/extract-vocab', { text: trimmed, sourceLanguage }, 90000);
  if (!res.ok) return res;
  const words = cleanWords(res.data.words);
  if (words.length === 0) return { ok: false, error: describeError(200, 'NO_TEXT') };
  return { ok: true, data: words };
}

/** Runs async tasks with limited concurrency (keeps us under the rate limit). */
export async function mapWithConcurrency<T, R>(
  list: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number) => void
): Promise<R[]> {
  const results: R[] = new Array(list.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      results[i] = await fn(list[i], i);
      done++;
      onProgress?.(done);
    }
  });
  await Promise.all(workers);
  return results;
}

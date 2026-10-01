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

export type AIResult<T> = { ok: true; data: T } | { ok: false; error: string };

function describeError(status: number, code?: string): string {
  if (code === 'AI_NOT_CONFIGURED') return 'AI 기능이 설정되어 있지 않습니다. (Gemini API 키 확인 필요)';
  if (status === 429 || code === 'RATE_LIMITED') return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  if (status === 413) return '파일이 너무 큽니다. 8MB 이하로 줄여 주세요.';
  if (code === 'INVALID_FILE') return '지원하지 않는 파일 형식입니다.';
  return 'AI 분석에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.';
}

async function postJson<T>(url: string, body: unknown): Promise<AIResult<T>> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: describeError(res.status, data?.error) };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: describeError(0) };
  }
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

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Shrinks large photos before upload (phone photos are often 5–10MB). */
async function downscaleImage(file: File, maxSide = 2000): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/heic' || file.type === 'image/heif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>(resolve =>
      canvas.toBlob(b => resolve(b || file), 'image/jpeg', 0.85)
    );
  } catch {
    return file;
  }
}

/** Sends a photo or PDF to Gemini and returns the vocabulary found in it. */
export async function extractVocabularyFromFile(
  file: File,
  sourceLanguage: string
): Promise<AIResult<ExtractedWord[]>> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const blob = isPdf ? file : await downscaleImage(file);
  if (blob.size > 8 * 1024 * 1024) return { ok: false, error: describeError(413) };
  const mimeType = isPdf ? 'application/pdf' : blob.type || 'image/jpeg';
  const data = await fileToBase64(blob);
  const res = await postJson<{ words: ExtractedWord[] }>('/api/ai/extract-vocab', {
    mimeType,
    data,
    sourceLanguage,
  });
  if (!res.ok) return res;
  const words = (res.data.words || []).filter(w => w && w.term && w.meaning);
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

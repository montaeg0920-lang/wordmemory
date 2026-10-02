/**
 * Fills in a word's details without AI: our server looks the word up in a free
 * dictionary (English pronunciation, part of speech, example) and a free
 * translation service (Korean meanings). See /api/dict/lookup in server.ts.
 *
 * When nothing is found these functions return an error result instead of
 * inventing data — nothing fake is ever saved into a word.
 */

export interface ExtractedWord {
  term: string;
  meaning: string;
  partOfSpeech?: string;
  pronunciation?: string;
}

export interface WordLookup {
  /** Korean meanings, best first. */
  meanings: string[];
  partOfSpeech?: string;
  pronunciation?: string;
  example?: { text: string; ko: string } | null;
}

export type LookupResult<T> = { ok: true; data: T } | { ok: false; error: string };

function describeError(status: number, code?: string): string {
  const tag = ` (오류 ${code || status || 'NETWORK'})`;
  if (status === 429 || code === 'RATE_LIMITED') return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' + tag;
  if (code === 'NOT_FOUND') return '사전에서 이 단어를 찾지 못했습니다.' + tag;
  if (code === 'TIMEOUT') return '사전 응답이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.' + tag;
  if (status === 0) return '인터넷 연결을 확인하고 다시 시도해 주세요.' + tag;
  return '사전 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.' + tag;
}

export async function lookupWord(term: string, lang: string): Promise<LookupResult<WordLookup>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`/api/dict/lookup?term=${encodeURIComponent(term)}&lang=${encodeURIComponent(lang)}`, {
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: describeError(res.status, data?.error) };
    const meanings = Array.isArray(data.meanings) ? data.meanings.filter((m: unknown) => typeof m === 'string' && m) : [];
    if (meanings.length === 0 && !data.pronunciation && !data.example) {
      return { ok: false, error: describeError(404, 'NOT_FOUND') };
    }
    return {
      ok: true,
      data: {
        meanings,
        partOfSpeech: data.partOfSpeech || undefined,
        pronunciation: data.pronunciation || undefined,
        example: data.example?.text ? { text: String(data.example.text), ko: String(data.example.ko || '') } : null,
      },
    };
  } catch (e) {
    return { ok: false, error: describeError(0, (e as Error)?.name === 'AbortError' ? 'TIMEOUT' : undefined) };
  } finally {
    clearTimeout(timer);
  }
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

/**
 * Fills in a word's details without AI:
 *  1. the learner's downloaded language pack (offline, instant) — see langPack.ts
 *  2. words not in the pack: free public services, called straight from the browser
 *     - Korean meanings: MyMemory translation API (no key; daily limit per user)
 *     - English pronunciation / part of speech / example: Free Dictionary API (dictionaryapi.dev)
 *
 * When nothing is found these functions return an error result instead of
 * inventing data — nothing fake is ever saved into a word.
 */
import { ensurePack, lookupInPack } from './langPack';

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

const NOT_FOUND = '사전에서 이 단어를 찾지 못했습니다. 뜻을 직접 입력해 주세요.';
const OFFLINE = '사전에 없는 단어라 인터넷 사전을 찾아야 하는데, 연결되지 않았습니다. 인터넷 연결을 확인해 주세요.';

/** App language code -> MyMemory language code. */
const TRANSLATE_LANG: Record<string, string> = {
  en: 'en', es: 'es', ja: 'ja', zh: 'zh-CN', fr: 'fr', de: 'de', he: 'he', el: 'el',
};
const POS_KO: Record<string, string> = {
  noun: '명사', verb: '동사', adjective: '형용사', adverb: '부사', pronoun: '대명사',
  preposition: '전치사', conjunction: '접속사', interjection: '감탄사', determiner: '한정사', article: '관사',
};
const HANGUL = /[\uac00-\ud7a3]/;

async function getJson(url: string, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Korean translations of a word or sentence, best first. */
async function translateToKorean(text: string, lang: string): Promise<string[]> {
  const src = TRANSLATE_LANG[lang];
  if (!src) return [];
  const data = await getJson(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`${src}|ko`)}`
  );
  const out: string[] = [];
  const add = (t: unknown) => {
    const v = String(t || '').trim().replace(/[.。]$/, '');
    if (v && HANGUL.test(v) && v.length <= 80 && !/MYMEMORY|QUERY LENGTH/i.test(v) && !out.includes(v)) out.push(v);
  };
  add(data?.responseData?.translatedText);
  (Array.isArray(data?.matches) ? data.matches : [])
    .filter((m: any) => String(m?.segment || '').trim().toLowerCase() === text.trim().toLowerCase())
    .sort((a: any, b: any) => Number(b?.quality || 0) - Number(a?.quality || 0))
    .forEach((m: any) => add(m?.translation));
  return out.slice(0, 4);
}

async function lookupEnglish(term: string): Promise<Omit<WordLookup, 'meanings'>> {
  const data = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term.toLowerCase())}`);
  const entries: any[] = Array.isArray(data) ? data : [];
  const pronunciation =
    entries.map(e => e?.phonetic).find(Boolean) ||
    entries.flatMap(e => (Array.isArray(e?.phonetics) ? e.phonetics : [])).map((p: any) => p?.text).find(Boolean);
  const meanings = entries.flatMap(e => (Array.isArray(e?.meanings) ? e.meanings : []));
  const partOfSpeech = meanings.map((m: any) => POS_KO[String(m?.partOfSpeech || '').toLowerCase()]).find(Boolean);
  const examples: string[] = meanings
    .flatMap((m: any) => (Array.isArray(m?.definitions) ? m.definitions : []))
    .map((d: any) => String(d?.example || '').trim())
    .filter((x: string) => x.length > 0 && x.length <= 160);
  const lower = term.toLowerCase();
  const text = examples.find(x => x.toLowerCase().includes(lower)) || examples[0];
  return { pronunciation: pronunciation || undefined, partOfSpeech, example: text ? { text, ko: '' } : null };
}

/** Free online services, used for words the language pack does not have. */
async function lookupOnline(term: string, lang: string, needDetails: boolean): Promise<LookupResult<WordLookup>> {
  const english = lang === 'en' && needDetails && /^[a-z][a-z' -]*$/i.test(term);
  const [meanings, details] = await Promise.allSettled([
    translateToKorean(term, lang),
    english ? lookupEnglish(term) : Promise.resolve({} as Omit<WordLookup, 'meanings'>),
  ]);
  if (meanings.status === 'rejected' && details.status === 'rejected') return { ok: false, error: OFFLINE };
  const d = details.status === 'fulfilled' ? details.value : {};
  if (d.example?.text) d.example.ko = (await translateToKorean(d.example.text, lang).catch(() => [] as string[]))[0] || '';
  const data: WordLookup = { meanings: meanings.status === 'fulfilled' ? meanings.value : [], ...d };
  if (data.meanings.length === 0 && !data.pronunciation && !data.example) return { ok: false, error: NOT_FOUND };
  return { ok: true, data };
}

/** Waits for the language pack at most a few seconds (it downloads only once). */
function packReady(lang: string): Promise<boolean> {
  return Promise.race([ensurePack(lang), new Promise<boolean>(r => setTimeout(() => r(false), 8000))]);
}

export async function lookupWord(term: string, lang: string): Promise<LookupResult<WordLookup>> {
  await packReady(lang);
  const hit = await lookupInPack(term, lang).catch(() => null);
  if (hit && hit.meanings.length > 0) {
    return {
      ok: true,
      data: {
        meanings: hit.meanings,
        partOfSpeech: hit.pos,
        pronunciation: hit.ipa,
        example: hit.example ? { text: hit.example, ko: '' } : null,
      },
    };
  }
  // Not in the pack (or the pack has no Korean meaning for it): ask the free online services,
  // keeping whatever the pack already knows (pronunciation, part of speech, example).
  const online = await lookupOnline(term, lang, !hit?.ipa || !hit?.example);
  if (!online.ok) return online;
  return {
    ok: true,
    data: {
      meanings: online.data.meanings,
      partOfSpeech: hit?.pos || online.data.partOfSpeech,
      pronunciation: hit?.ipa || online.data.pronunciation,
      example: hit?.example ? { text: hit.example, ko: '' } : online.data.example,
    },
  };
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

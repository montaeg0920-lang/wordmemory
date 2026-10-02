import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.set('trust proxy', true);

/* ============================ OCR assets ============================
 * Photos and scanned PDFs are read on the learner's own device with Tesseract
 * (open source). The engine and the language data are served from installed
 * npm packages, so nothing has to be downloaded from a third-party CDN.
 */
const NODE_MODULES = path.join(__dirname, 'node_modules');
const OCR_CACHE = { maxAge: '30d', immutable: true };
app.get('/ocr/worker.min.js', (_req, res) =>
  res.sendFile(path.join(NODE_MODULES, 'tesseract.js', 'dist', 'worker.min.js'), OCR_CACHE)
);
app.use('/ocr/core', express.static(path.join(NODE_MODULES, 'tesseract.js-core'), OCR_CACHE));
const OCR_LANGS = new Set(['eng', 'kor', 'jpn', 'chi_sim', 'spa', 'fra', 'deu', 'heb', 'ell', 'grc']);
app.get('/ocr/lang/:file', (req, res) => {
  const m = /^([a-z_]+)\.traineddata\.gz$/.exec(req.params.file);
  if (!m || !OCR_LANGS.has(m[1])) return res.status(404).end();
  const file = path.join(NODE_MODULES, '@tesseract.js-data', m[1], '4.0.0_best_int', `${m[1]}.traineddata.gz`);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file, OCR_CACHE);
});

/* ========================= Dictionary lookup =========================
 * Fills in a word's Korean meaning, pronunciation, part of speech and an
 * example without any AI key:
 *  - Korean meanings: MyMemory translation API (free, no key)
 *  - English pronunciation / part of speech / example: Free Dictionary API (dictionaryapi.dev)
 * Results are cached in memory, and requests are rate-limited per IP.
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REQUESTS = 300;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
app.use('/api/dict', (req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (rateBuckets.size > 5000) for (const [k, b] of rateBuckets) if (b.resetAt < now) rateBuckets.delete(k);
    return next();
  }
  if (++bucket.count > RATE_MAX_REQUESTS) return res.status(429).json({ error: 'RATE_LIMITED' });
  next();
});

/** App language code -> MyMemory language code. */
const TRANSLATE_LANG: Record<string, string> = {
  en: 'en', es: 'es', ja: 'ja', zh: 'zh-CN', fr: 'fr', de: 'de', he: 'he', el: 'el',
};
const POS_KO: Record<string, string> = {
  noun: '명사', verb: '동사', adjective: '형용사', adverb: '부사', pronoun: '대명사',
  preposition: '전치사', conjunction: '접속사', interjection: '감탄사', determiner: '한정사', article: '관사',
};
const HANGUL = /[\uac00-\ud7a3]/;

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

/** Korean translations of a word or sentence, best first (empty when the service has none). */
async function translateToKorean(text: string, lang: string): Promise<string[]> {
  const src = TRANSLATE_LANG[lang];
  if (!src) return [];
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`${src}|ko`)}`;
  const data = await fetchJson(url);
  const out: string[] = [];
  const add = (t: unknown) => {
    const v = String(t || '').trim().replace(/[.。]$/, '');
    if (v && HANGUL.test(v) && v.length <= 60 && !/MYMEMORY|QUERY LENGTH/i.test(v) && !out.includes(v)) out.push(v);
  };
  add(data?.responseData?.translatedText);
  const matches = Array.isArray(data?.matches) ? data.matches : [];
  matches
    .filter((m: any) => String(m?.segment || '').trim().toLowerCase() === text.trim().toLowerCase())
    .sort((a: any, b: any) => Number(b?.quality || 0) - Number(a?.quality || 0))
    .forEach((m: any) => add(m?.translation));
  return out.slice(0, 4);
}

interface EnglishEntry { pronunciation?: string; partOfSpeech?: string; example?: string }

async function lookupEnglish(term: string): Promise<EnglishEntry> {
  const data = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term.toLowerCase())}`);
  const entries: any[] = Array.isArray(data) ? data : [];
  const pronunciation =
    entries.map(e => e?.phonetic).find(Boolean) ||
    entries.flatMap(e => (Array.isArray(e?.phonetics) ? e.phonetics : [])).map((p: any) => p?.text).find(Boolean);
  const meanings = entries.flatMap(e => (Array.isArray(e?.meanings) ? e.meanings : []));
  const pos = meanings.map((m: any) => POS_KO[String(m?.partOfSpeech || '').toLowerCase()]).find(Boolean);
  const examples: string[] = meanings
    .flatMap((m: any) => (Array.isArray(m?.definitions) ? m.definitions : []))
    .map((d: any) => String(d?.example || '').trim())
    .filter((x: string) => x.length > 0 && x.length <= 160);
  const lower = term.toLowerCase();
  const example = examples.find(x => x.toLowerCase().includes(lower)) || examples[0];
  return { pronunciation: pronunciation || undefined, partOfSpeech: pos, example };
}

const lookupCache = new Map<string, { at: number; value: unknown }>();
const CACHE_MS = 24 * 60 * 60 * 1000;

/** GET /api/dict/lookup?term=derive&lang=en */
app.get('/api/dict/lookup', async (req, res) => {
  const term = String(req.query.term || '').trim();
  const lang = String(req.query.lang || 'en');
  if (!term || term.length > 60) return res.status(400).json({ error: 'INVALID_TERM' });

  const key = `${lang}:${term.toLowerCase()}`;
  const cached = lookupCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return res.json(cached.value);

  const [meanings, english] = await Promise.allSettled([
    translateToKorean(term, lang),
    lang === 'en' && /^[a-z][a-z' -]*$/i.test(term) ? lookupEnglish(term) : Promise.resolve({} as EnglishEntry),
  ]);
  const entry: EnglishEntry = english.status === 'fulfilled' ? english.value : {};
  let exampleKo = '';
  if (entry.example) {
    exampleKo = (await translateToKorean(entry.example, lang).catch(() => [] as string[]))[0] || '';
  }
  const value = {
    meanings: meanings.status === 'fulfilled' ? meanings.value : [],
    partOfSpeech: entry.partOfSpeech,
    pronunciation: entry.pronunciation,
    example: entry.example ? { text: entry.example, ko: exampleKo } : null,
  };
  if (meanings.status === 'rejected' && english.status === 'rejected') {
    console.error('Dictionary lookup failed:', meanings.reason, english.reason);
    return res.status(502).json({ error: 'LOOKUP_FAILED' });
  }
  if (lookupCache.size > 20000) lookupCache.clear();
  lookupCache.set(key, { at: Date.now(), value });
  return res.json(value);
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

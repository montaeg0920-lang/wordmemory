/**
 * On-device text recognition (OCR) with Tesseract — no AI service, no API key.
 *
 * The engine and language data are served by our own server under /ocr
 * (see server.ts). Language data is cached by the browser (IndexedDB) after the
 * first use, so later photos are read much faster.
 */
import { createWorker, OEM, type Worker } from 'tesseract.js';

/** App language -> Tesseract language data. Korean is always added for the meanings. */
const OCR_LANG: Record<string, string> = {
  en: 'eng',
  es: 'spa',
  ja: 'jpn',
  zh: 'chi_sim',
  fr: 'fra',
  de: 'deu',
  he: 'heb',
  el: 'ell+grc',
  other: 'eng',
};

export function ocrLanguagesFor(lang: string): string {
  return `${OCR_LANG[lang] || 'eng'}+kor`;
}

let cached: { langs: string; worker: Promise<Worker> } | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let progressListener: ((p: number) => void) | null = null;

function getWorker(langs: string): Promise<Worker> {
  if (cached?.langs === langs) return cached.worker;
  if (cached) cached.worker.then(w => w.terminate()).catch(() => undefined);
  const worker = createWorker(langs.split('+'), OEM.LSTM_ONLY, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/core',
    langPath: '/ocr/lang',
    logger: m => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') progressListener?.(m.progress);
    },
  });
  cached = { langs, worker };
  worker.catch(() => {
    if (cached?.worker === worker) cached = null;
  });
  return worker;
}

/** Frees the OCR engine's memory a while after the last use. */
function scheduleRelease() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    cached?.worker.then(w => w.terminate()).catch(() => undefined);
    cached = null;
  }, 60_000);
}

const HANGUL_SYLLABLE = /^[\uac00-\ud7a3]$/;
const STARTS_HANGUL = /^[\uac00-\ud7a3]/;

/**
 * Cleans typical OCR noise: table borders and stray marks ("|", "_", "~"), and
 * Korean read with a space after every syllable ("유 래 하 다" -> "유래하다").
 * Syllables are only joined on lines where that pattern clearly shows up
 * (two or more lone syllables), so normal spacing is kept.
 */
export function tidyOcrText(text: string): string {
  return text
    .split('\n')
    .map(line => {
      const tokens = line
        .replace(/[|_~¦]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        // drop lone marks ("。", "'", "•"), but keep separators like "-", ":" and "="
        .filter(t => t && !/^[^\p{L}\p{N}\-–—:=\/]+$/u.test(t));
      if (tokens.filter(t => HANGUL_SYLLABLE.test(t)).length < 2) return tokens.join(' ');
      const out: string[] = [];
      let lastWasLone = false;
      for (const t of tokens) {
        const lone = HANGUL_SYLLABLE.test(t);
        const prev = out[out.length - 1];
        if (prev && /[\uac00-\ud7a3]$/.test(prev) && STARTS_HANGUL.test(t) && (lone || lastWasLone)) out[out.length - 1] = prev + t;
        else out.push(t);
        lastWasLone = lone;
      }
      return out.join(' ');
    })
    .join('\n');
}

/** Reads the text in an image. `onProgress` gets 0..1 while recognising. */
export async function recognizeText(
  image: Blob | HTMLCanvasElement,
  lang: string,
  onProgress?: (p: number) => void
): Promise<string> {
  clearTimeout(idleTimer);
  const worker = await getWorker(ocrLanguagesFor(lang));
  progressListener = onProgress || null;
  try {
    const { data } = await worker.recognize(image);
    return tidyOcrText(data.text || '');
  } finally {
    progressListener = null;
    scheduleRelease();
  }
}

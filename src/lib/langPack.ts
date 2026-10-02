/**
 * Offline dictionaries ("language packs").
 *
 * Packs live in a separate public repository (montaeg0920-lang/vocacurve-langpack).
 * A learner downloads only the pack of the language they study (about 1–2 MB);
 * it is kept in the browser (IndexedDB), so look-ups then work instantly and offline.
 * The manifest says which packs exist and their current version; a pack is
 * downloaded again only when that version changes.
 */

const REPO = 'montaeg0920-lang/vocacurve-langpack';
/** Tried in order; both serve public GitHub files with CORS. */
const BASES = [`https://cdn.jsdelivr.net/gh/${REPO}@main/`, `https://raw.githubusercontent.com/${REPO}/main/`];
const MANIFEST_TTL_MS = 24 * 60 * 60 * 1000;
const MANIFEST_KEY = 'vocacurve_langpack_manifest_v1';

export interface PackInfo {
  name: string;
  version: string;
  file: string;
  entries: number;
  withMeaning?: number;
  bytes: number;
  sha256?: string;
  sources?: string[];
}

interface Manifest {
  format: number;
  packs: Record<string, PackInfo>;
}

export interface PackEntry {
  meanings: string[];
  ipa?: string;
  pos?: string;
  example?: string;
}

export type PackStatus =
  | { state: 'none' } // no pack for this language
  | { state: 'missing'; info: PackInfo } // available, not downloaded
  | { state: 'outdated'; info: PackInfo; installed: string }
  | { state: 'ready'; info: PackInfo | null; version: string; entries: number };

/* ------------------------------ storage ------------------------------ */

const DB_NAME = 'vocacurve-langpacks';
const STORE = 'packs';

interface StoredPack {
  lang: string;
  version: string;
  text: string;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'lang' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readStored(lang: string): Promise<StoredPack | null> {
  try {
    const db = await openDb();
    return await new Promise(resolve => {
      const req = db.transaction(STORE).objectStore(STORE).get(lang);
      req.onsuccess = () => resolve((req.result as StoredPack) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeStored(pack: StoredPack): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(pack);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ------------------------------ network ------------------------------ */

async function fetchFromRepo(path: string, onProgress?: (loaded: number) => void): Promise<Response> {
  let lastError: unknown;
  for (const base of BASES) {
    try {
      const res = await fetch(base + path, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!onProgress || !res.body) return res;
      // Stream so the UI can show progress, then hand back a normal Response.
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        onProgress(loaded);
      }
      return new Response(new Blob(chunks as BlobPart[]));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('download failed');
}

export async function getManifest(force = false): Promise<Manifest | null> {
  try {
    const cached = JSON.parse(localStorage.getItem(MANIFEST_KEY) || 'null');
    if (!force && cached && Date.now() - cached.at < MANIFEST_TTL_MS) return cached.manifest as Manifest;
  } catch {
    // ignore
  }
  try {
    const manifest = (await (await fetchFromRepo('manifest.json')).json()) as Manifest;
    try {
      localStorage.setItem(MANIFEST_KEY, JSON.stringify({ at: Date.now(), manifest }));
    } catch {
      // storage full: still usable for this session
    }
    return manifest;
  } catch {
    // Offline: fall back to the last manifest we saw, however old.
    try {
      return (JSON.parse(localStorage.getItem(MANIFEST_KEY) || 'null')?.manifest as Manifest) || null;
    } catch {
      return null;
    }
  }
}

async function sha256Hex(text: string): Promise<string | null> {
  if (!crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------ parsing ------------------------------ */

const loaded = new Map<string, { version: string; entries: Map<string, PackEntry> }>();

function parsePack(text: string): Map<string, PackEntry> {
  const map = new Map<string, PackEntry>();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [term, meanings, ipa, pos, example] = line.split('\t');
    if (!term) continue;
    map.set(term, {
      meanings: meanings ? meanings.split(' | ').filter(Boolean) : [],
      ipa: ipa || undefined,
      pos: pos || undefined,
      example: example || undefined,
    });
  }
  return map;
}

/* ------------------------------ public API ------------------------------ */

export async function getPackStatus(lang: string): Promise<PackStatus> {
  const [manifest, stored] = await Promise.all([getManifest(), readStored(lang)]);
  const info = manifest?.packs[lang] || null;
  if (stored && (!info || stored.version === info.version)) {
    const entries = loaded.get(lang)?.entries.size ?? stored.text.split('\n').length - 1;
    return { state: 'ready', info, version: stored.version, entries };
  }
  if (!info) return { state: 'none' };
  if (stored) return { state: 'outdated', info, installed: stored.version };
  return { state: 'missing', info };
}

/** Downloads (or updates) the pack for a language. Resolves to false when there is no pack. */
export async function downloadPack(lang: string, onProgress?: (fraction: number) => void): Promise<boolean> {
  const manifest = await getManifest(true);
  const info = manifest?.packs[lang];
  if (!info) return false;
  const res = await fetchFromRepo(info.file, n => onProgress?.(Math.min(1, n / info.bytes)));
  const text = await res.text();
  if (info.sha256) {
    const hash = await sha256Hex(text);
    if (hash && hash !== info.sha256) throw new Error('사전 파일이 손상되었습니다. 다시 받아 주세요.');
  }
  await writeStored({ lang, version: info.version, text, savedAt: Date.now() });
  loaded.set(lang, { version: info.version, entries: parsePack(text) });
  return true;
}

const pending = new Map<string, Promise<boolean>>();

/** Makes sure the pack is downloaded and current (quietly, in the background). */
export function ensurePack(lang: string): Promise<boolean> {
  const running = pending.get(lang);
  if (running) return running;
  const job = (async () => {
    const status = await getPackStatus(lang);
    if (status.state === 'ready') return true;
    if (status.state === 'none') return false;
    return downloadPack(lang);
  })()
    .catch(() => false)
    .finally(() => pending.delete(lang));
  pending.set(lang, job);
  return job;
}

async function entriesFor(lang: string): Promise<Map<string, PackEntry> | null> {
  const mem = loaded.get(lang);
  if (mem) return mem.entries;
  const stored = await readStored(lang);
  if (!stored) return null;
  const entries = parsePack(stored.text);
  loaded.set(lang, { version: stored.version, entries });
  return entries;
}

/** Base forms to try for an English word form (derived -> derive, studies -> study, running -> run). */
function englishCandidates(word: string): string[] {
  const w = word.toLowerCase();
  const out = [w];
  const add = (s: string) => s.length > 1 && !out.includes(s) && out.push(s);
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
    if (/(.)\1ed$/.test(w)) add(w.slice(0, -3));
  }
  if (w.endsWith('ing')) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + 'e');
    if (/(.)\1ing$/.test(w)) add(w.slice(0, -4));
  }
  if (w.endsWith('ier') || w.endsWith('iest')) add(w.replace(/i(er|est)$/, 'y'));
  if (w.endsWith('er')) add(w.slice(0, -2));
  if (w.endsWith('est')) add(w.slice(0, -3));
  return out;
}

/** Looks a word up in the downloaded pack (null when no pack or no entry). */
export async function lookupInPack(term: string, lang: string): Promise<(PackEntry & { term: string }) | null> {
  const entries = await entriesFor(lang);
  if (!entries) return null;
  const clean = term.trim().replace(/\s+/g, ' ');
  const candidates = lang === 'en' ? englishCandidates(clean) : [clean, clean.toLowerCase()];
  for (const c of candidates) {
    const hit = entries.get(c);
    if (hit) return { term: c, ...hit };
  }
  return null;
}

export function formatPackSize(bytes: number): string {
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1e3))}KB`;
}

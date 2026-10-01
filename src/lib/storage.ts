/**
 * Persistent storage for VocaCurve (browser localStorage, per profile).
 *
 * Changes from v1:
 * - No sample words are auto-seeded. Starter decks are imported on request.
 * - Missing keys fall back to empty data (no "ghost" sample words).
 * - Write failures (e.g. storage full) are reported via a window event so the
 *   UI can warn the user instead of silently losing data.
 * - A one-time v2 migration removes the fake review history that v1 attached
 *   to sample words, while keeping every word and every real review.
 */

import {
  LanguageCode,
  MemoryState,
  ReviewEvent,
  UserProfile,
  UserSettings,
  VocabularyCollection,
  VocabularyFolder,
  VocabularyItem,
} from '../types/database';
import {
  DEFAULT_DAILY_NEW_WORDS,
  createDefaultMemoryState,
  getMemoryView,
  refreshMemoryState,
  startOfToday,
} from './memoryEngine';
import { LEGACY_SEED_ITEM_IDS } from '../data/legacySeedIds';
import { getLanguageMeta } from './languageHelper';

const STORAGE_KEYS = {
  PROFILES: 'vocacurve_profiles_v1',
  ACTIVE_USER: 'vocacurve_active_user_id_v1',
  ONBOARDING_DONE: 'vocacurve_onboarding_completed_v1',
  TRIAL_OFFER: 'vocacurve_trial_offer_v1',
  COLLECTIONS: 'vocacurve_collections_v1',
  FOLDERS: 'vocacurve_folders_v1',
  ITEMS: 'vocacurve_items_v1',
  MEMORY_STATES: 'vocacurve_memory_states_v1',
  REVIEW_EVENTS: 'vocacurve_review_events_v1',
  SETTINGS: 'vocacurve_settings_v1',
  MIGRATION_V2: 'vocacurve_migration_v2',
};

export const STORAGE_ERROR_EVENT = 'vocacurve:storage-error';
const MAX_REVIEW_EVENTS = 3000;

const DEFAULT_SETTINGS: UserSettings = {
  userId: 'user_default',
  userName: '학습자',
  sourceLanguage: 'en',
  targetLanguage: 'ko',
  preferredSessionMode: 'count',
  preferredSessionDuration: 5,
  dailyWordGoal: DEFAULT_DAILY_NEW_WORDS,
  sentenceModeEnabled: false,
  sentenceQuestionRatio: 0.25,
  soundEffects: true,
  audioPronunciation: true,
  gentleReminders: true,
  reminderTime: '20:00',
  targetDailyReviews: DEFAULT_DAILY_NEW_WORDS,
  dailyNewWords: DEFAULT_DAILY_NEW_WORDS,
  theme: 'system',
};

/* ================= Low-level helpers ================= */

function getJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (e) {
    console.warn(`Failed to read ${key} from storage:`, e);
    return fallback;
  }
}

function setJson<T>(key: string, data: T): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error(`Failed to write ${key} to storage:`, e);
    try {
      window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key } }));
    } catch {
      // ignore
    }
    return false;
  }
}

/** Asks the browser not to evict our data under storage pressure (best effort). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted?.();
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch {
    // ignore
  }
  return false;
}

/* ================= Profiles ================= */

const DEFAULT_PROFILE: UserProfile = {
  id: 'user_default',
  name: '학습자 1',
  targetLanguage: 'en',
  createdAt: Date.now(),
  avatarColor: '#2B4C7E',
};

export function getActiveProfileId(): string {
  if (typeof window === 'undefined') return 'user_default';
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_USER) || 'user_default';
}

export function setActiveProfileId(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, userId);
}

export function getUserScopedKey(baseKey: string, userId?: string): string {
  const uid = userId || getActiveProfileId();
  return uid === 'user_default' ? baseKey : `${baseKey}_${uid}`;
}

export function getProfiles(): UserProfile[] {
  const list = getJson<UserProfile[]>(STORAGE_KEYS.PROFILES, []);
  if (!list || list.length === 0) {
    setJson(STORAGE_KEYS.PROFILES, [DEFAULT_PROFILE]);
    return [DEFAULT_PROFILE];
  }
  return list;
}

export function getActiveProfile(): UserProfile {
  const activeId = getActiveProfileId();
  const profiles = getProfiles();
  return profiles.find(p => p.id === activeId) || profiles[0] || DEFAULT_PROFILE;
}

export function getWordCountForProfile(profileId: string): number {
  return getJson<VocabularyItem[]>(getUserScopedKey(STORAGE_KEYS.ITEMS, profileId), []).length;
}

function createDefaultCollection(lang: LanguageCode): VocabularyCollection {
  const now = Date.now();
  return {
    id: `col_my_${now}`,
    name: `내 ${getLanguageMeta(lang).name} 단어장`,
    sourceLanguage: lang,
    targetLanguage: 'ko',
    createdAt: now,
    updatedAt: now,
    color: '#2B4C7E',
  };
}

export function createProfile(name: string, targetLanguage: LanguageCode = 'en'): UserProfile {
  const profiles = getProfiles();
  const newId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newProfile: UserProfile = {
    id: newId,
    name: name.trim() || `학습자 ${profiles.length + 1}`,
    targetLanguage,
    createdAt: Date.now(),
  };

  setJson(STORAGE_KEYS.PROFILES, [...profiles, newProfile]);
  setActiveProfileId(newId);

  setJson(getUserScopedKey(STORAGE_KEYS.COLLECTIONS, newId), [createDefaultCollection(targetLanguage)]);
  setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS, newId), []);
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS, newId), []);
  setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES, newId), []);
  setJson(getUserScopedKey(STORAGE_KEYS.MIGRATION_V2, newId), true);
  setJson(getUserScopedKey(STORAGE_KEYS.SETTINGS, newId), {
    ...DEFAULT_SETTINGS,
    userId: newId,
    userName: newProfile.name,
    sourceLanguage: targetLanguage,
  });

  return newProfile;
}

export function updateProfile(id: string, updates: Partial<UserProfile>): UserProfile {
  const profiles = getProfiles();
  const index = profiles.findIndex(p => p.id === id);
  if (index < 0) return getActiveProfile();

  profiles[index] = { ...profiles[index], ...updates };
  setJson(STORAGE_KEYS.PROFILES, profiles);

  const settingsKey = getUserScopedKey(STORAGE_KEYS.SETTINGS, id);
  const current = getJson<UserSettings>(settingsKey, { ...DEFAULT_SETTINGS, userId: id });
  setJson(settingsKey, {
    ...current,
    ...(updates.name ? { userName: updates.name } : {}),
    ...(updates.targetLanguage ? { sourceLanguage: updates.targetLanguage } : {}),
  });
  return profiles[index];
}

export function deleteProfile(id: string): void {
  const profiles = getProfiles();
  if (profiles.length <= 1) return;
  setJson(STORAGE_KEYS.PROFILES, profiles.filter(p => p.id !== id));

  if (typeof window !== 'undefined') {
    [
      STORAGE_KEYS.COLLECTIONS,
      STORAGE_KEYS.FOLDERS,
      STORAGE_KEYS.ITEMS,
      STORAGE_KEYS.MEMORY_STATES,
      STORAGE_KEYS.REVIEW_EVENTS,
      STORAGE_KEYS.SETTINGS,
      STORAGE_KEYS.MIGRATION_V2,
    ].forEach(k => localStorage.removeItem(getUserScopedKey(k, id)));
  }

  if (getActiveProfileId() === id) {
    setActiveProfileId(getProfiles()[0].id);
  }
}

export function hasCompletedOnboarding(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE) === 'true';
}

export function completeOnboarding(name: string, targetLanguage: LanguageCode = 'en'): UserProfile {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
  }
  const active = getActiveProfile();
  const updated = updateProfile(active.id, { name: name.trim() || '학습자 1', targetLanguage });

  // A brand-new user gets an empty notebook in the chosen language.
  const items = getVocabularyItems();
  const collections = getCollections();
  if (items.length === 0) {
    // Only a fresh install (no words yet) is offered the sample-word trial.
    localStorage.setItem(STORAGE_KEYS.TRIAL_OFFER, 'true');
    const onlyEmptyDefaults = collections.every(c => c.id.startsWith('col_my_'));
    if (collections.length === 0 || onlyEmptyDefaults) {
      setJson(getUserScopedKey(STORAGE_KEYS.COLLECTIONS), [createDefaultCollection(targetLanguage)]);
    }
  }
  return updated;
}

/** True until a brand-new learner saves their first words (or dismisses the trial). */
export function isTrialOfferActive(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEYS.TRIAL_OFFER) === 'true';
}

export function endTrialOffer(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEYS.TRIAL_OFFER);
}

/* ================= Init & migration ================= */

export function initializeStorageIfNeeded(): void {
  getProfiles();
  const profile = getActiveProfile();

  const colKey = getUserScopedKey(STORAGE_KEYS.COLLECTIONS);
  const cols = getJson<VocabularyCollection[]>(colKey, []);
  if (cols.length === 0) {
    setJson(colKey, [createDefaultCollection(profile.targetLanguage || 'en')]);
  }

  runMigrationV2();
}

/**
 * v1 attached invented review history to sample words (e.g. "4 correct answers,
 * reviewed 1.2 days ago") so new users saw progress they never made. This resets
 * the schedule of those sample words *only if they have no real review events*.
 * All words, folders and genuine review history are kept.
 */
function runMigrationV2(): void {
  const flagKey = getUserScopedKey(STORAGE_KEYS.MIGRATION_V2);
  if (getJson<boolean>(flagKey, false)) return;

  const reviewedIds = new Set(getReviewEvents().map(e => e.vocabularyItemId));
  const statesKey = getUserScopedKey(STORAGE_KEYS.MEMORY_STATES);
  const states = getJson<MemoryState[]>(statesKey, []);

  const migrated = states.map(s => {
    if (LEGACY_SEED_ITEM_IDS.has(s.vocabularyItemId) && !reviewedIds.has(s.vocabularyItemId)) {
      return createDefaultMemoryState(s.vocabularyItemId, s.userId);
    }
    // v1 could leave a "fast click" flag that blocked a word from ever graduating.
    return s.fastFlag ? { ...s, fastFlag: false } : s;
  });

  if (setJson(statesKey, migrated)) {
    setJson(flagKey, true);
  }
}

/* ================= Collections & folders ================= */

export function getCollections(): VocabularyCollection[] {
  return getJson<VocabularyCollection[]>(getUserScopedKey(STORAGE_KEYS.COLLECTIONS), []);
}

export function saveCollection(collection: VocabularyCollection): void {
  const list = getCollections();
  const index = list.findIndex(c => c.id === collection.id);
  if (index >= 0) list[index] = { ...collection, updatedAt: Date.now() };
  else list.push(collection);
  setJson(getUserScopedKey(STORAGE_KEYS.COLLECTIONS), list);
}

export function deleteCollection(id: string): void {
  const removedIds = new Set(getVocabularyItems().filter(i => i.collectionId === id).map(i => i.id));
  setJson(getUserScopedKey(STORAGE_KEYS.COLLECTIONS), getCollections().filter(c => c.id !== id));
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), getVocabularyItems().filter(i => i.collectionId !== id));
  setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), getFolders().filter(f => f.collectionId !== id));
  setJson(
    getUserScopedKey(STORAGE_KEYS.MEMORY_STATES),
    getRawMemoryStates().filter(s => !removedIds.has(s.vocabularyItemId))
  );
}

export function getFolders(collectionId?: string): VocabularyFolder[] {
  const folders = getJson<VocabularyFolder[]>(getUserScopedKey(STORAGE_KEYS.FOLDERS), []);
  if (collectionId && collectionId !== 'all') return folders.filter(f => f.collectionId === collectionId);
  return folders;
}

export function saveFolder(folder: VocabularyFolder): void {
  const list = getFolders();
  const index = list.findIndex(f => f.id === folder.id);
  if (index >= 0) list[index] = { ...folder, updatedAt: Date.now() };
  else list.push(folder);
  setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), list);
}

export function deleteFolder(id: string): void {
  setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), getFolders().filter(f => f.id !== id));
  const items = getVocabularyItems().map(item => {
    if (item.folderId !== id) return item;
    const { folderId: _removed, ...rest } = item;
    return rest;
  });
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), items);
}

export function moveItemsToFolder(itemIds: string[], folderId?: string): void {
  const idSet = new Set(itemIds);
  const target = folderId && folderId !== 'all' && folderId !== 'none' ? folderId : undefined;
  const items = getVocabularyItems().map(item =>
    idSet.has(item.id) ? { ...item, folderId: target, updatedAt: Date.now() } : item
  );
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), items);
}

/* ================= Vocabulary items ================= */

export function getVocabularyItems(collectionId?: string): VocabularyItem[] {
  const items = getJson<VocabularyItem[]>(getUserScopedKey(STORAGE_KEYS.ITEMS), []);
  return collectionId ? items.filter(i => i.collectionId === collectionId) : items;
}

const FOREIGN_LETTER = /[a-zA-ZÀ-ɏͰ-Ͽἀ-῿֐-׿Ѐ-ӿ぀-ヿ一-鿿]/;

/** Saves (or merges by term) words. Returns how many were saved. */
export function saveVocabularyItems(newItems: VocabularyItem[]): number {
  const current = getVocabularyItems();
  const byId = new Map(current.map(i => [i.id, i]));
  const termKeyToId = new Map(current.map(i => [`${i.collectionId}_${i.term.toLowerCase().trim()}`, i.id]));
  const processed: VocabularyItem[] = [];

  for (const raw of newItems) {
    let term = (raw.term || '').trim();
    let meaning = (raw.userMeaning || '').trim();

    // Korean on the left and foreign word on the right → swap.
    if (/[가-힣]/.test(term) && !FOREIGN_LETTER.test(term) && FOREIGN_LETTER.test(meaning) && !/[가-힣]/.test(meaning)) {
      [term, meaning] = [meaning, term];
    }
    term = term.replace(/^(?:no\.?\s*)?[0-9]+[.)\-:\s]+/i, '').trim();
    term = term.replace(/^[-–—:~=→>•·*|/\s,;]+/, '').replace(/[-–—:~=→>•·*|/\s,;]+$/, '').trim();
    meaning = meaning.replace(/^[-–—:~=→>•·*|/\s,;]+/, '').replace(/[-–—:~=→>•·*|/\s,;]+$/, '').trim();
    if (!term || !meaning || /^\d+$/.test(term)) continue;

    const termKey = `${raw.collectionId}_${term.toLowerCase()}`;
    const existingId = termKeyToId.get(termKey);
    const existing = existingId ? byId.get(existingId) : undefined;

    const item: VocabularyItem = {
      ...(existing || {}),
      ...raw,
      id: existingId || raw.id,
      term,
      lemma: raw.lemma || term.toLowerCase(),
      userMeaning: meaning,
      createdAt: existing?.createdAt || raw.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    byId.set(item.id, item);
    termKeyToId.set(termKey, item.id);
    processed.push(item);
  }

  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), Array.from(byId.values()));

  const states = getRawMemoryStates();
  const stateIds = new Set(states.map(s => s.vocabularyItemId));
  const userId = getActiveProfileId();
  let added = false;
  for (const item of processed) {
    if (!stateIds.has(item.id)) {
      states.push(createDefaultMemoryState(item.id, userId));
      stateIds.add(item.id);
      added = true;
    }
  }
  if (added) setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), states);
  return processed.length;
}

export function updateVocabularyItem(item: VocabularyItem): void {
  const items = getVocabularyItems();
  const index = items.findIndex(i => i.id === item.id);
  if (index >= 0) {
    items[index] = { ...item, updatedAt: Date.now() };
    setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), items);
  }
}

export function deleteVocabularyItems(ids: string[]): void {
  const idSet = new Set(ids);
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), getVocabularyItems().filter(i => !idSet.has(i.id)));
  setJson(
    getUserScopedKey(STORAGE_KEYS.MEMORY_STATES),
    getRawMemoryStates().filter(s => !idSet.has(s.vocabularyItemId))
  );
}

export function deleteVocabularyItem(id: string): void {
  deleteVocabularyItems([id]);
}

/**
 * Manual clean-up ("단어 정리"): fixes numbering, stray symbols, inline
 * pronunciation/part-of-speech and swapped columns. Never deletes a word
 * except for exact duplicates (same term in the same 단어장) with no history.
 */
export function cleanAndRepairVocabulary(): { repairedCount: number; removedCount: number } {
  const items = getVocabularyItems();
  const statesById = new Map(getRawMemoryStates().map(s => [s.vocabularyItemId, s]));
  const seen = new Map<string, VocabularyItem>();
  const cleaned: VocabularyItem[] = [];
  let repairedCount = 0;
  let removedCount = 0;

  for (const item of items) {
    let term = (item.term || '').trim();
    let meaning = (item.userMeaning || '').trim();
    let { partOfSpeech, pronunciation } = item;
    const before = `${term}|${meaning}|${partOfSpeech}|${pronunciation}`;

    if (/[가-힣]/.test(term) && !FOREIGN_LETTER.test(term) && FOREIGN_LETTER.test(meaning) && !/[가-힣]/.test(meaning)) {
      [term, meaning] = [meaning, term];
    }
    term = term
      .replace(/^(?:no\.?\s*)?[0-9]+[.)\-:\s]+/i, '')
      .replace(/^[(\[]\s*[0-9]+\s*[)\]]\s*/, '')
      .trim();
    const pron = /\/([^/]+)\//.exec(term);
    if (pron) {
      pronunciation = pronunciation || `/${pron[1].trim()}/`;
      term = term.replace(pron[0], ' ').trim();
    }
    const posMatch = /[(\[]\s*(동사|명사|형용사|부사|전치사|접속사|v\.?|n\.?|adj\.?|adv\.?|prep\.?|conj\.?)\s*[)\]]/i.exec(term);
    if (posMatch) {
      const map: Record<string, string> = { v: '동사', n: '명사', adj: '형용사', adv: '부사', prep: '전치사', conj: '접속사' };
      const key = posMatch[1].replace('.', '').toLowerCase();
      partOfSpeech = partOfSpeech || map[key] || posMatch[1];
      term = term.replace(posMatch[0], ' ').trim();
    }
    const strip = (t: string) =>
      t.replace(/^[-–—:~=→>•·*|/\s,;]+/, '').replace(/[-–—:~=→>•·*|/\s,;]+$/, '').replace(/^["'`“‘]+|["'`”’]+$/g, '').trim();
    term = strip(term) || item.term;
    meaning = strip(meaning) || item.userMeaning;

    const key = `${item.collectionId}_${term.toLowerCase()}`;
    const dup = seen.get(key);
    const history = statesById.get(item.id);
    if (dup && (!history || !history.lastReviewedAt)) {
      removedCount++;
      continue;
    }

    const after = `${term}|${meaning}|${partOfSpeech}|${pronunciation}`;
    const changed = before !== after;
    if (changed) repairedCount++;
    const next = changed
      ? { ...item, term, lemma: term.toLowerCase(), userMeaning: meaning, partOfSpeech, pronunciation, updatedAt: Date.now() }
      : item;
    if (!dup) seen.set(key, next);
    cleaned.push(next);
  }

  if (repairedCount > 0 || removedCount > 0) {
    setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), cleaned);
    const keep = new Set(cleaned.map(i => i.id));
    setJson(
      getUserScopedKey(STORAGE_KEYS.MEMORY_STATES),
      getRawMemoryStates().filter(s => keep.has(s.vocabularyItemId))
    );
  }
  return { repairedCount, removedCount };
}

/* ================= Memory states & review events ================= */

function getRawMemoryStates(): MemoryState[] {
  return getJson<MemoryState[]>(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), []);
}

export function getMemoryStates(): MemoryState[] {
  const now = Date.now();
  return getRawMemoryStates().map(s => refreshMemoryState(s, now));
}

export function getMemoryStateMap(): Map<string, MemoryState> {
  return new Map(getMemoryStates().map(s => [s.vocabularyItemId, s]));
}

export function saveMemoryState(state: MemoryState): void {
  const states = getRawMemoryStates();
  const index = states.findIndex(s => s.vocabularyItemId === state.vocabularyItemId);
  if (index >= 0) states[index] = state;
  else states.push(state);
  setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), states);
}

export function getReviewEvents(): ReviewEvent[] {
  return getJson<ReviewEvent[]>(getUserScopedKey(STORAGE_KEYS.REVIEW_EVENTS), []);
}

export function logReviewEvent(event: ReviewEvent): void {
  const events = getReviewEvents();
  events.push(event);
  setJson(getUserScopedKey(STORAGE_KEYS.REVIEW_EVENTS), events.slice(-MAX_REVIEW_EVENTS));
}

/* ================= Settings ================= */

export function getUserSettings(): UserSettings {
  const profile = getActiveProfile();
  const loaded = getJson<Partial<UserSettings>>(getUserScopedKey(STORAGE_KEYS.SETTINGS), {});
  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    userId: profile.id,
    userName: profile.name || loaded.userName || DEFAULT_SETTINGS.userName,
    sourceLanguage: profile.targetLanguage || loaded.sourceLanguage || 'en',
    targetLanguage: 'ko',
    dailyNewWords: loaded.dailyNewWords ?? DEFAULT_DAILY_NEW_WORDS,
    theme: loaded.theme ?? 'system',
  };
}

export function updateUserSettings(partial: Partial<UserSettings>): UserSettings {
  const updated = { ...getUserSettings(), ...partial };
  setJson(getUserScopedKey(STORAGE_KEYS.SETTINGS), updated);
  const profile = getActiveProfile();
  if (
    (partial.userName && partial.userName !== profile.name) ||
    (partial.sourceLanguage && partial.sourceLanguage !== profile.targetLanguage)
  ) {
    updateProfile(profile.id, {
      ...(partial.userName ? { name: partial.userName } : {}),
      ...(partial.sourceLanguage ? { targetLanguage: partial.sourceLanguage } : {}),
    });
  }
  return updated;
}

/* ================= Statistics (real data only) ================= */

export interface DayCount {
  date: number; // start of day timestamp
  count: number;
}

export interface StatsSummary {
  totalWords: number;
  newWords: number;
  learningWords: number;
  retainingWords: number;
  masteredWords: number;
  studiedWords: number;
  /** Average current retention of studied words (0..100), null if none studied. */
  averageRetention: number | null;
  todayReviewsCount: number;
  weeklyReviewsCount: number;
  /** Share of "확실히 알아요" in the last 7 days (0..100), null if no reviews. */
  accuracy7d: number | null;
  streakDays: number;
  dailyReviews: DayCount[]; // last 14 days, oldest first
  upcoming: DayCount[]; // next 7 days (index 0 = today, includes overdue)
}

export function getStatsSummary(): StatsSummary {
  const items = getVocabularyItems();
  const stateMap = getMemoryStateMap();
  const events = getReviewEvents();
  const now = Date.now();
  const today = startOfToday(now);
  const DAY = 86400000;

  let newWords = 0;
  let learningWords = 0;
  let retainingWords = 0;
  let masteredWords = 0;
  let retentionSum = 0;
  let studied = 0;
  const upcoming: DayCount[] = Array.from({ length: 7 }, (_, i) => ({ date: today + i * DAY, count: 0 }));

  for (const item of items) {
    const v = getMemoryView(stateMap.get(item.id), now);
    if (v.status === 'new') newWords++;
    else if (v.status === 'learning') learningWords++;
    else if (v.status === 'retaining') retainingWords++;
    else masteredWords++;

    if (v.retention !== null) {
      retentionSum += v.retention;
      studied++;
    }
    if (v.nextDueAt !== null) {
      const dayIdx = Math.max(0, Math.floor((v.nextDueAt - today) / DAY));
      if (dayIdx < 7) upcoming[dayIdx].count++;
    }
  }

  const dailyReviews: DayCount[] = Array.from({ length: 14 }, (_, i) => ({ date: today - (13 - i) * DAY, count: 0 }));
  const activeDays = new Set<number>();
  let week = 0;
  let weekSure = 0;
  let todayCount = 0;
  for (const e of events) {
    const day = startOfToday(e.reviewedAt);
    activeDays.add(day);
    const idx = 13 - Math.round((today - day) / DAY);
    if (idx >= 0 && idx < 14) dailyReviews[idx].count++;
    if (day === today) todayCount++;
    if (e.reviewedAt >= today - 6 * DAY) {
      week++;
      if (e.confidenceRating === 'know_well') weekSure++;
    }
  }

  // Streak: consecutive active days ending today (or yesterday if not studied yet today).
  let streak = 0;
  let cursor = activeDays.has(today) ? today : today - DAY;
  while (activeDays.has(cursor)) {
    streak++;
    cursor -= DAY;
  }

  return {
    totalWords: items.length,
    newWords,
    learningWords,
    retainingWords,
    masteredWords,
    studiedWords: studied,
    averageRetention: studied > 0 ? Math.round((retentionSum / studied) * 100) : null,
    todayReviewsCount: todayCount,
    weeklyReviewsCount: week,
    accuracy7d: week > 0 ? Math.round((weekSure / week) * 100) : null,
    streakDays: streak,
    dailyReviews,
    upcoming,
  };
}

/* ================= Backup / reset ================= */

export function clearAllWords(): void {
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), []);
  setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), []);
  setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), []);
  setJson(getUserScopedKey(STORAGE_KEYS.REVIEW_EVENTS), []);
  setJson(getUserScopedKey(STORAGE_KEYS.COLLECTIONS), [createDefaultCollection(getActiveProfile().targetLanguage)]);
}

export function exportUserDataAsJson(): string {
  return JSON.stringify(
    {
      vocacurve_version: '2.0',
      exportedAt: new Date().toISOString(),
      profile: getActiveProfile(),
      collections: getCollections(),
      folders: getFolders(),
      items: getVocabularyItems(),
      memoryStates: getRawMemoryStates(),
      reviewEvents: getReviewEvents(),
      settings: getUserSettings(),
    },
    null,
    2
  );
}

export function importUserDataFromJson(jsonStr: string): boolean {
  try {
    const data = JSON.parse(jsonStr);
    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('유효한 VocaCurve 백업 파일이 아닙니다.');
    }
    const ok = [
      setJson(getUserScopedKey(STORAGE_KEYS.COLLECTIONS), Array.isArray(data.collections) ? data.collections : []),
      setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), Array.isArray(data.folders) ? data.folders : []),
      setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), data.items),
      setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), Array.isArray(data.memoryStates) ? data.memoryStates : []),
      setJson(getUserScopedKey(STORAGE_KEYS.REVIEW_EVENTS), Array.isArray(data.reviewEvents) ? data.reviewEvents : []),
    ].every(Boolean);
    if (data.settings) setJson(getUserScopedKey(STORAGE_KEYS.SETTINGS), data.settings);
    // Old (v1) backups may contain the fake sample history — clean it once more.
    if (data.vocacurve_version !== '2.0') {
      localStorage.removeItem(getUserScopedKey(STORAGE_KEYS.MIGRATION_V2));
      runMigrationV2();
    }
    initializeStorageIfNeeded();
    return ok;
  } catch (e) {
    console.error('Failed to import JSON data:', e);
    return false;
  }
}

/**
 * VocaCurve memory engine (single source of truth).
 *
 * All scheduling AND everything shown on screen (status, retention %, due counts)
 * is derived from the half-life scheduler in ./scienceScheduler. The old
 * "strength/stability" fields on MemoryState are kept only for backward-compatible
 * storage and are no longer used for any calculation.
 */

import {
  ConfidenceRating,
  MemoryState,
  MemoryStatus,
  StudyDirection,
  UserSettings,
  VocabularyItem,
} from '../types/database';
import {
  MS_PER_DAY,
  SCIENCE_CONFIG,
  ScienceMemoryFields,
  UserResponseCode,
  calculateHlrInterval,
  calculateHlrRecall,
  calculateSciencePriority,
  migrateOrHydrateScienceState,
  processScienceReview,
} from './scienceScheduler';

/** A word counts as "장기 기억" once its next interval is about 3 weeks or more. */
export const MASTERED_HALF_LIFE_DAYS = 90;
export const DEFAULT_DAILY_NEW_WORDS = 10;
export const MAX_CARDS_PER_SESSION = 50;

export const STATUS_LABEL: Record<MemoryStatus, string> = {
  new: '새 단어',
  learning: '익히는 중',
  retaining: '기억 중',
  mastered: '장기 기억',
};

export interface MemoryView {
  status: MemoryStatus;
  /** Current predicted recall 0..1, or null when the word was never studied. */
  retention: number | null;
  isDue: boolean;
  nextDueAt: number | null;
  reviewCount: number;
  science: ScienceMemoryFields;
}

export function startOfToday(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function createDefaultMemoryState(
  vocabularyItemId: string,
  userId: string = 'local_user'
): MemoryState {
  const now = Date.now();
  return {
    id: `mem_${vocabularyItemId}`,
    userId,
    vocabularyItemId,
    recognitionStability: 1.0,
    productionStability: 0.6,
    sentenceStability: 0.8,
    transferStability: 0.8,
    difficulty: 1.0,
    recognitionStrength: 0,
    productionStrength: 0,
    sentenceStrength: 0,
    transferStrength: 0,
    lastReviewedAt: null,
    nextReviewAt: now,
    estimatedRecallProbability: 0,
    correctCount: 0,
    wrongCount: 0,
    consecutiveCorrect: 0,
    lapses: 0,
    averageResponseTime: 0,
    hintCount: 0,
    status: 'new',
    updatedAt: now,
    phase: 'NEW',
    lastReviewAt: null,
    nextDueAt: now,
    lastResponse: null,
    sureStreak: 0,
    lapseCount: 0,
    reviewCount: 0,
    responseTimeMs: 0,
    fastFlag: false,
    supportLevel: 0,
    halfLife: SCIENCE_CONFIG.defaultInitialHalfLifeDays,
    predictedRecall: 0,
    verifiedSureDates: [],
    importance: 0.5,
    relearnStep: 0,
    stabilizingStep: 0,
  };
}

/** Reads a memory state (or its absence) into the values the UI shows. */
export function getMemoryView(state: MemoryState | undefined, now: number = Date.now()): MemoryView {
  const s = state || createDefaultMemoryState('tmp');
  const science = migrateOrHydrateScienceState(s, now);
  const reviewCount = science.reviewCount || 0;

  if (reviewCount === 0 || !science.lastReviewAt) {
    return { status: 'new', retention: null, isDue: false, nextDueAt: null, reviewCount: 0, science };
  }

  let status: MemoryStatus = 'learning';
  if (science.phase === 'MATURE') {
    status = science.halfLife >= MASTERED_HALF_LIFE_DAYS ? 'mastered' : 'retaining';
  }

  const elapsedDays = Math.max(0, (now - science.lastReviewAt) / MS_PER_DAY);
  const retention = calculateHlrRecall(elapsedDays, science.halfLife);

  return {
    status,
    retention,
    isDue: science.nextDueAt <= now,
    nextDueAt: science.nextDueAt,
    reviewCount,
    science,
  };
}

/** Keeps the stored convenience fields (status, estimatedRecallProbability) in sync. */
export function refreshMemoryState(state: MemoryState, now: number = Date.now()): MemoryState {
  const view = getMemoryView(state, now);
  return {
    ...state,
    status: view.status,
    estimatedRecallProbability: view.retention ?? 0,
  };
}

export interface ReviewEvaluationResult {
  updatedState: MemoryState;
  intervalMinutes: number;
  feedback: string;
}

function ratingToResponse(rating: ConfidenceRating): UserResponseCode {
  if (rating === 'know_well' || rating === 'exact') return 'SURE';
  if (rating === 'unsure' || rating === 'ambiguous' || rating === 'somewhat') return 'UNSURE';
  return 'UNKNOWN';
}

/** Applies one self-graded answer to a word's schedule. */
export function processReviewResult(
  currentState: MemoryState,
  params: { rating: ConfidenceRating; responseTimeMs: number; reviewedAt?: number; hintUsed?: boolean }
): ReviewEvaluationResult {
  const now = params.reviewedAt || Date.now();
  const current = migrateOrHydrateScienceState(currentState, now);
  const response = ratingToResponse(params.rating);

  const res = processScienceReview(current, {
    response,
    responseTimeMs: params.responseTimeMs,
    now,
    // Self-graded flashcards: a quick "확실히 알아요" is a real answer, not a guess.
    effectiveFastThresholdMs: 0,
  });
  const next = { ...res.nextState, fastFlag: false };

  // While a word is still stabilising, the scheduler moves it on fixed steps
  // (1·4·12 days) without touching its half-life. Align the half-life with the
  // chosen interval so the retention % shown on screen matches the schedule
  // (≈85% at the moment the word becomes due).
  const target = SCIENCE_CONFIG.targetRecallDefault;
  let intervalMinutes = res.intervalMinutes;
  if ((next.phase === 'STABILIZING' || next.phase === 'RELEARN') && response !== 'UNKNOWN') {
    const aligned = intervalMinutes / 1440 / -Math.log2(target);
    next.halfLife = Math.min(SCIENCE_CONFIG.maxHalfLifeDays, Math.max(next.halfLife, aligned));
  }
  // A correct recall after E days is evidence the half-life is at least ~4×E.
  // Without this floor, a word that was failed once and then relearned would
  // return to MATURE with a tiny half-life and be asked every few hours.
  if (next.phase === 'MATURE' && response === 'SURE' && current.lastReviewAt) {
    const elapsedDays = (now - current.lastReviewAt) / MS_PER_DAY;
    const floor = elapsedDays / -Math.log2(target);
    if (floor > next.halfLife) {
      next.halfLife = Math.min(SCIENCE_CONFIG.maxHalfLifeDays, floor);
      intervalMinutes = Math.round(calculateHlrInterval(next.halfLife, target) * 1440);
      next.nextDueAt = now + intervalMinutes * 60000;
    }
  }

  const isCorrect = response !== 'UNKNOWN';
  const updated: MemoryState = {
    ...currentState,
    ...next,
    lastReviewedAt: now,
    nextReviewAt: next.nextDueAt,
    firstReviewedAt: currentState.firstReviewedAt ?? (current.reviewCount === 0 ? now : undefined),
    consecutiveCorrect: next.sureStreak,
    lapses: next.lapseCount,
    correctCount: (currentState.correctCount || 0) + (isCorrect ? 1 : 0),
    wrongCount: (currentState.wrongCount || 0) + (isCorrect ? 0 : 1),
    averageResponseTime: currentState.averageResponseTime
      ? Math.round(currentState.averageResponseTime * 0.75 + params.responseTimeMs * 0.25)
      : params.responseTimeMs,
    hintCount: (currentState.hintCount || 0) + (params.hintUsed ? 1 : 0),
    updatedAt: now,
  };

  return {
    updatedState: refreshMemoryState(updated, now),
    intervalMinutes,
    feedback: res.feedbackMessage,
  };
}

/** Human-friendly "다음 복습" text for an interval or a timestamp. */
export function formatInterval(minutes: number): string {
  if (minutes < 59.5) return `${Math.max(1, Math.round(minutes))}분 후`;
  if (minutes < 22 * 60) return `${Math.round(minutes / 60)}시간 후`;
  const days = Math.max(1, Math.round(minutes / 1440));
  if (days < 31) return `${days}일 후`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}개월 후` : `${Math.round(days / 365)}년 후`;
}

export function formatDueAt(ts: number | null, now: number = Date.now()): string {
  if (ts === null) return '아직 학습 전';
  if (ts <= now) return '지금 복습';
  return formatInterval((ts - now) / 60000);
}

/* ===================== Session planning ===================== */

export interface SessionOptions {
  collectionId?: string;
  folderId?: string;
  direction?: StudyDirection;
  /** Extra new words on top of today's allowance ("새 단어 5개 더"). */
  extraNew?: number;
  /** Practice weak words without changing their schedule. */
  practice?: boolean;
}

export type EmptyReason = 'no_words' | 'empty_scope' | 'no_sentences' | 'all_done' | 'nothing_to_practice';

export interface SessionPlan {
  items: VocabularyItem[];
  dueCount: number;
  newCount: number;
  practice: boolean;
  direction: StudyDirection;
  /** Due words left over because of the per-session cap. */
  remainingDue: number;
  emptyReason?: EmptyReason;
}

export interface TodaySummary {
  dueNow: number;
  newAvailable: number;
  newLearnedToday: number;
  newAllowanceLeft: number;
  totalWords: number;
  nextDueAt: number | null;
}

function scopeItems(items: VocabularyItem[], collectionId?: string, folderId?: string) {
  return items.filter(i => {
    if (collectionId && collectionId !== 'all' && i.collectionId !== collectionId) return false;
    if (folderId && folderId !== 'all' && i.folderId !== folderId) return false;
    return true;
  });
}

export function getDailyNewWords(settings: UserSettings): number {
  return settings.dailyNewWords ?? DEFAULT_DAILY_NEW_WORDS;
}

export function getTodaySummary(
  items: VocabularyItem[],
  memoryStateMap: Map<string, MemoryState>,
  settings: UserSettings,
  options: { collectionId?: string; folderId?: string } = {},
  now: number = Date.now()
): TodaySummary {
  const todayStart = startOfToday(now);
  let newLearnedToday = 0;
  memoryStateMap.forEach(s => {
    if (s.firstReviewedAt && s.firstReviewedAt >= todayStart) newLearnedToday++;
  });

  const pool = scopeItems(items, options.collectionId, options.folderId);
  let dueNow = 0;
  let newAvailable = 0;
  let nextDueAt: number | null = null;
  for (const item of pool) {
    const v = getMemoryView(memoryStateMap.get(item.id), now);
    if (v.status === 'new') newAvailable++;
    else if (v.isDue) dueNow++;
    else if (v.nextDueAt !== null && (nextDueAt === null || v.nextDueAt < nextDueAt)) nextDueAt = v.nextDueAt;
  }

  const allowance = Math.max(0, getDailyNewWords(settings) - newLearnedToday);
  return {
    dueNow,
    newAvailable,
    newLearnedToday,
    newAllowanceLeft: Math.min(allowance, newAvailable),
    totalWords: pool.length,
    nextDueAt,
  };
}

export function generateSessionPlan(
  allItems: VocabularyItem[],
  memoryStateMap: Map<string, MemoryState>,
  settings: UserSettings,
  options: SessionOptions = {},
  now: number = Date.now()
): SessionPlan {
  const direction: StudyDirection = options.direction || 'en_to_ko';
  const practice = !!options.practice;
  const base: SessionPlan = { items: [], dueCount: 0, newCount: 0, practice, direction, remainingDue: 0 };

  if (allItems.length === 0) return { ...base, emptyReason: 'no_words' };

  let pool = scopeItems(allItems, options.collectionId, options.folderId);
  if (pool.length === 0) return { ...base, emptyReason: 'empty_scope' };

  if (direction === 'context_cloze') {
    pool = pool.filter(i => i.exampleSentences && i.exampleSentences.length > 0);
    if (pool.length === 0) return { ...base, emptyReason: 'no_sentences' };
  }

  const views = pool.map(item => ({ item, view: getMemoryView(memoryStateMap.get(item.id), now) }));

  if (practice) {
    const weak = views
      .filter(v => v.view.status !== 'new')
      .sort((a, b) => (a.view.retention ?? 0) - (b.view.retention ?? 0))
      .slice(0, 10)
      .map(v => v.item);
    if (weak.length === 0) return { ...base, emptyReason: 'nothing_to_practice' };
    return { ...base, items: weak };
  }

  const due = views
    .filter(v => v.view.status !== 'new' && v.view.isDue)
    .map(v => ({ item: v.item, priority: calculateSciencePriority(v.view.science, now) }))
    .sort((a, b) => b.priority - a.priority)
    .map(v => v.item);

  const summary = getTodaySummary(allItems, memoryStateMap, settings, {}, now);
  const newAllowance = Math.max(0, getDailyNewWords(settings) - summary.newLearnedToday) + (options.extraNew || 0);
  const fresh = views
    .filter(v => v.view.status === 'new')
    .sort((a, b) => (a.item.createdAt || 0) - (b.item.createdAt || 0))
    .slice(0, newAllowance)
    .map(v => v.item);

  const dueTaken = due.slice(0, MAX_CARDS_PER_SESSION);
  const newTaken = fresh.slice(0, Math.max(0, MAX_CARDS_PER_SESSION - dueTaken.length));
  const items = [...dueTaken, ...newTaken];

  if (items.length === 0) return { ...base, emptyReason: 'all_done' };

  return {
    ...base,
    items,
    dueCount: dueTaken.length,
    newCount: newTaken.length,
    remainingDue: due.length - dueTaken.length,
  };
}

export const EMPTY_REASON_MESSAGE: Record<EmptyReason, string> = {
  no_words: '아직 단어가 없습니다. 먼저 단어를 추가해 주세요.',
  empty_scope: '선택한 단어장·폴더에 단어가 없습니다.',
  no_sentences: '예문이 있는 단어가 없어 문맥 빈칸 문제를 낼 수 없습니다.',
  all_done: '오늘 복습할 단어를 모두 끝냈습니다.',
  nothing_to_practice: '아직 학습한 단어가 없어 연습할 단어가 없습니다.',
};

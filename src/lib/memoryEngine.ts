/**
 * VocaCurve memory engine (single source of truth).
 *
 * Scheduling and everything shown on screen (status, retention %, due counts)
 * comes from FSRS (Free Spaced Repetition Scheduler, via ts-fsrs). Each word has
 * its own difficulty (D) and stability (S); the predicted recall right now (R)
 * follows FSRS's forgetting curve. A word is due when R is about to drop to 90%.
 *
 * Older fields on MemoryState (strength/halfLife/phase…) are kept only so old
 * data still loads; they are not used for any calculation.
 */

import { Card, Grade, Rating, State, createEmptyCard, fsrs } from 'ts-fsrs';
import {
  ConfidenceRating,
  MemoryState,
  MemoryStatus,
  ReviewEvent,
  StudyDirection,
  UserSettings,
  VocabularyItem,
} from '../types/database';

export const MS_PER_DAY = 86400000;
/** FSRS schedules a review when predicted recall falls to this level. */
export const DESIRED_RETENTION = 0.9;
/** Stability (days until recall drops to 90%) at which a word counts as "기억 중" / "장기 기억". */
export const RETAINING_STABILITY_DAYS = 7;
export const MASTERED_STABILITY_DAYS = 21;
export const DEFAULT_DAILY_NEW_WORDS = 10;
export const MAX_CARDS_PER_SESSION = 50;

/**
 * Short-term (same-day) steps are off: the review screen already repeats missed
 * words within the session, and only the first answer of a session is scheduled.
 */
const scheduler = fsrs({
  request_retention: DESIRED_RETENTION,
  maximum_interval: 365, // see every word at least once a year
  enable_fuzz: false,
  enable_short_term: false,
  learning_steps: [],
  relearning_steps: [],
});

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
  /** FSRS stability in days (time until recall drops to 90%). 0 for new words. */
  stability: number;
  /** FSRS difficulty 1 (easy) .. 10 (hard). */
  difficulty: number;
  lastReviewAt: number | null;
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
    recognitionStability: 0,
    productionStability: 0,
    sentenceStability: 0,
    transferStability: 0,
    difficulty: 0,
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
    lastReviewAt: null,
    nextDueAt: now,
    reviewCount: 0,
  };
}

/* ===================== FSRS card <-> MemoryState ===================== */

function ratingToGrade(rating: ConfidenceRating | string | undefined): Grade {
  if (rating === 'know_well' || rating === 'exact') return Rating.Good;
  if (rating === 'unsure' || rating === 'ambiguous' || rating === 'somewhat') return Rating.Hard;
  return Rating.Again;
}

const lastReviewOf = (s: MemoryState): number | null => s.lastReviewAt ?? s.lastReviewedAt ?? null;
const reviewCountOf = (s: MemoryState): number => s.reviewCount ?? (s.correctCount || 0) + (s.wrongCount || 0);

/**
 * Builds the FSRS card for a stored state. Words studied before the FSRS switch
 * (and not converted by the storage migration) get an estimate from the old
 * half-life model: the old model's 90%-recall time is 0.152 × half-life.
 */
function toCard(s: MemoryState): Card {
  const reviews = reviewCountOf(s);
  const last = lastReviewOf(s);
  if (reviews === 0 || last === null) return createEmptyCard(new Date(s.nextDueAt ?? Date.now()));

  const hasFsrs = typeof s.fsrsStability === 'number' && s.fsrsStability > 0;
  const lapses = s.lapseCount ?? s.lapses ?? 0;
  const stability = hasFsrs ? s.fsrsStability! : Math.max(0.1, (s.halfLife ?? 1) * -Math.log2(DESIRED_RETENTION));
  const difficulty = hasFsrs ? s.fsrsDifficulty ?? 5 : Math.min(10, Math.max(1, 5 + lapses));
  const due = s.nextDueAt ?? s.nextReviewAt ?? last;
  return {
    due: new Date(due),
    stability,
    difficulty,
    elapsed_days: 0,
    scheduled_days: Math.max(0, Math.round((due - last) / MS_PER_DAY)),
    learning_steps: 0,
    reps: reviews,
    lapses,
    state: (s.fsrsState as State | undefined) ?? State.Review,
    last_review: new Date(last),
  };
}

function withCard(s: MemoryState, card: Card): MemoryState {
  const last = card.last_review ? card.last_review.getTime() : null;
  return {
    ...s,
    fsrsStability: card.stability,
    fsrsDifficulty: card.difficulty,
    fsrsState: card.state,
    lapseCount: card.lapses,
    lapses: card.lapses,
    reviewCount: card.reps,
    lastReviewAt: last,
    lastReviewedAt: last,
    nextDueAt: card.due.getTime(),
    nextReviewAt: card.due.getTime(),
  };
}

/** Predicted recall after `elapsedDays` for a word with this FSRS stability. */
export function predictRecall(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return scheduler.forgetting_curve(Math.max(0, elapsedDays), stability);
}

/** Reads a memory state (or its absence) into the values the UI shows. */
export function getMemoryView(state: MemoryState | undefined, now: number = Date.now()): MemoryView {
  const s = state || createDefaultMemoryState('tmp');
  const card = toCard(s);
  const last = card.last_review ? card.last_review.getTime() : null;

  if (card.state === State.New || last === null) {
    return { status: 'new', retention: null, isDue: false, nextDueAt: null, reviewCount: 0, stability: 0, difficulty: 0, lastReviewAt: null };
  }

  const status: MemoryStatus =
    card.stability >= MASTERED_STABILITY_DAYS ? 'mastered' : card.stability >= RETAINING_STABILITY_DAYS ? 'retaining' : 'learning';
  const due = card.due.getTime();
  return {
    status,
    retention: predictRecall((now - last) / MS_PER_DAY, card.stability),
    isDue: due <= now,
    nextDueAt: due,
    reviewCount: card.reps,
    stability: card.stability,
    difficulty: card.difficulty,
    lastReviewAt: last,
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

/**
 * Rebuilds a word's FSRS state by replaying its review history. Returns null when
 * the history is incomplete (the event log is capped), so the caller can fall
 * back to the half-life estimate in toCard.
 */
export function replayReviewHistory(state: MemoryState, events: ReviewEvent[]): MemoryState | null {
  const reviews = reviewCountOf(state);
  if (reviews === 0 || events.length === 0 || events.length < reviews) return null;
  let card = createEmptyCard(new Date(events[0].reviewedAt));
  for (const e of [...events].sort((a, b) => a.reviewedAt - b.reviewedAt)) {
    card = scheduler.next(card, new Date(e.reviewedAt), ratingToGrade(e.confidenceRating ?? e.userAnswer)).card;
  }
  return refreshMemoryState(withCard(state, card));
}

export interface ReviewEvaluationResult {
  updatedState: MemoryState;
  intervalMinutes: number;
  feedback: string;
}

/** Applies one self-graded answer to a word's schedule. */
export function processReviewResult(
  currentState: MemoryState,
  params: { rating: ConfidenceRating; responseTimeMs: number; reviewedAt?: number; hintUsed?: boolean }
): ReviewEvaluationResult {
  const now = params.reviewedAt || Date.now();
  const grade = ratingToGrade(params.rating);
  const { card } = scheduler.next(toCard(currentState), new Date(now), grade);

  const isCorrect = grade !== Rating.Again;
  const updated: MemoryState = {
    ...withCard(currentState, card),
    firstReviewedAt: currentState.firstReviewedAt ?? (reviewCountOf(currentState) === 0 ? now : undefined),
    consecutiveCorrect: isCorrect ? (currentState.consecutiveCorrect || 0) + 1 : 0,
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
    intervalMinutes: (card.due.getTime() - now) / 60000,
    feedback: '',
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

  // Most-forgotten first: if the session is cut short, the words closest to being lost were seen.
  const due = views
    .filter(v => v.view.status !== 'new' && v.view.isDue)
    .sort((a, b) => (a.view.retention ?? 0) - (b.view.retention ?? 0))
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

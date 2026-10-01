/**
 * Spaced Repetition & Personalized Ebbinghaus Forgetting Engine
 *
 * Implements:
 * - Exponential decay forgetting curve based on individualized memory stability
 * - Separate tracking for passive Recognition (EN->KO) and active Production (KO->EN)
 * - Automatic response time calibration (fast = strong memory, slow = weak)
 * - Progressive difficulty & question level selection (Levels 1 to 4)
 * - Priority scoring favoring items near forgetting threshold (retrievability ~ 85-90%)
 * - Anti-fatigue session generator with adaptive micro-batches
 */

import {
  MemoryState,
  MemoryStatus,
  QuestionType,
  StudyDirection,
  UserSettings,
  VocabularyItem,
} from '../types/database';
import {
  SCIENCE_CONFIG,
  processScienceReview,
  calculateSciencePriority,
  migrateOrHydrateScienceState,
  UserResponseCode,
} from './scienceScheduler';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Calculates current estimated recall probability (Retrievability R)
 * using the Ebbinghaus forgetting model: R = (0.90) ^ (t / S)
 * where t = days elapsed since last review, S = stability in days until R drops to 90%.
 */
export function calculateRetrievability(
  elapsedDays: number,
  stability: number
): number {
  if (stability <= 0) return 0.5;
  if (elapsedDays <= 0) return 0.99;
  // R = 0.90 ^ (elapsedDays / stability)
  const R = Math.pow(0.9, elapsedDays / stability);
  return Math.max(0.05, Math.min(0.99, R));
}

/**
 * Recalculates up-to-date memory metrics for a given MemoryState at the current timestamp.
 */
export function refreshMemoryState(
  state: MemoryState,
  now: number = Date.now()
): MemoryState {
  if (!state.lastReviewedAt) {
    return {
      ...state,
      estimatedRecallProbability: 0.5,
      status: 'new',
    };
  }

  const elapsedDays = Math.max(0, (now - state.lastReviewedAt) / MS_PER_DAY);
  const recR = calculateRetrievability(elapsedDays, state.recognitionStability || 1.0);
  const prodR = calculateRetrievability(elapsedDays, state.productionStability || 0.6);
  const transR = calculateRetrievability(elapsedDays, state.transferStability || 0.8);

  // Weighted combined recall probability across recognition, production, and transfer
  const blendedR = 0.5 * recR + 0.35 * prodR + 0.15 * transR;

  // Determine user-friendly status with strict multi-session retrieval criteria
  // "Do not mark a vocabulary item as mastered after one successful response.
  // Mastery or progression to a harder question type should require successful retrieval on multiple occasions separated in time."
  let status: MemoryStatus = state.status;
  if (state.correctCount === 0 && state.wrongCount === 0) {
    status = 'new';
  } else if (
    state.correctCount >= 4 &&
    state.consecutiveCorrect >= 3 &&
    state.recognitionStrength >= 85 &&
    state.productionStrength >= 70 &&
    state.recognitionStability >= 12
  ) {
    status = 'mastered'; // 장기 기억 (시간차를 둔 다회 인출 성공 검증됨)
  } else if (state.recognitionStrength >= 60 || state.productionStrength >= 45) {
    status = 'retaining'; // 기억 중
  } else {
    status = 'learning'; // 학습 중
  }

  return {
    ...state,
    transferStability: state.transferStability || 0.8,
    transferStrength: state.transferStrength || 0,
    estimatedRecallProbability: Number(blendedR.toFixed(3)),
    status,
    updatedAt: now,
  };
}

/**
 * Factory for initial default memory state for a newly imported word.
 */
export function createDefaultMemoryState(
  vocabularyItemId: string,
  userId: string = 'local_user'
): MemoryState {
  const now = Date.now();
  return {
    id: `mem_${vocabularyItemId}`,
    userId,
    vocabularyItemId,
    recognitionStability: 1.0,  // 1 day initial prior
    productionStability: 0.6,   // 0.6 day initial prior for production
    sentenceStability: 0.8,
    transferStability: 0.8,     // stability across varied contextual cues
    difficulty: 1.0,            // standard baseline
    recognitionStrength: 10,
    productionStrength: 0,
    sentenceStrength: 0,
    transferStrength: 0,
    lastReviewedAt: null,
    nextReviewAt: now,          // due immediately for first learning
    estimatedRecallProbability: 0.5,
    correctCount: 0,
    wrongCount: 0,
    consecutiveCorrect: 0,
    lapses: 0,
    averageResponseTime: 2500,
    hintCount: 0,
    status: 'new',
    updatedAt: now,
  };
}

/**
 * Result of evaluating a review answer and updating the memory state.
 */
export interface ReviewEvaluationResult {
  updatedState: MemoryState;
  recallProbabilityDelta: number;
  recommendedNextIntervalDays: number;
  levelFeedback: string;
}

/**
 * Updates memory state upon a review event.
 * Modulates stability based on:
 * - correctness
 * - response speed (automaticity vs hesitation)
 * - hint usage
 * - question type (recognition vs production)
 * - previous memory stability
 */
export function processReviewResult(
  currentState: MemoryState,
  params: {
    correct: boolean;
    responseTimeMs: number;
    hintUsed: boolean;
    questionType: QuestionType;
    confidenceRating?: 'ambiguous' | 'somewhat' | 'exact' | 'skip' | 'dont_know' | 'unsure' | 'know_well';
    isSkipped?: boolean;
    reviewedAt?: number;
  }
): ReviewEvaluationResult {
  const now = params.reviewedAt || Date.now();

  // Feature Flag: scienceSchedulerV1
  if (SCIENCE_CONFIG.scienceSchedulerV1) {
    const scienceCurrent = migrateOrHydrateScienceState(currentState, now);
    let userResponse: UserResponseCode = 'UNKNOWN';
    if (params.confidenceRating === 'know_well' || params.confidenceRating === 'exact') {
      userResponse = 'SURE';
    } else if (
      params.confidenceRating === 'unsure' ||
      params.confidenceRating === 'ambiguous' ||
      params.confidenceRating === 'somewhat'
    ) {
      userResponse = 'UNSURE';
    } else {
      userResponse = 'UNKNOWN';
    }

    const scienceRes = processScienceReview(scienceCurrent, {
      response: userResponse,
      responseTimeMs: params.responseTimeMs,
      now,
    });

    const nextIntervalDays = Number((scienceRes.intervalMinutes / 1440).toFixed(2));
    const isConsideredCorrect = userResponse !== 'UNKNOWN';

    const updatedState: MemoryState = {
      ...currentState,
      ...scienceRes.nextState,
      lastReviewedAt: now,
      nextReviewAt: scienceRes.nextState.nextDueAt,
      estimatedRecallProbability: scienceRes.nextState.predictedRecall,
      consecutiveCorrect: scienceRes.nextState.sureStreak,
      lapses: scienceRes.nextState.lapseCount,
      correctCount: (currentState.correctCount || 0) + (isConsideredCorrect ? 1 : 0),
      wrongCount: (currentState.wrongCount || 0) + (isConsideredCorrect ? 0 : 1),
      averageResponseTime: Math.round(
        (currentState.averageResponseTime || 2500) * 0.75 + params.responseTimeMs * 0.25
      ),
      hintCount: currentState.hintCount + (params.hintUsed ? 1 : 0),
      status:
        scienceRes.nextState.phase === 'MATURE'
          ? 'mastered'
          : scienceRes.nextState.phase === 'STABILIZING'
          ? 'retaining'
          : 'learning',
      updatedAt: now,
    };

    const delta = updatedState.estimatedRecallProbability - (currentState.estimatedRecallProbability || 0.5);

    return {
      updatedState,
      recallProbabilityDelta: Number(delta.toFixed(3)),
      recommendedNextIntervalDays: nextIntervalDays,
      levelFeedback: scienceRes.feedbackMessage,
    };
  }

  const state = { ...currentState };
  const prevR = state.estimatedRecallProbability;

  // Running average response time (exponential moving average)
  const alpha = 0.25;
  state.averageResponseTime = Math.round(
    state.averageResponseTime * (1 - alpha) + params.responseTimeMs * alpha
  );

  if (params.hintUsed) {
    state.hintCount += 1;
  }

  // Calculate elapsed delay since previous retrieval
  const elapsedDays = state.lastReviewedAt
    ? Math.max(0.01, (now - state.lastReviewedAt) / MS_PER_DAY)
    : 0.1;

  // Delay multiplier rewards retrieval after genuine delay
  let delayBonus = 1.0;
  if (state.lastReviewedAt) {
    if (elapsedDays >= 3) {
      delayBonus = 1.35; // high delay, durable retention evidence
    } else if (elapsedDays >= 1) {
      delayBonus = 1.15;
    } else if (elapsedDays < 0.1) {
      delayBonus = 0.85; // immediate short-term retrieval, smaller stability increase
    }
  }

  // Map self-assessment ratings:
  // know_well: 확실히 알아요 (full boost, correct)
  // unsure: 애매해요 (moderate boost, prompt review)
  // dont_know: 모르겠어요 (treat as failed retrieval)
  let rating = params.confidenceRating;
  if (rating === 'know_well') rating = 'exact';
  else if (rating === 'unsure') rating = 'ambiguous';
  else if (rating === 'dont_know') rating = 'skip';

  // Confidence Rating Multiplier:
  let confidenceFactor = 1.0;
  if (rating === 'exact') {
    confidenceFactor = 1.35;
  } else if (rating === 'somewhat') {
    confidenceFactor = 1.05;
  } else if (rating === 'ambiguous') {
    confidenceFactor = 0.65;
  } else if (rating === 'skip' || params.isSkipped) {
    confidenceFactor = 0.3;
  }

  // Question type & response time normalization
  const isTyping =
    params.questionType === 'level2_meaning_recall' ||
    params.questionType === 'level3_production' ||
    params.questionType === 'level4_sentence';
  const baselineSpeed = isTyping ? 5000 : 2500;

  // Response time as secondary signal
  let speedFactor = 1.0;
  if (params.responseTimeMs < baselineSpeed * 0.75) {
    speedFactor = 1.15;
  } else if (params.responseTimeMs > baselineSpeed * 1.8) {
    speedFactor = 0.9;
  }

  if (params.hintUsed) {
    speedFactor *= 0.6;
  }

  let intervalDays = 1.0;
  const isConsideredCorrect = params.correct && !params.isSkipped && rating !== 'skip';

  if (isConsideredCorrect) {
    state.correctCount += 1;
    state.consecutiveCorrect += 1;

    // Difficulty adjustment
    if (state.consecutiveCorrect > 2 && (params.confidenceRating === 'exact' || !params.confidenceRating)) {
      state.difficulty = Math.max(0.65, state.difficulty - 0.05);
    } else if (params.confidenceRating === 'ambiguous') {
      state.difficulty = Math.min(2.5, state.difficulty + 0.05);
    }

    // Stability expansion factor
    const retrievabilityBonus = Math.max(1.0, 2.0 - prevR);
    const expansionMultiplier =
      1 + 1.5 * confidenceFactor * delayBonus * speedFactor * retrievabilityBonus * (1 / state.difficulty);

    if (params.questionType === 'level1_recognition') {
      state.recognitionStability = Math.min(180, Math.max(1.2, state.recognitionStability * expansionMultiplier));
      const inc = params.confidenceRating === 'ambiguous' ? 8 : (params.confidenceRating === 'somewhat' ? 14 : 20);
      state.recognitionStrength = Math.min(100, state.recognitionStrength + inc);
      intervalDays = state.recognitionStability;
    } else if (params.questionType === 'level2_meaning_recall') {
      state.recognitionStability = Math.min(180, Math.max(1.4, state.recognitionStability * expansionMultiplier * 1.1));
      const inc = params.confidenceRating === 'ambiguous' ? 8 : 18;
      state.recognitionStrength = Math.min(100, state.recognitionStrength + inc);
      state.productionStrength = Math.min(100, (state.productionStrength || 0) + (params.confidenceRating === 'exact' ? 12 : 6));
      intervalDays = state.recognitionStability;
    } else if (params.questionType === 'level3_production') {
      state.productionStability = Math.min(180, Math.max(1.2, state.productionStability * expansionMultiplier * 1.2));
      const inc = params.confidenceRating === 'ambiguous' ? 10 : (params.confidenceRating === 'somewhat' ? 16 : 24);
      state.productionStrength = Math.min(100, (state.productionStrength || 0) + inc);
      state.recognitionStrength = Math.min(100, state.recognitionStrength + 10);
      intervalDays = state.productionStability;
    } else if (params.questionType === 'level4_sentence') {
      state.sentenceStability = Math.min(180, Math.max(1.2, state.sentenceStability * expansionMultiplier * 1.15));
      state.transferStability = Math.min(180, Math.max(1.1, (state.transferStability || 0.8) * expansionMultiplier * 1.25));
      state.sentenceStrength = Math.min(100, (state.sentenceStrength || 0) + 18);
      state.transferStrength = Math.min(100, (state.transferStrength || 0) + (params.confidenceRating === 'exact' ? 25 : 15));
      intervalDays = (state.recognitionStability + state.transferStability) / 2;
    }

    // If learner rated 'ambiguous', schedule next retrieval sooner
    if (params.confidenceRating === 'ambiguous') {
      intervalDays = Math.max(0.5, intervalDays * 0.45);
    }
  } else {
    // Incorrect answer or Skip (failed retrieval)
    state.wrongCount += 1;
    state.consecutiveCorrect = 0;
    state.lapses += 1;
    state.difficulty = Math.min(2.5, state.difficulty + 0.18);

    if (params.questionType === 'level1_recognition' || params.questionType === 'level2_meaning_recall') {
      state.recognitionStability = Math.max(0.4, state.recognitionStability * 0.35);
      state.recognitionStrength = Math.max(5, state.recognitionStrength - 18);
    } else {
      state.productionStability = Math.max(0.3, state.productionStability * 0.3);
      state.productionStrength = Math.max(0, (state.productionStrength || 0) - 22);
    }

    // Schedule earliest retrieval (within-session / few hours)
    intervalDays = 0.12; // ~3 hours
  }

  state.lastReviewedAt = now;
  state.nextReviewAt = now + Math.round(intervalDays * MS_PER_DAY);

  // Recalculate instant refreshed status
  const refreshed = refreshMemoryState(state, now);

  const delta = refreshed.estimatedRecallProbability - prevR;
  let levelFeedback = '';
  if (params.isSkipped || params.confidenceRating === 'skip') {
    levelFeedback = '건너뜀 — 정답 확인 후 세션 내에 다시 인출 연습합니다.';
  } else if (isConsideredCorrect) {
    if (params.confidenceRating === 'ambiguous') {
      levelFeedback = '애매하게 아는 상태 — 기억을 확실히 다지기 위해 곧 다시 출제됩니다.';
    } else if (params.confidenceRating === 'exact') {
      levelFeedback = '확실한 인출 성공! 기억 안정도가 대폭 향상되었습니다.';
    } else {
      levelFeedback = '정답입니다. 성공적으로 기억이 강화되었습니다.';
    }
  } else {
    levelFeedback = '망각된 단어입니다. 오답 피드백 후 최적 복습 주기가 재조정되었습니다.';
  }

  return {
    updatedState: refreshed,
    recallProbabilityDelta: Number(delta.toFixed(3)),
    recommendedNextIntervalDays: Number(intervalDays.toFixed(1)),
    levelFeedback,
  };
}

/**
 * Priority Scoring for Spaced Repetition Selection
 * High priority = most urgently needed for optimal retention
 */
export function calculateReviewPriority(
  state: MemoryState,
  now: number = Date.now()
): number {
  if (SCIENCE_CONFIG.scienceSchedulerV1) {
    const scienceFields = migrateOrHydrateScienceState(state, now);
    return calculateSciencePriority(scienceFields, now);
  }

  // New unlearned words get high priority
  if (!state.lastReviewedAt) {
    return 100;
  }

  const elapsedDays = Math.max(0, (now - state.lastReviewedAt) / MS_PER_DAY);
  const currentR = calculateRetrievability(elapsedDays, state.recognitionStability);

  // Spaced repetition target: ideal review happens around R = 0.85
  // If R has dropped to 0.50, review is overdue!
  // Urgency score: (1 - R) * 100
  let priority = (1.0 - currentR) * 100;

  // Overdue bonus: if current time is past nextReviewAt
  if (now > state.nextReviewAt) {
    const overdueDays = (now - state.nextReviewAt) / MS_PER_DAY;
    priority += Math.min(40, overdueDays * 8);
  }

  // Lapses penalty/bonus: frequently forgotten words get extra attention
  if (state.lapses > 0) {
    priority += Math.min(25, state.lapses * 5);
  }

  // Production deficit bonus: if recognition is high but production is low
  if (state.recognitionStrength > 70 && state.productionStrength < 50) {
    priority += 15;
  }

  return Math.round(priority);
}

/**
 * Determines which learning level question to ask for this word:
 * LEVEL 1 — FAST RECOGNITION (English -> Korean multiple choice)
 * LEVEL 2 — MEANING RECALL (English -> Type/recall Korean)
 * LEVEL 3 — ACTIVE PRODUCTION (Korean -> Type English word)
 * LEVEL 4 — CONTEXT / SENTENCE USE (Fill-in-the-blank cloze)
 */
export function selectQuestionType(
  item: VocabularyItem,
  state: MemoryState,
  settings: UserSettings,
  sessionSentenceCount: number,
  sessionTotalCount: number
): { questionType: QuestionType; direction: 'en_to_ko' | 'ko_to_en' } {
  // Check if Level 4 sentence context question is appropriate
  const sentenceModeActive = settings.sentenceModeEnabled;
  const sentenceRatio = settings.sentenceQuestionRatio || 0.25;
  const hasExampleSentence =
    item.exampleSentences && item.exampleSentences.length > 0;

  if (
    sentenceModeActive &&
    hasExampleSentence &&
    state.recognitionStrength >= 60 &&
    sessionTotalCount > 0 &&
    sessionSentenceCount / sessionTotalCount < sentenceRatio
  ) {
    return { questionType: 'level4_sentence', direction: 'en_to_ko' };
  }

  // Level 3: Active Production (Korean -> English)
  // Introduced after learner shows strong recognition (recognitionStrength >= 75%)
  if (state.recognitionStrength >= 75 && state.productionStrength < 80) {
    // 65% chance production, 35% chance meaning recall
    if (Math.random() < 0.65) {
      return { questionType: 'level3_production', direction: 'ko_to_en' };
    }
  }

  // Level 2: Meaning Recall (English -> Korean recall)
  if (state.recognitionStrength >= 55 && state.recognitionStrength < 75) {
    if (Math.random() < 0.4) {
      return { questionType: 'level2_meaning_recall', direction: 'en_to_ko' };
    }
  }

  // Default: Level 1 Fast Recognition (English -> Korean multiple choice)
  return { questionType: 'level1_recognition', direction: 'en_to_ko' };
}

/**
 * Creates a calibrated, fatigue-free review session
 * Principle: "Open for 3-5 minutes, review the words you're most likely to forget, and leave."
 * Does NOT overload with huge backlog numbers.
 */
export interface SessionPlan {
  items: VocabularyItem[];
  estimatedMinutes: number;
  totalCards: number;
  dueCount: number;
  newCount: number;
  averageRecallRate: number;
  sessionMode: 'time' | 'count';
  studyDirection?: StudyDirection;
  targetWordsCount?: number;
  collectionId?: string;
  folderId?: string;
  longTermEligibleCount?: number;
}

export function isLongTermMemoryItem(item: VocabularyItem, state?: MemoryState): boolean {
  if (!state) return false;
  return (
    state.status === 'mastered' ||
    state.status === 'retaining' ||
    state.recognitionStability >= 2.0 ||
    state.correctCount >= 2
  );
}

export function generateSessionPlan(
  allItems: VocabularyItem[],
  memoryStateMap: Map<string, MemoryState>,
  settings: UserSettings,
  options?: {
    durationMinutes?: number;
    targetWordsCount?: number;
    mode?: 'time' | 'count';
    collectionId?: string;
    folderId?: string;
    studyDirection?: StudyDirection;
  } | number
): SessionPlan {
  // Support both legacy number arg (durationMinutes) or options object
  let mode: 'time' | 'count' = 'time';
  let duration: number = settings.preferredSessionDuration || 5;
  let customWordCount: number | undefined = undefined;
  let targetCollectionId: string | undefined = undefined;
  let targetFolderId: string | undefined = undefined;
  let studyDirection: StudyDirection = 'en_to_ko';

  if (typeof options === 'number') {
    duration = options;
    mode = 'time';
  } else if (options && typeof options === 'object') {
    mode = options.mode || (options.targetWordsCount ? 'count' : 'time');
    if (options.durationMinutes) duration = options.durationMinutes;
    if (options.targetWordsCount) customWordCount = options.targetWordsCount;
    if (options.collectionId) targetCollectionId = options.collectionId;
    if (options.folderId) targetFolderId = options.folderId;
    if (options.studyDirection) studyDirection = options.studyDirection;
  }

  // Filter pool based on selected category and folder
  let pool = allItems;
  if (targetCollectionId && targetCollectionId !== 'all') {
    pool = pool.filter(i => i.collectionId === targetCollectionId);
  }
  if (targetFolderId && targetFolderId !== 'all') {
    pool = pool.filter(i => i.folderId === targetFolderId);
  }
  // Fallback to allItems if selected folder is empty
  if (pool.length === 0 && allItems.length > 0) {
    pool = allItems;
  }

  // Count long term memory eligible words in pool for information/stats
  const longTermWordsInPool = pool.filter(item => {
    const st = memoryStateMap.get(item.id);
    return isLongTermMemoryItem(item, st);
  });
  const longTermEligibleCount = longTermWordsInPool.length;

  // Active production (한국어 → 외국어) & Context cloze filtering:
  // Allows ALL languages (Hebrew, Greek, English, Japanese, Spanish, etc.)
  // and does NOT require words to have reached long-term memory first.
  if (studyDirection === 'context_cloze') {
    // For context cloze, prefer words with example sentences if available
    const wordsWithSentence = pool.filter(
      item => item.exampleSentences && item.exampleSentences.length > 0
    );
    if (wordsWithSentence.length > 0) {
      pool = wordsWithSentence;
    }
  }
  // For 'ko_to_en' (한국어 → 외국어 인출), all words in the selected category/folder
  // are 100% eligible, regardless of memory state or language!

  const now = Date.now();

  // If in 'count' mode (목표 단어 수 직접 지정), use customWordCount
  // If in 'time' mode, average time per card is ~16-18 seconds:
  // 3 minutes -> 11 cards
  // 5 minutes -> 16 cards
  // 10 minutes -> 30 cards
  let targetCardCount: number;
  let estimatedMins: number;

  if (mode === 'count' && customWordCount && customWordCount > 0) {
    targetCardCount = Math.max(3, Math.min(100, customWordCount));
    estimatedMins = Math.max(1, Math.round((targetCardCount * 18) / 60));
  } else {
    targetCardCount = Math.max(5, Math.min(40, Math.round((duration * 60) / 18)));
    estimatedMins = duration;
  }

  // Cap target count by available pool size
  if (pool.length > 0 && targetCardCount > pool.length) {
    targetCardCount = pool.length;
  }

  // Calculate priorities and refresh states for candidate pool
  const scoredItems = pool.map(item => {
    const rawState = memoryStateMap.get(item.id) || createDefaultMemoryState(item.id);
    const refreshed = refreshMemoryState(rawState, now);
    const priority = calculateReviewPriority(refreshed, now);
    const isDue = !refreshed.lastReviewedAt || now >= refreshed.nextReviewAt || refreshed.estimatedRecallProbability < 0.85;
    const isNew = !refreshed.lastReviewedAt;
    return {
      item,
      state: refreshed,
      priority,
      isDue,
      isNew,
    };
  });

  // Sort descending by priority (lowest recall probability first!)
  scoredItems.sort((a, b) => b.priority - a.priority);

  const dueItems = scoredItems.filter(s => s.isDue && !s.isNew);
  const newItems = scoredItems.filter(s => s.isNew);

  // Anti-fatigue rule:
  // If backlog of due reviews is heavy (> targetCardCount), pause/zero out new words
  // so the user effortlessly clears critical memory decays without ballooning burden!
  const selected: VocabularyItem[] = [];
  let newIncluded = 0;
  let dueIncluded = 0;

  if (dueItems.length >= targetCardCount) {
    // 100% due reviews, 0 new words
    for (let i = 0; i < targetCardCount && i < dueItems.length; i++) {
      selected.push(dueItems[i].item);
      dueIncluded++;
    }
  } else {
    // Take all due items first
    for (const d of dueItems) {
      selected.push(d.item);
      dueIncluded++;
    }

    // Fill the remainder with new words gently (e.g. 2-5 words)
    const remainingSlots = targetCardCount - selected.length;
    for (let i = 0; i < remainingSlots && i < newItems.length; i++) {
      selected.push(newItems[i].item);
      newIncluded++;
    }

    // If still have slots and there are retaining items with lower recall probability
    if (selected.length < targetCardCount) {
      const rest = scoredItems.filter(s => !selected.some(sel => sel.id === s.item.id));
      for (let i = 0; i < rest.length && selected.length < targetCardCount; i++) {
        selected.push(rest[i].item);
      }
    }
  }

  // Calculate estimated average recall rate among due words
  const recallSum = selected.reduce((sum, item) => {
    const st = memoryStateMap.get(item.id);
    return sum + (st ? st.estimatedRecallProbability : 0.5);
  }, 0);
  const averageRecallRate = selected.length > 0 ? Math.round((recallSum / selected.length) * 100) : 85;

  return {
    items: selected,
    estimatedMinutes: estimatedMins,
    totalCards: selected.length,
    dueCount: dueIncluded,
    newCount: newIncluded,
    averageRecallRate,
    sessionMode: mode,
    studyDirection,
    targetWordsCount: customWordCount,
    collectionId: targetCollectionId,
    folderId: targetFolderId,
    longTermEligibleCount,
  };
}

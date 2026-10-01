/**
 * Learning Science Spaced Repetition Engine (scienceSchedulerV1)
 *
 * Implements:
 * - Half-Life Regression (HLR) memory decay: p = 2^(-delta / h)
 * - Optimal interval derivation: interval = -h * log2(targetRecall)
 * - Phase-based lifecycle: NEW -> STABILIZING -> MATURE (with RELEARN fallback)
 * - Strict graduation: 2 consecutive verified SUREs on separate dates (>= 24h)
 * - False mastery prevention: Fast-click RT threshold & deferred verification
 * - Anti-spam detection: Rolling window RT & repeated-action validation
 * - Dynamic priority scoring: risk (55%), overdue (25%), lapse (15%), importance (5%)
 * - Scaffolding & feedback support tiers (level 0 to 3) based on error history
 */

import { MemoryState, QuestionType } from '../types/database';

export const MS_PER_DAY = 1000 * 60 * 60 * 24;
export const MS_PER_MINUTE = 1000 * 60;

/**
 * Centralized, tunable scientific hyperparameters (no magic numbers in code)
 */
export const SCIENCE_CONFIG = {
  // Global feature flag for zero-downtime rollback
  scienceSchedulerV1: true,

  // Target recall probabilities (accuracy targets)
  targetRecallDefault: 0.85,
  targetRecallImportant: 0.90,
  targetRecallLowBurden: 0.80,

  // Half-life update multipliers in MATURE phase
  sureHalfLifeMultiplier: 2.0,
  unsureHalfLifeMultiplier: 1.0,
  failHalfLifeMultiplier: 0.5,

  // Initial expanding spacing schedule (in minutes) for NEW / STABILIZING
  initialUnknownIntervalsMinutes: [3, 15, 30, 1440, 5760, 17280], // +3m, +15m, +30m, Day 1, Day 4, Day 12
  initialUnsureIntervalsMinutes: [1440, 5760, 17280],              // Day 1, Day 4, Day 12
  initialSureIntervalsMinutes: [5760, 17280],                      // Day 4, Day 12

  // Relearn expanding schedule (in minutes)
  relearnIntervalsMinutes: [10, 1440, 4320],                       // +10m, Day 1, Day 3

  // Half-life constraints in days
  minHalfLifeDays: 0.2,
  maxHalfLifeDays: 730,
  defaultInitialHalfLifeDays: 1.0,

  // Fast-click / guessing validation parameters
  fastClickThresholdMs: 1200,
  adaptiveMinFastThresholdMs: 800,
  adaptiveMaxFastThresholdMs: 2000,
  minResponsesForAdaptiveThreshold: 30,
  fastVerificationCardDelay: 4,     // queue verification 3-5 cards ahead
  fastVerificationMinTimeSec: 30,

  // Session spam detection parameters
  spamWindowSize: 8,
  spamAverageThresholdMs: 800,
  spamVerifySampleCount: 3,
  spamVerifyMinPassCount: 2,
  spamStrictCardsCount: 10,

  // Multi-factor priority weighting
  priorityWeightRisk: 0.55,
  priorityWeightOverdue: 0.25,
  priorityWeightLapse: 0.15,
  priorityWeightImportance: 0.05,

  // Daily budget load control
  maxMatureDeferralPercent: 0.20, // max 20% interval deferral for low-risk mature cards

  // Dynamic feedback aid thresholds
  twoFailuresWindowHours: 48,
  lapseCountForMnemonic: 2,
  failCountForMnemonic: 3,
};

export type CardPhase = 'NEW' | 'STABILIZING' | 'MATURE' | 'RELEARN';
export type UserResponseCode = 'UNKNOWN' | 'UNSURE' | 'SURE';

export interface ScienceMemoryFields {
  phase: CardPhase;
  lastReviewAt: number | null;
  nextDueAt: number;
  lastResponse: UserResponseCode | null;
  sureStreak: number;
  lapseCount: number;
  reviewCount: number;
  responseTimeMs: number;
  fastFlag: boolean;
  supportLevel: number; // 0: basic, 1: example+collocation, 2: mnemonic, 3: image
  halfLife: number; // in days
  predictedRecall: number; // 0.0 ~ 1.0
  verifiedSureDates: string[]; // ISO YYYY-MM-DD strings for date-separated graduation
  importance: 0.0 | 0.5 | 1.0;
  relearnStep: number;
  stabilizingStep: number;
}

/**
 * Ensures backward-compatible migration of legacy MemoryState to ScienceMemoryFields
 */
export function migrateOrHydrateScienceState(
  state: MemoryState,
  now: number = Date.now()
): ScienceMemoryFields {
  const existingPhase = (state as any).phase as CardPhase | undefined;
  if (existingPhase) {
    return {
      phase: existingPhase,
      lastReviewAt: (state as any).lastReviewAt ?? state.lastReviewedAt,
      nextDueAt: (state as any).nextDueAt ?? state.nextReviewAt,
      lastResponse: (state as any).lastResponse ?? null,
      sureStreak: (state as any).sureStreak ?? (state.consecutiveCorrect || 0),
      lapseCount: (state as any).lapseCount ?? (state.lapses || 0),
      reviewCount: (state as any).reviewCount ?? ((state.correctCount || 0) + (state.wrongCount || 0)),
      responseTimeMs: (state as any).responseTimeMs ?? (state.averageResponseTime || 2500),
      fastFlag: (state as any).fastFlag ?? false,
      supportLevel: (state as any).supportLevel ?? 0,
      halfLife: (state as any).halfLife ?? Math.max(0.5, state.recognitionStability || 1.0),
      predictedRecall: (state as any).predictedRecall ?? (state.estimatedRecallProbability || 0.5),
      verifiedSureDates: (state as any).verifiedSureDates ?? [],
      importance: (state as any).importance ?? 0.5,
      relearnStep: (state as any).relearnStep ?? 0,
      stabilizingStep: (state as any).stabilizingStep ?? 0,
    };
  }

  // Derive initial phase from legacy status
  let phase: CardPhase = 'NEW';
  if (!state.lastReviewedAt || (state.correctCount === 0 && state.wrongCount === 0)) {
    phase = 'NEW';
  } else if (state.status === 'mastered') {
    phase = 'MATURE';
  } else if (state.wrongCount > 0 && state.consecutiveCorrect === 0) {
    phase = 'RELEARN';
  } else {
    phase = 'STABILIZING';
  }

  const initialHL = Math.max(
    SCIENCE_CONFIG.minHalfLifeDays,
    Math.min(SCIENCE_CONFIG.maxHalfLifeDays, state.recognitionStability || SCIENCE_CONFIG.defaultInitialHalfLifeDays)
  );

  return {
    phase,
    lastReviewAt: state.lastReviewedAt,
    nextDueAt: state.nextReviewAt || now,
    lastResponse: null,
    sureStreak: state.consecutiveCorrect || 0,
    lapseCount: state.lapses || 0,
    reviewCount: (state.correctCount || 0) + (state.wrongCount || 0),
    responseTimeMs: state.averageResponseTime || 2500,
    fastFlag: false,
    supportLevel: 0,
    halfLife: initialHL,
    predictedRecall: state.estimatedRecallProbability || 0.5,
    verifiedSureDates: [],
    importance: 0.5,
    relearnStep: 0,
    stabilizingStep: Math.min(2, state.consecutiveCorrect || 0),
  };
}

/**
 * Calculates predicted recall probability using Half-Life decay:
 * p = 2 ^ (-delta / halfLife)
 */
export function calculateHlrRecall(deltaDays: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) return 0.5;
  if (deltaDays <= 0) return 0.999;
  const p = Math.pow(2, -deltaDays / halfLifeDays);
  return Math.max(0.01, Math.min(0.999, Number(p.toFixed(4))));
}

/**
 * Derives optimal next interval in days for a target recall probability:
 * interval = -halfLife * log2(targetRecall)
 */
export function calculateHlrInterval(halfLifeDays: number, targetRecall: number): number {
  const safeTarget = Math.max(0.1, Math.min(0.99, targetRecall));
  const interval = -halfLifeDays * (Math.log(safeTarget) / Math.LN2);
  return Math.max(0.01, interval);
}

/**
 * Timezone-safe calendar date key (YYYY-MM-DD) for date-separated graduation
 */
export function getCalendarDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes adaptive fast-click threshold if user has >= 30 valid responses
 */
export function computeAdaptiveFastThreshold(responseTimes: number[]): number {
  if (!responseTimes || responseTimes.length < SCIENCE_CONFIG.minResponsesForAdaptiveThreshold) {
    return SCIENCE_CONFIG.fastClickThresholdMs;
  }

  const sorted = [...responseTimes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // Median Absolute Deviation (MAD)
  const deviations = sorted.map(t => Math.abs(t - median)).sort((a, b) => a - b);
  const mad = sorted.length % 2 !== 0 ? deviations[mid] : (deviations[mid - 1] + deviations[mid]) / 2;

  const threshold = median - 2 * mad;
  return Math.max(
    SCIENCE_CONFIG.adaptiveMinFastThresholdMs,
    Math.min(SCIENCE_CONFIG.adaptiveMaxFastThresholdMs, Math.round(threshold))
  );
}

/**
 * Evaluates session spam pattern across recent review events
 */
export function detectSessionSpam(
  recentEvents: Array<{ userAnswer: string; responseTimeMs: number }>
): boolean {
  if (!recentEvents || recentEvents.length < SCIENCE_CONFIG.spamWindowSize) {
    return false;
  }

  const window = recentEvents.slice(-SCIENCE_CONFIG.spamWindowSize);
  const firstAnswer = window[0].userAnswer;
  const isAllSameAnswer = window.every(e => e.userAnswer === firstAnswer);
  const avgRT = window.reduce((sum, e) => sum + e.responseTimeMs, 0) / window.length;

  return isAllSameAnswer && avgRT < SCIENCE_CONFIG.spamAverageThresholdMs;
}

/**
 * Determines feedback support level according to error history:
 * - 0: Basic (answer, meaning, POS)
 * - 1: Example sentence + collocation (2 fails within 48h)
 * - 2: Keyword mnemonic (3 fails or lapseCount >= 2)
 * - 3: Image (concrete noun with repeated failure)
 */
export function determineSupportLevel(
  phase: CardPhase,
  lapseCount: number,
  failsInWindow: number,
  isConcreteNoun: boolean = false
): number {
  if (phase === 'MATURE') return 0; // hide aids once stabilized

  if (isConcreteNoun && (failsInWindow >= 3 || lapseCount >= 3)) {
    return 3;
  }
  if (failsInWindow >= SCIENCE_CONFIG.failCountForMnemonic || lapseCount >= SCIENCE_CONFIG.lapseCountForMnemonic) {
    return 2;
  }
  if (failsInWindow >= 2) {
    return 1;
  }
  return 0;
}

/**
 * Computes card review priority score:
 * priority = 100 * clamp(0.55*risk + 0.25*overdue + 0.15*lapse + 0.05*importance, 0, 1)
 */
export function calculateSciencePriority(
  state: ScienceMemoryFields,
  now: number = Date.now(),
  plannedIntervalMs?: number
): number {
  if (state.phase === 'NEW') {
    return 100;
  }

  const deltaDays = state.lastReviewAt ? Math.max(0, (now - state.lastReviewAt) / MS_PER_DAY) : 1;
  const recall = calculateHlrRecall(deltaDays, state.halfLife);
  const risk = Math.max(0, Math.min(1, 1 - recall));

  const plannedMs = plannedIntervalMs || Math.max(MS_PER_MINUTE, state.nextDueAt - (state.lastReviewAt || now));
  const overdueRaw = now > state.nextDueAt ? (now - state.nextDueAt) / plannedMs : 0;
  const overdue = Math.max(0, Math.min(1, overdueRaw));

  const lapse = Math.min(1, state.lapseCount / 3);
  const importance = state.importance ?? 0.5;

  let rawPriority =
    SCIENCE_CONFIG.priorityWeightRisk * risk +
    SCIENCE_CONFIG.priorityWeightOverdue * overdue +
    SCIENCE_CONFIG.priorityWeightLapse * lapse +
    SCIENCE_CONFIG.priorityWeightImportance * importance;

  // RELEARN cards take strict precedence over low-risk MATURE cards
  if (state.phase === 'RELEARN') {
    rawPriority = Math.max(rawPriority, 0.85 + 0.15 * risk);
  }

  return Math.round(100 * Math.max(0, Math.min(1, rawPriority)));
}

/**
 * Pure transition engine for scienceSchedulerV1
 */
export function processScienceReview(
  current: ScienceMemoryFields,
  input: {
    response: UserResponseCode;
    responseTimeMs: number;
    now?: number;
    isVerification?: boolean;
    verificationSuccess?: boolean;
    effectiveFastThresholdMs?: number;
    failsInLast48Hours?: number;
    isConcreteNoun?: boolean;
    importance?: 0.0 | 0.5 | 1.0;
  }
): {
  nextState: ScienceMemoryFields;
  intervalMinutes: number;
  fastValidationNeeded: boolean;
  feedbackMessage: string;
} {
  const now = input.now || Date.now();
  const next: ScienceMemoryFields = { ...current };
  const effectiveThreshold = input.effectiveFastThresholdMs ?? SCIENCE_CONFIG.fastClickThresholdMs;
  const isFastClick = input.response === 'SURE' && input.responseTimeMs < effectiveThreshold;

  next.reviewCount += 1;
  next.lastReviewAt = now;
  next.lastResponse = input.response;
  next.responseTimeMs = input.responseTimeMs;
  if (input.importance !== undefined) next.importance = input.importance;

  let fastValidationNeeded = false;
  let intervalMinutes = 1440; // 1 day fallback
  let feedbackMessage = '';

  // 1. FAST CLICK ON SURE: Do NOT immediately confirm mastery promotion
  if (isFastClick && !input.isVerification) {
    next.fastFlag = true;
    fastValidationNeeded = true;
    // Keep in current phase, schedule temporary short verification
    intervalMinutes = 5;
    next.nextDueAt = now + intervalMinutes * MS_PER_MINUTE;
    feedbackMessage = '⚡ 빠른 응답 감지: 잠시 후 반대 방향 또는 문맥으로 검증합니다.';
    return { nextState: next, intervalMinutes, fastValidationNeeded, feedbackMessage };
  }

  // 2. Resolve verification if this is a follow-up test
  let resolvedResponse = input.response;
  if (input.isVerification) {
    next.fastFlag = false;
    if (input.verificationSuccess === false) {
      resolvedResponse = 'UNSURE'; // downgrade
    }
  }

  // 3. TARGET RECALL DETERMINATION
  const targetRecall =
    next.importance === 1.0
      ? SCIENCE_CONFIG.targetRecallImportant
      : next.importance === 0.0
      ? SCIENCE_CONFIG.targetRecallLowBurden
      : SCIENCE_CONFIG.targetRecallDefault;

  // 4. STATE TRANSITIONS BY PHASE & RESPONSE
  if (resolvedResponse === 'UNKNOWN') {
    // A. Failed retrieval -> RELEARN
    next.sureStreak = 0;
    next.lapseCount += 1;
    next.relearnStep = 0;
    next.phase = 'RELEARN';

    if (current.phase === 'MATURE') {
      next.halfLife = Math.max(
        SCIENCE_CONFIG.minHalfLifeDays,
        current.halfLife * SCIENCE_CONFIG.failHalfLifeMultiplier
      );
    } else {
      next.halfLife = Math.max(SCIENCE_CONFIG.minHalfLifeDays, current.halfLife * 0.7);
    }

    intervalMinutes = SCIENCE_CONFIG.relearnIntervalsMinutes[0]; // +10 min
    feedbackMessage = '📌 오답 확인: 10분 후 첫 번째 재인출을 시도합니다.';
  } else if (resolvedResponse === 'UNSURE') {
    // B. Hesitant / Ambiguous retrieval
    next.sureStreak = 0;

    if (next.phase === 'NEW' || next.phase === 'STABILIZING') {
      next.phase = 'STABILIZING';
      const step = Math.min(next.stabilizingStep, SCIENCE_CONFIG.initialUnsureIntervalsMinutes.length - 1);
      intervalMinutes = SCIENCE_CONFIG.initialUnsureIntervalsMinutes[step];
      next.stabilizingStep = Math.min(SCIENCE_CONFIG.initialUnsureIntervalsMinutes.length - 1, step + 1);
    } else if (next.phase === 'RELEARN') {
      const step = Math.min(next.relearnStep, SCIENCE_CONFIG.relearnIntervalsMinutes.length - 1);
      intervalMinutes = SCIENCE_CONFIG.relearnIntervalsMinutes[step];
      next.relearnStep = Math.min(SCIENCE_CONFIG.relearnIntervalsMinutes.length - 1, step + 1);
    } else {
      // MATURE: halfLife *= 1.0, targetRecall = 0.90
      next.halfLife = current.halfLife * SCIENCE_CONFIG.unsureHalfLifeMultiplier;
      const intervalDays = calculateHlrInterval(next.halfLife, SCIENCE_CONFIG.targetRecallImportant);
      intervalMinutes = Math.round(intervalDays * 1440);
    }

    feedbackMessage = '⚡ 애매한 상태: 망각 전에 다시 인출할 수 있도록 스케줄되었습니다.';
  } else {
    // C. SURE (확실히 알아요)
    next.sureStreak += 1;
    const todayDateKey = getCalendarDateKey(now);

    if (next.phase === 'NEW' || next.phase === 'STABILIZING') {
      next.phase = 'STABILIZING';
      const step = Math.min(next.stabilizingStep, SCIENCE_CONFIG.initialSureIntervalsMinutes.length - 1);
      intervalMinutes = SCIENCE_CONFIG.initialSureIntervalsMinutes[step];
      next.stabilizingStep = Math.min(SCIENCE_CONFIG.initialSureIntervalsMinutes.length - 1, step + 1);

      // Track verified dates
      if (!next.verifiedSureDates.includes(todayDateKey)) {
        next.verifiedSureDates.push(todayDateKey);
      }

      // GRADUATION CHECK:
      // Minimum 2 verified SUREs on different calendar dates OR >= 24h apart
      const hasDateSeparatedSures = next.verifiedSureDates.length >= 2;
      const has24hSeparation =
        current.lastReviewAt !== null && now - current.lastReviewAt >= 24 * 3600 * 1000;

      if (!next.fastFlag && next.sureStreak >= 2 && (hasDateSeparatedSures || has24hSeparation)) {
        next.phase = 'MATURE';
        next.halfLife = Math.max(SCIENCE_CONFIG.defaultInitialHalfLifeDays * 2, current.halfLife * 1.5);
        const matureDays = calculateHlrInterval(next.halfLife, targetRecall);
        intervalMinutes = Math.round(matureDays * 1440);
        feedbackMessage = '🎓 장기 기억(MATURE)으로 승급되었습니다! 망각 곡선 반감기 모델이 적용됩니다.';
      } else {
        feedbackMessage = '🌟 완벽한 인출! 안정화 단계로 진입했습니다.';
      }
    } else if (next.phase === 'RELEARN') {
      // Progression within relearn -> return to MATURE if relearn sequence completed
      if (next.relearnStep >= SCIENCE_CONFIG.relearnIntervalsMinutes.length - 1) {
        next.phase = 'MATURE';
        next.relearnStep = 0;
        const matureDays = calculateHlrInterval(next.halfLife, targetRecall);
        intervalMinutes = Math.round(matureDays * 1440);
        feedbackMessage = '🎉 재정착 성공: 다시 장기 기억(MATURE)으로 복귀했습니다.';
      } else {
        next.relearnStep += 1;
        intervalMinutes = SCIENCE_CONFIG.relearnIntervalsMinutes[next.relearnStep];
        feedbackMessage = '👍 재학습 진행 중: 다음 간격으로 확장됩니다.';
      }
    } else {
      // MATURE: halfLife *= 2.0, targetRecall = 0.85
      next.halfLife = Math.min(
        SCIENCE_CONFIG.maxHalfLifeDays,
        current.halfLife * SCIENCE_CONFIG.sureHalfLifeMultiplier
      );
      const matureDays = calculateHlrInterval(next.halfLife, targetRecall);
      intervalMinutes = Math.round(matureDays * 1440);
      feedbackMessage = '🚀 인출 성공: 반감기가 2배 확장되어 장기 기억에 고정됩니다.';
    }
  }

  // 5. UPDATE NEXT DUE TIMESTAMP & ESTIMATED RECALL
  next.nextDueAt = now + intervalMinutes * MS_PER_MINUTE;
  next.predictedRecall = calculateHlrRecall(
    Math.max(0.01, (now - (current.lastReviewAt || now)) / MS_PER_DAY),
    next.halfLife
  );

  // 6. UPDATE ADAPTIVE SUPPORT LEVEL
  const fails = input.failsInLast48Hours ?? (resolvedResponse === 'UNKNOWN' ? 1 : 0);
  next.supportLevel = determineSupportLevel(next.phase, next.lapseCount, fails, input.isConcreteNoun);

  return { nextState: next, intervalMinutes, fastValidationNeeded, feedbackMessage };
}

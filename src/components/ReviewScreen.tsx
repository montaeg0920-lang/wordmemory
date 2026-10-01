import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lightbulb, Volume2, VolumeX, X } from 'lucide-react';
import { ConfidenceRating, MemoryState, ReviewEvent, UserSettings, VocabularyItem } from '../types/database';
import { SessionPlan, createDefaultMemoryState, formatInterval, processReviewResult } from '../lib/memoryEngine';
import { playSuccessSound, playWrongSound, speakEnglishWord } from '../lib/sound';
import {
  ClozeSentenceDisplay,
  HighlightedSentenceDisplay,
  getBackMeaningFontSizeClass,
  getFrontMeaningFontSizeClass,
  getSentenceFontSizeClass,
  getTermFontSizeClass,
} from '../lib/typographyHelper';
import { TermText } from './ui';

type Rating = Extract<ConfidenceRating, 'dont_know' | 'unsure' | 'know_well'>;

export interface SessionResult {
  /** Distinct words answered at least once. */
  reviewed: number;
  know: number;
  unsure: number;
  dontKnow: number;
  struggledIds: string[];
  practice: boolean;
}

interface ReviewScreenProps {
  plan: SessionPlan;
  memoryStateMap: Map<string, MemoryState>;
  settings: UserSettings;
  onAnswer: (state: MemoryState, event: ReviewEvent) => void;
  /** "이전": puts the word's schedule back and deletes the logged answer. */
  onUndoAnswer: (vocabularyItemId: string, previous: MemoryState | undefined, eventId: string) => void;
  onEnd: (result: SessionResult) => void;
}

/** Everything needed to step back to the card before an answer or a pass. */
interface Step {
  index: number;
  queue: QueueCard[];
  firstAnswers: Map<string, Rating>;
  struggled: Set<string>;
  firstAnswersSaved: Set<string>;
  passed: Set<string>;
  /** Set when that answer changed the schedule. */
  scheduled?: { itemId: string; previous: MemoryState | undefined; eventId: string };
}

interface QueueCard {
  item: VocabularyItem;
  /** A repeat inside the same session: practice only, does not change the schedule. */
  repeat: number;
}

const MAX_REPEATS_PER_WORD = 3;

const RATINGS: { id: Rating; label: string; key: string; tone: string }[] = [
  { id: 'dont_know', label: '모르겠어요', key: '1', tone: 'text-bad border-bad/40 hover:bg-bad-soft' },
  { id: 'unsure', label: '애매해요', key: '2', tone: 'text-warn border-warn/40 hover:bg-warn-soft' },
  { id: 'know_well', label: '알아요', key: '3', tone: 'text-good border-good/40 hover:bg-good-soft' },
];

export const ReviewScreen: React.FC<ReviewScreenProps> = ({ plan, memoryStateMap, settings, onAnswer, onUndoAnswer, onEnd }) => {
  const direction = plan.direction;
  const [queue, setQueue] = useState<QueueCard[]>(() => plan.items.map(item => ({ item, repeat: 0 })));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hint, setHint] = useState(false);
  const [audioOn, setAudioOn] = useState(settings.audioPronunciation);
  const [toast, setToast] = useState<string | null>(null);

  const shownAt = useRef(performance.now());
  const firstAnswers = useRef(new Map<string, Rating>());
  const struggled = useRef(new Set<string>());
  const firstAnswersSaved = useRef(new Set<string>());
  /** Words passed with "넘기기" (not answered, schedule unchanged). */
  const passed = useRef(new Set<string>());
  const [history, setHistory] = useState<Step[]>([]);

  const card = queue[index];
  const item = card?.item;
  const lang = item?.sourceLanguage || settings.sourceLanguage;
  const isRepeat = !!card && card.repeat > 0;
  const affectsSchedule = !plan.practice && !isRepeat;
  const firstTotal = plan.items.length;
  const handled = new Set([...firstAnswers.current.keys(), ...passed.current]);
  const doneFirst = Math.min(firstTotal, handled.size);

  const speak = useCallback(
    (text?: string) => {
      if (text) speakEnglishWord(text, 0.95, lang);
    },
    [lang]
  );

  // New card shown
  useEffect(() => {
    setFlipped(false);
    setHint(false);
    shownAt.current = performance.now();
    if (item && audioOn && direction === 'en_to_ko') speak(item.term);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, item?.id]);

  // Speak the answer when revealed in the reverse directions
  useEffect(() => {
    if (flipped && item && audioOn && direction !== 'en_to_ko') speak(item.term);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped]);

  const result = (): SessionResult => {
    const values = Array.from(firstAnswers.current.values());
    return {
      reviewed: values.length,
      know: values.filter(v => v === 'know_well').length,
      unsure: values.filter(v => v === 'unsure').length,
      dontKnow: values.filter(v => v === 'dont_know').length,
      struggledIds: Array.from(struggled.current),
      practice: plan.practice,
    };
  };

  // Preview of the next interval for each answer (shown under the buttons)
  const previews = useMemo(() => {
    if (!item || !affectsSchedule) return null;
    const state = memoryStateMap.get(item.id) || createDefaultMemoryState(item.id, settings.userId);
    const out = {} as Record<Rating, string>;
    for (const r of RATINGS) {
      out[r.id] = formatInterval(processReviewResult(state, { rating: r.id, responseTimeMs: 3000 }).intervalMinutes);
    }
    return out;
  }, [item, affectsSchedule, memoryStateMap, settings.userId]);

  const snapshot = (): Step => ({
    index,
    queue,
    firstAnswers: new Map(firstAnswers.current),
    struggled: new Set(struggled.current),
    firstAnswersSaved: new Set(firstAnswersSaved.current),
    passed: new Set(passed.current),
  });

  const goTo = (nextIndex: number, nextQueue: QueueCard[]) => {
    if (nextIndex < nextQueue.length) setIndex(nextIndex);
    else onEnd(result());
  };

  /** "넘기기": move on without answering; the word keeps its schedule. */
  const pass = () => {
    if (!item) return;
    const step = snapshot();
    setHistory(h => [...h, step]);
    if (!firstAnswers.current.has(item.id)) passed.current.add(item.id);
    setToast('넘겼어요');
    goTo(index + 1, queue);
  };

  /** "이전": back to the previous card; an answer given there is undone so it can be answered again. */
  const goBack = () => {
    const step = history[history.length - 1];
    if (!step) return;
    if (step.scheduled) onUndoAnswer(step.scheduled.itemId, step.scheduled.previous, step.scheduled.eventId);
    firstAnswers.current = step.firstAnswers;
    struggled.current = step.struggled;
    firstAnswersSaved.current = step.firstAnswersSaved;
    passed.current = step.passed;
    setHistory(h => h.slice(0, -1));
    setQueue(step.queue);
    setIndex(step.index);
    setFlipped(false);
    setHint(false);
    shownAt.current = performance.now();
    setToast(step.scheduled ? '이전 답을 취소했어요' : null);
  };

  const rate = (rating: Rating) => {
    if (!item || !flipped) return;
    const responseTimeMs = Math.round(performance.now() - shownAt.current);
    const step = snapshot();

    if (settings.soundEffects) {
      if (rating === 'know_well') playSuccessSound();
      else playWrongSound();
    }

    if (!firstAnswers.current.has(item.id)) firstAnswers.current.set(item.id, rating);
    if (rating !== 'know_well') struggled.current.add(item.id);

    if (affectsSchedule && !firstAnswersSaved.current.has(item.id)) {
      firstAnswersSaved.current.add(item.id);
      const state = memoryStateMap.get(item.id) || createDefaultMemoryState(item.id, settings.userId);
      const evaluation = processReviewResult(state, { rating, responseTimeMs, hintUsed: hint });
      const event: ReviewEvent = {
        id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId: settings.userId,
        vocabularyItemId: item.id,
        collectionId: item.collectionId,
        questionType:
          direction === 'ko_to_en' ? 'level3_production' : direction === 'context_cloze' ? 'level4_sentence' : 'level1_recognition',
        questionDirection: direction === 'ko_to_en' ? 'ko_to_en' : 'en_to_ko',
        userAnswer: rating,
        correct: rating !== 'dont_know',
        confidenceRating: rating,
        responseTimeMs,
        hintUsed: hint,
        reviewedAt: Date.now(),
        recallProbabilityBefore: state.estimatedRecallProbability || 0,
        recallProbabilityAfter: evaluation.updatedState.estimatedRecallProbability || 0,
      };
      onAnswer(evaluation.updatedState, event);
      step.scheduled = { itemId: item.id, previous: memoryStateMap.get(item.id), eventId: event.id };
      setToast(`다음 복습: ${formatInterval(evaluation.intervalMinutes)}`);
    } else {
      setToast(rating === 'know_well' ? null : '이 세션 안에서 한 번 더 나옵니다');
    }

    passed.current.delete(item.id);
    setHistory(h => [...h, step]);

    // Build the next queue synchronously so the "last card" case is handled correctly.
    let nextQueue = queue;
    if (rating !== 'know_well' && card.repeat < MAX_REPEATS_PER_WORD) {
      const insertAt = Math.min(queue.length, index + (rating === 'dont_know' ? 3 : 5));
      nextQueue = [...queue.slice(0, insertAt), { item, repeat: card.repeat + 1 }, ...queue.slice(insertAt)];
      setQueue(nextQueue);
    }

    goTo(index + 1, nextQueue);
  };

  // Keyboard shortcuts (desktop): Space/Enter = flip, 1·2·3 = answer, ←/→ = 이전/넘기기, R = listen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped(f => !f);
      } else if (flipped && (e.key === '1' || e.key === '2' || e.key === '3')) {
        rate(RATINGS[Number(e.key) - 1].id);
      } else if (e.key === 'ArrowLeft') {
        goBack();
      } else if (e.key === 'ArrowRight') {
        pass();
      } else if (e.key === 'r' || e.key === 'R') {
        speak(item?.term);
      } else if (e.key === 'Escape') {
        onEnd(result());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  if (!item) return null;

  const example = item.exampleSentences?.[0];
  const progress = firstTotal > 0 ? (doneFirst / firstTotal) * 100 : 0;

  return (
    <div className="min-h-[100dvh] bg-paper text-ink flex flex-col">
      {/* Top bar */}
      <div className="safe-top px-4">
        <div className="max-w-md mx-auto flex items-center gap-3 h-12">
          <button onClick={() => onEnd(result())} className="p-2 -ml-2 rounded-full text-muted hover:bg-sunken" aria-label="그만하기">
            <X className="w-6 h-6" />
          </button>
          <div className="flex-1 h-1.5 rounded-full bg-sunken overflow-hidden" aria-hidden>
            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-sm text-muted tabular-nums w-14 text-right">
            {doneFirst}/{firstTotal}
          </span>
          <button
            onClick={() => setAudioOn(a => !a)}
            className="p-2 -mr-2 rounded-full text-muted hover:bg-sunken"
            aria-label={audioOn ? '자동 발음 끄기' : '자동 발음 켜기'}
          >
            {audioOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        </div>
        {(plan.practice || isRepeat) && (
          <p className="max-w-md mx-auto text-center text-[13px] text-muted -mt-1">
            {plan.practice ? '연습 모드 · 복습 일정은 바뀌지 않습니다' : '다시 보기 · 일정에는 반영되지 않습니다'}
          </p>
        )}
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col px-4 py-4">
        <div className="max-w-md w-full mx-auto flex-1 flex flex-col">
          <div
            role="button"
            tabIndex={0}
            aria-label={flipped ? '카드 앞면 보기' : '뜻 확인하기'}
            onClick={() => setFlipped(f => !f)}
            className="flex-1 min-h-[52vh] bg-surface border border-line rounded-3xl px-6 py-7 flex flex-col cursor-pointer select-none"
          >
            {!flipped ? (
              <div key="front" className="flex-1 flex flex-col items-center justify-center text-center gap-4 vc-enter">
                {direction === 'ko_to_en' ? (
                  <>
                    <p className="text-[13px] text-muted">이 뜻의 단어는?</p>
                    <h2 className={`${getFrontMeaningFontSizeClass(item.userMeaning)} font-bold leading-snug`}>{item.userMeaning}</h2>
                    {item.partOfSpeech && <p className="text-sm text-muted">{item.partOfSpeech}</p>}
                  </>
                ) : direction === 'context_cloze' && example ? (
                  <>
                    <p className="text-[13px] text-muted">빈칸에 들어갈 단어는?</p>
                    <p className={`${getSentenceFontSizeClass(example.en)} font-serif leading-relaxed text-start w-full`} dir="auto">
                      <ClozeSentenceDisplay sentence={example.en} term={item.term} />
                    </p>
                    {example.ko && <p className="text-[15px] text-ink-2 text-left w-full">{example.ko}</p>}
                  </>
                ) : (
                  <>
                    <h2 className={`${getTermFontSizeClass(item.term)} font-medium leading-tight`}>
                      <TermText term={item.term} lang={lang} />
                    </h2>
                    {item.pronunciation && <p className="text-base text-muted">{item.pronunciation}</p>}
                  </>
                )}

                <div className="h-10 flex items-center">
                  {hint ? (
                    <p className="text-[15px] text-ink-2">
                      {direction === 'en_to_ko'
                        ? `뜻의 첫 글자: ${item.userMeaning.slice(0, 1)}…`
                        : `첫 글자: ${item.term.slice(0, 1)}… (${item.term.length}글자)`}
                    </p>
                  ) : (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setHint(true);
                      }}
                      className="inline-flex items-center gap-1.5 text-sm text-muted px-3 py-1.5 rounded-full hover:bg-sunken"
                    >
                      <Lightbulb className="w-4 h-4" /> 힌트
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div key="back" className="flex-1 flex flex-col vc-enter">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[28px] leading-tight font-medium">
                      <TermText term={item.term} lang={lang} />
                    </p>
                    {(item.pronunciation || item.partOfSpeech) && (
                      <p className="text-[15px] text-muted mt-1">
                        {[item.pronunciation, item.partOfSpeech].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      speak(item.term);
                    }}
                    className="p-2 -mr-2 rounded-full text-muted hover:bg-sunken shrink-0"
                    aria-label="발음 듣기"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-6">
                  <p className={`${getBackMeaningFontSizeClass(item.userMeaning)} font-bold leading-snug`}>{item.userMeaning}</p>
                  {item.alternativeMeanings && item.alternativeMeanings.length > 0 && (
                    <p className="text-[15px] text-ink-2 mt-1.5">{item.alternativeMeanings.slice(0, 3).join(', ')}</p>
                  )}
                </div>

                {example && (
                  <div className="mt-6 pt-5 border-t border-line">
                    <p className={`${getSentenceFontSizeClass(example.en)} font-serif leading-relaxed`} dir="auto">
                      <HighlightedSentenceDisplay sentence={example.en} term={item.term} />
                    </p>
                    {example.ko && <p className="text-[15px] text-ink-2 mt-2 leading-relaxed">{example.ko}</p>}
                  </div>
                )}

                {item.collocations && item.collocations.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {item.collocations.slice(0, 4).map(c => (
                      <span key={c} className="px-2.5 py-1 rounded-lg bg-sunken text-sm text-ink-2 font-serif">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="h-11 flex items-center justify-between gap-2">
            <button
              onClick={goBack}
              disabled={history.length === 0}
              className="h-9 pl-1.5 pr-3 rounded-full inline-flex items-center gap-0.5 text-sm text-muted hover:bg-sunken disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="이전 카드"
            >
              <ChevronLeft className="w-4 h-4" /> 이전
            </button>
            <p className="flex-1 min-w-0 text-center text-[13px] text-muted truncate" aria-live="polite">
              {toast}
            </p>
            <button
              onClick={pass}
              className="h-9 pl-3 pr-1.5 rounded-full inline-flex items-center gap-0.5 text-sm text-muted hover:bg-sunken"
              aria-label="이 카드 넘기기"
            >
              넘기기 <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Answer area */}
          <div className="safe-bottom">
            {!flipped ? (
              <button
                onClick={() => setFlipped(true)}
                className="w-full h-14 rounded-2xl bg-accent text-on-accent text-base font-semibold hover:bg-accent-hover"
              >
                뜻 확인하기
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {RATINGS.map(r => (
                  <button
                    key={r.id}
                    onClick={() => rate(r.id)}
                    className={`h-16 rounded-2xl border bg-surface flex flex-col items-center justify-center ${r.tone}`}
                  >
                    <span className="text-[15px] font-semibold">{r.label}</span>
                    {previews && <span className="text-[12px] text-muted mt-0.5">{previews[r.id]}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

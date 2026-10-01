import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  X,
  RotateCw,
  Sparkles,
  HelpCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle as QuestionIcon,
  Flame,
  ArrowRight,
} from 'lucide-react';
import {
  ConfidenceRating,
  MemoryState,
  ReviewEvent,
  StudyDirection,
  UserSettings,
  VocabularyItem,
} from '../types/database';
import {
  processReviewResult,
  createDefaultMemoryState,
} from '../lib/memoryEngine';
import { playSuccessSound, playWrongSound, speakEnglishWord } from '../lib/sound';
import { getDirectionLabels, isRTL } from '../lib/languageHelper';
import {
  getTermFontSizeClass,
  getFrontMeaningFontSizeClass,
  getBackMeaningFontSizeClass,
  getSentenceFontSizeClass,
  ClozeSentenceDisplay,
  HighlightedSentenceDisplay,
} from '../lib/typographyHelper';

interface ReviewScreenProps {
  sessionItems: VocabularyItem[];
  allItems: VocabularyItem[];
  memoryStateMap: Map<string, MemoryState>;
  settings: UserSettings;
  durationMinutes: number;
  studyDirection?: StudyDirection;
  onFinishSession: (
    reviewedCardsCount: number,
    strengthenedCount: number,
    reviewEvents: ReviewEvent[]
  ) => void;
  onCancel: () => void;
  onSaveState: (state: MemoryState, event: ReviewEvent) => void;
}

interface FlashcardQueueItem {
  item: VocabularyItem;
  isRequeued?: boolean;
  requeuedReason?: 'dont_know' | 'unsure';
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  sessionItems,
  allItems,
  memoryStateMap,
  settings,
  durationMinutes,
  studyDirection = 'en_to_ko',
  onFinishSession,
  onCancel,
  onSaveState,
}) => {
  // Pure Flashcard Queue: All items start as direct test items (no initial encoding)
  const [queue, setQueue] = useState<FlashcardQueueItem[]>(() =>
    sessionItems.map(item => ({ item }))
  );
  const queueRef = useRef<FlashcardQueueItem[]>(queue);
  queueRef.current = queue;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{
    message: string;
    type: 'success' | 'warning' | 'info';
  } | null>(null);

  // Time & Session tracking
  const startTimeRef = useRef<number>(performance.now());
  const [remainingSeconds, setRemainingSeconds] = useState(durationMinutes * 60);
  const isTimeMode = durationMinutes > 0;
  const reviewEventsRef = useRef<ReviewEvent[]>([]);
  const strengthenedCountRef = useRef<number>(0);
  const reviewedCardsTotalCount = useRef<number>(0);
  const timerIntervalRef = useRef<any>(null);

  // Current Card Item & Language Dynamics
  const currentCard = queue[currentIndex];
  const currentItem = currentCard?.item;
  const activeItemLang = currentItem?.sourceLanguage || settings.sourceLanguage || 'ja';
  const dirLabels = getDirectionLabels(activeItemLang);
  const currentMemoryState = currentItem
    ? memoryStateMap.get(currentItem.id) || createDefaultMemoryState(currentItem.id)
    : null;

  // Auto pronunciation on front card appear (only for foreign->ko mode so as not to spoil answers)
  useEffect(() => {
    if (currentItem && settings.audioPronunciation && studyDirection === 'en_to_ko') {
      speakEnglishWord(currentItem.term, 0.95, activeItemLang);
    }
    setIsFlipped(false);
    setShowHint(false);
    startTimeRef.current = performance.now();
  }, [currentIndex, currentItem?.id, studyDirection, activeItemLang]);

  // When card is flipped in ko_to_en mode, speak foreign answer if enabled
  useEffect(() => {
    if (isFlipped && currentItem && settings.audioPronunciation && studyDirection === 'ko_to_en') {
      speakEnglishWord(currentItem.term, 0.95, activeItemLang);
    }
  }, [isFlipped, currentItem, studyDirection, activeItemLang]);

  // Session Timer countdown
  useEffect(() => {
    if (!isTimeMode) return;
    timerIntervalRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          handleFinishSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isTimeMode]);

  // Handle Finish Session
  const handleFinishSession = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    onFinishSession(
      reviewedCardsTotalCount.current,
      strengthenedCountRef.current,
      reviewEventsRef.current
    );
  };

  // Flip card
  const handleFlipCard = () => {
    setIsFlipped(prev => !prev);
  };

  // Handle 3-step self assessment: 'dont_know' | 'unsure' | 'know_well'
  const handleAssessCard = (rating: 'dont_know' | 'unsure' | 'know_well') => {
    if (!currentItem) return;

    const responseTimeMs = Math.round(performance.now() - startTimeRef.current);
    const currentState =
      memoryStateMap.get(currentItem.id) || createDefaultMemoryState(currentItem.id);

    const isSuccess = rating === 'know_well';
    const isUnsure = rating === 'unsure';
    const isDontKnow = rating === 'dont_know';

    if (isSuccess) {
      if (settings.soundEffects) playSuccessSound();
      strengthenedCountRef.current += 1;
    } else {
      if (settings.soundEffects) playWrongSound();
    }

    reviewedCardsTotalCount.current += 1;

    const resolvedQuestionType =
      studyDirection === 'ko_to_en'
        ? 'level3_production'
        : studyDirection === 'context_cloze'
        ? 'level4_sentence'
        : 'level1_recognition';

    const resolvedDirection = studyDirection === 'ko_to_en' ? 'ko_to_en' : 'en_to_ko';

    // Process review result through Ebbinghaus Memory Engine
    const evalResult = processReviewResult(currentState, {
      correct: !isDontKnow,
      responseTimeMs,
      hintUsed: showHint,
      questionType: resolvedQuestionType,
      confidenceRating: rating,
      reviewedAt: Date.now(),
    });

    const event: ReviewEvent = {
      id: `rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: settings.userId,
      vocabularyItemId: currentItem.id,
      collectionId: currentItem.collectionId,
      questionType: resolvedQuestionType,
      questionDirection: resolvedDirection,
      userAnswer: rating,
      correct: !isDontKnow,
      confidenceRating: rating,
      responseTimeMs,
      hintUsed: showHint,
      reviewedAt: Date.now(),
      recallProbabilityBefore: currentState.estimatedRecallProbability,
      recallProbabilityAfter: evalResult.updatedState.estimatedRecallProbability,
    };

    reviewEventsRef.current.push(event);
    onSaveState(evalResult.updatedState, event);

    // If 'dont_know' or 'unsure': Re-queue later in session!
    // Per user request: "모를때는 나중에 다시 출제해야 하기 때문에 모르겠어요, 애매해요, 확실히 알아요 항목을 체크해야 해"
    if (isDontKnow || isUnsure) {
      const requeuedItem: FlashcardQueueItem = {
        item: currentItem,
        isRequeued: true,
        requeuedReason: rating,
      };

      setQueue(prevQueue => {
        const nextQueue = [...prevQueue];
        // Insert 3 to 4 items ahead, or at end
        const insertOffset = isDontKnow ? 3 : 4;
        const targetIndex = Math.min(nextQueue.length, currentIndex + insertOffset);
        nextQueue.splice(targetIndex, 0, requeuedItem);
        return nextQueue;
      });

      setFeedbackToast({
        message: isDontKnow
          ? '📌 모르는 단어로 체크됨: 세션 뒤에서 다시 복기합니다!'
          : '⚡ 애매한 단어로 체크됨: 확실히 외우도록 뒤에서 다시 출제합니다!',
        type: isDontKnow ? 'warning' : 'info',
      });
    } else {
      setFeedbackToast({
        message: '🎉 완벽하게 기억함! 다음 복습 주기가 연장되었습니다.',
        type: 'success',
      });
    }

    setTimeout(() => {
      setFeedbackToast(null);
    }, 1800);

    // Advance to next card
    if (currentIndex + 1 < queueRef.current.length) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Completed all cards in queue!
      handleFinishSession();
    }
  };

  // Keyboard shortcut listener: Space/Enter = Flip, 1 = dont_know, 2 = unsure, 3 = know_well
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        handleFlipCard();
      } else if (e.key === '1') {
        if (isFlipped) handleAssessCard('dont_know');
      } else if (e.key === '2') {
        if (isFlipped) handleAssessCard('unsure');
      } else if (e.key === '3') {
        if (isFlipped) handleAssessCard('know_well');
      } else if (e.key === 'r' || e.key === 'R') {
        if (currentItem) speakEnglishWord(currentItem.term, 0.95, activeItemLang);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, currentItem]);

  if (!currentItem) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <p className="text-base text-slate-300">세션 준비 중...</p>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold"
          >
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  const minutesRemaining = Math.floor(remainingSeconds / 60);
  const secondsRemaining = remainingSeconds % 60;
  const progressRatio = Math.min(100, Math.round(((currentIndex) / queue.length) * 100));

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Top Session Navigation & Progress */}
      <header className="px-4 pt-4 pb-3 border-b border-slate-900/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          {/* Exit Button */}
          <button
            onClick={onCancel}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
            title="세션 종료"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Center Card Counter & Timer */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
              카드 <strong className="text-white">{currentIndex + 1}</strong> / {queue.length}
            </span>

            {isTimeMode && (
              <div
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  remainingSeconds < 60
                    ? 'bg-rose-950/70 border border-rose-800 text-rose-300 animate-pulse'
                    : 'bg-indigo-950/70 border border-indigo-800 text-indigo-300'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {minutesRemaining}:{secondsRemaining < 10 ? `0${secondsRemaining}` : secondsRemaining}
                </span>
              </div>
            )}
          </div>

          {/* Quick Speak button */}
          <button
            onClick={() => speakEnglishWord(currentItem.term, 0.95, activeItemLang)}
            className="p-2 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-slate-900 transition-colors cursor-pointer"
            title="발음 듣기 (단축키: R)"
          >
            <Volume2 className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="max-w-md mx-auto mt-3 w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
            style={{ width: `${progressRatio}%` }}
          />
        </div>
      </header>

      {/* Main Flashcard Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full relative">
        {/* Requeued Alert Badge if revisiting wrong word */}
        {currentCard?.isRequeued && (
          <div className="mb-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold">
              <RotateCw className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {currentCard.requeuedReason === 'dont_know'
                  ? '🔄 다시 복기하기 (모름 재도전)'
                  : '⚡ 다시 복기하기 (애매함 재도전)'}
              </span>
            </span>
          </div>
        )}

        {/* FLASHCARD INTERACTIVE CARD */}
        <div
          onClick={handleFlipCard}
          className={`w-full min-h-[360px] rounded-3xl p-6 transition-all duration-300 cursor-pointer shadow-2xl relative flex flex-col justify-between select-none ${
            isFlipped
              ? 'bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border-2 border-indigo-500/50 shadow-indigo-950/40'
              : 'bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800 hover:border-slate-700 shadow-slate-950/50'
          }`}
        >
          {/* Card Top Information */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-[11px] font-semibold text-slate-300">
                {studyDirection === 'ko_to_en'
                  ? isFlipped
                    ? dirLabels.koToForeignBack
                    : dirLabels.koToForeignFront
                  : studyDirection === 'context_cloze'
                  ? isFlipped
                    ? '뒷면 (문맥 정답 확인)'
                    : '앞면 (문맥 단어 빈칸)'
                  : isFlipped
                  ? dirLabels.backCardHint
                  : dirLabels.frontCardHint}
              </span>
              {currentItem.partOfSpeech && (
                <span className="text-indigo-400 font-medium">[{currentItem.partOfSpeech}]</span>
              )}
            </div>

            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <RotateCw className="w-3 h-3" />
              <span>터치하여 뒤집기</span>
            </div>
          </div>

          {/* FRONT CONTENT (Visible before flip) */}
          {!isFlipped ? (
            <div className="my-auto py-8 text-center space-y-4">
              {studyDirection === 'ko_to_en' ? (
                /* KO -> EN FRONT: Show Korean meaning, recall foreign */
                <>
                  <div className="space-y-2 max-w-full">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                      {dirLabels.koToForeignPrompt}
                    </span>
                    <h2 className={`${getFrontMeaningFontSizeClass(currentItem.userMeaning)} font-extrabold tracking-tight text-white drop-shadow-md break-keep max-w-full leading-snug px-2`}>
                      {currentItem.userMeaning}
                    </h2>
                  </div>

                  <p className="text-xs text-slate-400 break-keep px-2">
                    머릿속으로 단어를 떠올린 후 카드를 탭하여 스펠링과 발음을 확인하세요
                  </p>

                  {/* Hint Toggle */}
                  <div className="pt-2">
                    {showHint ? (
                      <div className="inline-block p-2 rounded-xl bg-white/5 border border-white/10 text-xs text-indigo-300 font-mono animate-in fade-in duration-200 break-keep">
                        💡 첫 글자:{' '}
                        <strong
                          className={`text-white text-sm ${
                            isRTL(activeItemLang) ? 'font-hebrew text-base font-medium' : ''
                          }`}
                        >
                          {currentItem.term.slice(0, 1)}
                        </strong>
                        {currentItem.term.length > 1 ? ` _ `.repeat(Math.min(8, currentItem.term.length - 1)) : ''}
                        {' '}(총 {currentItem.term.length}글자)
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setShowHint(true);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-300 px-2.5 py-1 rounded-lg hover:bg-white/5 cursor-pointer"
                      >
                        <QuestionIcon className="w-3 h-3" />
                        <span>첫 글자 & 글자 수 힌트 보기</span>
                      </button>
                    )}
                  </div>
                </>
              ) : studyDirection === 'context_cloze' ? (
                /* CONTEXT CLOZE FRONT: Show sentence with non-breaking blank & dynamic font */
                <>
                  <div className="space-y-2 max-w-full">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                      문맥 빈칸 채우기
                    </span>
                    <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-4 text-left">
                      {(() => {
                        const exEn = currentItem.exampleSentences?.[0]?.en || `The concept of ${currentItem.term} is crucial here.`;
                        const exKo = currentItem.exampleSentences?.[0]?.ko || `뜻: ${currentItem.userMeaning}`;
                        const fontSize = getSentenceFontSizeClass(exEn);
                        return (
                          <>
                            <div className={`${fontSize} text-slate-100 font-medium leading-relaxed break-keep`}>
                              <ClozeSentenceDisplay sentence={exEn} term={currentItem.term} />
                            </div>
                            <p className="text-xs sm:text-sm text-slate-400 mt-2.5 font-normal break-keep leading-relaxed border-t border-white/5 pt-2">
                              {exKo}
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 break-keep px-2">
                    문맥을 파악하여 빈칸에 들어갈 알맞은 단어를 떠올려보세요
                  </p>

                  {/* Hint Toggle */}
                  <div className="pt-2">
                    {showHint ? (
                      <div className="inline-block p-2 rounded-xl bg-white/5 border border-white/10 text-xs text-indigo-300 font-mono animate-in fade-in duration-200 break-keep">
                        💡 힌트: {currentItem.term.slice(0, 1)}... (뜻: {currentItem.userMeaning})
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setShowHint(true);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-300 px-2.5 py-1 rounded-lg hover:bg-white/5 cursor-pointer"
                      >
                        <QuestionIcon className="w-3 h-3" />
                        <span>단어 뜻 & 초성 힌트 보기</span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                /* EN -> KO FRONT (Default Flashcard) with dynamic font scaling */
                <>
                  <h2
                    className={`${getTermFontSizeClass(currentItem.term)} font-extrabold tracking-tight text-white drop-shadow-md break-keep max-w-full leading-tight px-2 ${
                      isRTL(activeItemLang) ? 'font-hebrew text-4xl sm:text-5xl font-medium tracking-wide' : ''
                    }`}
                    dir={isRTL(activeItemLang) ? 'rtl' : 'ltr'}
                    lang={activeItemLang}
                  >
                    <span className="inline-block break-keep max-w-full">{currentItem.term}</span>
                  </h2>

                  {currentItem.pronunciation && (
                    <p className="text-sm font-medium text-indigo-300/80 font-mono break-keep">
                      {currentItem.pronunciation}
                    </p>
                  )}

                  {/* Optional Hint Toggle */}
                  <div className="pt-2">
                    {showHint ? (
                      <div className="inline-block p-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300 animate-in fade-in duration-200 break-keep">
                        💡 힌트: {currentItem.userMeaning.slice(0, 1)}... (
                        {currentItem.partOfSpeech || '품사 미지정'})
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setShowHint(true);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-300 px-2.5 py-1 rounded-lg hover:bg-white/5 cursor-pointer"
                      >
                        <QuestionIcon className="w-3 h-3" />
                        <span>초성 힌트 보기</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* BACK CONTENT (Revealed when flipped) */
            <div className="my-auto py-3 space-y-4 animate-in fade-in duration-200">
              {/* Foreign Term + Pronunciation */}
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5 gap-2">
                <div className="min-w-0 flex-1">
                  <h3
                    className={`${currentItem.term.length > 20 ? 'text-lg' : 'text-xl'} font-bold text-white flex items-center gap-2 break-keep ${
                      isRTL(activeItemLang) ? 'font-hebrew text-2xl sm:text-3xl font-medium tracking-wide' : ''
                    }`}
                    dir={isRTL(activeItemLang) ? 'rtl' : 'ltr'}
                    lang={activeItemLang}
                  >
                    <span className="break-keep">{currentItem.term}</span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        speakEnglishWord(currentItem.term, 0.95, activeItemLang);
                      }}
                      className="p-1 rounded-full text-indigo-400 hover:text-white hover:bg-white/10 shrink-0 cursor-pointer"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </h3>
                  {currentItem.pronunciation && (
                    <span className="text-xs text-slate-400 font-mono block break-keep">{currentItem.pronunciation}</span>
                  )}
                </div>

                {currentItem.partOfSpeech && (
                  <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 font-bold text-xs shrink-0">
                    {currentItem.partOfSpeech}
                  </span>
                )}
              </div>

              {/* Main Korean Meaning */}
              <div className="bg-white/10 rounded-2xl p-4 border border-white/15">
                <span className="text-[10px] font-bold tracking-wider text-indigo-300 uppercase block mb-1">
                  단어 뜻
                </span>
                <p className={`${getBackMeaningFontSizeClass(currentItem.userMeaning)} font-extrabold text-white leading-snug break-keep`}>
                  {currentItem.userMeaning}
                </p>

                {/* AI suggested alternative meanings if available */}
                {currentItem.aiSuggestedMeaning && (
                  <p className="text-xs text-indigo-200/80 mt-1 break-keep">
                    추가 의미: {currentItem.aiSuggestedMeaning}
                  </p>
                )}
              </div>

              {/* Example Sentence (Context) with dynamic font & word keep */}
              {currentItem.exampleSentences && currentItem.exampleSentences.length > 0 && (
                <div className="bg-slate-900/80 rounded-xl p-3 border border-white/10 text-xs">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span>실전 문맥 예문</span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        speakEnglishWord(currentItem.exampleSentences[0].en, 0.9, activeItemLang);
                      }}
                      className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
                    >
                      <Volume2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className={`${getSentenceFontSizeClass(currentItem.exampleSentences[0].en)} text-slate-200 font-medium leading-relaxed break-keep`}>
                    {studyDirection === 'context_cloze' ? (
                      <HighlightedSentenceDisplay
                        sentence={currentItem.exampleSentences[0].en}
                        term={currentItem.term}
                      />
                    ) : (
                      <span className="break-keep">{currentItem.exampleSentences[0].en}</span>
                    )}
                  </div>
                  <p className="text-slate-400 text-[11px] sm:text-xs mt-1.5 break-keep leading-relaxed border-t border-white/5 pt-1">
                    {currentItem.exampleSentences[0].ko}
                  </p>
                </div>
              )}

              {/* Collocations */}
              {currentItem.collocations && currentItem.collocations.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-400">함께 쓰이는 표현:</span>
                  {currentItem.collocations.map((col, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] text-slate-200 font-medium"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Card Bottom Hint / Instruction */}
          <div className="pt-2 text-center text-[11px] text-slate-400 border-t border-white/5">
            {!isFlipped ? (
              <span className="text-indigo-300 font-medium flex items-center justify-center gap-1">
                <span>뜻을 확인하려면 카드를 탭하세요 (스페이스바)</span>
                <ArrowRight className="w-3 h-3" />
              </span>
            ) : (
              <span className="text-slate-400">
                아래 3가지 항목 중 본인의 기억 상태를 채점해주세요
              </span>
            )}
          </div>
        </div>

        {/* Feedback Toast Notification */}
        {feedbackToast && (
          <div
            className={`mt-3 px-4 py-2 rounded-2xl text-xs font-bold border shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150 ${
              feedbackToast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-700 text-emerald-300'
                : feedbackToast.type === 'warning'
                ? 'bg-rose-950/90 border-rose-700 text-rose-300'
                : 'bg-amber-950/90 border-amber-700 text-amber-300'
            }`}
          >
            {feedbackToast.message}
          </div>
        )}
      </main>

      {/* BOTTOM SELF-ASSESSMENT ACTIONS (3-Step Self Scoring) */}
      <footer className="p-4 max-w-md mx-auto w-full bg-slate-950 border-t border-slate-900 sticky bottom-0 z-20">
        {!isFlipped ? (
          /* When NOT flipped: Prominent Flip Button */
          <button
            onClick={handleFlipCard}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <RotateCw className="w-5 h-5" />
            <span>{dirLabels.flipButtonText}</span>
          </button>
        ) : (
          /* When FLIPPED: 3 Self-Assessment Buttons (모르겠어요 / 애매해요 / 확실히 알아요) */
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {/* BUTTON 1: 모르겠어요 (Red) */}
              <button
                onClick={() => handleAssessCard('dont_know')}
                className="py-3 px-1 rounded-2xl bg-rose-950/60 hover:bg-rose-900/80 active:scale-95 border-2 border-rose-700 text-rose-200 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-md"
              >
                <div className="flex items-center gap-1 font-extrabold text-sm text-rose-300">
                  <X className="w-4 h-4" />
                  <span>모르겠어요</span>
                </div>
                <span className="text-[10px] text-rose-400/90 font-medium">나중에 재출제 (1)</span>
              </button>

              {/* BUTTON 2: 애매해요 (Yellow/Amber) */}
              <button
                onClick={() => handleAssessCard('unsure')}
                className="py-3 px-1 rounded-2xl bg-amber-950/60 hover:bg-amber-900/80 active:scale-95 border-2 border-amber-600 text-amber-200 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-md"
              >
                <div className="flex items-center gap-1 font-extrabold text-sm text-amber-300">
                  <AlertCircle className="w-4 h-4" />
                  <span>애매해요</span>
                </div>
                <span className="text-[10px] text-amber-400/90 font-medium">다시 복기 (2)</span>
              </button>

              {/* BUTTON 3: 확실히 알아요 (Green) */}
              <button
                onClick={() => handleAssessCard('know_well')}
                className="py-3 px-1 rounded-2xl bg-emerald-950/70 hover:bg-emerald-900/90 active:scale-95 border-2 border-emerald-600 text-emerald-200 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-md"
              >
                <div className="flex items-center gap-1 font-extrabold text-sm text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>확실히 알아요</span>
                </div>
                <span className="text-[10px] text-emerald-400/90 font-medium">암기 완료 (3)</span>
              </button>
            </div>

            <p className="text-[10px] text-center text-slate-500 font-medium">
              키보드 단축키: <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-300">1</kbd> 모름 · <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-300">2</kbd> 애매 · <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-300">3</kbd> 확실
            </p>
          </div>
        )}
      </footer>
    </div>
  );
};

import React, { useEffect } from 'react';
import { CheckCircle2, Sparkles, Clock, Zap, ArrowRight, Brain, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { ReviewEvent, VocabularyItem } from '../types/database';

interface SessionCompleteScreenProps {
  reviewedCardsCount: number;
  strengthenedCount: number;
  reviewEvents: ReviewEvent[];
  allItems: VocabularyItem[];
  onFinish: () => void;
  onMoreReview: (
    options:
      | {
          durationMinutes?: number;
          targetWordsCount?: number;
          mode?: 'time' | 'count';
        }
      | number
  ) => void;
}

export const SessionCompleteScreen: React.FC<SessionCompleteScreenProps> = ({
  reviewedCardsCount,
  strengthenedCount,
  reviewEvents,
  allItems,
  onFinish,
  onMoreReview,
}) => {
  useEffect(() => {
    // Subtle, gentle confetti burst
    try {
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#6366f1', '#a855f7', '#10b981'],
        disableForReducedMotion: true,
      });
    } catch {
      // ignore
    }
  }, []);

  const totalTimeSeconds = reviewEvents.reduce((acc, ev) => acc + ev.responseTimeMs, 0) / 1000;
  const avgResponseTime = reviewEvents.length > 0 ? (totalTimeSeconds / reviewEvents.length).toFixed(1) : '2.0';

  const itemMap = new Map(allItems.map(i => [i.id, i]));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between max-w-md mx-auto p-5 animate-in fade-in duration-300">
      <div className="pt-6">
        {/* Calm Completion Banner */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl mx-auto flex items-center justify-center mb-3 shadow-sm">
            <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            오늘 복습 완료
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            소중한 단어 기억이 잊혀지기 전 단단히 고정되었습니다
          </p>
        </div>

        {/* Core Metric Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm text-center">
            <span className="text-xs text-slate-400 block mb-1">복습한 단어</span>
            <div className="text-3xl font-extrabold text-slate-900">{reviewedCardsCount}개</div>
            <span className="text-[11px] text-indigo-600 font-semibold mt-1 inline-block">
              소요 시간: {Math.round(totalTimeSeconds)}초
            </span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm text-center">
            <span className="text-xs text-slate-400 block mb-1">기억 강화</span>
            <div className="text-3xl font-extrabold text-emerald-600">+{strengthenedCount}</div>
            <span className="text-[11px] text-slate-400 mt-1 inline-block">
              평균 응답 속도: {avgResponseTime}초
            </span>
          </div>
        </div>

        {/* Reviewed Words Glance */}
        {reviewEvents.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm mb-6">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              강화된 단어 기억 곡선
            </h3>

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {reviewEvents.map(ev => {
                const item = itemMap.get(ev.vocabularyItemId);
                if (!item) return null;
                const before = Math.round(ev.recallProbabilityBefore * 100);
                const after = Math.round(ev.recallProbabilityAfter * 100);

                return (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0"
                  >
                    <div>
                      <span className="font-bold text-slate-800 mr-1.5">{item.term}</span>
                      <span className="text-slate-400">{item.userMeaning}</span>
                    </div>

                    <div className="flex items-center gap-1.5 font-medium">
                      <span className="text-slate-400">{before}%</span>
                      <ArrowRight className="w-3 h-3 text-slate-300" />
                      <span className={ev.correct ? 'text-emerald-600 font-bold' : 'text-slate-600'}>
                        {after}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Primary Bottom Actions */}
      <div className="space-y-2 pb-4">
        {/* Main CTA: 끝내기 (No guilt, exit effortlessly) */}
        <button
          onClick={onFinish}
          className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-base shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>학습 완료 및 저장</span>
        </button>

        {/* Extension options: 10 more words or 3 more minutes */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onMoreReview({ mode: 'count', targetWordsCount: 10 })}
            className="py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl font-bold text-xs active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>10단어 더 외우기</span>
          </button>

          <button
            onClick={() => onMoreReview({ mode: 'time', durationMinutes: 3 })}
            className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-semibold text-xs active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>3분 더 복습하기</span>
          </button>
        </div>
      </div>
    </div>
  );
};

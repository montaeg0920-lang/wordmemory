import React from 'react';
import { Brain, TrendingUp, Zap, CheckCircle2, ShieldCheck, Clock, Award, Sparkles } from 'lucide-react';
import { StatsSummary } from '../lib/storage';
import { MemoryState, VocabularyItem } from '../types/database';

interface StatsScreenProps {
  stats: StatsSummary;
  items: VocabularyItem[];
  memoryStates: MemoryState[];
}

export const StatsScreen: React.FC<StatsScreenProps> = ({
  stats,
  items,
  memoryStates,
}) => {
  // SVG Forgetting Curve calculation points
  // Curve 1: Without Spaced Repetition (Steep decay)
  // Curve 2: With Spaced Repetition (Reinforced flat retention)
  const generateCurvePoints = () => {
    const days = [0, 1, 2, 4, 7, 14, 21, 30];
    const width = 320;
    const height = 140;

    // Normal forgetting curve: R = e^(-t/1.8)
    const decayPoints = days.map(d => {
      const x = (d / 30) * width;
      const r = Math.exp(-d / 2.2);
      const y = height - r * (height - 20) - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    // Spaced repetition curve with 3 periodic reviews
    const spacedPoints = [
      '0,20',
      '20,45',
      '25,18',
      '60,35',
      '65,18',
      '140,28',
      '145,18',
      '320,25',
    ];

    return {
      decayPath: `M ${decayPoints.join(' L ')}`,
      spacedPath: `M ${spacedPoints.join(' L ')}`,
    };
  };

  const curves = generateCurvePoints();

  return (
    <div className="pb-24 pt-4 px-4 max-w-md mx-auto animate-in fade-in duration-300">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">기억 통계</h1>
        <p className="text-xs text-slate-500">
          에빙하우스 망각 곡선 모델 기반 개인화 기억 분석
        </p>
      </div>

      {/* Main Forgetting Curve Graphic Card */}
      <div className="bg-slate-900 rounded-3xl p-5 text-white shadow-xl mb-5 border border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Brain className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider">
              나의 망각 곡선 & 인출 효과
            </span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
            평균 유지율 {stats.averageRecallRate}%
          </span>
        </div>

        {/* SVG Graph */}
        <div className="relative py-2">
          <svg viewBox="0 0 320 140" className="w-full h-36 overflow-visible">
            {/* Grid Lines */}
            <line x1="0" y1="20" x2="320" y2="20" stroke="#334155" strokeDasharray="3 3" />
            <line x1="0" y1="70" x2="320" y2="70" stroke="#334155" strokeDasharray="3 3" />
            <line x1="0" y1="120" x2="320" y2="120" stroke="#334155" />

            {/* Decay line (Without review) */}
            <path
              d={curves.decayPath}
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeDasharray="4 4"
            />

            {/* Spaced repetition line (With micro-review) */}
            <path
              d={curves.spacedPath}
              fill="none"
              stroke="#818cf8"
              strokeWidth="3.5"
              strokeLinecap="round"
            />

            {/* Review point dots */}
            <circle cx="25" cy="18" r="4" fill="#a855f7" />
            <circle cx="65" cy="18" r="4" fill="#a855f7" />
            <circle cx="145" cy="18" r="4" fill="#a855f7" />
          </svg>

          {/* Legend */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-indigo-400 rounded-full" />
              <span>VocaCurve 복습 후 (장기 기억 유지)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-slate-500 border-dashed" />
              <span>방치 시 자연 망각</span>
            </div>
          </div>
        </div>
      </div>

      {/* Memory Stage Breakdown (새 단어 / 학습 중 / 기억 중 / 장기 기억) */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm mb-5">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
          단어 기억 단계 분포
        </h3>

        <div className="space-y-3">
          {[
            {
              label: '장기 기억 (Mastered)',
              count: stats.masteredWords,
              color: 'bg-emerald-500',
              badge: 'bg-emerald-50 text-emerald-700',
              desc: '안정도 14일 이상, 90% 이상 인출 성공',
            },
            {
              label: '기억 중 (Retaining)',
              count: stats.retainingWords,
              color: 'bg-indigo-600',
              badge: 'bg-indigo-50 text-indigo-700',
              desc: '인식 강도 65% 이상, 안정 궤도 진입',
            },
            {
              label: '학습 중 (Learning)',
              count: stats.learningWords,
              color: 'bg-amber-500',
              badge: 'bg-amber-50 text-amber-700',
              desc: '주기적 마이크로 인출로 강화 필요',
            },
            {
              label: '새 단어 (New)',
              count: stats.newWords,
              color: 'bg-slate-400',
              badge: 'bg-slate-100 text-slate-700',
              desc: '최초 1회 인출 대기 중',
            },
          ].map(stage => {
            const pct = stats.totalWords > 0 ? Math.round((stage.count / stats.totalWords) * 100) : 0;
            return (
              <div key={stage.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-800">{stage.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-900">{stage.count}개</span>
                    <span className="text-slate-400">({pct}%)</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`${stage.color} h-full rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Separate Memory States: Recognition vs Active Production vs Transfer */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            다차원 기억 강도 (인식 / 인출 / 전이)
          </h3>
          <span className="text-[11px] text-slate-400">3개 독립 메모리 상태</span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <div className="p-2.5 bg-indigo-50/70 rounded-xl border border-indigo-100">
            <span className="text-[11px] text-indigo-700 font-semibold block mb-0.5">
              인식 강도
            </span>
            <div className="text-xl font-extrabold text-indigo-950">
              {stats.recognitionVsProductionRatio.recognition}%
            </div>
            <span className="text-[9px] text-indigo-600">EN → KO</span>
          </div>

          <div className="p-2.5 bg-purple-50/70 rounded-xl border border-purple-100">
            <span className="text-[11px] text-purple-700 font-semibold block mb-0.5">
              인출 강도
            </span>
            <div className="text-xl font-extrabold text-purple-950">
              {stats.recognitionVsProductionRatio.production}%
            </div>
            <span className="text-[9px] text-purple-600">KO → EN</span>
          </div>

          <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-100">
            <span className="text-[11px] text-emerald-700 font-semibold block mb-0.5">
              전이 강도
            </span>
            <div className="text-xl font-extrabold text-emerald-950">
              {stats.recognitionVsProductionRatio.transfer}%
            </div>
            <span className="text-[9px] text-emerald-600">문맥 / 전이</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2.5 rounded-xl">
          💡 <strong>독립 기억 상태 원칙</strong>: 높은 인식력(EN→KO)이 자동으로 능동 인출(KO→EN)이나 문맥 전이(Transfer) 능력을 보장하지 않습니다. 시스템은 각 단어의 인출 강도와 문맥 적용력을 개별적으로 측정하고 점진적으로 발전시킵니다.
        </p>
      </div>

      {/* Speed & Fatigue Analytics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 text-center">
          <Clock className="w-5 h-5 text-indigo-600 mx-auto mb-1" />
          <div className="text-xl font-bold text-slate-900">
            {stats.averageResponseTimeSeconds}초
          </div>
          <span className="text-[10px] text-slate-400">평균 단어 인출 속도</span>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 text-center">
          <Sparkles className="w-5 h-5 text-purple-600 mx-auto mb-1" />
          <div className="text-xl font-bold text-slate-900">
            +{stats.todayReviewsCount}
          </div>
          <span className="text-[10px] text-slate-400">오늘 복습 완료</span>
        </div>
      </div>
    </div>
  );
};

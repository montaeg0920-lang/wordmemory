import React from 'react';
import { Clock, TrendingUp, AlertTriangle, CheckCircle, ShieldCheck, Zap } from 'lucide-react';
import { MemoryState } from '../types/database';

interface EbbinghausCurveChartProps {
  memoryState?: MemoryState;
  term: string;
}

export const EbbinghausCurveChart: React.FC<EbbinghausCurveChartProps> = ({
  memoryState,
  term,
}) => {
  const now = Date.now();
  const lastReviewed = memoryState?.lastReviewedAt;
  const elapsedMs = lastReviewed ? Math.max(0, now - lastReviewed) : 0;
  const elapsedMinutes = Math.round(elapsedMs / (1000 * 60));
  const elapsedHours = (elapsedMs / (1000 * 60 * 60)).toFixed(1);
  const elapsedDays = (elapsedMs / (1000 * 60 * 60 * 24)).toFixed(1);

  // Current retention probability (0 to 100%)
  const retentionPercent = memoryState
    ? Math.max(10, Math.min(100, Math.round(memoryState.estimatedRecallProbability * 100)))
    : 100;

  // Stability in days
  const stabilityDays = memoryState?.recognitionStability || 1.0;

  // Time formatting for display
  let elapsedText = '방금 학습';
  if (!lastReviewed) {
    elapsedText = '아직 미학습 (새 단어)';
  } else if (elapsedMinutes < 60) {
    elapsedText = `학습 후 ${elapsedMinutes}분 경과`;
  } else if (parseFloat(elapsedHours) < 24) {
    elapsedText = `학습 후 ${elapsedHours}시간 경과`;
  } else {
    elapsedText = `학습 후 ${elapsedDays}일 경과`;
  }

  // Calculate position along graph X-axis (0 to 300)
  // Non-linear scale to give room to short intervals (20m, 1d, 3d, 7d, 30d)
  const mapTimeToX = (days: number): number => {
    // 0 days -> 25px
    // 0.014 days (20 min) -> 55px
    // 1 day -> 115px
    // 3 days -> 165px
    // 7 days -> 215px
    // 14 days -> 255px
    // 30 days -> 295px
    const logVal = Math.log10(days * 24 * 60 + 1); // log of minutes + 1
    const maxLog = Math.log10(30 * 24 * 60 + 1);
    const minX = 25;
    const maxX = 295;
    return minX + (logVal / maxLog) * (maxX - minX);
  };

  const mapRetentionToY = (retention: number): number => {
    // 100% -> 25px (top)
    // 0% -> 120px (bottom)
    const minY = 25;
    const maxY = 120;
    return maxY - (retention / 100) * (maxY - minY);
  };

  const currentDaysElapsed = elapsedMs / (1000 * 60 * 60 * 24);
  const currentPinX = Math.min(295, Math.max(25, mapTimeToX(currentDaysElapsed)));
  const currentPinY = mapRetentionToY(retentionPercent);

  // Status diagnosis
  let statusColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
  let statusTitle = '기억 보존 양호';
  let statusMessage = '현재 기억 유지율이 높아 안정적입니다. 골든타임에 맞춰 복습이 진행됩니다.';
  let StatusIcon = ShieldCheck;

  if (retentionPercent < 65) {
    statusColor = 'text-rose-600 bg-rose-50 border-rose-200';
    statusTitle = '🚨 망각 위험 (즉시 복습 필요)';
    statusMessage = '기억 유지율이 65% 미만으로 떨어졌습니다. 지금 인출하지 않으면 완전히 잊혀질 위험이 큽니다!';
    StatusIcon = AlertTriangle;
  } else if (retentionPercent < 80) {
    statusColor = 'text-amber-700 bg-amber-50 border-amber-200';
    statusTitle = '⚡ 복습 골든타임 도달!';
    statusMessage = '망각이 본격적으로 시작되는 최적의 복습 타이밍입니다. 지금 인출하면 기억 안정성이 2.5배 연장됩니다.';
    StatusIcon = Zap;
  }

  // Determine current review cycle stage
  const consecutive = memoryState?.consecutiveCorrect || 0;
  let currentStageText = '1차 인출 단계 (초기 부호화)';
  let nextStageTarget = '1일 후 복습';
  if (consecutive >= 4) {
    currentStageText = '4차 장기기억 고착 단계';
    nextStageTarget = '30일 후 확인';
  } else if (consecutive === 3) {
    currentStageText = '3차 안정화 단계';
    nextStageTarget = '7일 후 복습';
  } else if (consecutive >= 1) {
    currentStageText = '2차 강화 단계';
    nextStageTarget = '3일 후 복습';
  }

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-lg border border-slate-800">
      {/* Chart Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
          <h4 className="text-xs font-bold tracking-wide uppercase text-indigo-300">
            에빙하우스 망각 곡선 상 현재 위치
          </h4>
        </div>
        <span className="text-[11px] font-semibold text-slate-400">
          안정성: <strong className="text-white">{stabilityDays.toFixed(1)}일</strong>
        </span>
      </div>

      {/* SVG Interactive Curve */}
      <div className="relative w-full overflow-hidden bg-slate-950/70 rounded-xl p-2 border border-slate-800/80 mb-3">
        <svg viewBox="0 0 320 150" className="w-full h-auto overflow-visible select-none">
          <defs>
            {/* Gradient under the forgetting curve */}
            <linearGradient id="curveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#6366F1" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#6366F1" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#6366F1" stopOpacity="0.0" />
            </linearGradient>

            {/* Threshold area (below 75%) */}
            <linearGradient id="dangerGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="25" y1="25" x2="295" y2="25" stroke="#334155" strokeDasharray="3 3" strokeWidth="0.8" />
          <line x1="25" y1="57" x2="295" y2="57" stroke="#334155" strokeDasharray="3 3" strokeWidth="0.8" />
          <line x1="25" y1="89" x2="295" y2="89" stroke="#334155" strokeDasharray="3 3" strokeWidth="0.8" />
          <line x1="25" y1="120" x2="295" y2="120" stroke="#475569" strokeWidth="1" />

          {/* Y Axis Labels */}
          <text x="5" y="28" fill="#64748B" fontSize="8" fontWeight="600">100%</text>
          <text x="10" y="60" fill="#64748B" fontSize="8">75%</text>
          <text x="10" y="92" fill="#64748B" fontSize="8">40%</text>
          <text x="14" y="123" fill="#64748B" fontSize="8">0%</text>

          {/* Golden threshold line at 75% */}
          <line x1="25" y1="57" x2="295" y2="57" stroke="#F59E0B" strokeDasharray="2 2" strokeWidth="1" strokeOpacity="0.6" />
          <text x="225" y="53" fill="#F59E0B" fontSize="7.5" fontWeight="600">골든타임 한계선 (75%)</text>

          {/* Mathematical Ebbinghaus retention curve area fill */}
          {/* Path starts at (25, 25) [100%], descends to 20m, 1d, 3d, 7d, 30d */}
          <path
            d="M 25 25 
               C 45 45, 75 75, 115 88
               C 155 100, 205 108, 255 113
               L 295 116
               L 295 120
               L 25 120 Z"
            fill="url(#curveGradient)"
          />

          {/* Curve Stroke */}
          <path
            d="M 25 25 
               C 45 45, 75 75, 115 88
               C 155 100, 205 108, 255 113
               L 295 116"
            fill="none"
            stroke="#818CF8"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Spaced repetition recovery bumps (dashed ideal path) */}
          <path
            d="M 55 65 Q 60 30, 70 32 Q 95 60, 115 62 Q 120 30, 130 32 Q 170 50, 215 52 Q 220 30, 230 32 L 295 38"
            fill="none"
            stroke="#10B981"
            strokeWidth="1.2"
            strokeDasharray="2 2"
            strokeOpacity="0.75"
          />

          {/* X Axis Time Stage Ticks & Labels */}
          <line x1="25" y1="120" x2="25" y2="124" stroke="#64748B" strokeWidth="1" />
          <text x="25" y="133" fill="#94A3B8" fontSize="7" textAnchor="middle">직후</text>

          <line x1="55" y1="120" x2="55" y2="124" stroke="#64748B" strokeWidth="1" />
          <text x="55" y="133" fill="#94A3B8" fontSize="7" textAnchor="middle">20분</text>

          <line x1="115" y1="120" x2="115" y2="124" stroke="#64748B" strokeWidth="1" />
          <text x="115" y="133" fill="#94A3B8" fontSize="7" textAnchor="middle">1일</text>

          <line x1="165" y1="120" x2="165" y2="124" stroke="#64748B" strokeWidth="1" />
          <text x="165" y="133" fill="#94A3B8" fontSize="7" textAnchor="middle">3일</text>

          <line x1="215" y1="120" x2="215" y2="124" stroke="#64748B" strokeWidth="1" />
          <text x="215" y="133" fill="#94A3B8" fontSize="7" textAnchor="middle">7일</text>

          <line x1="295" y1="120" x2="295" y2="124" stroke="#64748B" strokeWidth="1" />
          <text x="295" y="133" fill="#94A3B8" fontSize="7" textAnchor="middle">30일</text>

          {/* CURRENT POSITION DOT (📍 현재 위치) with Pulse effect */}
          <g transform={`translate(${currentPinX}, ${currentPinY})`}>
            {/* Animated pulsing outer halo */}
            <circle r="9" fill="#818CF8" fillOpacity="0.3" className="animate-ping" />
            <circle r="6" fill="#4F46E5" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle r="2.5" fill="#FFFFFF" />

            {/* Vertical pin line down to axis */}
            <line x1="0" y1="6" x2="0" y2={120 - currentPinY} stroke="#818CF8" strokeDasharray="2 2" strokeWidth="1" strokeOpacity="0.8" />
          </g>

          {/* Floating badge for current position */}
          <g transform={`translate(${Math.max(45, Math.min(240, currentPinX))}, ${Math.max(16, currentPinY - 18)})`}>
            <rect
              x="-45"
              y="-12"
              width="90"
              height="16"
              rx="4"
              fill="#1E1B4B"
              stroke="#6366F1"
              strokeWidth="1"
            />
            <text x="0" y="-1" fill="#FFFFFF" fontSize="8" fontWeight="700" textAnchor="middle">
              📍 현재: {retentionPercent}% 유지 중
            </text>
          </g>
        </svg>

        {/* Legend */}
        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 px-1">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-indigo-400 rounded-full" />
            <span>자연 망각 곡선</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-emerald-400 rounded-full border-t border-dashed" />
            <span>반복 복습 시 기억 유지</span>
          </div>
          <div className="flex items-center gap-1 font-semibold text-indigo-300">
            <span>{elapsedText}</span>
          </div>
        </div>
      </div>

      {/* Diagnostics Card */}
      <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${statusColor} mb-2.5`}>
        <StatusIcon className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <h5 className="font-bold text-xs leading-snug">{statusTitle}</h5>
          <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">{statusMessage}</p>
        </div>
      </div>

      {/* Review Cycle Milestones */}
      <div className="grid grid-cols-2 gap-2 text-center text-[11px] bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/60">
        <div className="border-r border-slate-700/60 pr-2">
          <span className="text-slate-400 block text-[10px]">현재 복습 단계</span>
          <span className="font-semibold text-white mt-0.5 block truncate">{currentStageText}</span>
        </div>
        <div className="pl-1">
          <span className="text-slate-400 block text-[10px]">다음 목표 복습 시점</span>
          <span className="font-bold text-amber-300 mt-0.5 block truncate">{nextStageTarget}</span>
        </div>
      </div>
    </div>
  );
};

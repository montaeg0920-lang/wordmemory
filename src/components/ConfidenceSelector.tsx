import React from 'react';
import { HelpCircle, CheckCircle, Sparkles } from 'lucide-react';
import { ConfidenceRating } from '../types/database';

interface ConfidenceSelectorProps {
  onSelect: (rating: ConfidenceRating) => void;
  disabled?: boolean;
}

export const ConfidenceSelector: React.FC<ConfidenceSelectorProps> = ({
  onSelect,
  disabled = false,
}) => {
  return (
    <div className="w-full space-y-2 animate-in fade-in duration-200">
      <div className="text-center">
        <span className="text-xs font-semibold text-slate-500 flex items-center justify-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          이 단어에 대한 기억 확신도를 선택해주세요:
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* 1. 애매함 */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect('ambiguous')}
          className="py-3 px-2 rounded-2xl border-2 border-amber-200 bg-amber-50/70 hover:bg-amber-100/80 active:scale-95 text-center transition-all cursor-pointer"
        >
          <span className="text-base block mb-0.5">🤔</span>
          <span className="text-xs font-bold text-amber-900 block">애매함</span>
          <span className="text-[10px] text-amber-700 block mt-0.5 opacity-80">곧 다시 복습</span>
        </button>

        {/* 2. 조금 정확함 */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect('somewhat')}
          className="py-3 px-2 rounded-2xl border-2 border-blue-200 bg-blue-50/70 hover:bg-blue-100/80 active:scale-95 text-center transition-all cursor-pointer"
        >
          <span className="text-base block mb-0.5">🙂</span>
          <span className="text-xs font-bold text-blue-900 block">조금 정확함</span>
          <span className="text-[10px] text-blue-700 block mt-0.5 opacity-80">어느 정도 기억</span>
        </button>

        {/* 3. 정확함 */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect('exact')}
          className="py-3 px-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50/80 hover:bg-emerald-100 active:scale-95 text-center transition-all cursor-pointer"
        >
          <span className="text-base block mb-0.5">✨</span>
          <span className="text-xs font-bold text-emerald-900 block">정확하게 앎</span>
          <span className="text-[10px] text-emerald-700 block mt-0.5 opacity-80">완벽한 인출</span>
        </button>
      </div>
    </div>
  );
};

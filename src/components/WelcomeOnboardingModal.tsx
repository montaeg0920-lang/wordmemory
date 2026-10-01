import React, { useState } from 'react';
import { Sparkles, Check, Globe, Smartphone, ArrowRight } from 'lucide-react';
import { LanguageCode } from '../types/database';
import { SUPPORTED_LANGUAGES } from '../lib/languageHelper';

interface WelcomeOnboardingModalProps {
  initialName?: string;
  initialLanguage?: LanguageCode;
  onComplete: (name: string, targetLanguage: LanguageCode) => void;
}

export const WelcomeOnboardingModal: React.FC<WelcomeOnboardingModalProps> = ({
  initialName = '',
  initialLanguage = 'en',
  onComplete,
}) => {
  const [name, setName] = useState(initialName || '');
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(initialLanguage);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || '학습자';
    onComplete(finalName, selectedLanguage);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl relative border border-slate-100 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Scrollable Content Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto p-5 sm:p-6 space-y-4 flex-1">
            <div className="text-center pt-1 pb-1">
              <img
                src="/pwa-192x192.png"
                alt="VocaCurve App Icon"
                className="w-14 h-14 rounded-2xl mx-auto mb-2.5 shadow-lg shadow-blue-500/25 object-cover border border-blue-400/20"
              />
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                환영합니다! VocaCurve
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                개인화된 에빙하우스 망각 곡선으로 단어를 장기기억에 정착시킵니다
              </p>
            </div>

            {/* 1. Name Input */}
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1.5">
                1. 학습자 이름(닉네임)을 정해주세요
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="예: 몽태, 민수"
                className="w-full px-4 py-3 text-base bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
              />
            </div>

            {/* 2. Language Selection (Ordered: en, es, ja, zh, fr, de, he, el, other; no sample terms) */}
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1.5">
                2. 지금 공부하고 싶은 언어를 선택하세요
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SUPPORTED_LANGUAGES.map((lang, index) => {
                  const isSelected = selectedLanguage === lang.code;
                  const isLastItem = index === SUPPORTED_LANGUAGES.length - 1;
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setSelectedLanguage(lang.code)}
                      className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isLastItem ? 'col-span-2' : ''
                      } ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/90 shadow-xs ring-2 ring-indigo-500/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{lang.flag}</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-900">{lang.name}</span>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Storage & Mobile notice */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2">
              <Smartphone className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>핸드폰 오프라인 저장:</strong> 인터넷 없이도 폰 브라우저 내부에 단어와 진도가 안전하게 보관됩니다. 나중에 언제든 다른 언어를 추가할 수 있습니다.
              </div>
            </div>
          </div>

          {/* Sticky Bottom Action Button - ALWAYS VISIBLE */}
          <div className="p-4 sm:p-5 bg-slate-50/95 border-t border-slate-100 shrink-0">
            <button
              type="submit"
              className="w-full py-3.5 sm:py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-2xl font-bold text-sm sm:text-base shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>다음으로 가기 (학습 시작)</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

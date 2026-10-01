import React from 'react';
import { Volume2, BookOpen, ArrowRight } from 'lucide-react';
import { VocabularyItem } from '../types/database';
import { speakEnglishWord } from '../lib/sound';
import { isRTL } from '../lib/languageHelper';
import {
  getTermFontSizeClass,
  getBackMeaningFontSizeClass,
  getSentenceFontSizeClass,
} from '../lib/typographyHelper';

interface InitialEncodingCardProps {
  item: VocabularyItem;
  onContinue: () => void;
}

export const InitialEncodingCard: React.FC<InitialEncodingCardProps> = ({
  item,
  onContinue,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="text-center">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-xs font-semibold mb-3">
          <BookOpen className="w-3.5 h-3.5 text-amber-600" />
          <span>신규 단어 최초 학습 (Initial Encoding)</span>
        </span>

        <div className="inline-flex items-center justify-center gap-2 mb-2 w-full flex-wrap px-2">
          <h1
            className={`${getTermFontSizeClass(item.term)} font-extrabold tracking-tight text-slate-900 break-keep max-w-full leading-tight ${
              isRTL(item.sourceLanguage) ? 'font-hebrew text-4xl sm:text-5xl font-medium tracking-wide' : ''
            }`}
            dir={isRTL(item.sourceLanguage) ? 'rtl' : 'ltr'}
            lang={item.sourceLanguage}
          >
            {item.term}
          </h1>
          <button
            type="button"
            onClick={() => speakEnglishWord(item.term)}
            className="p-2 rounded-full text-indigo-600 bg-indigo-50 hover:bg-indigo-100 active:scale-90 transition-all shrink-0 cursor-pointer"
            title="발음 듣기"
          >
            <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {item.pronunciation && (
          <p className="text-xs text-slate-400 font-mono mb-1 break-keep">{item.pronunciation}</p>
        )}

        {item.partOfSpeech && (
          <span className="text-xs font-semibold text-indigo-600 px-2 py-0.5 bg-indigo-50 rounded-md">
            [{item.partOfSpeech}]
          </span>
        )}
      </div>

      {/* Primary User Meaning Display */}
      <div className="bg-white border-2 border-indigo-100 rounded-3xl p-5 shadow-sm text-center">
        <span className="text-xs font-semibold text-slate-400 block mb-1">
          단어 뜻
        </span>
        <p className={`${getBackMeaningFontSizeClass(item.userMeaning)} font-bold text-slate-900 leading-snug break-keep`}>
          {item.userMeaning}
        </p>

        {item.aiSuggestedMeaning && (
          <p className="text-xs text-indigo-600 font-medium mt-2 bg-indigo-50/60 py-1 px-2.5 rounded-lg inline-block break-keep">
            AI 제안: {item.aiSuggestedMeaning}
          </p>
        )}
      </div>

      {/* Example Sentence Context if available */}
      {item.exampleSentences && item.exampleSentences.length > 0 && (
        <div className="bg-slate-100/80 rounded-2xl p-4 text-slate-700">
          <p className={`${getSentenceFontSizeClass(item.exampleSentences[0].en)} font-semibold text-slate-900 mb-1 leading-relaxed break-keep`}>
            {item.exampleSentences[0].en}
          </p>
          <p className="text-slate-500 text-xs sm:text-[13px] leading-relaxed break-keep">
            {item.exampleSentences[0].ko}
          </p>
        </div>
      )}

      {/* Bottom explanation */}
      <p className="text-center text-xs text-slate-400 px-2 leading-relaxed break-keep">
        단어를 눈과 귀로 익히세요. 잠시 후 다른 단어들 사이에 끼워 넣어 인출 연습을 진행합니다.
      </p>

      {/* Continue CTA */}
      <button
        onClick={onContinue}
        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white rounded-2xl font-bold text-base shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <span>기억하고 넘어가기</span>
        <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );
};

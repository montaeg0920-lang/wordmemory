import React, { useState } from 'react';
import { X, Volume2, Brain, Sparkles, Clock, CheckCircle2, AlertCircle, Edit3, Trash2, Folder } from 'lucide-react';
import { MemoryState, VocabularyFolder, VocabularyItem } from '../types/database';
import { speakEnglishWord } from '../lib/sound';
import { getDirectionLabels, getLanguageMeta, isRTL } from '../lib/languageHelper';
import { EbbinghausCurveChart } from './EbbinghausCurveChart';
import {
  getTermFontSizeClass,
  getBackMeaningFontSizeClass,
  getSentenceFontSizeClass,
} from '../lib/typographyHelper';

interface WordDetailModalProps {
  item: VocabularyItem;
  memoryState?: MemoryState;
  folders?: VocabularyFolder[];
  onClose: () => void;
  onUpdate: (updated: VocabularyItem) => void;
  onDelete: (id: string) => void;
}

export const WordDetailModal: React.FC<WordDetailModalProps> = ({
  item,
  memoryState,
  folders = [],
  onClose,
  onUpdate,
  onDelete,
}) => {
  const dirLabels = getDirectionLabels(item.sourceLanguage);
  const langMeta = getLanguageMeta(item.sourceLanguage);

  const [isEditing, setIsEditing] = useState(false);
  const [editMeaning, setEditMeaning] = useState(item.userMeaning);
  const [editPartOfSpeech, setEditPartOfSpeech] = useState(item.partOfSpeech || '');
  const [selectedFolderId, setSelectedFolderId] = useState<string>(item.folderId || '');

  const handleSaveEdit = () => {
    onUpdate({
      ...item,
      userMeaning: editMeaning.trim(),
      partOfSpeech: editPartOfSpeech.trim() || undefined,
      folderId: selectedFolderId || undefined,
    });
    setIsEditing(false);
  };

  const handleFolderChange = (newFolderId: string) => {
    setSelectedFolderId(newFolderId);
    onUpdate({
      ...item,
      folderId: newFolderId || undefined,
    });
  };

  const currentFolder = folders.find(f => f.id === (item.folderId || selectedFolderId));

  const getStatusBadge = () => {
    const status = memoryState?.status || 'new';
    switch (status) {
      case 'mastered':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">장기 기억</span>;
      case 'retaining':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">기억 중</span>;
      case 'learning':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">학습 중</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">새 단어</span>;
    }
  };

  const formatNextReview = (nextReviewAt?: number) => {
    if (!nextReviewAt) return '곧 복습 예정';
    const diffHours = Math.round((nextReviewAt - Date.now()) / (1000 * 60 * 60));
    if (diffHours <= 0) return '지금 복습 필요';
    if (diffHours < 24) return `약 ${diffHours}시간 후`;
    const days = Math.round(diffHours / 24);
    return `${days}일 후`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Word Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h2
              className={`${
                item.term.length > 22 ? 'text-xl' : item.term.length > 14 ? 'text-2xl' : 'text-3xl'
              } font-bold tracking-tight text-slate-900 break-keep ${
                isRTL(item.sourceLanguage) ? 'font-hebrew text-3xl sm:text-4xl font-medium tracking-wide' : ''
              }`}
              dir={isRTL(item.sourceLanguage) ? 'rtl' : 'ltr'}
              lang={item.sourceLanguage}
            >
              {item.term}
            </h2>
            <button
              onClick={() => speakEnglishWord(item.term, 0.95, item.sourceLanguage)}
              className="p-1.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 active:scale-95 transition-all cursor-pointer"
              title="발음 듣기"
            >
              <Volume2 className="w-5 h-5" />
            </button>
            <span className="text-base" title={langMeta.name}>{langMeta.flag}</span>
            {getStatusBadge()}
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
            {item.pronunciation && <span className="break-keep font-mono">{item.pronunciation}</span>}
            {item.partOfSpeech && <span className="text-indigo-600 font-medium">[{item.partOfSpeech}]</span>}
            
            {/* Folder indicator & switcher */}
            {folders.length > 0 && (
              <div className="flex items-center gap-1 ml-auto text-xs">
                <Folder className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedFolderId}
                  onChange={e => handleFolderChange(e.target.value)}
                  className="bg-slate-100 border border-slate-200 text-slate-700 rounded-lg px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer"
                >
                  <option value="">(폴더 미지정)</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Meaning Sections */}
        <div className="space-y-4 mb-6">
          {/* User Meaning (Always preserved as primary) */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                기본 뜻 (사용자 등록)
              </span>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                >
                  <Edit3 className="w-3.5 h-3.5" /> 수정
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-2 mt-2">
                <input
                  type="text"
                  value={editMeaning}
                  onChange={e => setEditMeaning(e.target.value)}
                  className="w-full px-3 py-2 text-base border border-indigo-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="단어 뜻 입력"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                  >
                    저장
                  </button>
                </div>
              </div>
            ) : (
              <p className={`${getBackMeaningFontSizeClass(item.userMeaning)} font-semibold text-slate-900 break-keep leading-snug`}>{item.userMeaning}</p>
            )}
          </div>

          {/* AI Suggested Meaning (Clearly distinguished) */}
          {item.aiSuggestedMeaning && (
            <div className="bg-gradient-to-br from-indigo-50/60 to-purple-50/40 border border-indigo-100 rounded-2xl p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 mb-1">
                <Sparkles className="w-3.5 h-3.5" /> AI 제안 의미
              </div>
              <p className="text-sm font-medium text-slate-800 break-keep leading-relaxed">{item.aiSuggestedMeaning}</p>
              {item.alternativeMeanings && item.alternativeMeanings.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {item.alternativeMeanings.map((alt, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-white/80 border border-indigo-100 rounded-md text-xs text-indigo-900 break-keep"
                    >
                      {alt}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Collocations */}
          {item.collocations && item.collocations.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-slate-500 block mb-1.5">함께 쓰이는 연어 (Collocations)</span>
              <div className="flex flex-wrap gap-2">
                {item.collocations.map((col, i) => (
                  <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium break-keep">
                    {col}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Example Sentences */}
          {item.exampleSentences && item.exampleSentences.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 block">예문 (Context)</span>
              {item.exampleSentences.map(ex => (
                <div key={ex.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>{ex.source === 'user' ? '사용자 등록 예문' : 'AI 추천 예문'}</span>
                    <button
                      onClick={() => speakEnglishWord(ex.en, 0.9, item.sourceLanguage)}
                      className="text-indigo-600 hover:text-indigo-700 p-0.5 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className={`${getSentenceFontSizeClass(ex.en)} font-medium text-slate-900 leading-snug break-keep`}>{ex.en}</p>
                  <p className="text-xs text-slate-500 mt-1 break-keep leading-relaxed">{ex.ko}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Spaced Repetition & Forgetting Curve Diagnostics */}
        {memoryState && (
          <div className="border-t border-slate-100 pt-4 mb-6 space-y-4">
            {/* Visual Ebbinghaus Curve Chart */}
            <EbbinghausCurveChart memoryState={memoryState} term={item.term} />

            {/* Multidimensional Memory Strengths */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Brain className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  다차원 기억 강도 (Multidimensional Memory)
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500 font-medium">{dirLabels.foreignToKoShort} 인출</span>
                    <span className="text-xs font-bold text-indigo-600">{memoryState.recognitionStrength}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${memoryState.recognitionStrength}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 block">기본 단어 인출력</span>
                </div>

                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500 font-medium">{dirLabels.koToForeignShort} 인출</span>
                    <span className="text-xs font-bold text-purple-600">{memoryState.productionStrength}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${memoryState.productionStrength}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 block">능동 연상력</span>
                </div>

                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500 font-medium">문맥/전이</span>
                    <span className="text-xs font-bold text-emerald-600">{memoryState.transferStrength || 0}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${memoryState.transferStrength || 0}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 block">예문 적용력</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button
            onClick={() => {
              if (confirm(`'${item.term}' 단어를 단어장에서 삭제하시겠습니까?`)) {
                onDelete(item.id);
                onClose();
              }
            }}
            className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 font-medium px-2 py-1.5 rounded-lg hover:bg-rose-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> 단어 삭제
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 text-sm bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};

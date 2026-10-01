import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, Plus, Globe, Check } from 'lucide-react';
import { LanguageCode, VocabularyCollection, VocabularyFolder, VocabularyItem } from '../types/database';
import { analyzeWordWithAI } from '../lib/aiClient';
import { detectLanguage, getLanguageMeta, isRTL, SUPPORTED_LANGUAGES } from '../lib/languageHelper';

interface AddWordModalProps {
  collections: VocabularyCollection[];
  selectedCollectionId: string;
  folders?: VocabularyFolder[];
  selectedFolderId?: string;
  targetLanguage?: LanguageCode;
  onClose: () => void;
  onAdd: (item: VocabularyItem) => void;
  onLanguageDetected?: (lang: LanguageCode) => void;
}

export const AddWordModal: React.FC<AddWordModalProps> = ({
  collections,
  selectedCollectionId,
  folders = [],
  selectedFolderId: initialFolderId,
  targetLanguage = 'ja',
  onClose,
  onAdd,
  onLanguageDetected,
}) => {
  const [term, setTerm] = useState('');
  const [userMeaning, setUserMeaning] = useState('');
  const [collectionId, setCollectionId] = useState(
    selectedCollectionId && selectedCollectionId !== 'all'
      ? selectedCollectionId
      : collections[0]?.id || ''
  );
  const [folderId, setFolderId] = useState(
    initialFolderId && initialFolderId !== 'all' ? initialFolderId : ''
  );

  const selectedCol = collections.find(c => c.id === collectionId);
  const initialLangCode = selectedCol?.sourceLanguage || targetLanguage || 'ja';

  // Dynamic detected language state
  const [detectedLang, setDetectedLang] = useState<LanguageCode>(initialLangCode);
  const langMeta = getLanguageMeta(detectedLang);

  // Auto-detect language when user types in the term input
  useEffect(() => {
    if (!term.trim()) return;
    const detected = detectLanguage(term.trim(), initialLangCode);
    if (detected !== detectedLang) {
      setDetectedLang(detected);
      if (onLanguageDetected) {
        onLanguageDetected(detected);
      }
    }
  }, [term, initialLangCode]);

  const [partOfSpeech, setPartOfSpeech] = useState('');
  const [exampleEn, setExampleEn] = useState('');
  const [exampleKo, setExampleKo] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAlternativeMeanings, setAiAlternativeMeanings] = useState<string[]>([]);
  const [pronunciation, setPronunciation] = useState('');

  // Folders belonging to selected collection
  const availableFolders = folders.filter(f => f.collectionId === collectionId);

  const handleAIAnalyze = async () => {
    if (!term.trim()) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeWordWithAI(term.trim(), userMeaning.trim(), detectedLang);
      if (result) {
        if (!userMeaning && result.alternativeMeanings.length > 0) {
          setUserMeaning(result.alternativeMeanings[0]);
          setAiAlternativeMeanings(result.alternativeMeanings.slice(1));
        } else {
          setAiAlternativeMeanings(result.alternativeMeanings);
        }
        if (result.partOfSpeech) setPartOfSpeech(result.partOfSpeech);
        if (result.pronunciation) setPronunciation(result.pronunciation);
        if (result.exampleSentence && !exampleEn) {
          setExampleEn(result.exampleSentence.en);
          setExampleKo(result.exampleSentence.ko);
        }
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim() || !userMeaning.trim()) return;

    const newItem: VocabularyItem = {
      id: `vocab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      collectionId,
      folderId: folderId || undefined,
      sourceLanguage: detectedLang,
      targetLanguage: 'ko',
      term: term.trim(),
      lemma: term.toLowerCase().trim(),
      partOfSpeech: partOfSpeech.trim() || undefined,
      userMeaning: userMeaning.trim(),
      aiSuggestedMeaning: aiAlternativeMeanings.length > 0 ? aiAlternativeMeanings.join(', ') : undefined,
      alternativeMeanings: aiAlternativeMeanings,
      pronunciation: pronunciation.trim() || undefined,
      exampleSentences: exampleEn.trim()
        ? [
            {
              id: `ex_${Date.now()}`,
              source: 'user',
              en: exampleEn.trim(),
              ko: exampleKo.trim(),
              clozeBlank: term.trim(),
            },
          ]
        : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onAdd(newItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">단어 직접 추가</h2>
            <p className="text-xs text-slate-500">입력된 문자를 분석하여 언어를 자동 인식합니다</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">단어장 선택</label>
              <select
                value={collectionId}
                onChange={e => {
                  setCollectionId(e.target.value);
                  setFolderId('');
                }}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer"
              >
                {collections.map(col => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">폴더 지정 (선택)</label>
              <select
                value={folderId}
                onChange={e => setFolderId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer"
              >
                <option value="">📁 전체 / 기본</option>
                {availableFolders.map(f => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Term input with dynamic language recognition indicator */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span>{langMeta.wordName} (Term)</span>
                {term.trim() && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 animate-in fade-in">
                    <span>{langMeta.flag}</span>
                    <span>{langMeta.name} 자동 감지</span>
                  </span>
                )}
              </label>

              <button
                type="button"
                onClick={handleAIAnalyze}
                disabled={!term.trim() || isAnalyzing}
                className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 flex items-center gap-1 font-semibold cursor-pointer"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                AI 자동 분석
              </button>
            </div>

            <input
              type="text"
              value={term}
              onChange={e => setTerm(e.target.value)}
              placeholder={`예: ${langMeta.sampleTerm}`}
              required
              autoFocus
              dir={isRTL(detectedLang) ? 'rtl' : 'ltr'}
              className="w-full px-3.5 py-2.5 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
            />

            {/* Quick Language Override Chips if user wants to force another language */}
            <div className="flex items-center gap-1 mt-1.5 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[10px] text-slate-400 shrink-0 mr-0.5">언어:</span>
              {SUPPORTED_LANGUAGES.map(l => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setDetectedLang(l.code)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    detectedLang === l.code
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>{l.flag}</span>
                  <span>{l.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">한국어 뜻 (기본 의미)</label>
              <input
                type="text"
                value={userMeaning}
                onChange={e => setUserMeaning(e.target.value)}
                placeholder={`예: ${langMeta.sampleMeaning}`}
                required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">품사 (선택)</label>
              <input
                type="text"
                value={partOfSpeech}
                onChange={e => setPartOfSpeech(e.target.value)}
                placeholder="예: 동사, 명사"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Pronunciation Field with language-adaptive placeholder */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">
              {detectedLang === 'ja'
                ? '일본어 발음 (후리가나 / 로마자, 선택)'
                : detectedLang === 'zh'
                ? '중국어 발음 (병음/성조, 선택)'
                : `${langMeta.name} 발음 (선택)`}
            </label>
            <input
              type="text"
              value={pronunciation}
              onChange={e => setPronunciation(e.target.value)}
              placeholder={
                detectedLang === 'ja'
                  ? '예: たべる (taberu)'
                  : detectedLang === 'zh'
                  ? '예: xuéxí'
                  : '예: /ˈmɪt.ɪ.ɡeɪt/'
              }
              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Example Sentence Field with language-adaptive placeholder */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">
              {langMeta.name} 예문 (선택)
            </label>
            <input
              type="text"
              value={exampleEn}
              onChange={e => setExampleEn(e.target.value)}
              placeholder={
                detectedLang === 'ja'
                  ? '예: 毎日野菜をたくさん食べます。'
                  : detectedLang === 'es'
                  ? '예: Siempre tengo esperanza.'
                  : '예: An authentic example sentence'
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
            />
            <input
              type="text"
              value={exampleKo}
              onChange={e => setExampleKo(e.target.value)}
              placeholder="예문 한국어 해석"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!term.trim() || !userMeaning.trim()}
              className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors cursor-pointer shadow-sm"
            >
              {langMeta.name} 단어 저장하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

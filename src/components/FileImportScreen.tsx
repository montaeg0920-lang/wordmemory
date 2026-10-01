import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Sparkles, Loader2, Trash2, Edit3, ArrowRight, BookOpen, Folder, Globe } from 'lucide-react';
import { LanguageCode, VocabularyCollection, VocabularyFolder, VocabularyItem } from '../types/database';
import { ExtractedVocabRow, ParsedImportResult, processVocabularyFile, parseTextContent } from '../lib/fileParser';
import { analyzeWordWithAI } from '../lib/aiClient';
import { detectDominantLanguage, getLanguageMeta, SUPPORTED_LANGUAGES } from '../lib/languageHelper';

interface FileImportScreenProps {
  collections: VocabularyCollection[];
  folders?: VocabularyFolder[];
  existingItems: VocabularyItem[];
  onImportComplete: (items: VocabularyItem[]) => void;
  onNavigateTab: (tab: 'library' | 'home') => void;
}

export const FileImportScreen: React.FC<FileImportScreenProps> = ({
  collections,
  folders = [],
  existingItems,
  onImportComplete,
  onNavigateTab,
}) => {
  const [activeMode, setActiveMode] = useState<'upload' | 'paste'>('upload');
  const [targetCollectionId, setTargetCollectionId] = useState<string>(
    collections[0]?.id || ''
  );
  const [targetFolderId, setTargetFolderId] = useState<string>('all');

  const selectedCol = collections.find(c => c.id === targetCollectionId);
  const defaultCollectionLang = (selectedCol?.sourceLanguage || 'ja') as LanguageCode;

  // Language state for imported words
  const [detectedLang, setDetectedLang] = useState<LanguageCode>(defaultCollectionLang);
  const langMeta = getLanguageMeta(detectedLang);

  // Raw paste text
  const [pasteText, setPasteText] = useState('');

  // Processing & preview state
  const [isProcessing, setIsProcessing] = useState(false);
  const [enrichWithAI, setEnrichWithAI] = useState(true);
  const [parsedResult, setParsedResult] = useState<ParsedImportResult | null>(null);
  const [editableRows, setEditableRows] = useState<ExtractedVocabRow[]>([]);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Whenever editableRows changes, auto-detect the language from extracted terms!
  useEffect(() => {
    if (editableRows.length > 0) {
      const terms = editableRows.map(r => r.term);
      const autoLang = detectDominantLanguage(terms, defaultCollectionLang);
      setDetectedLang(autoLang);
    }
  }, [editableRows.length]);

  const handleFileSelected = async (file: File) => {
    setIsProcessing(true);
    setImportSuccessMessage(null);
    try {
      const result = await processVocabularyFile(file, existingItems);
      setParsedResult(result);
      setEditableRows(result.rows);
      if (result.rows.length > 0) {
        const autoLang = detectDominantLanguage(result.rows.map(r => r.term), defaultCollectionLang);
        setDetectedLang(autoLang);
      }
    } catch (err: any) {
      alert('파일 분석에 실패했습니다: ' + (err.message || '지원되지 않는 파일 구조'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handlePasteSubmit = () => {
    if (!pasteText.trim()) return;
    setIsProcessing(true);
    setImportSuccessMessage(null);
    try {
      const result = parseTextContent(pasteText, 'pasted_text.txt', existingItems);
      setParsedResult(result);
      setEditableRows(result.rows);
      if (result.rows.length > 0) {
        const autoLang = detectDominantLanguage(result.rows.map(r => r.term), defaultCollectionLang);
        setDetectedLang(autoLang);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadSample = (lang: 'ja' | 'en' | 'es' | 'he' | 'el' = 'ja') => {
    if (lang === 'ja') {
      const sampleJa = `食べる | 먹다 | 毎日野菜をたくさん食べます。
勉強 [명사/동사] 공부하다 | 図書館で日本語を勉強します。
感謝 감사하다 | いつも応援に感謝しています。
約束 약속하다 | 明日友達と会う約束があります。
散歩 산책하다 | 毎朝公園を散歩するのが日課です。
幸せ 행복하다 | 家族と一緒に過ごせて幸せです。
習慣 습관 | 読書はとても良い習慣です。
笑顔 미소, 웃는 얼굴 | 彼女の笑顔はみんなを明るくします。
大切 소중하다 | 健康は何よりも大切です。
挑戦 도전하다 | 新しい目標に向かって挑戦します。`;
      setPasteText(sampleJa);
      setDetectedLang('ja');
    } else if (lang === 'he') {
      const sampleHe = `שָׁלוֹם | 평화, 안녕, 온전함 | שָׁלוֹם עֲלֵיכֶם
בְּרֵאשִׁית | 태초에, 시작에 | בְּרֵאשִׁית בָּרָא אֱלֹהִים
אֱלֹהִים [명사] 하나님, 신 | אֱלֹהִים אֶחָד
חֶסֶד 은혜, 인애, 자비
תּוֹרָה 율법, 교훈, 가르침
אֲהָבָה 사랑 | אֲהָבָה עַזָּה
אֱמֶת 진리, 진실, 성실
בְּרָכָה 축복, 번영
מֶלֶךְ 왕, 군주
קָדוֹשׁ 거룩한, 성스러운`;
      setPasteText(sampleHe);
      setDetectedLang('he');
    } else if (lang === 'el') {
      const sampleEl = `ἀγάπη | 사랑, 아가페 | ἡ ἀγάπη οὐδέποτε πίπτει.
λόγος [명사] 말씀, 로고스, 이성 | Ἐν ἀρχῇ ἦν ὁ λόγος.
χάρις 은혜, 감사, 호의 | ἡ χάρις τοῦ κυρίου
εἰρήνη 평화, 화평
πνεῦμα 영, 성령, 바람 | τὸ πνεῦμα τὸ ἅγιον
φῶς 빛 | τὸ φῶς τοῦ κόσμου
ἀλήθεια 진리, 진실
ζωὴ 생명, 삶 | ἡ ζωὴ αἰώνιος
πίστις 믿음, 신뢰
καρδία 마음, 심장`;
      setPasteText(sampleEl);
      setDetectedLang('el');
    } else if (lang === 'es') {
      const sampleEs = `esperanza | 희망 | Siempre hay esperanza.
amigo 친구 | Él es mi mejor amigo.
gracias 감사하다 | Muchas gracias por tu ayuda.
trabajo 일, 직업 | Me gusta mucho mi trabajo.
tiempo 시간, 날씨 | El tiempo pasa muy rápido.`;
      setPasteText(sampleEs);
      setDetectedLang('es');
    } else {
      const sampleEn = `derive | 유래하다 | This word derives from ancient Latin.
mitigate [동사] 완화하다 | The government took action to mitigate climate risks.
abandon 포기하다
subtle 미묘한
contemplate 심사숙고하다
scrutinize 면밀히 조사하다
resilient 회복력 있는
plausible 그럴듯한
tangible 실질적인, 유형의
coherent 일관성 있는`;
      setPasteText(sampleEn);
      setDetectedLang('en');
    }
  };

  const handleRowEdit = (id: string, field: keyof ExtractedVocabRow, value: any) => {
    setEditableRows(prev =>
      prev.map(row => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleRowDelete = (id: string) => {
    setEditableRows(prev => prev.filter(row => row.id !== id));
  };

  const handleCommitImport = async () => {
    if (editableRows.length === 0) return;

    setIsProcessing(true);
    const validRows = editableRows.filter(r => r.term.trim() && r.userMeaning.trim());

    const newVocabItems: VocabularyItem[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const term = row.term.trim();
      const userMeaning = row.userMeaning.trim();

      const newItem: VocabularyItem = {
        id: `vocab_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
        collectionId: targetCollectionId || collections[0]?.id || 'col_essential_advanced',
        folderId: targetFolderId && targetFolderId !== 'all' ? targetFolderId : undefined,
        sourceLanguage: detectedLang,
        targetLanguage: 'ko',
        term,
        lemma: term.toLowerCase(),
        partOfSpeech: row.partOfSpeech,
        pronunciation: row.pronunciation,
        userMeaning, // USER MEANING ALWAYS PRESERVED AS PRIMARY
        exampleSentences: row.exampleSentenceEn
          ? [
              {
                id: `ex_${Date.now()}_${i}`,
                source: 'user',
                en: row.exampleSentenceEn,
                ko: row.exampleSentenceKo || '',
                clozeBlank: term,
              },
            ]
          : [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      newVocabItems.push(newItem);
    }

    // Optional quick AI enrichment in background/parallel if requested
    if (enrichWithAI && newVocabItems.length <= 15) {
      try {
        await Promise.allSettled(
          newVocabItems.map(async item => {
            const aiData = await analyzeWordWithAI(item.term, item.userMeaning);
            if (aiData) {
              item.lemma = aiData.lemma || item.lemma;
              item.aiSuggestedMeaning = aiData.alternativeMeanings.join(', ');
              item.alternativeMeanings = aiData.alternativeMeanings;
              item.pronunciation = aiData.pronunciation;
              item.collocations = aiData.collocations;
              item.distractors = aiData.distractors;
              if (aiData.exampleSentence && item.exampleSentences.length === 0) {
                item.exampleSentences.push({
                  id: `ex_ai_${Date.now()}`,
                  source: 'ai',
                  en: aiData.exampleSentence.en,
                  ko: aiData.exampleSentence.ko,
                  clozeBlank: item.term,
                });
              }
            }
          })
        );
      } catch {
        // Continue even if enrichment fails
      }
    }

    onImportComplete(newVocabItems);
    setIsProcessing(false);
    setParsedResult(null);
    setEditableRows([]);
    setPasteText('');
    setImportSuccessMessage(`${newVocabItems.length}개 단어가 성공적으로 등록되었습니다!`);
  };

  return (
    <div className="pb-24 pt-4 px-4 max-w-md mx-auto animate-in fade-in duration-300">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">단어 파일 추가</h1>
        <p className="text-xs text-slate-500">
          PDF, Excel(XLSX), CSV, TXT, Word(DOCX) 파일을 자동 분석합니다
        </p>
      </div>

      {importSuccessMessage && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2 text-emerald-800 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{importSuccessMessage}</span>
          </div>
          <button
            onClick={() => onNavigateTab('library')}
            className="text-xs text-emerald-700 underline font-semibold flex items-center gap-0.5"
          >
            단어장 확인 <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Target Collection & Folder Selector */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 mb-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              저장할 단어장 (카테고리)
            </label>
            <select
              value={targetCollectionId}
              onChange={e => {
                setTargetCollectionId(e.target.value);
                setTargetFolderId('all');
              }}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 cursor-pointer"
            >
              {collections.map(col => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              저장할 폴더 (선택)
            </label>
            <select
              value={targetFolderId}
              onChange={e => setTargetFolderId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 cursor-pointer"
            >
              <option value="all">📁 전체 / 기본</option>
              {folders
                .filter(f => f.collectionId === targetCollectionId)
                .map(f => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Mode Tabs: 파일 업로드 vs 텍스트 붙여넣기 */}
      {!parsedResult && (
        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl mb-4">
          <button
            onClick={() => setActiveMode('upload')}
            className={`py-2 text-xs font-semibold rounded-xl transition-all ${
              activeMode === 'upload'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            파일 업로드
          </button>
          <button
            onClick={() => setActiveMode('paste')}
            className={`py-2 text-xs font-semibold rounded-xl transition-all ${
              activeMode === 'paste'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            직접 텍스트 입력
          </button>
        </div>
      )}

      {/* Upload Zone */}
      {!parsedResult && activeMode === 'upload' && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/30 hover:bg-indigo-50/60 rounded-3xl p-8 text-center cursor-pointer transition-all shadow-sm mb-4"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt,.docx,.pdf"
            onChange={e => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelected(e.target.files[0]);
              }
            }}
            className="hidden"
          />

          <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-3">
            <UploadCloud className="w-7 h-7" />
          </div>

          <h3 className="text-base font-bold text-slate-900 mb-1">
            단어 파일 드래그 또는 탭하여 선택
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            XLSX, CSV, TXT, DOCX 파일 지원
          </p>

          <span className="inline-block px-3 py-1 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-full shadow-xs">
            파일 찾기
          </span>
        </div>
      )}

      {/* Paste Zone */}
      {!parsedResult && activeMode === 'paste' && (
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span className="text-xs text-slate-500 font-medium">단어 목록을 붙여넣으세요</span>
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] text-slate-400">예시:</span>
              <button
                type="button"
                onClick={() => handleLoadSample('ja')}
                className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 cursor-pointer"
              >
                🇯🇵 일본어
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('en')}
                className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 cursor-pointer"
              >
                🇬🇧 영어
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('he')}
                className="text-[11px] px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 font-semibold hover:bg-sky-100 cursor-pointer"
              >
                🇮🇱 히브리어
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('el')}
                className="text-[11px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 cursor-pointer"
              >
                🇬🇷 헬라어
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('es')}
                className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 cursor-pointer"
              >
                🇪🇸 스페인어
              </button>
            </div>
          </div>

          <textarea
            rows={8}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={`食べる 먹다\n勉強 공부하다\n約束 약속하다\n또는:\n食べる | 먹다 | 毎日野菜をたくさん食べます。`}
            className="w-full p-3.5 text-xs font-mono bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />

          <button
            onClick={handlePasteSubmit}
            disabled={!pasteText.trim() || isProcessing}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs shadow-md disabled:opacity-50 transition-colors cursor-pointer"
          >
            단어 추출 및 자동 언어 분석
          </button>
        </div>
      )}

      {/* Extraction Preview and Edit Table */}
      {parsedResult && (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800">
                추출된 단어 미리보기 ({editableRows.length}개)
              </span>
              <button
                onClick={() => setParsedResult(null)}
                className="text-xs text-slate-400 hover:text-slate-600 underline cursor-pointer"
              >
                다시 업로드
              </button>
            </div>

            {/* Language Auto-Detection Banner */}
            <div className="p-3 mb-3 rounded-xl bg-indigo-50/80 border border-indigo-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                <span className="text-base">{langMeta.flag}</span>
                <span>감지된 언어: <strong>{langMeta.name}</strong></span>
              </div>
              <div className="flex items-center gap-1">
                {SUPPORTED_LANGUAGES.map(l => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setDetectedLang(l.code)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-all ${
                      detectedLang === l.code
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-indigo-100'
                    }`}
                  >
                    {l.flag} {l.name}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 mb-3">
              추출된 내용이 정확한지 확인하고 필요한 경우 수정하세요. 사용자가 등록한 뜻은 절대 임의 변경되지 않습니다.
            </p>

            {/* AI Enrichment Checkbox */}
            <label className="flex items-center gap-2 p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl cursor-pointer text-xs text-indigo-950 font-medium mb-3">
              <input
                type="checkbox"
                checked={enrichWithAI}
                onChange={e => setEnrichWithAI(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>AI {langMeta.name} 발음(후리가나/IPA), 예문, 오답 보기 자동 생성</span>
            </label>

            {/* Column Headers */}
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 px-2 mb-1.5">
              <span>{langMeta.wordName}</span>
              <span>한국어 뜻</span>
            </div>

            {/* Editable List */}
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {editableRows.map(row => (
                <div
                  key={row.id}
                  className={`p-3 rounded-xl border text-xs ${
                    row.isDuplicate
                      ? 'bg-amber-50/50 border-amber-200'
                      : 'bg-slate-50 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <input
                      type="text"
                      value={row.term}
                      onChange={e => handleRowEdit(row.id, 'term', e.target.value)}
                      placeholder={langMeta.wordName}
                      className="font-bold text-slate-900 bg-white px-2 py-1 rounded-lg border border-slate-200 text-xs w-1/2"
                    />

                    <input
                      type="text"
                      value={row.userMeaning}
                      onChange={e => handleRowEdit(row.id, 'userMeaning', e.target.value)}
                      placeholder="뜻"
                      className="text-slate-800 bg-white px-2 py-1 rounded-lg border border-slate-200 text-xs w-1/2"
                    />

                    <button
                      onClick={() => handleRowDelete(row.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {row.exampleSentenceEn && (
                    <div className="text-[11px] text-slate-500 bg-white/80 p-2 rounded-lg border border-slate-100 mt-1">
                      <span className="font-semibold text-slate-700">예문: </span>
                      {row.exampleSentenceEn}
                    </div>
                  )}

                  {row.isDuplicate && (
                    <span className="text-[10px] text-amber-700 font-semibold block mt-1">
                      ⚠️ 이미 단어장에 존재하는 단어입니다. (새 주기로 갱신됩니다)
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Commit Import Button */}
            <button
              onClick={handleCommitImport}
              disabled={isProcessing || editableRows.length === 0}
              className="w-full mt-4 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm shadow-md disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{langMeta.name} 단어 등록 및 AI 분석 중...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editableRows.length}개 {langMeta.name} 단어 등록하기</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

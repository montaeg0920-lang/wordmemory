import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { Camera, Check, ClipboardList, FileUp, ImageIcon, Loader2, PenLine, Sparkles, Trash2, X } from 'lucide-react';
import { LanguageCode, UserSettings, VocabularyCollection, VocabularyFolder, VocabularyItem } from '../types/database';
import { ExtractedWord, analyzeWordWithAI, extractVocabularyFromFile, extractVocabularyFromText, mapWithConcurrency } from '../lib/aiClient';
import { ParsedImportResult, classifyFile, extractPlainText, parseSpreadsheetData, parseTextContent } from '../lib/fileParser';
import { describeCameraError, prefersNativeCamera } from '../lib/imageTools';
import { detectLanguage, getLanguageMeta } from '../lib/languageHelper';
import { Button, Card, Field, Notice, ScreenHeader, Segmented, Select, Sheet, TermText, inputClass } from './ui';

interface AddWordsScreenProps {
  collections: VocabularyCollection[];
  folders: VocabularyFolder[];
  existingItems: VocabularyItem[];
  settings: UserSettings;
  onSave: (items: VocabularyItem[]) => number;
  onSaveCollection: (col: VocabularyCollection) => void;
}

type Tab = 'single' | 'paste' | 'photo' | 'file';

interface DraftRow {
  key: string;
  term: string;
  meaning: string;
  partOfSpeech?: string;
  pronunciation?: string;
  exampleEn?: string;
  exampleKo?: string;
  alternativeMeanings?: string[];
  collocations?: string[];
  distractors?: string[];
  include: boolean;
  duplicate: boolean;
  warning?: string;
}

const MAX_AI_ENRICH = 100;

export const AddWordsScreen: React.FC<AddWordsScreenProps> = ({
  collections,
  folders,
  existingItems,
  settings,
  onSave,
  onSaveCollection,
}) => {
  const [collectionId, setCollectionId] = useState(collections[0]?.id || '');
  const [folderId, setFolderId] = useState('');
  const [tab, setTab] = useState<Tab>('single');
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  const collection = collections.find(c => c.id === collectionId) || collections[0];
  const lang = collection?.sourceLanguage || settings.sourceLanguage;
  const langName = getLanguageMeta(lang).name;
  const collectionFolders = folders.filter(f => f.collectionId === collection?.id);
  const existingInCollection = useMemo(
    () => existingItems.filter(i => i.collectionId === collection?.id),
    [existingItems, collection?.id]
  );
  const existingTerms = useMemo(
    () => new Set(existingInCollection.map(i => i.term.toLowerCase().trim())),
    [existingInCollection]
  );

  const buildItems = (rows: DraftRow[]): VocabularyItem[] => {
    const now = Date.now();
    return rows.map((r, idx) => ({
      id: `vocab_${now}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      collectionId: collection.id,
      folderId: folderId || undefined,
      sourceLanguage: lang as LanguageCode,
      targetLanguage: 'ko',
      term: r.term.trim(),
      lemma: r.term.trim().toLowerCase(),
      partOfSpeech: r.partOfSpeech || undefined,
      userMeaning: r.meaning.trim(),
      alternativeMeanings: r.alternativeMeanings,
      pronunciation: r.pronunciation || undefined,
      collocations: r.collocations,
      distractors: r.distractors,
      exampleSentences: r.exampleEn
        ? [{ id: `ex_${now}_${idx}`, source: 'user', en: r.exampleEn, ko: r.exampleKo || '', clozeBlank: r.term.trim() }]
        : [],
      createdAt: now + idx,
      updatedAt: now,
    }));
  };

  if (!collection) {
    return (
      <div>
        <ScreenHeader title="단어 추가" />
        <Notice>먼저 단어장을 하나 만들어 주세요.</Notice>
      </div>
    );
  }

  return (
    <div className="vc-enter">
      <ScreenHeader title="단어 추가" subtitle={`${langName} → 한국어`} />

      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label="저장할 단어장"
          value={collection.id}
          onChange={e => {
            if (e.target.value === '__new') {
              setShowNewCollection(true);
              return;
            }
            setCollectionId(e.target.value);
            setFolderId('');
          }}
        >
          {collections.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="__new">+ 새 단어장 만들기</option>
        </Select>
        <Select aria-label="저장할 폴더" value={folderId} onChange={e => setFolderId(e.target.value)}>
          <option value="">폴더 없음</option>
          {collectionFolders.map(f => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-4">
        <TabBar value={tab} onChange={setTab} />
      </div>

      <div className="mt-5">
        {tab === 'single' && (
          <SingleWordForm lang={lang} existingTerms={existingTerms} onSave={row => onSave(buildItems([row]))} />
        )}
        {tab !== 'single' && (
          <BatchImport
            key={tab}
            mode={tab}
            lang={lang}
            existingInCollection={existingInCollection}
            existingTerms={existingTerms}
            onSave={rows => onSave(buildItems(rows))}
          />
        )}
      </div>

      {showNewCollection && (
        <Sheet
          title="새 단어장"
          onClose={() => setShowNewCollection(false)}
          footer={
            <Button
              variant="primary"
              block
              disabled={!newCollectionName.trim()}
              onClick={() => {
                const now = Date.now();
                const col: VocabularyCollection = {
                  id: `col_${now}`,
                  name: newCollectionName.trim(),
                  sourceLanguage: settings.sourceLanguage,
                  targetLanguage: 'ko',
                  createdAt: now,
                  updatedAt: now,
                  color: '#2B4C7E',
                };
                onSaveCollection(col);
                setCollectionId(col.id);
                setFolderId('');
                setNewCollectionName('');
                setShowNewCollection(false);
              }}
            >
              만들기
            </Button>
          }
        >
          <Field label="이름">
            <input
              autoFocus
              className={inputClass}
              value={newCollectionName}
              onChange={e => setNewCollectionName(e.target.value)}
              placeholder="예: 토익 필수 어휘"
            />
          </Field>
        </Sheet>
      )}
    </div>
  );
};

const TabBar: React.FC<{ value: Tab; onChange: (t: Tab) => void }> = ({ value, onChange }) => {
  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'single', label: '한 단어', icon: PenLine },
    { id: 'paste', label: '붙여넣기', icon: ClipboardList },
    { id: 'photo', label: '사진 찍기', icon: Camera },
    { id: 'file', label: '파일 넣기', icon: FileUp },
  ];
  return (
    <div className="grid grid-cols-4 gap-1 p-1 bg-sunken rounded-xl" role="tablist">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`h-14 rounded-lg flex flex-col items-center justify-center gap-0.5 text-[13px] ${
            value === id ? 'bg-surface text-ink font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-muted'
          }`}
        >
          <Icon className="w-[18px] h-[18px]" />
          {label}
        </button>
      ))}
    </div>
  );
};

/* ============================ Single word ============================ */

const SingleWordForm: React.FC<{
  lang: string;
  existingTerms: Set<string>;
  onSave: (row: DraftRow) => number;
}> = ({ lang, existingTerms, onSave }) => {
  const empty: DraftRow = { key: 'single', term: '', meaning: '', include: true, duplicate: false };
  const [row, setRow] = useState<DraftRow>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const termRef = useRef<HTMLInputElement>(null);
  const isDuplicate = row.term.trim() !== '' && existingTerms.has(row.term.trim().toLowerCase());
  const wordLang = row.term.trim() ? detectLanguage(row.term.trim(), lang as never) : lang;

  const fill = async () => {
    if (!row.term.trim()) return;
    setBusy(true);
    setError(null);
    const res = await analyzeWordWithAI(row.term.trim(), row.meaning.trim(), wordLang);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const d = res.data;
    setRow(r => {
      const meaning = r.meaning.trim() || d.alternativeMeanings[0] || '';
      return {
        ...r,
        meaning,
        alternativeMeanings: d.alternativeMeanings.filter(m => m !== meaning).slice(0, 3),
        partOfSpeech: r.partOfSpeech || d.partOfSpeech || undefined,
        pronunciation: r.pronunciation || d.pronunciation || undefined,
        exampleEn: r.exampleEn || d.exampleSentence?.en || undefined,
        exampleKo: r.exampleKo || d.exampleSentence?.ko || undefined,
        collocations: d.collocations,
        distractors: d.distractors,
      };
    });
  };

  const save = () => {
    if (!row.term.trim() || !row.meaning.trim()) return;
    onSave(row);
    setSaved(row.term.trim());
    setRow(empty);
    setError(null);
    termRef.current?.focus();
  };

  const hasExtras = row.partOfSpeech || row.pronunciation || row.exampleEn || (row.alternativeMeanings?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {saved && (
        <Notice tone="good" onClose={() => setSaved(null)}>
          ‘{saved}’ 저장했습니다. 계속 입력하세요.
        </Notice>
      )}
      <Field label="단어">
        <div className="flex gap-2">
          <input
            ref={termRef}
            autoFocus
            className={`${inputClass} font-serif text-[17px]`}
            placeholder={getLanguageMeta(lang).sampleTerm}
            value={row.term}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={e => setRow({ ...empty, term: e.target.value, meaning: row.meaning })}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!row.meaning.trim()) fill();
                else save();
              }
            }}
          />
          <Button onClick={fill} disabled={!row.term.trim() || busy} className="shrink-0" aria-label="AI로 뜻과 예문 채우기">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-accent" />}
            AI 채우기
          </Button>
        </div>
      </Field>
      {isDuplicate && <p className="text-[13px] text-warn -mt-2">이미 이 단어장에 있는 단어입니다. 저장하면 내용이 갱신됩니다.</p>}

      <Field label="뜻" hint="뜻을 비워 두고 Enter를 누르면 AI가 채워 줍니다.">
        <input
          className={inputClass}
          placeholder={getLanguageMeta(lang).sampleMeaning}
          value={row.meaning}
          onChange={e => setRow({ ...row, meaning: e.target.value })}
          onKeyDown={e => e.key === 'Enter' && save()}
        />
      </Field>

      {error && <Notice tone="bad">{error} 뜻은 직접 입력해서 저장할 수 있습니다.</Notice>}

      {hasExtras && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-muted">AI가 채운 내용 · 확인 후 저장하세요</p>
            <button
              className="text-[13px] text-muted"
              onClick={() =>
                setRow(r => ({ ...r, partOfSpeech: undefined, pronunciation: undefined, exampleEn: undefined, exampleKo: undefined, alternativeMeanings: undefined, collocations: undefined }))
              }
            >
              지우기
            </button>
          </div>
          <p className="text-[15px] mt-2">
            <TermText term={row.term} lang={wordLang} />
            {row.pronunciation && <span className="text-muted"> · {row.pronunciation}</span>}
            {row.partOfSpeech && <span className="text-muted"> · {row.partOfSpeech}</span>}
          </p>
          {row.alternativeMeanings && row.alternativeMeanings.length > 0 && (
            <p className="text-[14px] text-ink-2 mt-1">다른 뜻: {row.alternativeMeanings.join(', ')}</p>
          )}
          {row.exampleEn && (
            <div className="mt-3 pt-3 border-t border-line">
              <p className="font-serif text-[15px] leading-relaxed" dir="auto">{row.exampleEn}</p>
              {row.exampleKo && <p className="text-[13px] text-ink-2 mt-1">{row.exampleKo}</p>}
            </div>
          )}
        </Card>
      )}

      <Button variant="primary" size="lg" block onClick={save} disabled={!row.term.trim() || !row.meaning.trim()}>
        저장
      </Button>
    </div>
  );
};

/* ============================ Batch (paste / photo / file) ============================ */

interface BatchSourceResult {
  words: ExtractedWord[];
  /** Plain text read locally (kept so "AI로 더 정확하게" can re-run on it). */
  text?: string;
  viaAI: boolean;
}

type Script = 'hebrew' | 'greek' | 'kana' | 'cjk' | 'cyrillic' | 'latin' | 'other';
function scriptOf(text: string): Script {
  if (/[\u0590-\u05FF]/.test(text)) return 'hebrew';
  if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(text)) return 'greek';
  if (/[\u3040-\u30FF]/.test(text)) return 'kana';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'cjk';
  if (/[\u0400-\u04FF]/.test(text)) return 'cyrillic';
  if (/[a-zA-Z\u00C0-\u024F]/.test(text)) return 'latin';
  return 'other';
}
const EXPECTED_SCRIPTS: Partial<Record<string, Script[]>> = {
  en: ['latin'], es: ['latin'], fr: ['latin'], de: ['latin'],
  he: ['hebrew'], el: ['greek'], ja: ['kana', 'cjk'], zh: ['cjk'],
};

/** Rows that look like sentences, headings or the wrong language. */
function rowProblem(w: ExtractedWord, lang: string): string | undefined {
  const expected = EXPECTED_SCRIPTS[lang];
  if (expected && !expected.includes(scriptOf(w.term))) return `${getLanguageMeta(lang).name}가 아닌 단어`;
  if (/[가-힣]/.test(w.term) || /\d/.test(w.term) || w.term.trim().split(/\s+/).length > 5 || w.meaning.length > 40)
    return '단어가 아닐 수 있음';
  return undefined;
}

const toDraftRows = (words: ExtractedWord[], existingTerms: Set<string>, keyPrefix: string, lang: string): DraftRow[] =>
  words.map((w, i) => {
    const dup = existingTerms.has(w.term.toLowerCase().trim());
    const problem = rowProblem(w, lang);
    return {
      key: `${keyPrefix}_${i}_${w.term}`,
      term: w.term,
      meaning: w.meaning,
      partOfSpeech: w.partOfSpeech,
      pronunciation: w.pronunciation,
      include: !dup && !problem,
      duplicate: dup,
      warning: dup ? '이미 있는 단어' : problem,
    };
  });

const parsedToWords = (res: ParsedImportResult): ExtractedWord[] =>
  res.rows
    .filter(r => r.isValid !== false && r.term && r.userMeaning)
    .map(r => ({ term: r.term, meaning: r.userMeaning, partOfSpeech: r.partOfSpeech, pronunciation: r.pronunciation }));

/** Local parsing found too little compared with the amount of text → let AI read it. */
function localResultLooksWeak(words: ExtractedWord[], text: string, lang: string): boolean {
  const lines = text.split(/\n/).filter(l => l.trim().length > 1).length;
  const suspicious = words.filter(w => rowProblem(w, lang)).length;
  return words.length === 0 || (lines >= 5 && words.length < lines * 0.4) || suspicious > words.length * 0.2;
}

const BatchImport: React.FC<{
  mode: Exclude<Tab, 'single'>;
  lang: string;
  existingInCollection: VocabularyItem[];
  existingTerms: Set<string>;
  onSave: (rows: DraftRow[]) => number;
}> = ({ mode, lang, existingInCollection, existingTerms, onSave }) => {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [source, setSource] = useState('');
  const [localTexts, setLocalTexts] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [enrich, setEnrich] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [liveCamera, setLiveCamera] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nativeCamera = prefersNativeCamera();
  const langName = getLanguageMeta(lang).name;

  const showRows = (list: DraftRow[], label: string) => {
    setSource(label);
    setRows(list);
    if (list.length === 0) setError('단어를 찾지 못했습니다. 단어와 뜻이 잘 보이는지 확인해 주세요.');
  };

  /** Reads one file: photos/PDFs → AI; documents/tables/text → instant local parsing, AI if that looks weak. */
  const readOne = async (file: File): Promise<BatchSourceResult | { error: string }> => {
    const kind = classifyFile(file);
    if (kind === 'image' || kind === 'pdf') {
      const res = await extractVocabularyFromFile(file, lang);
      return res.ok ? { words: res.data, viaAI: true } : { error: `${file.name}: ${res.error}` };
    }
    if (kind === 'unsupported') {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const tip =
        ext === 'hwp' ? '한글에서 "다른 이름으로 저장 → PDF 또는 HWPX"로 저장해서 넣어 주세요.' : 'PDF로 저장하거나 사진으로 찍어서 넣어 주세요.';
      return { error: `${file.name}: 이 파일은 바로 읽을 수 없어요. ${tip}` };
    }
    try {
      let words: ExtractedWord[];
      let plain = '';
      if (kind === 'sheet') {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        words = parsedToWords(parseSpreadsheetData(workbook, file.name, existingInCollection));
        plain = await extractPlainText(file);
      } else {
        plain = await extractPlainText(file);
        words = parsedToWords(parseTextContent(plain, file.name, existingInCollection));
      }
      if (localResultLooksWeak(words, plain, lang) && plain.trim()) {
        const ai = await extractVocabularyFromText(plain, lang);
        if (ai.ok) return { words: ai.data, viaAI: true, text: plain };
      }
      return { words, viaAI: false, text: plain };
    } catch {
      return { error: `${file.name}: 파일을 열지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.` };
    }
  };

  const handleFiles = async (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list || []).slice(0, 20);
    if (files.length === 0) return;
    setError(null);
    setDone(null);
    const results: (BatchSourceResult | { error: string })[] = [];
    let finished = 0;
    const label = (n: number) =>
      files.length === 1
        ? classifyFile(files[0]) === 'image'
          ? '사진에서 단어를 찾는 중…'
          : '파일에서 단어를 찾는 중…'
        : `${files.length}개 중 ${n}개 읽음…`;
    setBusy(label(0));
    await mapWithConcurrency(
      files,
      3,
      async (f, i) => {
        results[i] = await readOne(f);
      },
      () => setBusy(label(++finished))
    );
    setBusy(null);

    const errors = results.filter((r): r is { error: string } => 'error' in r).map(r => r.error);
    const ok = results.filter((r): r is BatchSourceResult => !('error' in r));
    const merged: ExtractedWord[] = [];
    const seen = new Set<string>();
    for (const r of ok)
      for (const w of r.words) {
        const k = w.term.toLowerCase().trim();
        if (!seen.has(k)) {
          seen.add(k);
          merged.push(w);
        }
      }
    setLocalTexts(ok.filter(r => !r.viaAI && r.text).map(r => r.text!));
    if (errors.length) setError(errors.join('\n'));
    if (ok.length) showRows(toDraftRows(merged, existingTerms, 'f', lang), files.length === 1 ? files[0].name : `파일 ${files.length}개`);
  };

  const reRunWithAI = async () => {
    if (localTexts.length === 0) return;
    setBusy('AI가 더 정확하게 찾는 중…');
    const res = await extractVocabularyFromText(localTexts.join('\n\n'), lang);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLocalTexts([]);
    showRows(toDraftRows(res.data, existingTerms, 'ai', lang), source);
  };

  const save = async () => {
    if (!rows) return;
    const chosen = rows.filter(r => r.include && r.term.trim() && r.meaning.trim());
    if (chosen.length === 0) return;
    setError(null);

    let failed = 0;
    if (enrich) {
      const targets = chosen.filter(r => !r.pronunciation || !r.exampleEn).slice(0, MAX_AI_ENRICH);
      if (targets.length > 0) {
        setBusy(`AI로 발음·예문 채우는 중… 0/${targets.length}`);
        await mapWithConcurrency(
          targets,
          4,
          async r => {
            const res = await analyzeWordWithAI(r.term, r.meaning, lang);
            if (!res.ok) {
              failed++;
              return;
            }
            const d = res.data;
            r.partOfSpeech = r.partOfSpeech || d.partOfSpeech || undefined;
            r.pronunciation = r.pronunciation || d.pronunciation || undefined; // never overwrite the file's own
            r.alternativeMeanings = d.alternativeMeanings.filter(m => m !== r.meaning).slice(0, 3);
            r.collocations = d.collocations;
            r.distractors = d.distractors;
            if (!r.exampleEn && d.exampleSentence?.en) {
              r.exampleEn = d.exampleSentence.en;
              r.exampleKo = d.exampleSentence.ko;
            }
          },
          n => setBusy(`AI로 발음·예문 채우는 중… ${n}/${targets.length}`)
        );
      }
    }

    const saved = onSave(chosen);
    setBusy(null);
    setRows(null);
    setText('');
    setLocalTexts([]);
    setDone(
      `${saved}개 단어를 저장했습니다.` +
        (failed > 0 ? ` (${failed}개는 AI 보강에 실패해 뜻만 저장했습니다. 단어장에서 다시 채울 수 있습니다.)` : '')
    );
  };

  const includedCount = rows?.filter(r => r.include).length ?? 0;
  const resetInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow choosing the same photo again after an error
    handleFiles(files);
  };

  return (
    <div className="space-y-4">
      {done && (
        <Notice tone="good" onClose={() => setDone(null)}>
          {done}
        </Notice>
      )}
      {error && (
        <Notice tone="bad" onClose={() => setError(null)}>
          <span className="whitespace-pre-line">{error}</span>
        </Notice>
      )}

      {!rows && !busy && (
        <>
          {mode === 'paste' && (
            <>
              <textarea
                className={`${inputClass} h-48 py-3 leading-relaxed`}
                placeholder={'한 줄에 하나씩 붙여넣으세요\n\nderive - 유래하다\nmitigate  완화하다\n3. subtle : 미묘한'}
                value={text}
                onChange={e => setText(e.target.value)}
              />
              <Button
                variant="primary"
                size="lg"
                block
                disabled={!text.trim()}
                onClick={async () => {
                  setError(null);
                  setDone(null);
                  const words = parsedToWords(parseTextContent(text, '붙여넣기', existingInCollection));
                  if (localResultLooksWeak(words, text, lang)) {
                    setBusy('AI가 단어를 찾는 중…');
                    const ai = await extractVocabularyFromText(text, lang);
                    setBusy(null);
                    if (ai.ok) return showRows(toDraftRows(ai.data, existingTerms, 'p', lang), '붙여넣기');
                  }
                  setLocalTexts([text]);
                  showRows(toDraftRows(words, existingTerms, 'p', lang), '붙여넣기');
                }}
              >
                단어 찾기
              </Button>
              <p className="text-[13px] text-muted">어떤 모양으로 적혀 있어도 괜찮아요. 깔끔한 목록은 바로, 복잡한 글은 AI가 골라 냅니다.</p>
            </>
          )}

          {mode === 'photo' && (
            <Card className="p-5 text-center">
              <p className="text-[15px] text-ink-2 leading-relaxed">
                교재·단어 시험지·칠판을 찍으면 AI가 {langName} 단어와 뜻을 찾아 줍니다. 저장 전에 직접 확인할 수 있어요.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-5">
                <Button variant="primary" onClick={() => (nativeCamera ? cameraRef.current?.click() : setLiveCamera(true))}>
                  <Camera className="w-4 h-4" /> 사진 찍기
                </Button>
                <Button onClick={() => galleryRef.current?.click()}>
                  <ImageIcon className="w-4 h-4" /> 앨범에서
                </Button>
              </div>
              <p className="text-[12px] text-muted mt-3">글자가 화면에 꽉 차게, 밝은 곳에서 찍으면 더 정확해요. 여러 장도 한 번에 고를 수 있어요.</p>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={resetInput} />
              <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={resetInput} />
            </Card>
          )}

          {mode === 'file' && (
            <div
              onDragOver={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              className={`w-full rounded-2xl border-2 border-dashed px-5 py-10 text-center cursor-pointer ${
                dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:border-accent'
              }`}
            >
              <FileUp className="w-7 h-7 mx-auto text-muted" />
              <p className="text-[16px] font-semibold mt-3">파일 넣기</p>
              <p className="text-[14px] text-ink-2 mt-1">단어가 들어 있는 파일이면 무엇이든 넣어 보세요</p>
              <p className="text-[12px] text-muted mt-2">사진 · 문서 · 표 · 발표 자료 · 메모 · 한글 문서 / 여러 개도 한 번에</p>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={resetInput} />
            </div>
          )}
        </>
      )}

      {busy && (
        <Card className="p-6 flex items-center justify-center gap-3 text-[15px] text-ink-2">
          <Loader2 className="w-5 h-5 animate-spin text-accent" /> {busy}
        </Card>
      )}

      {rows && rows.length > 0 && !busy && (
        <>
          <div className="flex items-center justify-between px-1 gap-2">
            <p className="text-[13px] text-muted min-w-0 truncate">
              {source} · {rows.length}개 찾음
              {rows.some(r => !r.include) && ` · ${rows.filter(r => !r.include).length}개 제외됨`}
            </p>
            <button className="text-[13px] text-muted shrink-0" onClick={() => setRows(null)}>
              다시 하기
            </button>
          </div>
          {localTexts.length > 0 && (
            <button
              onClick={reRunWithAI}
              className="w-full flex items-center justify-center gap-1.5 h-10 rounded-xl bg-accent-soft text-[14px] text-ink"
            >
              <Sparkles className="w-4 h-4 text-accent" /> 빠진 단어가 있나요? AI로 더 정확하게 찾기
            </button>
          )}
          <Card className="divide-y divide-line overflow-hidden">
            {rows.map((r, i) => (
              <div key={r.key} className={`flex items-center gap-2 px-3 py-2 ${r.include ? '' : 'opacity-50'}`}>
                <button
                  onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, include: !x.include } : x)))}
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                    r.include ? 'bg-accent border-accent text-on-accent' : 'border-line-strong'
                  }`}
                  aria-label={r.include ? '제외하기' : '포함하기'}
                >
                  {r.include && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </button>
                <input
                  className="flex-1 min-w-0 h-9 px-2 rounded-lg bg-transparent focus:bg-sunken font-serif text-[15px] outline-none"
                  value={r.term}
                  dir="auto"
                  onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)))}
                  aria-label="단어"
                />
                <div className="flex-1 min-w-0">
                  <input
                    className="w-full h-9 px-2 rounded-lg bg-transparent focus:bg-sunken text-[14px] text-ink-2 outline-none"
                    value={r.meaning}
                    onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, meaning: e.target.value } : x)))}
                    aria-label="뜻"
                  />
                  {r.warning && <p className="px-2 -mt-1 pb-1 text-[11px] text-warn">{r.warning}</p>}
                </div>
                <button
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  className="p-1.5 text-muted hover:text-bad shrink-0"
                  aria-label="행 삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </Card>

          <label className="flex items-start gap-3 px-1 cursor-pointer">
            <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={enrich} onChange={e => setEnrich(e.target.checked)} />
            <span className="text-[14px] text-ink-2">
              AI로 발음·예문 채우기 <span className="text-muted">(최대 {MAX_AI_ENRICH}개, 이미 있는 내용은 그대로 둡니다)</span>
            </span>
          </label>

          <Button variant="primary" size="lg" block disabled={includedCount === 0} onClick={save}>
            {includedCount}개 저장
          </Button>
        </>
      )}

      {liveCamera && (
        <LiveCameraSheet
          onClose={() => setLiveCamera(false)}
          onCapture={file => {
            setLiveCamera(false);
            handleFiles([file]);
          }}
          onFallback={() => {
            setLiveCamera(false);
            galleryRef.current?.click();
          }}
        />
      )}
    </div>
  );
};

/** In-app camera for computers/tablets without a native camera picker. */
const LiveCameraSheet: React.FC<{ onClose: () => void; onCapture: (file: File) => void; onFallback: () => void }> = ({
  onClose,
  onCapture,
  onFallback,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no api'), { name: 'NotFoundError' });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach(t => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
          setReady(true);
        }
      } catch (e) {
        setError(describeCameraError(e).message);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      b => b && onCapture(new File([b], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })),
      'image/jpeg',
      0.9
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="카메라">
      <div className="flex justify-end p-3 safe-top">
        <button onClick={onClose} className="p-2 rounded-full text-white/80 hover:bg-white/10" aria-label="닫기">
          <X className="w-6 h-6" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
        {error ? (
          <div className="max-w-sm text-center text-white">
            <p className="text-[15px] leading-relaxed">{error}</p>
            <button onClick={onFallback} className="mt-5 h-11 px-5 rounded-xl bg-white text-black font-semibold">
              앨범에서 고르기
            </button>
          </div>
        ) : (
          <video ref={videoRef} playsInline muted className="max-h-full max-w-full rounded-xl" />
        )}
      </div>
      {!error && (
        <div className="flex justify-center py-6 safe-bottom">
          <button
            onClick={capture}
            disabled={!ready}
            className="w-[72px] h-[72px] rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
            aria-label="찍기"
          />
        </div>
      )}
    </div>,
    document.body
  );
};

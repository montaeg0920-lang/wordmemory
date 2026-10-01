import React, { useMemo, useRef, useState } from 'react';
import { Camera, Check, ClipboardList, FileUp, ImageIcon, Loader2, PenLine, Sparkles, Trash2 } from 'lucide-react';
import { UserSettings, VocabularyCollection, VocabularyFolder, VocabularyItem } from '../types/database';
import { analyzeWordWithAI, extractVocabularyFromFile, mapWithConcurrency } from '../lib/aiClient';
import { NeedsAIExtractionError, ParsedImportResult, parseTextContent, processVocabularyFile } from '../lib/fileParser';
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
      sourceLanguage: detectLanguage(r.term, lang),
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
    { id: 'photo', label: '사진', icon: Camera },
    { id: 'file', label: '파일', icon: FileUp },
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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [enrich, setEnrich] = useState(true);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fromParsed = (res: ParsedImportResult): DraftRow[] =>
    res.rows
      .filter(r => r.isValid !== false && r.term && r.userMeaning)
      .map((r, i) => ({
        key: `${i}_${r.term}`,
        term: r.term,
        meaning: r.userMeaning,
        partOfSpeech: r.partOfSpeech,
        pronunciation: r.pronunciation,
        exampleEn: r.exampleSentenceEn,
        exampleKo: r.exampleSentenceKo,
        include: !existingTerms.has(r.term.toLowerCase().trim()),
        duplicate: existingTerms.has(r.term.toLowerCase().trim()),
      }));

  const showRows = (list: DraftRow[], label: string) => {
    setSource(label);
    setRows(list);
    if (list.length === 0) setError('단어를 찾지 못했습니다. "단어 - 뜻" 형식으로 한 줄에 하나씩 적혀 있는지 확인해 주세요.');
  };

  const handleAIExtract = async (file: File) => {
    setBusy(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'PDF를 읽는 중…' : '사진에서 단어를 찾는 중…');
    const res = await extractVocabularyFromFile(file, lang);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    showRows(
      res.data.map((w, i) => {
        const dup = existingTerms.has(w.term.toLowerCase().trim());
        return {
          key: `${i}_${w.term}`,
          term: w.term,
          meaning: w.meaning,
          partOfSpeech: w.partOfSpeech || undefined,
          pronunciation: w.pronunciation || undefined,
          include: !dup,
          duplicate: dup,
        };
      }),
      file.name
    );
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setDone(null);
    if (mode === 'photo') return handleAIExtract(file);
    try {
      setBusy('파일을 읽는 중…');
      const parsed = await processVocabularyFile(file, existingInCollection);
      setBusy(null);
      showRows(fromParsed(parsed), file.name);
    } catch (e) {
      setBusy(null);
      if (e instanceof NeedsAIExtractionError) return handleAIExtract(file);
      setError('파일을 읽지 못했습니다. 다른 형식(XLSX, CSV, TXT, DOCX, PDF)으로 시도해 주세요.');
    }
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
            const res = await analyzeWordWithAI(r.term, r.meaning, detectLanguage(r.term, lang as never));
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
    setDone(
      `${saved}개 단어를 저장했습니다.` +
        (failed > 0 ? ` (${failed}개는 AI 보강에 실패해 뜻만 저장했습니다. 단어장에서 다시 채울 수 있습니다.)` : '')
    );
  };

  const includedCount = rows?.filter(r => r.include).length ?? 0;

  return (
    <div className="space-y-4">
      {done && (
        <Notice tone="good" onClose={() => setDone(null)}>
          {done}
        </Notice>
      )}
      {error && (
        <Notice tone="bad" onClose={() => setError(null)}>
          {error}
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
                onClick={() => {
                  setError(null);
                  setDone(null);
                  showRows(fromParsed(parseTextContent(text, '붙여넣기', existingInCollection)), '붙여넣기');
                }}
              >
                단어 찾기
              </Button>
              <p className="text-[13px] text-muted">탭, 하이픈(-), 콜론(:), 공백으로 구분된 목록을 자동으로 나눕니다. 번호와 기호는 지워집니다.</p>
            </>
          )}

          {mode === 'photo' && (
            <Card className="p-5 text-center">
              <p className="text-[15px] text-ink-2 leading-relaxed">
                교재나 단어 시험지를 찍으면 AI가 단어와 뜻을 찾아 목록으로 만들어 줍니다. 저장 전에 직접 확인·수정할 수 있습니다.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-5">
                <Button variant="primary" onClick={() => cameraRef.current?.click()}>
                  <Camera className="w-4 h-4" /> 사진 찍기
                </Button>
                <Button onClick={() => galleryRef.current?.click()}>
                  <ImageIcon className="w-4 h-4" /> 앨범에서
                </Button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
              <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
            </Card>
          )}

          {mode === 'file' && (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed border-line-strong bg-surface px-5 py-10 text-center hover:border-accent"
            >
              <FileUp className="w-7 h-7 mx-auto text-muted" />
              <p className="text-[15px] font-semibold mt-3">파일 선택</p>
              <p className="text-[13px] text-muted mt-1">엑셀(XLSX·CSV), TXT, 워드(DOCX), PDF</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.docx,.pdf,application/pdf"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])}
              />
            </button>
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
          <div className="flex items-center justify-between px-1">
            <p className="text-[13px] text-muted">
              {source} · {rows.length}개 찾음
              {rows.some(r => r.duplicate) && ` · 중복 ${rows.filter(r => r.duplicate).length}개 제외`}
            </p>
            <button className="text-[13px] text-muted" onClick={() => setRows(null)}>
              다시 하기
            </button>
          </div>
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
                  onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)))}
                  aria-label="단어"
                />
                <input
                  className="flex-1 min-w-0 h-9 px-2 rounded-lg bg-transparent focus:bg-sunken text-[14px] text-ink-2 outline-none"
                  value={r.meaning}
                  onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, meaning: e.target.value } : x)))}
                  aria-label="뜻"
                />
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
              AI로 발음·예문 채우기 <span className="text-muted">(최대 {MAX_AI_ENRICH}개, 파일에 있는 내용은 그대로 둡니다)</span>
            </span>
          </label>

          <Button variant="primary" size="lg" block disabled={includedCount === 0} onClick={save}>
            {includedCount}개 저장
          </Button>
        </>
      )}
    </div>
  );
};

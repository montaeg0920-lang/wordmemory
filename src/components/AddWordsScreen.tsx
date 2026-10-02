import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { BookOpen, Check, ClipboardList, FileUp, Loader2, PenLine, Trash2 } from 'lucide-react';
import { LanguageCode, UserSettings, VocabularyCollection, VocabularyFolder, VocabularyItem } from '../types/database';
import { ExtractedWord, lookupWord, mapWithConcurrency } from '../lib/wordLookup';
import { ImagePrepError, prepareImageForOcr } from '../lib/imageTools';
import { recognizeText } from '../lib/ocr';
import { extractPdfText } from '../lib/pdfText';
import { ParsedImportResult, classifyFile, extractPlainText, parseSpreadsheetData, parseTextContent } from '../lib/fileParser';
import { detectLanguage, getLanguageMeta } from '../lib/languageHelper';
import { Button, Card, Field, Notice, ScreenHeader, Segmented, Select, Sheet, TermText, inputClass } from './ui';

interface AddWordsScreenProps {
  collections: VocabularyCollection[];
  folders: VocabularyFolder[];
  existingItems: VocabularyItem[];
  settings: UserSettings;
  onSave: (items: VocabularyItem[]) => number;
  onSaveCollection: (col: VocabularyCollection) => void;
  /** First-run trial: opens the paste tab with these sample lines already filled in. */
  initialPaste?: string | null;
}

type Tab = 'single' | 'paste' | 'file';

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

const MAX_LOOKUPS = 100;

export const AddWordsScreen: React.FC<AddWordsScreenProps> = ({
  collections,
  folders,
  existingItems,
  settings,
  onSave,
  onSaveCollection,
  initialPaste,
}) => {
  const [collectionId, setCollectionId] = useState(collections[0]?.id || '');
  const [folderId, setFolderId] = useState('');
  const [tab, setTab] = useState<Tab>(initialPaste ? 'paste' : 'single');
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
            initialText={tab === 'paste' ? initialPaste || '' : ''}
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
    { id: 'file', label: '파일 넣기', icon: FileUp },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 p-1 bg-sunken rounded-xl" role="tablist">
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
    const res = await lookupWord(row.term.trim(), wordLang);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const d = res.data;
    setRow(r => {
      const meaning = r.meaning.trim() || d.meanings[0] || '';
      return {
        ...r,
        meaning,
        alternativeMeanings: d.meanings.filter(m => m !== meaning).slice(0, 3),
        partOfSpeech: r.partOfSpeech || d.partOfSpeech || undefined,
        pronunciation: r.pronunciation || d.pronunciation || undefined,
        exampleEn: r.exampleEn || d.example?.text || undefined,
        exampleKo: r.exampleKo || d.example?.ko || undefined,
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
          <Button onClick={fill} disabled={!row.term.trim() || busy} className="shrink-0" aria-label="사전에서 뜻과 예문 채우기">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4 text-accent" />}
            사전 채우기
          </Button>
        </div>
      </Field>
      {isDuplicate && <p className="text-[13px] text-warn -mt-2">이미 이 단어장에 있는 단어입니다. 저장하면 내용이 갱신됩니다.</p>}

      <Field label="뜻" hint="뜻을 비워 두고 Enter를 누르면 사전에서 채워 줍니다.">
        <input
          className={inputClass}
          value={row.meaning}
          onChange={e => setRow({ ...row, meaning: e.target.value })}
          onKeyDown={e => e.key === 'Enter' && save()}
        />
      </Field>

      {error && <Notice tone="bad">{error} 뜻은 직접 입력해서 저장할 수 있습니다.</Notice>}

      {hasExtras && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-muted">사전에서 찾은 내용 · 확인 후 저장하세요</p>
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

/* ============================ Batch (paste / file) ============================ */

interface BatchSourceResult {
  words: ExtractedWord[];
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
      warning: dup ? '이미 있는 단어' : problem || (w.meaning ? undefined : '뜻은 저장할 때 사전에서 찾아요'),
    };
  });

const parsedToWords = (res: ParsedImportResult): ExtractedWord[] =>
  res.rows
    .filter(r => r.isValid !== false && r.term && r.userMeaning)
    .map(r => ({ term: r.term, meaning: r.userMeaning, partOfSpeech: r.partOfSpeech, pronunciation: r.pronunciation }));

/**
 * Lines that hold just a word of the learner's language (a word list without
 * meanings, e.g. a photo of a word test). Their meanings are looked up in the
 * dictionary when saving.
 */
function bareTerms(text: string, lang: string): ExtractedWord[] {
  const expected = EXPECTED_SCRIPTS[lang];
  const out: ExtractedWord[] = [];
  for (const raw of text.split(/\n/)) {
    const line = raw
      .replace(/^[\s\d.)\]•·\-–—|~*]+/, '')
      .replace(/[\s|~*.,;:]+$/, '')
      .trim();
    if (!line || line.length > 40 || /[가-힣\d]/.test(line) || line.split(/\s+/).length > 3) continue;
    if (expected ? !expected.includes(scriptOf(line)) : scriptOf(line) === 'other') continue;
    if (/^[a-z]$/i.test(line)) continue; // stray OCR letters
    out.push({ term: line, meaning: '' });
  }
  return out;
}

/** Word–meaning pairs from any text, plus meaning-less words when the text is a bare word list. */
function findWords(text: string, lang: string, existing: VocabularyItem[], label: string): ExtractedWord[] {
  const words = parsedToWords(parseTextContent(text, label, existing));
  const seen = new Set(words.map(w => w.term.toLowerCase()));
  const lines = text.split(/\n/).filter(l => l.trim().length > 1).length;
  if (words.length < lines * 0.5) {
    for (const w of bareTerms(text, lang)) {
      if (!seen.has(w.term.toLowerCase())) {
        seen.add(w.term.toLowerCase());
        words.push(w);
      }
    }
  }
  return words;
}

const BatchImport: React.FC<{
  mode: Exclude<Tab, 'single'>;
  initialText: string;
  lang: string;
  existingInCollection: VocabularyItem[];
  existingTerms: Set<string>;
  onSave: (rows: DraftRow[]) => number;
}> = ({ mode, initialText, lang, existingInCollection, existingTerms, onSave }) => {
  const [text, setText] = useState(initialText);
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [enrich, setEnrich] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const showRows = (list: DraftRow[], label: string) => {
    setSource(label);
    setRows(list);
    if (list.length === 0) setError('단어를 찾지 못했습니다. 단어와 뜻이 잘 보이는지 확인해 주세요.');
  };

  /**
   * Reads one file on this device: photos with OCR, PDFs with PDF.js (scanned
   * pages with OCR), documents/tables/text directly. No AI service is used.
   */
  const readOne = async (file: File, report: (msg: string) => void): Promise<BatchSourceResult | { error: string }> => {
    const kind = classifyFile(file);
    if (kind === 'unsupported') {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const tip =
        ext === 'hwp' ? '한글에서 "다른 이름으로 저장 → PDF 또는 HWPX"로 저장해서 넣어 주세요.' : 'PDF로 저장하거나 사진으로 찍어서 넣어 주세요.';
      return { error: `${file.name}: 이 파일은 바로 읽을 수 없어요. ${tip}` };
    }
    try {
      if (kind === 'sheet') {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const words = parsedToWords(parseSpreadsheetData(workbook, file.name, existingInCollection));
        if (words.length > 0) return { words };
        return { words: findWords(await extractPlainText(file), lang, existingInCollection, file.name) };
      }
      let text = '';
      if (kind === 'image') {
        report('사진을 준비하는 중…');
        const image = await prepareImageForOcr(file);
        report('사진에서 글자를 읽는 중… (처음 한 번은 글자 인식 자료를 받느라 조금 걸려요)');
        text = await recognizeText(image, lang, p => report(`사진에서 글자를 읽는 중… ${Math.round(p * 100)}%`));
      } else if (kind === 'pdf') {
        text = await extractPdfText(file, lang, p =>
          report(p.ocr ? `PDF ${p.page}/${p.pages}쪽: 스캔된 쪽이라 글자를 인식하는 중…` : `PDF ${p.page}/${p.pages}쪽 읽는 중…`)
        );
      } else {
        text = await extractPlainText(file);
      }
      if (!text.trim()) {
        return {
          error:
            kind === 'image'
              ? `${file.name}: 글자를 찾지 못했어요. 밝은 곳에서 글자가 크고 반듯하게 보이도록 다시 찍어 주세요.`
              : `${file.name}: 파일에서 글자를 찾지 못했어요.`,
        };
      }
      return { words: findWords(text, lang, existingInCollection, file.name) };
    } catch (e) {
      if (e instanceof ImagePrepError) {
        return {
          error:
            e.code === 'HEIC_UNSUPPORTED'
              ? `${file.name}: 이 브라우저는 아이폰 HEIC 사진을 열 수 없어요. 아이폰 설정 → 카메라 → 포맷 → "높은 호환성"으로 바꾸거나 스크린샷으로 넣어 주세요.`
              : `${file.name}: 사진을 열지 못했어요. 다른 사진으로 시도해 주세요.`,
        };
      }
      console.error('File read failed:', e);
      return { error: `${file.name}: 파일을 읽지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.` };
    }
  };

  const handleFiles = async (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list || []).slice(0, 20);
    if (files.length === 0) return;
    setError(null);
    setDone(null);
    const results: (BatchSourceResult | { error: string })[] = [];
    let finished = 0;
    const label = (n: number) => `${files.length}개 중 ${n}개 읽음…`;
    setBusy(files.length === 1 ? '파일을 읽는 중…' : label(0));
    // One at a time: photo recognition is heavy and runs on this device.
    await mapWithConcurrency(
      files,
      1,
      async (f, i) => {
        results[i] = await readOne(f, msg => setBusy(files.length === 1 ? msg : `${label(finished)} ${msg}`));
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
    if (errors.length) setError(errors.join('\n'));
    if (ok.length) showRows(toDraftRows(merged, existingTerms, 'f', lang), files.length === 1 ? files[0].name : `파일 ${files.length}개`);
  };

  const save = async () => {
    if (!rows) return;
    const chosen = rows.filter(r => r.include && r.term.trim());
    if (chosen.length === 0) return;
    setError(null);

    // Words without a meaning (bare word lists) always get one from the dictionary;
    // the others only when "사전에서 발음·예문 채우기" is on.
    let failed = 0;
    let noMeaning = 0;
    const targets = chosen.filter(r => !r.meaning.trim() || (enrich && (!r.pronunciation || !r.exampleEn))).slice(0, MAX_LOOKUPS);
    if (targets.length > 0) {
      setBusy(`사전에서 찾는 중… 0/${targets.length}`);
      await mapWithConcurrency(
        targets,
        4,
        async r => {
          const res = await lookupWord(r.term, lang);
          if (!res.ok) {
            failed++;
            return;
          }
          const d = res.data;
          if (!r.meaning.trim()) r.meaning = d.meanings[0] || '';
          r.partOfSpeech = r.partOfSpeech || d.partOfSpeech || undefined;
          r.pronunciation = r.pronunciation || d.pronunciation || undefined; // never overwrite the file's own
          r.alternativeMeanings = d.meanings.filter(m => m !== r.meaning).slice(0, 3);
          if (!r.exampleEn && d.example?.text) {
            r.exampleEn = d.example.text;
            r.exampleKo = d.example.ko;
          }
        },
        n => setBusy(`사전에서 찾는 중… ${n}/${targets.length}`)
      );
    }
    const ready = chosen.filter(r => {
      if (r.meaning.trim()) return true;
      noMeaning++;
      return false;
    });
    if (ready.length === 0) {
      setBusy(null);
      setError('뜻을 찾지 못해 저장하지 않았습니다. 뜻을 직접 입력해 주세요.');
      return;
    }

    const saved = onSave(ready);
    setBusy(null);
    setRows(noMeaning > 0 ? rows.filter(r => r.include && !r.meaning.trim()) : null);
    if (noMeaning === 0) setText('');
    setDone(
      `${saved}개 단어를 저장했습니다.` +
        (noMeaning > 0 ? ` 뜻을 찾지 못한 ${noMeaning}개는 아래에 남겨 두었어요. 뜻을 직접 적어 저장해 주세요.` : '') +
        (failed > noMeaning ? ' 일부 단어는 사전에서 발음·예문을 찾지 못해 뜻만 저장했습니다.' : '')
    );
  };

  const includedCount = rows?.filter(r => r.include).length ?? 0;
  const resetInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow choosing the same file again after an error
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
              {initialText && text === initialText && (
                <Notice>체험용 예시 단어가 들어 있어요. "단어 찾기"를 누르고, 확인한 뒤 저장해 보세요.</Notice>
              )}
              <textarea
                className={`${inputClass} h-48 py-3 leading-relaxed`}
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
                  showRows(toDraftRows(findWords(text, lang, existingInCollection, '붙여넣기'), existingTerms, 'p', lang), '붙여넣기');
                }}
              >
                단어 찾기
              </Button>
              <p className="text-[13px] text-muted">한 줄에 단어와 뜻을 함께 적어 주세요. 단어만 적으면 뜻은 저장할 때 사전에서 찾아요.</p>
            </>
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
              사전에서 발음·예문 채우기 <span className="text-muted">(최대 {MAX_LOOKUPS}개, 이미 있는 내용은 그대로 둡니다)</span>
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

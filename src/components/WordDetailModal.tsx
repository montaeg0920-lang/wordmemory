import React, { useState } from 'react';
import { BookOpen, Loader2, Trash2, Volume2 } from 'lucide-react';
import { MemoryState, VocabularyFolder, VocabularyItem } from '../types/database';
import { DESIRED_RETENTION, MS_PER_DAY, formatDueAt, getMemoryView, predictRecall } from '../lib/memoryEngine';
import { speakEnglishWord } from '../lib/sound';
import { lookupWord } from '../lib/wordLookup';
import { Button, Field, Notice, Select, Sheet, StatusTag, TermText, inputClass } from './ui';

interface WordDetailModalProps {
  item: VocabularyItem;
  memoryState?: MemoryState;
  folders: VocabularyFolder[];
  onClose: () => void;
  onUpdate: (updated: VocabularyItem) => void;
  onDelete: (id: string) => void;
}

export const WordDetailModal: React.FC<WordDetailModalProps> = ({ item, memoryState, folders, onClose, onUpdate, onDelete }) => {
  const view = getMemoryView(memoryState);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    userMeaning: item.userMeaning,
    alternative: (item.alternativeMeanings || []).join(', '),
    partOfSpeech: item.partOfSpeech || '',
    pronunciation: item.pronunciation || '',
    exampleEn: item.exampleSentences?.[0]?.en || '',
    exampleKo: item.exampleSentences?.[0]?.ko || '',
  });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const collectionFolders = folders.filter(f => f.collectionId === item.collectionId);
  const example = item.exampleSentences?.[0];

  const save = () => {
    onUpdate({
      ...item,
      userMeaning: draft.userMeaning.trim() || item.userMeaning,
      alternativeMeanings: draft.alternative
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      partOfSpeech: draft.partOfSpeech.trim() || undefined,
      pronunciation: draft.pronunciation.trim() || undefined,
      exampleSentences: draft.exampleEn.trim()
        ? [
            {
              id: item.exampleSentences?.[0]?.id || `ex_${Date.now()}`,
              source: 'user',
              en: draft.exampleEn.trim(),
              ko: draft.exampleKo.trim(),
              clozeBlank: item.term,
            },
          ]
        : [],
    });
    setEditing(false);
  };

  const enrich = async () => {
    setAiBusy(true);
    setAiError(null);
    const res = await lookupWord(item.term, item.sourceLanguage);
    setAiBusy(false);
    if (!res.ok) {
      setAiError(res.error);
      return;
    }
    const d = res.data;
    onUpdate({
      ...item,
      partOfSpeech: item.partOfSpeech || d.partOfSpeech || undefined,
      pronunciation: item.pronunciation || d.pronunciation || undefined,
      alternativeMeanings: item.alternativeMeanings?.length
        ? item.alternativeMeanings
        : d.meanings.filter(m => m !== item.userMeaning).slice(0, 3),
      exampleSentences:
        item.exampleSentences?.length || !d.example
          ? item.exampleSentences
          : [{ id: `ex_dict_${Date.now()}`, source: 'ai', en: d.example.text, ko: d.example.ko, clozeBlank: item.term }],
    });
  };

  const missing = !item.pronunciation || !example || !item.partOfSpeech;

  return (
    <Sheet
      title="단어 정보"
      onClose={onClose}
      footer={
        editing ? (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setEditing(false)}>취소</Button>
            <Button variant="primary" onClick={save}>
              저장
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="danger"
              aria-label="삭제"
              onClick={() => {
                if (confirm(`'${item.term}' 단어를 삭제할까요? 학습 기록도 함께 지워집니다.`)) {
                  onDelete(item.id);
                  onClose();
                }
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button block onClick={() => setEditing(true)}>
              수정하기
            </Button>
          </div>
        )
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[30px] leading-tight font-medium">
            <TermText term={item.term} lang={item.sourceLanguage} />
          </p>
          {(item.pronunciation || item.partOfSpeech) && (
            <p className="text-[15px] text-muted mt-1">{[item.pronunciation, item.partOfSpeech].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <button
          onClick={() => speakEnglishWord(item.term, 0.95, item.sourceLanguage)}
          className="p-2 rounded-full text-muted hover:bg-sunken"
          aria-label="발음 듣기"
        >
          <Volume2 className="w-5 h-5" />
        </button>
      </div>

      {!editing ? (
        <>
          <p className="text-xl font-bold mt-4">{item.userMeaning}</p>
          {item.alternativeMeanings && item.alternativeMeanings.length > 0 && (
            <p className="text-[15px] text-ink-2 mt-1">{item.alternativeMeanings.join(', ')}</p>
          )}
          {example && (
            <div className="mt-4 p-4 rounded-xl bg-surface border border-line">
              <p className="font-serif text-[17px] leading-relaxed" dir="auto">{example.en}</p>
              {example.ko && <p className="text-[14px] text-ink-2 mt-1.5">{example.ko}</p>}
            </div>
          )}
          {item.collocations && item.collocations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.collocations.map(c => (
                <span key={c} className="px-2.5 py-1 rounded-lg bg-sunken text-sm text-ink-2 font-serif">
                  {c}
                </span>
              ))}
            </div>
          )}

          {missing && (
            <button
              onClick={enrich}
              disabled={aiBusy}
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent font-medium disabled:opacity-50"
            >
              {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              사전에서 발음·예문 채우기
            </button>
          )}
          {aiError && (
            <div className="mt-2">
              <Notice tone="bad">{aiError}</Notice>
            </div>
          )}

          {/* Memory */}
          <div className="mt-6 pt-5 border-t border-line">
            <div className="flex items-center justify-between">
              <StatusTag status={view.status} />
              <span className="text-[13px] text-muted">다음 복습: {formatDueAt(view.nextDueAt)}</span>
            </div>
            {view.retention !== null ? (
              <>
                <p className="text-[15px] mt-3">
                  지금 기억하고 있을 확률 <strong className="font-semibold tabular-nums">{Math.round(view.retention * 100)}%</strong>
                </p>
                <RetentionCurve stability={view.stability} lastReviewAt={view.lastReviewAt!} nextDueAt={view.nextDueAt} />
                <p className="text-[12px] text-muted mt-1">
                  {view.reviewCount}번 복습 · 기억 안정도 {formatDays(view.stability)} (기억할 확률이 90%로 떨어지기까지 걸리는 기간) 기준 추정치
                </p>
              </>
            ) : (
              <p className="text-[15px] text-ink-2 mt-3">아직 학습하지 않은 단어입니다. 오늘의 복습에서 새 단어로 나옵니다.</p>
            )}
          </div>

          {collectionFolders.length > 0 && (
            <div className="mt-5">
              <Field label="폴더">
                <Select value={item.folderId || ''} onChange={e => onUpdate({ ...item, folderId: e.target.value || undefined })}>
                  <option value="">폴더 없음</option>
                  {collectionFolders.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3 mt-4">
          <Field label="뜻">
            <input className={inputClass} value={draft.userMeaning} onChange={e => setDraft({ ...draft, userMeaning: e.target.value })} />
          </Field>
          <Field label="다른 뜻" hint="쉼표로 구분">
            <input className={inputClass} value={draft.alternative} onChange={e => setDraft({ ...draft, alternative: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="품사">
              <input className={inputClass} value={draft.partOfSpeech} onChange={e => setDraft({ ...draft, partOfSpeech: e.target.value })} />
            </Field>
            <Field label="발음">
              <input className={inputClass} value={draft.pronunciation} onChange={e => setDraft({ ...draft, pronunciation: e.target.value })} />
            </Field>
          </div>
          <Field label="예문">
            <textarea
              className={`${inputClass} h-20 py-2.5 font-serif`}
              value={draft.exampleEn}
              onChange={e => setDraft({ ...draft, exampleEn: e.target.value })}
            />
          </Field>
          <Field label="예문 해석">
            <input className={inputClass} value={draft.exampleKo} onChange={e => setDraft({ ...draft, exampleKo: e.target.value })} />
          </Field>
        </div>
      )}
    </Sheet>
  );
};

function formatDays(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}시간`;
  if (days < 60) return `${Math.round(days)}일`;
  return `${Math.round(days / 30)}개월`;
}

/** Predicted recall from the last review up to (and a bit past) the next review. */
const RetentionCurve: React.FC<{ stability: number; lastReviewAt: number; nextDueAt: number | null }> = ({
  stability,
  lastReviewAt,
  nextDueAt,
}) => {
  const now = Date.now();
  const W = 320;
  const H = 96;
  const pad = 6;
  const spanMs = Math.max((nextDueAt || now) - lastReviewAt, now - lastReviewAt, MS_PER_DAY) * 1.4;
  const x = (t: number) => pad + ((t - lastReviewAt) / spanMs) * (W - pad * 2);
  const y = (p: number) => pad + (1 - p) * (H - pad * 2);
  const points: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = lastReviewAt + (spanMs * i) / 40;
    points.push(`${x(t).toFixed(1)},${y(predictRecall((t - lastReviewAt) / MS_PER_DAY, stability)).toFixed(1)}`);
  }
  const nowP = predictRecall((now - lastReviewAt) / MS_PER_DAY, stability);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 mt-3" role="img" aria-label="이 단어의 예상 망각곡선">
      <line x1={pad} x2={W - pad} y1={y(DESIRED_RETENTION)} y2={y(DESIRED_RETENTION)} stroke="var(--line-strong)" strokeDasharray="3 4" />
      <polyline points={points.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {nextDueAt && nextDueAt > lastReviewAt && (
        <line x1={x(nextDueAt)} x2={x(nextDueAt)} y1={pad} y2={H - pad} stroke="var(--line-strong)" />
      )}
      <circle cx={x(now)} cy={y(nowP)} r="4.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FolderPlus, MoreHorizontal, Plus, Search, Wand2, X } from 'lucide-react';
import {
  MemoryState,
  MemoryStatus,
  UserSettings,
  VocabularyCollection,
  VocabularyFolder,
  VocabularyItem,
} from '../types/database';
import { STATUS_LABEL, formatDueAt, getMemoryView } from '../lib/memoryEngine';
import { cleanAndRepairVocabulary } from '../lib/storage';
import { WordDetailModal } from './WordDetailModal';
import { Button, Chip, Field, Notice, ScreenHeader, Select, Sheet, StatusDot, TermText, inputClass } from './ui';

interface VocabLibraryProps {
  items: VocabularyItem[];
  collections: VocabularyCollection[];
  folders: VocabularyFolder[];
  memoryStateMap: Map<string, MemoryState>;
  settings: UserSettings;
  initialCollectionId: string;
  onUpdateItem: (item: VocabularyItem) => void;
  onDeleteItems: (ids: string[]) => void;
  onMoveItems: (ids: string[], folderId?: string) => void;
  onSaveCollection: (col: VocabularyCollection) => void;
  onDeleteCollection: (id: string) => void;
  onSaveFolder: (folder: VocabularyFolder) => void;
  onDeleteFolder: (id: string) => void;
  onAddWords: () => void;
  onReloadData: () => void;
}

type StatusFilter = 'all' | MemoryStatus | 'due';
const PAGE = 80;

export const VocabLibrary: React.FC<VocabLibraryProps> = ({
  items,
  collections,
  folders,
  memoryStateMap,
  settings,
  initialCollectionId,
  onUpdateItem,
  onDeleteItems,
  onMoveItems,
  onSaveCollection,
  onDeleteCollection,
  onSaveFolder,
  onDeleteFolder,
  onAddWords,
  onReloadData,
}) => {
  const [collectionId, setCollectionId] = useState(initialCollectionId || 'all');
  const [folderId, setFolderId] = useState('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<null | 'newCollection' | 'newFolder' | 'manageCollection' | 'manageFolder' | 'move' | 'menu'>(null);
  const [nameInput, setNameInput] = useState('');
  const [moveTarget, setMoveTarget] = useState('none');
  const [message, setMessage] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setCollectionId(initialCollectionId || 'all'), [initialCollectionId]);
  useEffect(() => setLimit(PAGE), [collectionId, folderId, query, status]);

  const activeCollection = collections.find(c => c.id === collectionId);
  const visibleFolders = collectionId === 'all' ? [] : folders.filter(f => f.collectionId === collectionId);
  const activeFolder = folders.find(f => f.id === folderId);

  const rows = useMemo(() => {
    const now = Date.now();
    const q = query.trim().toLowerCase();
    return items
      .filter(i => collectionId === 'all' || i.collectionId === collectionId)
      .filter(i => folderId === 'all' || i.folderId === folderId)
      .filter(i => !q || i.term.toLowerCase().includes(q) || i.userMeaning.toLowerCase().includes(q))
      .map(item => ({ item, view: getMemoryView(memoryStateMap.get(item.id), now) }))
      .filter(r => (status === 'all' ? true : status === 'due' ? r.view.isDue : r.view.status === status))
      .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0));
  }, [items, collectionId, folderId, query, status, memoryStateMap]);

  const inspecting = inspectId ? items.find(i => i.id === inspectId) : undefined;

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const startLongPress = (id: string) => {
    longPress.current = setTimeout(() => {
      setSelecting(true);
      setSelected(new Set([id]));
      longPress.current = null;
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = null;
  };

  const openName = (kind: 'newCollection' | 'newFolder' | 'manageCollection' | 'manageFolder', initial = '') => {
    setNameInput(initial);
    setSheet(kind);
  };

  const submitName = () => {
    const name = nameInput.trim();
    if (!name) return;
    const now = Date.now();
    if (sheet === 'newCollection') {
      const col: VocabularyCollection = {
        id: `col_${now}`,
        name,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: 'ko',
        createdAt: now,
        updatedAt: now,
        color: '#2B4C7E',
      };
      onSaveCollection(col);
      setCollectionId(col.id);
      setFolderId('all');
    } else if (sheet === 'newFolder' && activeCollection) {
      const f: VocabularyFolder = { id: `folder_${now}`, collectionId: activeCollection.id, name, createdAt: now, updatedAt: now };
      onSaveFolder(f);
      setFolderId(f.id);
    } else if (sheet === 'manageCollection' && activeCollection) {
      onSaveCollection({ ...activeCollection, name });
    } else if (sheet === 'manageFolder' && activeFolder) {
      onSaveFolder({ ...activeFolder, name });
    }
    setSheet(null);
  };

  return (
    <div className="vc-enter">
      <ScreenHeader
        title="단어장"
        subtitle={`${items.length}개 단어`}
        right={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setSheet('menu')} aria-label="더보기">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
            <Button size="sm" variant="primary" onClick={onAddWords}>
              <Plus className="w-4 h-4" /> 추가
            </Button>
          </div>
        }
      />

      {message && (
        <div className="mb-3">
          <Notice tone="good" onClose={() => setMessage(null)}>
            {message}
          </Notice>
        </div>
      )}

      {/* Collections */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        <Chip active={collectionId === 'all'} onClick={() => { setCollectionId('all'); setFolderId('all'); }}>
          전체 {items.length}
        </Chip>
        {collections.map(c => (
          <Chip
            key={c.id}
            active={collectionId === c.id}
            onClick={() => {
              if (collectionId === c.id) openName('manageCollection', c.name);
              else {
                setCollectionId(c.id);
                setFolderId('all');
              }
            }}
            title={collectionId === c.id ? '한 번 더 누르면 이름 변경·삭제' : undefined}
          >
            {c.name} {items.filter(i => i.collectionId === c.id).length}
          </Chip>
        ))}
        <Chip onClick={() => openName('newCollection')}>
          <span className="inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> 새 단어장
          </span>
        </Chip>
      </div>

      {/* Folders (inside a collection) */}
      {collectionId !== 'all' && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pt-2">
          <FolderTab active={folderId === 'all'} onClick={() => setFolderId('all')}>
            모든 폴더
          </FolderTab>
          {visibleFolders.map(f => (
            <FolderTab
              key={f.id}
              active={folderId === f.id}
              onClick={() => (folderId === f.id ? openName('manageFolder', f.name) : setFolderId(f.id))}
            >
              {f.name} <span className="text-muted">{items.filter(i => i.folderId === f.id).length}</span>
            </FolderTab>
          ))}
          <FolderTab onClick={() => openName('newFolder')}>
            <span className="inline-flex items-center gap-1 text-accent">
              <FolderPlus className="w-4 h-4" /> 새 폴더
            </span>
          </FolderTab>
        </div>
      )}

      {/* Search + filter */}
      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            className={`${inputClass} pl-9`}
            placeholder="단어 또는 뜻 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
            type="search"
          />
        </div>
        <Select aria-label="상태" value={status} onChange={e => setStatus(e.target.value as StatusFilter)} className="w-32">
          <option value="all">모든 상태</option>
          <option value="due">복습할 때</option>
          <option value="new">{STATUS_LABEL.new}</option>
          <option value="learning">{STATUS_LABEL.learning}</option>
          <option value="retaining">{STATUS_LABEL.retaining}</option>
          <option value="mastered">{STATUS_LABEL.mastered}</option>
        </Select>
      </div>

      {/* Selection bar */}
      <div className="flex items-center justify-between mt-4 mb-2 px-1 h-8">
        <p className="text-[13px] text-muted">{selecting ? `${selected.size}개 선택됨` : `${rows.length}개`}</p>
        {selecting ? (
          <div className="flex items-center gap-3 text-[13px]">
            <button className="text-accent font-medium" onClick={() => setSelected(new Set(rows.map(r => r.item.id)))}>
              전체 선택
            </button>
            <button className="text-muted" onClick={exitSelect}>
              취소
            </button>
          </div>
        ) : (
          rows.length > 0 && (
            <button className="text-[13px] text-accent font-medium" onClick={() => setSelecting(true)}>
              선택
            </button>
          )
        )}
      </div>

      {/* Word list */}
      {rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[15px] text-ink-2">{items.length === 0 ? '아직 단어가 없습니다.' : '조건에 맞는 단어가 없습니다.'}</p>
          {items.length === 0 && (
            <Button variant="primary" className="mt-4" onClick={onAddWords}>
              <Plus className="w-4 h-4" /> 단어 추가하기
            </Button>
          )}
        </div>
      ) : (
        <ul className="bg-surface border border-line rounded-2xl divide-y divide-line overflow-hidden">
          {rows.slice(0, limit).map(({ item, view }) => {
            const isSel = selected.has(item.id);
            return (
              <li key={item.id}>
                <button
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left ${isSel ? 'bg-accent-soft' : 'hover:bg-sunken'}`}
                  onClick={() => (selecting ? toggleSelect(item.id) : setInspectId(item.id))}
                  onTouchStart={() => !selecting && startLongPress(item.id)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                  onContextMenu={e => {
                    e.preventDefault();
                    setSelecting(true);
                    toggleSelect(item.id);
                  }}
                >
                  {selecting && (
                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        isSel ? 'bg-accent border-accent text-on-accent' : 'border-line-strong'
                      }`}
                    >
                      {isSel && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[17px] leading-snug truncate">
                      <TermText term={item.term} lang={item.sourceLanguage} />
                    </p>
                    <p className="text-[14px] text-ink-2 truncate">{item.userMeaning}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
                      <StatusDot status={view.status} />
                      {view.status === 'new' ? STATUS_LABEL.new : formatDueAt(view.nextDueAt)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > limit && (
        <Button block className="mt-3" onClick={() => setLimit(l => l + PAGE)}>
          더 보기 ({rows.length - limit}개 남음)
        </Button>
      )}

      {/* Bottom action bar while selecting */}
      {selecting && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4">
          <div className="max-w-md mx-auto flex gap-2 p-2 rounded-2xl bg-surface border border-line-strong shadow-lg">
            <Button block onClick={() => setSheet('move')}>
              폴더 이동
            </Button>
            <Button
              block
              variant="danger"
              onClick={() => {
                if (confirm(`선택한 ${selected.size}개 단어를 삭제할까요? 학습 기록도 함께 지워집니다.`)) {
                  onDeleteItems(Array.from(selected));
                  exitSelect();
                }
              }}
            >
              삭제
            </Button>
          </div>
        </div>
      )}

      {/* ---------- Sheets ---------- */}
      {inspecting && (
        <WordDetailModal
          item={inspecting}
          memoryState={memoryStateMap.get(inspecting.id)}
          folders={folders}
          onClose={() => setInspectId(null)}
          onUpdate={onUpdateItem}
          onDelete={id => onDeleteItems([id])}
        />
      )}

      {(sheet === 'newCollection' || sheet === 'newFolder' || sheet === 'manageCollection' || sheet === 'manageFolder') && (
        <Sheet
          title={
            sheet === 'newCollection' ? '새 단어장' : sheet === 'newFolder' ? '새 폴더' : sheet === 'manageCollection' ? '단어장 관리' : '폴더 관리'
          }
          onClose={() => setSheet(null)}
          footer={
            <Button variant="primary" block onClick={submitName} disabled={!nameInput.trim()}>
              {sheet.startsWith('new') ? '만들기' : '이름 저장'}
            </Button>
          }
        >
          <Field label="이름">
            <input
              autoFocus
              className={inputClass}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitName()}
            />
          </Field>
          {sheet === 'manageCollection' && activeCollection && (
            <button
              className="mt-6 text-sm text-bad"
              onClick={() => {
                const n = items.filter(i => i.collectionId === activeCollection.id).length;
                if (confirm(`'${activeCollection.name}' 단어장과 안의 단어 ${n}개를 모두 삭제할까요? 되돌릴 수 없습니다.`)) {
                  onDeleteCollection(activeCollection.id);
                  setCollectionId('all');
                  setSheet(null);
                }
              }}
            >
              이 단어장 삭제
            </button>
          )}
          {sheet === 'manageFolder' && activeFolder && (
            <button
              className="mt-6 text-sm text-bad"
              onClick={() => {
                if (confirm(`'${activeFolder.name}' 폴더를 삭제할까요? 안의 단어는 지워지지 않습니다.`)) {
                  onDeleteFolder(activeFolder.id);
                  setFolderId('all');
                  setSheet(null);
                }
              }}
            >
              폴더 삭제 (단어는 유지)
            </button>
          )}
        </Sheet>
      )}

      {sheet === 'move' && (
        <Sheet
          title={`${selected.size}개 단어 이동`}
          onClose={() => setSheet(null)}
          footer={
            <Button
              variant="primary"
              block
              onClick={() => {
                onMoveItems(Array.from(selected), moveTarget === 'none' ? undefined : moveTarget);
                setSheet(null);
                exitSelect();
              }}
            >
              이동
            </Button>
          }
        >
          <Field label="옮길 폴더" hint="같은 단어장 안의 폴더만 지정할 수 있습니다.">
            <Select value={moveTarget} onChange={e => setMoveTarget(e.target.value)}>
              <option value="none">폴더 없음</option>
              {collections.map(c => (
                <optgroup key={c.id} label={c.name}>
                  {folders
                    .filter(f => f.collectionId === c.id)
                    .map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        </Sheet>
      )}

      {sheet === 'menu' && (
        <Sheet title="단어장 도구" onClose={() => setSheet(null)}>
          <button
            className="w-full flex items-start gap-3 py-3 text-left"
            onClick={() => {
              const { repairedCount, removedCount } = cleanAndRepairVocabulary();
              onReloadData();
              setSheet(null);
              setMessage(
                repairedCount + removedCount === 0
                  ? '정리할 단어가 없습니다.'
                  : `${repairedCount}개 단어 표기를 정리하고, 학습 기록 없는 중복 ${removedCount}개를 합쳤습니다.`
              );
            }}
          >
            <Wand2 className="w-5 h-5 text-muted mt-0.5" />
            <span>
              <span className="block text-[15px]">표기 자동 정리</span>
              <span className="block text-[13px] text-muted">번호·기호 제거, 뒤바뀐 단어/뜻, 단어 속 발음·품사 분리</span>
            </span>
          </button>
          <button className="w-full flex items-start gap-3 py-3 text-left" onClick={() => { setSheet(null); setSelecting(true); }}>
            <Check className="w-5 h-5 text-muted mt-0.5" />
            <span className="block text-[15px]">여러 단어 선택하기</span>
          </button>
          <button className="w-full flex items-start gap-3 py-3 text-left" onClick={() => setSheet(null)}>
            <X className="w-5 h-5 text-muted mt-0.5" />
            <span className="block text-[15px]">닫기</span>
          </button>
        </Sheet>
      )}
    </div>
  );
};

const FolderTab: React.FC<{ active?: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`shrink-0 h-8 px-3 rounded-lg text-[13px] whitespace-nowrap ${
      active ? 'bg-accent-soft text-ink font-semibold' : 'text-ink-2 hover:bg-sunken'
    }`}
  >
    {children}
  </button>
);

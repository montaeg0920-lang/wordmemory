import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Flame, Play, Plus } from 'lucide-react';
import {
  MemoryState,
  StudyDirection,
  UserProfile,
  UserSettings,
  VocabularyCollection,
  VocabularyFolder,
  VocabularyItem,
} from '../types/database';
import { SessionOptions, formatDueAt, getTodaySummary } from '../lib/memoryEngine';
import { StatsSummary } from '../lib/storage';
import { getLanguageMeta } from '../lib/languageHelper';
import { StarterDeck, getStarterDecksForLanguage } from '../data/starterDecks';
import { TabType } from './Navbar';
import { Button, Card, SectionLabel, Segmented, Select } from './ui';

interface HomeScreenProps {
  items: VocabularyItem[];
  memoryStateMap: Map<string, MemoryState>;
  collections: VocabularyCollection[];
  folders: VocabularyFolder[];
  settings: UserSettings;
  stats: StatsSummary;
  activeProfile: UserProfile;
  onOpenProfileModal: () => void;
  onStart: (options: SessionOptions) => void;
  onNavigateTab: (tab: TabType) => void;
  onOpenCollection: (collectionId: string) => void;
  onImportDeck: (deck: StarterDeck) => void;
}

const SECONDS_PER_CARD = 8;

export const HomeScreen: React.FC<HomeScreenProps> = ({
  items,
  memoryStateMap,
  collections,
  folders,
  settings,
  stats,
  activeProfile,
  onOpenProfileModal,
  onStart,
  onNavigateTab,
  onOpenCollection,
  onImportDeck,
}) => {
  const lang = getLanguageMeta(activeProfile.targetLanguage);
  const [showOptions, setShowOptions] = useState(false);
  const [collectionId, setCollectionId] = useState('all');
  const [folderId, setFolderId] = useState('all');
  const [direction, setDirection] = useState<StudyDirection>('en_to_ko');

  const scope = { collectionId, folderId };
  const summary = useMemo(
    () => getTodaySummary(items, memoryStateMap, settings, scope),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, memoryStateMap, settings, collectionId, folderId]
  );
  const todayCount = summary.dueNow + summary.newAllowanceLeft;
  const minutes = Math.max(1, Math.round((todayCount * SECONDS_PER_CARD) / 60));
  const scopedFolders = collectionId === 'all' ? folders : folders.filter(f => f.collectionId === collectionId);
  const isCustomScope = collectionId !== 'all' || folderId !== 'all' || direction !== 'en_to_ko';

  const today = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  const startOpts: SessionOptions = { collectionId, folderId, direction };

  return (
    <div className="vc-enter">
      <header className="flex items-start justify-between gap-3 pt-6 pb-5">
        <div className="min-w-0">
          <p className="text-sm text-muted">{today}</p>
          <h1 className="text-[26px] leading-tight font-bold tracking-tight mt-0.5 truncate">
            {activeProfile.name}님, 안녕하세요
          </h1>
        </div>
        <button
          onClick={onOpenProfileModal}
          className="shrink-0 mt-1 h-9 px-3 rounded-full border border-line bg-surface text-sm text-ink-2 hover:border-line-strong"
          title="학습자·언어 바꾸기"
        >
          {lang.name}
        </button>
      </header>

      {/* ---------- Today card ---------- */}
      {items.length === 0 ? (
        <EmptyStart
          decks={getStarterDecksForLanguage(activeProfile.targetLanguage)}
          onAdd={() => onNavigateTab('import')}
          onImportDeck={onImportDeck}
        />
      ) : (
        <Card className="p-5">
          {todayCount > 0 ? (
            <>
              <p className="text-sm font-medium text-muted">오늘 할 일</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-[44px] leading-none font-bold tracking-tight tabular-nums">{todayCount}</span>
                <span className="text-lg text-ink-2">단어</span>
                <span className="ml-auto text-sm text-muted">약 {minutes}분</span>
              </div>
              <p className="text-[15px] text-ink-2 mt-3">
                복습 {summary.dueNow}개 · 새 단어 {summary.newAllowanceLeft}개
              </p>
              <Button variant="primary" size="lg" block className="mt-5" onClick={() => onStart(startOpts)}>
                <Play className="w-5 h-5" fill="currentColor" strokeWidth={0} />
                시작하기
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-good">오늘 복습 완료</p>
              <p className="text-[22px] font-bold mt-1 leading-snug">잘하셨어요. 오늘은 여기까지면 충분합니다.</p>
              <p className="text-[15px] text-ink-2 mt-2">
                {summary.nextDueAt
                  ? `다음 복습은 ${formatDueAt(summary.nextDueAt)}에 돌아옵니다.`
                  : '복습할 단어가 생기면 여기에 표시됩니다.'}
              </p>
              <div className="grid grid-cols-2 gap-2 mt-5">
                <Button
                  onClick={() => onStart({ ...startOpts, extraNew: 5 })}
                  disabled={summary.newAvailable === 0}
                  title={summary.newAvailable === 0 ? '남은 새 단어가 없습니다' : undefined}
                >
                  <Plus className="w-4 h-4" /> 새 단어 5개
                </Button>
                <Button onClick={() => onStart({ ...startOpts, practice: true })}>약한 단어 연습</Button>
              </div>
            </>
          )}

          {/* Options (scope & direction) — collapsed by default */}
          <div className="mt-4 pt-3 border-t border-line">
            <button
              onClick={() => setShowOptions(v => !v)}
              className="w-full flex items-center justify-between text-sm text-muted py-1"
              aria-expanded={showOptions}
            >
              <span>
                {isCustomScope ? '범위·방식 변경됨' : '전체 단어장 · 뜻 떠올리기'}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
            </button>
            {showOptions && (
              <div className="space-y-3 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    aria-label="단어장"
                    value={collectionId}
                    onChange={e => {
                      setCollectionId(e.target.value);
                      setFolderId('all');
                    }}
                  >
                    <option value="all">전체 단어장</option>
                    {collections.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Select aria-label="폴더" value={folderId} onChange={e => setFolderId(e.target.value)}>
                    <option value="all">전체 폴더</option>
                    {scopedFolders.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Segmented<StudyDirection>
                  size="sm"
                  value={direction}
                  onChange={setDirection}
                  options={[
                    { value: 'en_to_ko', label: '뜻 떠올리기' },
                    { value: 'ko_to_en', label: '단어 떠올리기' },
                    { value: 'context_cloze', label: '문장 빈칸' },
                  ]}
                />
                <p className="text-[13px] text-muted leading-relaxed">
                  {direction === 'en_to_ko' && `${lang.name} 단어를 보고 한국어 뜻을 떠올립니다.`}
                  {direction === 'ko_to_en' && `한국어 뜻을 보고 ${lang.name} 단어를 떠올립니다. 더 어렵지만 오래 남습니다.`}
                  {direction === 'context_cloze' && '예문의 빈칸에 들어갈 단어를 떠올립니다. 예문이 있는 단어만 나옵니다.'}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ---------- Small progress strip ---------- */}
      {items.length > 0 && (
        <button
          onClick={() => onNavigateTab('stats')}
          className="w-full mt-3 grid grid-cols-3 rounded-2xl border border-line bg-surface divide-x divide-line text-left"
        >
          <MiniStat
            label="연속 학습"
            value={
              <span className="inline-flex items-center gap-1">
                {stats.streakDays > 0 && <Flame className="w-4 h-4 text-warn" />}
                {stats.streakDays}일
              </span>
            }
          />
          <MiniStat label="오늘 복습" value={`${stats.todayReviewsCount}회`} />
          <MiniStat label="장기 기억" value={`${stats.masteredWords}개`} />
        </button>
      )}

      {/* ---------- Notebooks ---------- */}
      {collections.length > 0 && items.length > 0 && (
        <section className="mt-8">
          <SectionLabel
            right={
              <button onClick={() => onNavigateTab('library')} className="text-[13px] text-accent font-medium">
                전체 보기
              </button>
            }
          >
            단어장
          </SectionLabel>
          <Card className="divide-y divide-line overflow-hidden">
            {collections.map(col => {
              const count = items.filter(i => i.collectionId === col.id).length;
              const due = getTodaySummary(items, memoryStateMap, settings, { collectionId: col.id }).dueNow;
              return (
                <button
                  key={col.id}
                  onClick={() => onOpenCollection(col.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-sunken"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium truncate">{col.name}</p>
                    <p className="text-[13px] text-muted mt-0.5">
                      {count}단어{due > 0 ? ` · 복습 ${due}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted" />
                </button>
              );
            })}
          </Card>
        </section>
      )}
    </div>
  );
};

const MiniStat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="px-4 py-3">
    <p className="text-[12px] text-muted">{label}</p>
    <p className="text-[17px] font-semibold mt-0.5 tabular-nums">{value}</p>
  </div>
);

const EmptyStart: React.FC<{
  decks: StarterDeck[];
  onAdd: () => void;
  onImportDeck: (deck: StarterDeck) => void;
}> = ({ decks, onAdd, onImportDeck }) => (
  <Card className="p-5">
    <p className="text-sm font-medium text-muted">시작하기</p>
    <p className="text-[22px] font-bold mt-1 leading-snug">외울 단어를 먼저 넣어 주세요</p>
    <p className="text-[15px] text-ink-2 mt-2 leading-relaxed">
      단어를 넣으면 잊어버리기 직전에 다시 보여 드립니다. 하루 몇 분이면 충분합니다.
    </p>
    <Button variant="primary" size="lg" block className="mt-5" onClick={onAdd}>
      <Plus className="w-5 h-5" /> 내 단어 추가하기
    </Button>
    {decks.length > 0 && (
      <div className="mt-5">
        <p className="text-[13px] text-muted mb-2">또는 기본 단어장으로 시작</p>
        <div className="space-y-2">
          {decks.map(deck => (
            <button
              key={deck.id}
              onClick={() => onImportDeck(deck)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-line hover:border-line-strong text-left"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-medium">{deck.title}</span>
                <span className="block text-[13px] text-muted">
                  {deck.description} · {deck.items.length}단어
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-muted shrink-0" />
            </button>
          ))}
        </div>
      </div>
    )}
  </Card>
);

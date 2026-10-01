import React from 'react';
import { Check } from 'lucide-react';
import { MemoryState, UserSettings, VocabularyItem } from '../types/database';
import { SessionOptions, formatDueAt, getMemoryView, getTodaySummary } from '../lib/memoryEngine';
import { SessionResult } from './ReviewScreen';
import { Button, Card, TermText } from './ui';

interface SessionCompleteScreenProps {
  result: SessionResult;
  items: VocabularyItem[];
  memoryStateMap: Map<string, MemoryState>;
  settings: UserSettings;
  scope: SessionOptions;
  onHome: () => void;
  onStart: (options: SessionOptions) => void;
}

export const SessionCompleteScreen: React.FC<SessionCompleteScreenProps> = ({
  result,
  items,
  memoryStateMap,
  settings,
  scope,
  onHome,
  onStart,
}) => {
  const summary = getTodaySummary(items, memoryStateMap, settings, scope);
  const remaining = summary.dueNow + summary.newAllowanceLeft;
  const struggled = result.struggledIds
    .map(id => items.find(i => i.id === id))
    .filter(Boolean) as VocabularyItem[];

  return (
    <div className="min-h-[100dvh] bg-paper text-ink">
      <div className="max-w-md mx-auto px-4 safe-top pb-10">
        <div className="pt-10 pb-6 text-center vc-enter">
          <div className="mx-auto w-14 h-14 rounded-full bg-good-soft text-good flex items-center justify-center">
            <Check className="w-7 h-7" strokeWidth={2.4} />
          </div>
          <h1 className="text-[26px] font-bold mt-4">{result.practice ? '연습 끝' : remaining > 0 ? '한 묶음 끝' : '오늘 복습 완료'}</h1>
          <p className="text-[15px] text-ink-2 mt-1">
            {result.reviewed}개 단어를 {result.practice ? '연습했습니다' : '복습했습니다'}
          </p>
        </div>

        <Card className="grid grid-cols-3 divide-x divide-line text-center">
          <Tally label="알아요" value={result.know} tone="text-good" />
          <Tally label="애매해요" value={result.unsure} tone="text-warn" />
          <Tally label="모르겠어요" value={result.dontKnow} tone="text-bad" />
        </Card>

        {struggled.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[13px] font-semibold text-muted mb-2 px-1">다시 볼 단어</h2>
            <Card className="divide-y divide-line">
              {struggled.slice(0, 12).map(item => {
                const view = getMemoryView(memoryStateMap.get(item.id));
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[17px] truncate">
                        <TermText term={item.term} lang={item.sourceLanguage} />
                      </p>
                      <p className="text-[13px] text-muted truncate">{item.userMeaning}</p>
                    </div>
                    {!result.practice && <span className="text-[13px] text-muted shrink-0">{formatDueAt(view.nextDueAt)}</span>}
                  </div>
                );
              })}
            </Card>
            {!result.practice && (
              <p className="text-[13px] text-muted mt-2 px-1">헷갈린 단어는 곧 다시 나오도록 일정이 앞당겨졌습니다.</p>
            )}
          </section>
        )}

        <div className="mt-8 space-y-2">
          {remaining > 0 && !result.practice ? (
            <Button variant="primary" size="lg" block onClick={() => onStart({})}>
              이어서 {remaining}개 더 하기
            </Button>
          ) : (
            <Button variant="primary" size="lg" block onClick={onHome}>
              홈으로
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => onStart({ extraNew: 5 })} disabled={summary.newAvailable === 0}>
              새 단어 5개 더
            </Button>
            <Button onClick={() => onStart({ practice: true })}>약한 단어 연습</Button>
          </div>
          {remaining > 0 && !result.practice && (
            <Button variant="ghost" block onClick={onHome}>
              오늘은 여기까지
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const Tally: React.FC<{ label: string; value: number; tone: string }> = ({ label, value, tone }) => (
  <div className="py-4">
    <p className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    <p className="text-[13px] text-muted mt-0.5">{label}</p>
  </div>
);

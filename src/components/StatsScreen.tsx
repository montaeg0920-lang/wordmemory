import React from 'react';
import { DayCount, StatsSummary } from '../lib/storage';
import { STATUS_LABEL } from '../lib/memoryEngine';
import { Card, ScreenHeader, SectionLabel } from './ui';

interface StatsScreenProps {
  stats: StatsSummary;
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export const StatsScreen: React.FC<StatsScreenProps> = ({ stats }) => {
  const stages = [
    { key: 'new', label: STATUS_LABEL.new, value: stats.newWords, color: 'var(--line-strong)' },
    { key: 'learning', label: STATUS_LABEL.learning, value: stats.learningWords, color: 'var(--warn)' },
    { key: 'retaining', label: STATUS_LABEL.retaining, value: stats.retainingWords, color: 'var(--accent)' },
    { key: 'mastered', label: STATUS_LABEL.mastered, value: stats.masteredWords, color: 'var(--good)' },
  ];
  const total = Math.max(1, stats.totalWords);
  const hasHistory = stats.dailyReviews.some(d => d.count > 0);

  return (
    <div className="vc-enter">
      <ScreenHeader title="기록" subtitle="실제 복습 기록으로 계산합니다" />

      <div className="grid grid-cols-2 gap-2">
        <Tile label="연속 학습" value={`${stats.streakDays}일`} />
        <Tile label="오늘 복습" value={`${stats.todayReviewsCount}회`} />
        <Tile
          label="평균 기억률"
          value={stats.averageRetention === null ? '—' : `${stats.averageRetention}%`}
          note={stats.averageRetention === null ? '아직 학습한 단어 없음' : `학습한 ${stats.studiedWords}개 기준`}
        />
        <Tile
          label="7일 정답률"
          value={stats.accuracy7d === null ? '—' : `${stats.accuracy7d}%`}
          note={stats.accuracy7d === null ? '최근 복습 없음' : `'알아요' 비율 · ${stats.weeklyReviewsCount}회`}
        />
      </div>

      <section className="mt-8">
        <SectionLabel>단어 단계</SectionLabel>
        <Card className="p-4">
          <div className="flex h-3 rounded-full overflow-hidden bg-sunken" role="img" aria-label="단계별 단어 비율">
            {stages.map(s =>
              s.value > 0 ? <div key={s.key} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} /> : null
            )}
          </div>
          <ul className="grid grid-cols-2 gap-y-2.5 gap-x-4 mt-4">
            {stages.map(s => (
              <li key={s.key} className="flex items-center gap-2 text-[14px]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                <span className="text-ink-2">{s.label}</span>
                <span className="ml-auto font-semibold tabular-nums">{s.value}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted mt-4 leading-relaxed">
            기억이 유지되는 기간(기억할 확률이 90%로 떨어지기까지)이 익히는 중: 1주 미만 · 기억 중: 1~3주 · 장기 기억: 3주
            이상인 단어
          </p>
        </Card>
      </section>

      <section className="mt-8">
        <SectionLabel>최근 2주 복습</SectionLabel>
        <Card className="p-4">
          {hasHistory ? (
            <Bars data={stats.dailyReviews} highlightLast />
          ) : (
            <p className="text-[15px] text-ink-2 py-6 text-center">복습을 시작하면 여기에 기록이 쌓입니다.</p>
          )}
        </Card>
      </section>

      <section className="mt-8">
        <SectionLabel>앞으로 7일 복습 예정</SectionLabel>
        <Card className="p-4">
          <Bars data={stats.upcoming} labelFirst="오늘" color="var(--line-strong)" highlightFirst />
          <p className="text-[12px] text-muted mt-3">밀린 복습은 '오늘'에 포함됩니다.</p>
        </Card>
      </section>

      <p className="text-[12px] text-muted mt-6 px-1 leading-relaxed">
        기억률은 각 단어의 복습 기록으로 추정한 값입니다(FSRS 기억 모델). 단어마다 난이도와 기억 안정도를 따로 계산합니다. 정확한 시험 점수가 아니라 복습 시점을 정하는 기준입니다.
      </p>
    </div>
  );
};

const Tile: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <Card className="px-4 py-3.5">
    <p className="text-[13px] text-muted">{label}</p>
    <p className="text-[26px] font-bold leading-tight mt-1 tabular-nums">{value}</p>
    {note && <p className="text-[12px] text-muted mt-0.5">{note}</p>}
  </Card>
);

const Bars: React.FC<{
  data: DayCount[];
  color?: string;
  highlightLast?: boolean;
  highlightFirst?: boolean;
  labelFirst?: string;
}> = ({ data, color = 'var(--line-strong)', highlightLast, highlightFirst, labelFirst }) => {
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <div>
      <div className="flex items-end gap-1 h-28">
        {data.map((d, i) => {
          const hi = (highlightLast && i === data.length - 1) || (highlightFirst && i === 0);
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
              {d.count > 0 && <span className="text-[11px] text-muted tabular-nums leading-none">{d.count}</span>}
              <div
                className="w-full rounded-t-[4px]"
                style={{
                  height: `${d.count === 0 ? 2 : Math.max(6, (d.count / max) * 88)}px`,
                  background: hi ? 'var(--accent)' : d.count === 0 ? 'var(--sunken)' : color,
                }}
                title={`${new Date(d.date).toLocaleDateString('ko-KR')} · ${d.count}회`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1.5">
        {data.map((d, i) => {
          const date = new Date(d.date);
          const show = data.length <= 7 || i % 2 === 1 || i === data.length - 1;
          return (
            <span key={d.date} className="flex-1 text-center text-[11px] text-muted">
              {show ? (i === 0 && labelFirst ? labelFirst : data.length <= 7 ? WEEKDAY[date.getDay()] : `${date.getDate()}`) : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
};

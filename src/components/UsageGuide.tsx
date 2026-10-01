import React, { useState } from 'react';
import { BookOpenCheck, CalendarCheck, ChevronLeft, HardDrive, PlusCircle, TrendingDown } from 'lucide-react';
import { Button } from './ui';

interface UsageGuideProps {
  /** Shown only to brand-new learners: lets the last page jump straight into the trial. */
  canTry: boolean;
  onTry: () => void;
  onClose: () => void;
}

const STEPS: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }[] = [
  {
    icon: PlusCircle,
    title: '1. 외울 단어를 넣어요',
    body: '아래 "추가" 탭에서 한 단어씩 적거나, 단어 목록을 복사해 붙여넣거나, 엑셀·워드·PDF·사진 파일을 그대로 넣을 수 있어요. 저장하기 전에 한 번 더 확인할 수 있어요.',
  },
  {
    icon: CalendarCheck,
    title: '2. 매일 "오늘 할 일"만 하면 돼요',
    body: '홈 화면의 시작 버튼을 누르면 오늘 복습할 단어와 새 단어가 함께 나와요. 하루 몇 분이면 충분해요. 자기 전에 하면 자는 동안 기억이 정리돼서 더 오래 남아요. 새 단어 개수는 설정에서 바꿀 수 있어요.',
  },
  {
    icon: BookOpenCheck,
    title: '3. 먼저 떠올리고, 솔직하게 답해요',
    body: '카드를 뒤집기 전에 뜻을 머릿속으로 떠올려 보세요. 그다음 "모르겠어요 · 애매해요 · 알아요" 중 솔직하게 고르면, 그 답으로 다음 복습 날짜가 정해져요.',
  },
  {
    icon: TrendingDown,
    title: '4. 잊어버리기 직전에 다시 보여 줘요',
    body: '잘 아는 단어는 점점 길게, 헷갈리는 단어는 자주 나와요. 단어마다 망각곡선을 따로 계산하기 때문에, 오늘 꼭 필요한 단어만 보게 돼요.',
  },
  {
    icon: HardDrive,
    title: '5. 기록은 이 기기에 저장돼요',
    body: '단어와 학습 기록은 이 기기의 브라우저에만 저장돼요. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 설정 → "백업 파일 받기"로 저장해 두세요.',
  },
];

export const UsageGuide: React.FC<UsageGuideProps> = ({ canTry, onTry, onClose }) => {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const { icon: Icon, title, body } = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 bg-paper overflow-y-auto" role="dialog" aria-modal="true" aria-label="이용 가이드">
      <div className="max-w-md mx-auto px-5 safe-top pb-10 min-h-full flex flex-col">
        <div className="pt-6 flex items-center justify-between">
          <button
            onClick={() => setStep(s => s - 1)}
            className={`p-2 -ml-2 rounded-full text-muted hover:bg-sunken ${step === 0 ? 'invisible' : ''}`}
            aria-label="이전"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="text-sm font-semibold text-accent">이용 가이드</p>
          <button onClick={onClose} className="text-sm text-muted px-2 py-1 rounded-lg hover:bg-sunken">
            건너뛰기
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center py-10">
          <Icon className="w-10 h-10 text-accent" />
          <h1 className="text-[24px] font-bold leading-tight mt-5">{title}</h1>
          <p className="text-[16px] text-ink-2 mt-4 leading-relaxed">{body}</p>
        </div>

        <div className="flex justify-center gap-1.5 mb-6" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full ${i === step ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'}`} />
          ))}
        </div>

        {!last && (
          <Button variant="primary" size="lg" block onClick={() => setStep(s => s + 1)}>
            다음
          </Button>
        )}
        {last && canTry && (
          <div className="space-y-2">
            <Button variant="primary" size="lg" block onClick={onTry}>
              예시 단어로 체험해 보기
            </Button>
            <Button size="lg" block onClick={onClose}>
              내 단어로 바로 시작
            </Button>
          </div>
        )}
        {last && !canTry && (
          <Button variant="primary" size="lg" block onClick={onClose}>
            시작하기
          </Button>
        )}
      </div>
    </div>
  );
};

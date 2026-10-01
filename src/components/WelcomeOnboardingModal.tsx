import React, { useState } from 'react';
import { LanguageCode } from '../types/database';
import { Button, Field, inputClass } from './ui';
import { LanguagePicker } from './UserProfileModal';

interface WelcomeOnboardingModalProps {
  initialName: string;
  initialLanguage: LanguageCode;
  onComplete: (name: string, lang: LanguageCode) => void;
}

export const WelcomeOnboardingModal: React.FC<WelcomeOnboardingModalProps> = ({ initialName, initialLanguage, onComplete }) => {
  const [name, setName] = useState(initialName);
  const [lang, setLang] = useState<LanguageCode>(initialLanguage);

  return (
    <div className="fixed inset-0 z-50 bg-paper overflow-y-auto">
      <div className="max-w-md mx-auto px-5 safe-top pb-10">
        <div className="pt-12">
          <p className="text-sm font-semibold text-accent">VocaCurve</p>
          <h1 className="text-[28px] font-bold leading-tight mt-2">
            잊어버리기 직전에
            <br />
            다시 보여 주는 단어장
          </h1>
          <p className="text-[15px] text-ink-2 mt-3 leading-relaxed">
            단어마다 망각곡선을 따로 계산해서, 오늘 꼭 볼 단어만 골라 드립니다. 하루 몇 분이면 충분합니다.
          </p>
        </div>

        <div className="mt-10 space-y-6">
          <Field label="이름">
            <input className={inputClass} value={name} onChange={e => setName(e.target.value)} />
          </Field>
          <Field label="배우는 언어">
            <LanguagePicker value={lang} onChange={setLang} />
          </Field>
        </div>

        <Button variant="primary" size="lg" block className="mt-10" onClick={() => onComplete(name, lang)}>
          시작하기
        </Button>
        <p className="text-[12px] text-muted text-center mt-3">단어와 기록은 이 기기에만 저장됩니다.</p>
      </div>
    </div>
  );
};

import React, { useRef, useState } from 'react';
import { ChevronRight, Download, Upload } from 'lucide-react';
import { UserProfile, UserSettings } from '../types/database';
import { clearAllWords, exportUserDataAsJson, importUserDataFromJson } from '../lib/storage';
import { getLanguageMeta } from '../lib/languageHelper';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Button, Card, Notice, ScreenHeader, SectionLabel, Segmented, Toggle } from './ui';

interface SettingsScreenProps {
  settings: UserSettings;
  activeProfile: UserProfile;
  onOpenProfileModal: () => void;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onDataChanged: () => void;
}

const NEW_WORD_OPTIONS = [5, 10, 15, 20, 30];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  activeProfile,
  onOpenProfileModal,
  onUpdateSettings,
  onDataChanged,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const lang = getLanguageMeta(activeProfile.targetLanguage);
  const dailyNew = settings.dailyNewWords ?? 10;

  const downloadBackup = () => {
    const blob = new Blob([exportUserDataAsJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocacurve-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ tone: 'good', text: '백업 파일을 저장했습니다. 휴대폰을 바꾸거나 브라우저 데이터를 지우기 전에 꼭 받아 두세요.' });
  };

  const restoreBackup = async (file?: File) => {
    if (!file) return;
    if (!confirm('백업 파일로 현재 학습자의 단어와 기록을 덮어씁니다. 계속할까요?')) return;
    const ok = importUserDataFromJson(await file.text());
    onDataChanged();
    setMessage(ok ? { tone: 'good', text: '백업을 복원했습니다.' } : { tone: 'bad', text: '올바른 VocaCurve 백업 파일이 아닙니다.' });
  };

  return (
    <div className="vc-enter">
      <ScreenHeader title="설정" />

      {message && (
        <div className="mb-4">
          <Notice tone={message.tone} onClose={() => setMessage(null)}>
            {message.text}
          </Notice>
        </div>
      )}

      {/* Profile */}
      <Card className="mb-8">
        <button onClick={onOpenProfileModal} className="w-full flex items-center gap-3 px-4 py-4 text-left">
          <span className="w-10 h-10 rounded-full bg-accent-soft text-accent font-bold flex items-center justify-center shrink-0">
            {activeProfile.name.slice(0, 1)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[16px] font-semibold truncate">{activeProfile.name}</span>
            <span className="block text-[13px] text-muted">{lang.name} 학습 · 학습자 전환/추가</span>
          </span>
          <ChevronRight className="w-4 h-4 text-muted" />
        </button>
      </Card>

      <SectionLabel>학습</SectionLabel>
      <Card className="px-4 py-4 mb-8">
        <p className="text-[15px]">하루 새 단어</p>
        <p className="text-[13px] text-muted mt-0.5 mb-3">
          복습할 단어는 양과 상관없이 모두 나옵니다. 새 단어만 하루에 이만큼씩 섞입니다. 처음에는 10개를 권합니다.
        </p>
        <Segmented<number>
          value={dailyNew}
          onChange={v => onUpdateSettings({ dailyNewWords: v })}
          options={NEW_WORD_OPTIONS.map(n => ({ value: n, label: `${n}개` }))}
        />
      </Card>

      <SectionLabel>소리</SectionLabel>
      <Card className="px-4 mb-8 divide-y divide-line">
        <Toggle
          label="단어 발음 자동 재생"
          description="카드가 나올 때 기기 음성으로 읽어 줍니다"
          checked={settings.audioPronunciation}
          onChange={v => onUpdateSettings({ audioPronunciation: v })}
        />
        <Toggle label="효과음" checked={settings.soundEffects} onChange={v => onUpdateSettings({ soundEffects: v })} />
      </Card>

      <SectionLabel>화면</SectionLabel>
      <Card className="px-4 py-4 mb-8">
        <Segmented<'system' | 'light' | 'dark'>
          value={settings.theme || 'system'}
          onChange={v => onUpdateSettings({ theme: v })}
          options={[
            { value: 'system', label: '기기 설정' },
            { value: 'light', label: '밝게' },
            { value: 'dark', label: '어둡게' },
          ]}
        />
      </Card>

      <SectionLabel>데이터</SectionLabel>
      <Card className="mb-2 divide-y divide-line">
        <RowButton onClick={downloadBackup} icon={<Download className="w-5 h-5" />} label="백업 파일 받기" />
        <RowButton onClick={() => fileRef.current?.click()} icon={<Upload className="w-5 h-5" />} label="백업 파일로 복원" />
      </Card>
      <p className="text-[12px] text-muted px-1 mb-8 leading-relaxed">
        단어와 기록은 이 기기의 브라우저에만 저장됩니다. 브라우저 데이터를 지우거나 기기를 바꾸면 사라지므로, 가끔 백업 파일을 받아 두세요.
      </p>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={e => restoreBackup(e.target.files?.[0])} />

      <SectionLabel>앱으로 설치</SectionLabel>
      <Card className="px-4 py-4 mb-8">
        {isInstalled ? (
          <p className="text-[15px] text-ink-2">이미 홈 화면에 설치되어 있습니다.</p>
        ) : isInstallable ? (
          <>
            <p className="text-[15px] text-ink-2">홈 화면에 추가하면 주소창 없이 앱처럼 열리고, 인터넷 없이도 복습할 수 있습니다.</p>
            <Button variant="primary" block className="mt-3" onClick={install}>
              홈 화면에 설치
            </Button>
          </>
        ) : (
          <ul className="text-[14px] text-ink-2 space-y-2 leading-relaxed">
            <li>
              <strong className="font-semibold text-ink">아이폰(Safari)</strong> 아래 공유 버튼 → ‘홈 화면에 추가’
            </li>
            <li>
              <strong className="font-semibold text-ink">안드로이드(Chrome)</strong> 오른쪽 위 ⋮ → ‘앱 설치’ 또는 ‘홈 화면에 추가’
            </li>
            {isIOS && <li className="text-muted">아이폰은 홈 화면에 추가해 두어야 저장된 데이터가 더 안전하게 유지됩니다.</li>}
          </ul>
        )}
      </Card>

      <SectionLabel>초기화</SectionLabel>
      <Card className="mb-4">
        <button
          className="w-full px-4 py-4 text-left text-[15px] text-bad"
          onClick={() => {
            if (confirm(`'${activeProfile.name}'의 모든 단어와 학습 기록을 삭제할까요? 되돌릴 수 없습니다. 먼저 백업을 받아 두세요.`)) {
              clearAllWords();
              onDataChanged();
              setMessage({ tone: 'good', text: '모든 단어를 삭제했습니다.' });
            }
          }}
        >
          모든 단어와 기록 삭제
        </button>
      </Card>

    </div>
  );
};

const RowButton: React.FC<{ onClick: () => void; label: string; icon?: React.ReactNode }> = ({ onClick, label, icon }) => (
  <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-sunken">
    {icon && <span className="text-muted">{icon}</span>}
    <span className="flex-1 text-[15px]">{label}</span>
    <ChevronRight className="w-4 h-4 text-muted" />
  </button>
);

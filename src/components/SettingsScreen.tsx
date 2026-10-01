import React, { useState, useRef } from 'react';
import {
  Settings as SettingsIcon,
  Bell,
  Volume2,
  Clock,
  BookOpen,
  RotateCcw,
  Check,
  Target,
  Plus,
  Minus,
  Flame,
  User,
  Smartphone,
  Download,
  Upload,
  Shield,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';
import { UserProfile, UserSettings } from '../types/database';
import { resetToSampleData, exportUserDataAsJson, importUserDataFromJson } from '../lib/storage';
import { getLanguageMeta } from '../lib/languageHelper';
import { MobileAppInstallModal } from './MobileAppInstallModal';

interface SettingsScreenProps {
  settings: UserSettings;
  activeProfile?: UserProfile;
  onOpenProfileModal?: () => void;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  onResetData: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  activeProfile,
  onOpenProfileModal,
  onUpdateSettings,
  onResetData,
}) => {
  const [savedNotice, setSavedNotice] = useState(false);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const langMeta = getLanguageMeta(activeProfile?.targetLanguage || settings.sourceLanguage);

  const showSaved = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleExportBackup = () => {
    const jsonStr = exportUserDataAsJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `VocaCurve_Backup_${activeProfile?.name || 'User'}_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupNotice('✅ 백업 파일(.json)이 다운로드되었습니다.');
    setTimeout(() => setBackupNotice(null), 3000);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      if (content) {
        const success = importUserDataFromJson(content);
        if (success) {
          onResetData();
          setBackupNotice('✅ 백업 데이터가 성공적으로 복원되었습니다!');
        } else {
          alert('백업 파일 형식이 올바르지 않습니다.');
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleModeChange = (mode: 'time' | 'count') => {
    onUpdateSettings({ preferredSessionMode: mode });
    showSaved();
  };

  const handleDailyGoalChange = (goal: number) => {
    const clamped = Math.max(3, Math.min(100, goal));
    onUpdateSettings({ dailyWordGoal: clamped, targetDailyReviews: clamped });
    showSaved();
  };

  const handleSentenceModeToggle = (enabled: boolean) => {
    onUpdateSettings({ sentenceModeEnabled: enabled });
    showSaved();
  };

  const handleDurationChange = (mins: 3 | 5 | 10) => {
    onUpdateSettings({ preferredSessionDuration: mins });
    showSaved();
  };

  const handleSoundToggle = (soundEffects: boolean) => {
    onUpdateSettings({ soundEffects });
    showSaved();
  };

  const handleAudioPronunciationToggle = (audioPronunciation: boolean) => {
    onUpdateSettings({ audioPronunciation });
    showSaved();
  };

  const handleRemindersToggle = (gentleReminders: boolean) => {
    onUpdateSettings({ gentleReminders });
    showSaved();
  };

  const currentGoal = settings.dailyWordGoal || settings.targetDailyReviews || 20;
  const wordGoalPresets = [10, 15, 20, 30, 50];

  return (
    <div className="pb-24 pt-4 px-4 max-w-md mx-auto animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">설정</h1>
          <p className="text-xs text-slate-500">학습 환경 및 에빙하우스 인출 모드 설정</p>
        </div>

        {savedNotice && (
          <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg">
            <Check className="w-3.5 h-3.5" /> 저장됨
          </span>
        )}
      </div>

      {/* Hidden file input for backup restore */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        className="hidden"
      />

      <div className="space-y-4">
        {/* 학습자 계정 관리 (사용자 분리 저장) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-xs"
                style={{ backgroundColor: activeProfile?.avatarColor || '#4F46E5' }}
              >
                {activeProfile?.name ? activeProfile.name.slice(0, 1) : '학'}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-slate-900">
                    {activeProfile?.name || settings.userName || '학습자'}
                  </span>
                  <span className="text-xs">{langMeta.flag}</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  학습 언어: {langMeta.name} · 사용자별 단어/기록 독립 저장
                </span>
              </div>
            </div>

            {onOpenProfileModal && (
              <button
                type="button"
                onClick={onOpenProfileModal}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95"
              >
                계정 전환 / 추가
              </button>
            )}
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 leading-relaxed">
            💡 사용자에 따라 단어장, 망각 곡선 진도, 학습 기록이 완전히 분리되어 저장됩니다. 형제/가족 또는 언어별로 계정을 추가하여 이용할 수 있습니다.
          </div>
        </div>

        {/* 핸드폰 앱(APK) 설치 & 모바일 이용 안내 */}
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 rounded-2xl p-4 border border-indigo-500/30 text-white shadow-md">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>핸드폰 앱(APK) 설치 & 이용</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/30 text-indigo-300 text-[10px] font-bold">PWA / APK</span>
                </h3>
                <span className="text-[11px] text-indigo-300">스마트폰 홈 화면 1초 설치 및 .APK 추출</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowInstallModal(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1 shrink-0"
            >
              <span>설치 가이드</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            스마트폰에서 주소창 없이 전체 화면 독립 앱으로 1초 만에 설치하거나, PWABuilder를 통해 직접 안드로이드용 .apk 파일을 추출할 수 있습니다.
          </p>
        </div>

        {/* 목표 단어 설정 (Target Words) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Target className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">목표 단어 설정</h3>
            </div>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              {currentGoal}개
            </span>
          </div>

          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            세션 당 외울 기본 목표 단어 수를 정합니다. 접속한 순간에 원하는 분량만큼 홈 화면이나 여기서 자유롭게 조절할 수 있습니다.
          </p>

          {/* Preset Buttons */}
          <div className="flex items-center gap-2 mb-3">
            {wordGoalPresets.map(preset => (
              <button
                key={preset}
                onClick={() => handleDailyGoalChange(preset)}
                className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  currentGoal === preset
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {preset}개
              </button>
            ))}
          </div>

          {/* Stepper & Number Input */}
          <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 mb-2">
            <button
              onClick={() => handleDailyGoalChange(currentGoal - 5)}
              disabled={currentGoal <= 5}
              className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center text-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">목표 수량:</span>
              <input
                type="number"
                min={3}
                max={100}
                value={currentGoal}
                onChange={e => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) handleDailyGoalChange(val);
                }}
                className="w-16 py-1 px-2 text-center text-slate-900 font-extrabold text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
              />
              <span className="text-xs font-semibold text-slate-700">단어</span>
            </div>

            <button
              onClick={() => handleDailyGoalChange(currentGoal + 5)}
              disabled={currentGoal >= 100}
              className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center text-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-amber-600">
            <Flame className="w-3.5 h-3.5 shrink-0" />
            <span>외울 단어가 많은 날에는 목표 단어 칸을 늘려 빠르게 집중 학습하세요.</span>
          </div>
        </div>

        {/* 기본 학습 모드 선택 (시간 모드 vs 하루 목표 단어 모드) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">기본 복습 세션 기준</h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            홈 화면에 기본으로 표시할 복습 기준 방식을 선택합니다.
          </p>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => handleModeChange('time')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                settings.preferredSessionMode === 'time'
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="text-xs font-bold text-slate-900 block mb-0.5">⏱️ 시간 모드</span>
              <span className="text-[11px] text-slate-500">3분, 5분, 10분 단위 인출</span>
            </button>

            <button
              onClick={() => handleModeChange('count')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                settings.preferredSessionMode === 'count'
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="text-xs font-bold text-slate-900 block mb-0.5">🎯 하루 목표 단어</span>
              <span className="text-[11px] text-slate-500">지정한 목표 단어 수만큼 인출</span>
            </button>
          </div>

          {/* 시간 모드 선택 시 기본 분 설정 */}
          <div className="pt-2 border-t border-slate-100">
            <span className="text-[11px] font-semibold text-slate-600 block mb-2">
              시간 모드 기본 시간 (홈 복습 시작 시 권장):
            </span>
            <div className="grid grid-cols-3 gap-2">
              {([3, 5, 10] as const).map(mins => (
                <button
                  key={mins}
                  onClick={() => handleDurationChange(mins)}
                  className={`py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                    settings.preferredSessionDuration === mins
                      ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {mins}분 (약 {mins * 3}개)
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* REQUIREMENT 6: 문장 문제 옵션 설정 (빠른 단어 복습 vs 문장도 함께 학습) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">문장 문제 학습 설정</h3>
          </div>

          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            단어 단독 복습 위주로 진행할지, 문맥 속 빈칸 완성 문제를 함께 풀지 결정합니다.
          </p>

          <div className="space-y-2">
            <button
              onClick={() => handleSentenceModeToggle(false)}
              className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-start justify-between cursor-pointer ${
                !settings.sentenceModeEnabled
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div>
                <span className="text-xs font-bold text-slate-900 block mb-0.5">
                  빠른 단어 복습 (기본값)
                </span>
                <span className="text-[11px] text-slate-500">
                  어휘 중심의 가장 빠른 인출 세션 (3~5분 완주에 최적화)
                </span>
              </div>
              {!settings.sentenceModeEnabled && (
                <div className="w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </button>

            <button
              onClick={() => handleSentenceModeToggle(true)}
              className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-start justify-between cursor-pointer ${
                settings.sentenceModeEnabled
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div>
                <span className="text-xs font-bold text-slate-900 block mb-0.5">
                  문장도 함께 학습
                </span>
                <span className="text-[11px] text-slate-500">
                  단어 복습과 함께 약 20~30% 문맥 속 어형 변화 빈칸 문제 출제
                </span>
              </div>
              {settings.sentenceModeEnabled && (
                <div className="w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </button>
          </div>
        </div>

        {/* 사운드 및 발음 */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Volume2 className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">소리 및 발음 안내</h3>
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">단어 음성 자동 재생</span>
              <span className="text-[11px] text-slate-400">{langMeta.name} 단어 출제 시 원어민 음성 재생</span>
            </div>
            <input
              type="checkbox"
              checked={settings.audioPronunciation}
              onChange={e => handleAudioPronunciationToggle(e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between py-1 border-t border-slate-100 pt-2">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">정답 효과음</span>
              <span className="text-[11px] text-slate-400">부드러운 정답/오답 사운드 효과</span>
            </div>
            <input
              type="checkbox"
              checked={settings.soundEffects}
              onChange={e => handleSoundToggle(e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
            />
          </div>
        </div>

        {/* REQUIREMENT 19: 정중한 알림 (부담 없는 알림) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">부담 없는 기억 유지 알림</h3>
          </div>

          <div className="flex items-center justify-between py-1 mb-2">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">부드러운 리마인더</span>
              <span className="text-[11px] text-slate-400">
                죄책감을 주지 않는 온화한 문구로 망각 방지 안내
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.gentleReminders}
              onChange={e => handleRemindersToggle(e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          {settings.gentleReminders && (
            <div className="bg-indigo-50/60 p-2.5 rounded-xl border border-indigo-100 text-[11px] text-indigo-900 leading-relaxed">
              🔔 알림 예시: "오늘 {currentGoal}개 단어를 복습하면 잊어버리지 않고 오래 기억됩니다."
            </div>
          )}
        </div>

        {/* 📱 핸드폰 저장 & 앱 다운로드(PWA) 안내 (사용자 질의 100% 해소) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">핸드폰 다운로드 및 저장 원리</h3>
              <p className="text-[11px] text-slate-500">인터넷 없이도 폰에 영구 보존됩니다</p>
            </div>
          </div>

          <div className="space-y-2 text-xs text-slate-600">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-indigo-600" />
                <span>1. 핸드폰에 다운받았을 때 저장은 어떻게 되나요?</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                모든 단어와 망각 곡선 복습 기록은 핸드폰 브라우저 내부의 <strong>독립 샌드박스 저장소(LocalStorage)</strong>에 즉시 자동 저장됩니다. 비행기 모드나 오프라인에서도 모든 데이터가 유지됩니다.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                <span>2. 핸드폰 홈 화면에 앱으로 다운로드하는 방법 (PWA)</span>
              </div>
              <ul className="text-[11px] text-slate-500 space-y-1 list-disc list-inside leading-relaxed">
                <li><strong>아이폰(Safari):</strong> 하단 공유 버튼(네모+화살표) → <strong>[홈 화면에 추가]</strong></li>
                <li><strong>안드로이드/갤럭시(Chrome):</strong> 우측 상단 메뉴(점 3개) → <strong>[앱 설치]</strong> 또는 <strong>[홈 화면에 추가]</strong></li>
              </ul>
            </div>
          </div>

          {backupNotice && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 animate-in fade-in">
              {backupNotice}
            </div>
          )}

          {/* Backup & Restore Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={handleExportBackup}
              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              <span>백업 파일 받기 (.json)</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-600" />
              <span>백업 파일 복원하기</span>
            </button>
          </div>
        </div>

        {/* 데이터 관리 & 초기화 */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-2">샘플 데이터 관리</h3>
          <p className="text-xs text-slate-500 mb-3">
            필요한 경우 현재 선택된 언어의 기본 정예 단어 세트로 되돌릴 수 있습니다.
          </p>

          <button
            onClick={() => {
              if (confirm('샘플 단어 데이터로 재설정하시겠습니까? (기존 단어 및 복습 기록이 초기화됩니다)')) {
                resetToSampleData();
                onResetData();
                alert('샘플 데이터가 복원되었습니다.');
              }
            }}
            className="w-full py-2.5 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>샘플 단어 데이터 복원하기</span>
          </button>
        </div>
      </div>

      {/* Mobile App (APK / PWA) Installation Modal */}
      {showInstallModal && (
        <MobileAppInstallModal onClose={() => setShowInstallModal(false)} />
      )}
    </div>
  );
};

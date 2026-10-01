import React, { useState, useEffect } from 'react';
import {
  Play,
  Sparkles,
  Clock,
  ArrowRight,
  Brain,
  Zap,
  CheckCircle2,
  ChevronRight,
  BookOpen,
  Target,
  Plus,
  Minus,
  Trophy,
  Flame,
  Folder,
  Layers,
  BarChart3,
  TrendingUp,
  Lock,
  User,
  Smartphone,
} from 'lucide-react';
import {
  MemoryState,
  StudyDirection,
  UserProfile,
  UserSettings,
  VocabularyCollection,
  VocabularyFolder,
  VocabularyItem,
} from '../types/database';
import { generateSessionPlan, isLongTermMemoryItem, SessionPlan } from '../lib/memoryEngine';
import { StatsSummary } from '../lib/storage';
import { getDirectionLabels } from '../lib/languageHelper';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { MobileAppInstallModal } from './MobileAppInstallModal';

interface HomeScreenProps {
  items: VocabularyItem[];
  memoryStateMap: Map<string, MemoryState>;
  collections: VocabularyCollection[];
  folders: VocabularyFolder[];
  settings: UserSettings;
  stats: StatsSummary;
  activeProfile?: UserProfile;
  onOpenProfileModal?: () => void;
  onStartReview: (
    options:
      | {
          durationMinutes?: number;
          targetWordsCount?: number;
          mode?: 'time' | 'count';
          collectionId?: string;
          folderId?: string;
          studyDirection?: StudyDirection;
        }
      | number
  ) => void;
  onNavigateTab: (tab: 'library' | 'import' | 'stats' | 'settings') => void;
  onSelectCollection: (collectionId: string) => void;
  onUpdateDailyGoal?: (newGoal: number, newMode?: 'time' | 'count') => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  items,
  memoryStateMap,
  collections,
  folders = [],
  settings,
  stats,
  activeProfile,
  onOpenProfileModal,
  onStartReview,
  onNavigateTab,
  onSelectCollection,
  onUpdateDailyGoal,
}) => {
  // Target language & dynamic directional labels (e.g. 일본어, 영어, 스페인어)
  const targetLanguage = settings.sourceLanguage || activeProfile?.targetLanguage || 'ja';
  const dirLabels = getDirectionLabels(targetLanguage);

  // Category & Folder scope selection before starting review
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');

  // Study Direction: 'en_to_ko' (기본 외국어->한) | 'ko_to_en' (한->외국어 장기기억 인출) | 'context_cloze' (문맥 빈칸)
  const [studyDirection, setStudyDirection] = useState<StudyDirection>('en_to_ko');

  // Active study knob: 'time' (3/5/10 min) or 'count' (목표 단어)
  const [activeMode, setActiveMode] = useState<'time' | 'count'>(
    settings.preferredSessionMode || 'time'
  );

  // Time mode state
  const [selectedDuration, setSelectedDuration] = useState<3 | 5 | 10>(
    settings.preferredSessionDuration || 5
  );

  // Target words knob (접속한 순간 원하는 학습량 조절)
  const [targetWords, setTargetWords] = useState<number>(
    settings.dailyWordGoal || settings.targetDailyReviews || 20
  );
  const { isInstalled } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);

  // Available folders for the currently selected category
  const availableFolders =
    selectedCollectionId === 'all'
      ? folders
      : folders.filter(f => f.collectionId === selectedCollectionId);

  // Filter items in the chosen scope to display counts
  const scopedItems = items.filter(item => {
    if (selectedCollectionId !== 'all' && item.collectionId !== selectedCollectionId) return false;
    if (selectedFolderId !== 'all' && item.folderId !== selectedFolderId) return false;
    return true;
  });

  // Calculate words in long-term memory within the selected scope
  const longTermItemsInScope = scopedItems.filter(item => {
    const st = memoryStateMap.get(item.id);
    return isLongTermMemoryItem(item, st);
  });
  const longTermCount = longTermItemsInScope.length;

  // Handle changing target words
  const handleUpdateTargetWords = (newVal: number) => {
    const clamped = Math.max(3, Math.min(100, newVal));
    setTargetWords(clamped);
    if (onUpdateDailyGoal) {
      onUpdateDailyGoal(clamped, activeMode);
    }
  };

  // Switch between Time Mode and Word Count Mode
  const handleModeSwitch = (mode: 'time' | 'count') => {
    setActiveMode(mode);
    if (onUpdateDailyGoal) {
      onUpdateDailyGoal(targetWords, mode);
    }
  };

  // Generate real-time session plan based on selected Category + Folder + Mode + Direction
  const sessionPlan: SessionPlan = generateSessionPlan(items, memoryStateMap, settings, {
    mode: activeMode,
    durationMinutes: selectedDuration,
    targetWordsCount: targetWords,
    collectionId: selectedCollectionId,
    folderId: selectedFolderId,
    studyDirection,
  });

  // Handle Dimension Selection
  const handleSelectDimension = (dir: StudyDirection) => {
    setStudyDirection(dir);
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // Ignore scroll error in iframe
    }
  };

  // Multidimensional Memory Strength percentages (default or calculated)
  const recStrength = stats.recognitionVsProductionRatio?.recognition ?? 84;
  const prodStrength = stats.recognitionVsProductionRatio?.production ?? 56;
  const transStrength = stats.recognitionVsProductionRatio?.transfer ?? 42;

  // Selected Scope Name
  const selectedCollectionName =
    selectedCollectionId === 'all'
      ? '전체 카테고리'
      : collections.find(c => c.id === selectedCollectionId)?.name || '단어장';
  const selectedFolderName =
    selectedFolderId === 'all'
      ? '전체 폴더'
      : folders.find(f => f.id === selectedFolderId)?.name || '폴더';

  // Preset word counts
  const wordPresets = [10, 15, 20, 30, 50];

  return (
    <div className="pb-24 pt-4 px-4 max-w-md mx-auto animate-in fade-in duration-300">
      {/* Friendly Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">
            VocaCurve · {dirLabels.name}
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
            안녕하세요, {activeProfile?.name || settings.userName || '학습자'}님 👋
          </h1>
        </div>

        {onOpenProfileModal && (
          <button
            onClick={onOpenProfileModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 shadow-xs rounded-2xl text-xs font-bold text-slate-700 transition-all cursor-pointer active:scale-95"
            title="계정 전환 및 학습 언어 변경"
          >
            <span className="text-sm">{dirLabels.meta.flag}</span>
            <span className="max-w-[70px] truncate text-slate-900">
              {activeProfile?.name || settings.userName || '학습자'}
            </span>
            <span className="text-[10px] text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded-md">
              {dirLabels.name}
            </span>
          </button>
        )}
      </div>

      {/* MAIN STUDY CONTROL PANEL (카테고리/폴더 선택 + 시간/목표 단어 조절 + 즉시 시작) */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 text-white shadow-xl shadow-indigo-950/25 mb-6 border border-slate-800">
        <div className="absolute top-0 right-0 -mr-10 -mt-10 w-48 h-48 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          {/* STEP 1: 학습 범위 선택 (카테고리 및 폴더) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                1. 학습 범위 선택
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                선택 범위: <strong className="text-white">{scopedItems.length}단어</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Category Dropdown */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">카테고리 (단어장)</label>
                <select
                  value={selectedCollectionId}
                  onChange={e => {
                    setSelectedCollectionId(e.target.value);
                    setSelectedFolderId('all'); // reset folder when category changes
                  }}
                  className="w-full py-2 px-2.5 bg-white/10 border border-white/15 rounded-xl text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
                >
                  <option value="all" className="bg-slate-900 text-white">
                    📚 전체 카테고리
                  </option>
                  {collections.map(col => (
                    <option key={col.id} value={col.id} className="bg-slate-900 text-white">
                      {col.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Folder Dropdown */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">폴더 (세부 항목)</label>
                <select
                  value={selectedFolderId}
                  onChange={e => setSelectedFolderId(e.target.value)}
                  className="w-full py-2 px-2.5 bg-white/10 border border-white/15 rounded-xl text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
                >
                  <option value="all" className="bg-slate-900 text-white">
                    📁 전체 폴더
                  </option>
                  {availableFolders.map(f => (
                    <option key={f.id} value={f.id} className="bg-slate-900 text-white">
                      📁 {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* STEP 2: 세션 분량 조절 (시간 모드 vs 목표 단어) */}
          <div className="pt-2 border-t border-white/10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Target className="w-3.5 h-3.5 text-indigo-400" />
                2. 학습 분량 설정
              </span>

              {/* Knob toggle: [시간 모드] vs [목표 단어] */}
              <div className="flex items-center bg-white/10 p-0.5 rounded-xl">
                <button
                  onClick={() => handleModeSwitch('time')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeMode === 'time'
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  시간 모드
                </button>
                <button
                  onClick={() => handleModeSwitch('count')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeMode === 'count'
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  목표 단어
                </button>
              </div>
            </div>

            {/* Content for Time Mode */}
            {activeMode === 'time' ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 bg-white/10 p-1 rounded-2xl">
                  {([3, 5, 10] as const).map(mins => (
                    <button
                      key={mins}
                      onClick={() => setSelectedDuration(mins)}
                      className={`py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                        selectedDuration === mins
                          ? 'bg-white text-slate-950 shadow-xs'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      {mins}분 모드
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-indigo-200/80 text-center">
                  약 {selectedDuration}분 동안 부담 없이 {sessionPlan.totalCards}개 단어를 집중 인출합니다
                </p>
              </div>
            ) : (
              /* Content for Word Count Mode (목표 단어) */
              <div className="space-y-2.5">
                {/* Presets */}
                <div className="flex items-center justify-between gap-1.5">
                  {wordPresets.map(preset => (
                    <button
                      key={preset}
                      onClick={() => handleUpdateTargetWords(preset)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all border cursor-pointer ${
                        targetWords === preset
                          ? 'bg-indigo-500 border-indigo-400 text-white shadow-xs'
                          : 'bg-white/10 border-white/15 text-white/80 hover:bg-white/20'
                      }`}
                    >
                      {preset}개
                    </button>
                  ))}
                </div>

                {/* Stepper & Direct Editable Input */}
                <div className="flex items-center justify-between bg-white/10 border border-white/15 rounded-2xl p-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateTargetWords(targetWords - 5)}
                    disabled={targetWords <= 5}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 active:scale-95 flex items-center justify-center text-white transition-all cursor-pointer"
                    title="5개 줄이기"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1.5 text-center">
                    <span className="text-xs text-indigo-200">목표 단어:</span>
                    <input
                      type="number"
                      min={3}
                      max={100}
                      value={targetWords}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) handleUpdateTargetWords(val);
                      }}
                      className="w-16 py-1 px-1 bg-white/20 text-white font-extrabold text-base text-center rounded-lg border border-white/20 focus:outline-none focus:border-indigo-400"
                    />
                    <span className="text-xs text-indigo-200 font-semibold">개 단어</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUpdateTargetWords(targetWords + 5)}
                    disabled={targetWords >= 100}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 active:scale-95 flex items-center justify-center text-white transition-all cursor-pointer"
                    title="5개 늘리기"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* STEP 3: 플래시카드 학습 시작 CTA Button */}
          <div className="space-y-1.5 mt-2">
            <button
              onClick={() =>
                onStartReview({
                  mode: activeMode,
                  durationMinutes: selectedDuration,
                  targetWordsCount: targetWords,
                  collectionId: selectedCollectionId,
                  folderId: selectedFolderId,
                  studyDirection,
                })
              }
              className={`w-full py-4 text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                studyDirection === 'ko_to_en'
                  ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/40'
                  : studyDirection === 'context_cloze'
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40'
                  : 'bg-indigo-500 hover:bg-indigo-400 shadow-indigo-600/30'
              }`}
            >
              <Play className="w-5 h-5 fill-white" />
              <span>
                {studyDirection === 'ko_to_en'
                  ? `${dirLabels.koToForeign} 시작 (${sessionPlan.totalCards}개 단어)`
                  : studyDirection === 'context_cloze'
                  ? `문맥 빈칸 문제 시작 (${sessionPlan.totalCards}개 단어)`
                  : selectedFolderId !== 'all'
                  ? `[${selectedFolderName}] ${dirLabels.foreignToKoShort} 시작 (${sessionPlan.totalCards}개 단어)`
                  : `${dirLabels.foreignToKo} 플래시카드 시작 (${sessionPlan.totalCards}개 단어)`}
              </span>
            </button>

            {/* Current Mode Badge / Indicator */}
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-indigo-200/90 font-medium">
              <span>현재 모드:</span>
              <strong className="text-white underline underline-offset-2">
                {studyDirection === 'ko_to_en'
                  ? `${dirLabels.koToForeign} (신규/학습 중 포함 전체 단어 인출)`
                  : studyDirection === 'context_cloze'
                  ? `문맥 / 실전문장 빈칸 문제`
                  : `${dirLabels.foreignToKo} 플래시카드 (기본 인출)`}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: 다차원 기억 강도 매트릭스 (Multidimensional Memory Strengths) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">다차원 기억 강도 분석</h3>
              <p className="text-[11px] text-slate-400">클릭하여 해당 학습 모드로 상단 플래시카드를 전환합니다</p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
            종합 유지율 {stats.averageRecallRate}%
          </span>
        </div>

        <div className="space-y-3">
          {/* 1. 외국어 -> 한 인출력 (기본 모드) */}
          <div
            onClick={() => handleSelectDimension('en_to_ko')}
            className={`p-3.5 rounded-2xl transition-all cursor-pointer border ${
              studyDirection === 'en_to_ko'
                ? 'bg-indigo-50/90 border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs'
                : 'bg-slate-50/60 border-slate-200/70 hover:bg-indigo-50/40'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    studyDirection === 'en_to_ko' ? 'bg-indigo-600 ring-4 ring-indigo-100' : 'bg-slate-400'
                  }`}
                />
                <span className="text-xs font-bold text-slate-900">
                  {dirLabels.foreignToKoFull}
                </span>
                {studyDirection === 'en_to_ko' && (
                  <span className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-[10px] font-bold text-white">
                    활성화됨
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-extrabold text-indigo-700">{recStrength}%</span>
                <span className="text-[10px] text-indigo-600 font-semibold">
                  {recStrength >= 80 ? '매우 우수' : recStrength >= 65 ? '안정권' : '복습 필요'}
                </span>
              </div>
            </div>
            <div className="w-full bg-indigo-100/70 h-2 rounded-full overflow-hidden mb-1.5">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${recStrength}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {dirLabels.foreignToKoDesc}
            </p>
          </div>

          {/* 2. 한 -> 외국어 인출력 (모든 단어 인출 지원) */}
          <div
            onClick={() => handleSelectDimension('ko_to_en')}
            className={`p-3.5 rounded-2xl transition-all border ${
              studyDirection === 'ko_to_en'
                ? 'bg-purple-50/90 border-purple-400 ring-2 ring-purple-500/20 shadow-xs cursor-pointer'
                : 'bg-slate-50/60 border-slate-200/70 hover:bg-purple-50/40 cursor-pointer'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    studyDirection === 'ko_to_en' ? 'bg-purple-600 ring-4 ring-purple-100' : 'bg-slate-400'
                  }`}
                />
                <span className="text-xs font-bold text-slate-900">
                  {dirLabels.koToForeignFull}
                </span>
                {studyDirection === 'ko_to_en' && (
                  <span className="px-1.5 py-0.5 rounded-md bg-purple-600 text-[10px] font-bold text-white">
                    활성화됨
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-extrabold text-purple-700">{prodStrength}%</span>
                <span className="text-[10px] text-purple-600 font-semibold">
                  {scopedItems.length}개 단어 전체 지원
                </span>
              </div>
            </div>
            <div className="w-full bg-purple-100/70 h-2 rounded-full overflow-hidden mb-1.5">
              <div
                className="bg-purple-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${prodStrength}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {dirLabels.koToForeignDesc}
            </p>
          </div>

          {/* 3. 문맥 및 실전문장 전이력 (단어 빈칸 문제) */}
          <div
            onClick={() => handleSelectDimension('context_cloze')}
            className={`p-3.5 rounded-2xl transition-all border ${
              studyDirection === 'context_cloze'
                ? 'bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-500/20 shadow-xs cursor-pointer'
                : 'bg-slate-50/60 border-slate-200/70 hover:bg-emerald-50/40 cursor-pointer'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    studyDirection === 'context_cloze' ? 'bg-emerald-600 ring-4 ring-emerald-100' : 'bg-slate-400'
                  }`}
                />
                <span className="text-xs font-bold text-slate-900">
                  문맥 / 실전문장 전이력 (단어 빈칸 문제)
                </span>
                {studyDirection === 'context_cloze' && (
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-[10px] font-bold text-white">
                    활성화됨
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-extrabold text-emerald-700">{transStrength}%</span>
                <span className="text-[10px] text-emerald-600 font-semibold">
                  장기기억 {longTermCount}단어
                </span>
              </div>
            </div>
            <div className="w-full bg-emerald-100/70 h-2 rounded-full overflow-hidden mb-1.5">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${transStrength}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              실전문장의 빈칸 [ ___ ]에 들어갈 단어를 맞추는 문맥 응용 학습입니다. 클릭 시 상단 버튼이 문맥 빈칸 학습으로 전환됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* Vocabulary Collections Glance */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-bold text-slate-900">학습 단어장 및 폴더</h2>
          <button
            onClick={() => onNavigateTab('library')}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5 cursor-pointer"
          >
            단어장에서 관리하기 <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2.5">
          {collections.map(col => {
            const colItems = items.filter(i => i.collectionId === col.id);
            const colFolders = folders.filter(f => f.collectionId === col.id);
            return (
              <div
                key={col.id}
                onClick={() => {
                  onSelectCollection(col.id);
                  onNavigateTab('library');
                }}
                className="bg-white hover:bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center justify-between transition-all cursor-pointer shadow-sm active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: col.color || '#4F46E5' }}
                  >
                    <BookOpen className="w-5 h-5 text-white/90" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 leading-snug">{col.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {colFolders.length}개 폴더 · {colItems.length}개 단어 보관 중
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Gentle Memory Principle Card (Ebbinghaus Context) */}
      <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 text-xs text-slate-600">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1">
          <Brain className="w-3.5 h-3.5 text-indigo-600" />
          에빙하우스 망각 곡선 설계
        </div>
        <p className="leading-relaxed text-slate-500">
          단어장에서 단어를 누르면 망각곡선 상에서 현재 위치와 기억 유지율을 확인할 수 있습니다. 플래시카드로 뒤집어보며 자가 채점을 진행하면 기억 안정성이 대폭 상승합니다.
        </p>
      </div>

      {/* Mobile App Install & APK Modal */}
      {showInstallModal && (
        <MobileAppInstallModal onClose={() => setShowInstallModal(false)} />
      )}
    </div>
  );
};

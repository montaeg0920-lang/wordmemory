import React, { useCallback, useEffect, useState } from 'react';
import { Navbar, TabType } from './components/Navbar';
import { HomeScreen } from './components/HomeScreen';
import { ReviewScreen, SessionResult } from './components/ReviewScreen';
import { SessionCompleteScreen } from './components/SessionCompleteScreen';
import { VocabLibrary } from './components/VocabLibrary';
import { AddWordsScreen } from './components/AddWordsScreen';
import { StatsScreen } from './components/StatsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { UserProfileModal } from './components/UserProfileModal';
import { WelcomeOnboardingModal } from './components/WelcomeOnboardingModal';
import { UsageGuide } from './components/UsageGuide';
import { getTrialPasteText } from './data/trialWords';
import { Notice } from './components/ui';
import {
  STORAGE_ERROR_EVENT,
  completeOnboarding,
  endTrialOffer,
  createProfile,
  deleteCollection,
  deleteFolder,
  deleteProfile,
  deleteVocabularyItems,
  getActiveProfile,
  getCollections,
  getFolders,
  getMemoryStateMap,
  getProfiles,
  getStatsSummary,
  getUserSettings,
  getVocabularyItems,
  hasCompletedOnboarding,
  isTrialOfferActive,
  initializeStorageIfNeeded,
  logReviewEvent,
  moveItemsToFolder,
  requestPersistentStorage,
  saveCollection,
  saveFolder,
  saveMemoryState,
  saveVocabularyItems,
  setActiveProfileId,
  updateProfile,
  updateUserSettings,
  updateVocabularyItem,
} from './lib/storage';
import {
  LanguageCode,
  MemoryState,
  ReviewEvent,
  UserProfile,
  UserSettings,
  VocabularyCollection,
  VocabularyFolder,
  VocabularyItem,
} from './types/database';
import { EMPTY_REASON_MESSAGE, SessionOptions, SessionPlan, generateSessionPlan } from './lib/memoryEngine';

initializeStorageIfNeeded();

function applyTheme(theme: UserSettings['theme']) {
  const dark =
    theme === 'dark' ||
    ((theme === 'system' || !theme) && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach(m => m.setAttribute('content', dark ? '#151412' : '#F7F5F0'));
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('home');
  const [libraryCollectionId, setLibraryCollectionId] = useState<string>('all');

  const [collections, setCollections] = useState<VocabularyCollection[]>(getCollections);
  const [folders, setFolders] = useState<VocabularyFolder[]>(getFolders);
  const [items, setItems] = useState<VocabularyItem[]>(getVocabularyItems);
  const [memoryStateMap, setMemoryStateMap] = useState<Map<string, MemoryState>>(getMemoryStateMap);
  const [settings, setSettings] = useState<UserSettings>(getUserSettings);
  const [stats, setStats] = useState(getStatsSummary);

  const [profiles, setProfiles] = useState<UserProfile[]>(getProfiles);
  const [activeProfile, setActiveProfile] = useState<UserProfile>(getActiveProfile);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(!hasCompletedOnboarding());
  const [showGuide, setShowGuide] = useState(false);
  const [trialOffer, setTrialOffer] = useState(isTrialOfferActive);
  /** Sample words pre-filled into the paste box when the learner starts the trial. */
  const [trialPaste, setTrialPaste] = useState<string | null>(null);

  const [activePlan, setActivePlan] = useState<SessionPlan | null>(null);
  const [lastPlanOptions, setLastPlanOptions] = useState<SessionOptions>({});
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);

  const reloadData = useCallback(() => {
    initializeStorageIfNeeded();
    setCollections(getCollections());
    setFolders(getFolders());
    setItems(getVocabularyItems());
    setMemoryStateMap(getMemoryStateMap());
    setSettings(getUserSettings());
    setStats(getStatsSummary());
    setProfiles(getProfiles());
    setActiveProfile(getActiveProfile());
  }, []);

  useEffect(() => {
    requestPersistentStorage();
    const onError = () => setStorageError(true);
    window.addEventListener(STORAGE_ERROR_EVENT, onError);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onError);
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system' && settings.theme) return;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(settings.theme);
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, [settings.theme]);

  // Refresh "due" counts when the user comes back to the app.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !activePlan) {
        setMemoryStateMap(getMemoryStateMap());
        setStats(getStatsSummary());
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [activePlan]);

  /* ---------- profiles ---------- */
  const handleSelectProfile = (userId: string) => {
    setActiveProfileId(userId);
    setShowProfileModal(false);
    reloadData();
  };
  const handleCreateProfile = (name: string, lang: LanguageCode) => {
    createProfile(name, lang);
    setShowProfileModal(false);
    reloadData();
  };
  const handleUpdateProfile = (userId: string, updates: Partial<UserProfile>) => {
    updateProfile(userId, updates);
    reloadData();
  };
  const handleDeleteProfile = (userId: string) => {
    deleteProfile(userId);
    reloadData();
  };
  const handleCompleteOnboarding = (name: string, lang: LanguageCode) => {
    completeOnboarding(name, lang);
    setShowOnboarding(false);
    setTrialOffer(isTrialOfferActive());
    setShowGuide(true);
    reloadData();
  };
  const trialText = trialOffer ? getTrialPasteText(activeProfile.targetLanguage) : null;
  const startTrial = () => {
    if (!trialText) return;
    setShowGuide(false);
    setTrialPaste(trialText);
    setCurrentTab('import');
  };

  /* ---------- sessions ---------- */
  const startSession = (options: SessionOptions) => {
    const plan = generateSessionPlan(items, memoryStateMap, settings, options);
    if (plan.items.length === 0) {
      setNotice(plan.emptyReason ? EMPTY_REASON_MESSAGE[plan.emptyReason] : '학습할 단어가 없습니다.');
      return;
    }
    setNotice(null);
    setLastPlanOptions(options);
    setSessionResult(null);
    setActivePlan(plan);
  };

  const handleAnswer = (state: MemoryState, event: ReviewEvent) => {
    saveMemoryState(state);
    logReviewEvent(event);
    setMemoryStateMap(prev => new Map(prev).set(state.vocabularyItemId, state));
  };

  const handleSessionEnd = (result: SessionResult) => {
    setActivePlan(null);
    setMemoryStateMap(getMemoryStateMap());
    setStats(getStatsSummary());
    setSessionResult(result.reviewed > 0 ? result : null);
  };

  /* ---------- words ---------- */
  const handleSaveItems = (newItems: VocabularyItem[]) => {
    const saved = saveVocabularyItems(newItems);
    if (saved > 0 && trialOffer) {
      endTrialOffer();
      setTrialOffer(false);
      setTrialPaste(null);
    }
    reloadData();
    return saved;
  };
  const handleUpdateSettings = (partial: Partial<UserSettings>) => {
    setSettings(updateUserSettings(partial));
    if (partial.userName || partial.sourceLanguage) reloadData();
  };

  /* ---------- render ---------- */
  if (activePlan) {
    return (
      <ReviewScreen
        plan={activePlan}
        memoryStateMap={memoryStateMap}
        settings={settings}
        onAnswer={handleAnswer}
        onEnd={handleSessionEnd}
      />
    );
  }

  if (sessionResult) {
    return (
      <SessionCompleteScreen
        result={sessionResult}
        items={items}
        memoryStateMap={memoryStateMap}
        settings={settings}
        scope={lastPlanOptions}
        onHome={() => {
          setSessionResult(null);
          setCurrentTab('home');
          reloadData();
        }}
        onStart={opts => startSession({ ...lastPlanOptions, practice: false, extraNew: 0, ...opts })}
      />
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <main className="max-w-md mx-auto px-4 pb-tabbar">
        {storageError && (
          <div className="pt-4">
            <Notice tone="bad" onClose={() => setStorageError(false)}>
              <strong className="font-semibold">저장에 실패했습니다.</strong> 기기 저장 공간이 부족하거나 브라우저가 저장을 막고
              있습니다. 설정 → 백업 파일 받기로 지금 데이터를 저장해 두세요.
            </Notice>
          </div>
        )}
        {notice && currentTab === 'home' && (
          <div className="pt-4">
            <Notice onClose={() => setNotice(null)}>{notice}</Notice>
          </div>
        )}

        {currentTab === 'home' && (
          <HomeScreen
            items={items}
            memoryStateMap={memoryStateMap}
            collections={collections}
            folders={folders}
            settings={settings}
            stats={stats}
            activeProfile={activeProfile}
            onOpenProfileModal={() => setShowProfileModal(true)}
            onStart={startSession}
            onNavigateTab={setCurrentTab}
            onOpenCollection={id => {
              setLibraryCollectionId(id);
              setCurrentTab('library');
            }}
            onTrial={trialText ? startTrial : undefined}
          />
        )}

        {currentTab === 'library' && (
          <VocabLibrary
            items={items}
            collections={collections}
            folders={folders}
            memoryStateMap={memoryStateMap}
            settings={settings}
            initialCollectionId={libraryCollectionId}
            onUpdateItem={item => {
              updateVocabularyItem(item);
              setItems(getVocabularyItems());
            }}
            onDeleteItems={ids => {
              deleteVocabularyItems(ids);
              reloadData();
            }}
            onMoveItems={(ids, folderId) => {
              moveItemsToFolder(ids, folderId);
              reloadData();
            }}
            onSaveCollection={col => {
              saveCollection(col);
              reloadData();
            }}
            onDeleteCollection={id => {
              deleteCollection(id);
              setLibraryCollectionId('all');
              reloadData();
            }}
            onSaveFolder={f => {
              saveFolder(f);
              reloadData();
            }}
            onDeleteFolder={id => {
              deleteFolder(id);
              reloadData();
            }}
            onAddWords={() => setCurrentTab('import')}
            onReloadData={reloadData}
          />
        )}

        {currentTab === 'import' && (
          <AddWordsScreen
            collections={collections}
            folders={folders}
            existingItems={items}
            settings={settings}
            onSave={handleSaveItems}
            initialPaste={trialPaste}
            onSaveCollection={col => {
              saveCollection(col);
              reloadData();
            }}
          />
        )}

        {currentTab === 'stats' && <StatsScreen stats={stats} />}

        {currentTab === 'settings' && (
          <SettingsScreen
            settings={settings}
            activeProfile={activeProfile}
            onOpenProfileModal={() => setShowProfileModal(true)}
            onUpdateSettings={handleUpdateSettings}
            onOpenGuide={() => setShowGuide(true)}
            onDataChanged={reloadData}
          />
        )}
      </main>

      {showProfileModal && (
        <UserProfileModal
          profiles={profiles}
          activeProfile={activeProfile}
          onSelectProfile={handleSelectProfile}
          onCreateProfile={handleCreateProfile}
          onUpdateProfile={handleUpdateProfile}
          onDeleteProfile={handleDeleteProfile}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {showOnboarding && (
        <WelcomeOnboardingModal
          initialName={activeProfile.name === '학습자 1' ? '' : activeProfile.name}
          initialLanguage={activeProfile.targetLanguage || 'en'}
          onComplete={handleCompleteOnboarding}
        />
      )}

      {showGuide && !showOnboarding && (
        <UsageGuide canTry={!!trialText && items.length === 0} onTry={startTrial} onClose={() => setShowGuide(false)} />
      )}

      <Navbar currentTab={currentTab} onTabChange={setCurrentTab} />
    </div>
  );
}

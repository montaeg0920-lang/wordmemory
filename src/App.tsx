import React, { useState, useEffect } from 'react';
import { Navbar, TabType } from './components/Navbar';
import { HomeScreen } from './components/HomeScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { SessionCompleteScreen } from './components/SessionCompleteScreen';
import { VocabLibrary } from './components/VocabLibrary';
import { FileImportScreen } from './components/FileImportScreen';
import { StatsScreen } from './components/StatsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { UserProfileModal } from './components/UserProfileModal';
import { WelcomeOnboardingModal } from './components/WelcomeOnboardingModal';
import {
  getCollections,
  getFolders,
  saveFolder,
  deleteFolder,
  getVocabularyItems,
  getMemoryStates,
  getMemoryStateMap,
  getUserSettings,
  getStatsSummary,
  saveMemoryState,
  logReviewEvent,
  saveVocabularyItems,
  updateVocabularyItem,
  deleteVocabularyItem,
  deleteVocabularyItems,
  moveItemsToFolder,
  saveCollection,
  deleteCollection,
  updateUserSettings,
  initializeStorageIfNeeded,
  getProfiles,
  getActiveProfile,
  setActiveProfileId,
  createProfile,
  updateProfile,
  deleteProfile,
  hasCompletedOnboarding,
  completeOnboarding,
} from './lib/storage';
import {
  LanguageCode,
  MemoryState,
  ReviewEvent,
  StudyDirection,
  UserProfile,
  UserSettings,
  VocabularyCollection,
  VocabularyFolder,
  VocabularyItem,
} from './types/database';
import { generateSessionPlan } from './lib/memoryEngine';

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('home');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');

  // Application Data States
  const [collections, setCollections] = useState<VocabularyCollection[]>([]);
  const [folders, setFolders] = useState<VocabularyFolder[]>([]);
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [memoryStateMap, setMemoryStateMap] = useState<Map<string, MemoryState>>(new Map());
  const [settings, setSettings] = useState<UserSettings>(getUserSettings());
  const [stats, setStats] = useState(getStatsSummary());

  // Multi-user Profile States
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<UserProfile>(getActiveProfile());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(!hasCompletedOnboarding());

  // Active Review Session States
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(5);
  const [sessionStudyDirection, setSessionStudyDirection] = useState<StudyDirection>('en_to_ko');
  const [sessionItems, setSessionItems] = useState<VocabularyItem[]>([]);
  const [completedCardsCount, setCompletedCardsCount] = useState(0);
  const [strengthenedCount, setStrengthenedCount] = useState(0);
  const [completedEvents, setCompletedEvents] = useState<ReviewEvent[]>([]);

  // Reload all storage state
  const reloadData = () => {
    initializeStorageIfNeeded();
    const cols = getCollections();
    const flds = getFolders();
    const vocabs = getVocabularyItems();
    const memMap = getMemoryStateMap();
    const userSet = getUserSettings();
    const stSummary = getStatsSummary();
    const allProfiles = getProfiles();
    const currProfile = getActiveProfile();

    setCollections(cols);
    setFolders(flds);
    setItems(vocabs);
    setMemoryStateMap(memMap);
    setSettings(userSet);
    setStats(stSummary);
    setProfiles(allProfiles);
    setActiveProfile(currProfile);
  };

  useEffect(() => {
    reloadData();
  }, []);

  // Multi-user profile handlers
  const handleSelectProfile = (userId: string) => {
    setActiveProfileId(userId);
    setShowProfileModal(false);
    reloadData();
  };

  const handleCreateProfile = (name: string, targetLanguage: LanguageCode) => {
    createProfile(name, targetLanguage);
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

  const handleCompleteOnboarding = (name: string, targetLanguage: LanguageCode) => {
    completeOnboarding(name, targetLanguage);
    setShowOnboarding(false);
    reloadData();
  };

  // Start Review session
  const handleStartReview = (
    options:
      | {
          durationMinutes?: number;
          targetWordsCount?: number;
          mode?: 'time' | 'count';
          collectionId?: string;
          folderId?: string;
          studyDirection?: StudyDirection;
        }
      | number = 5
  ) => {
    const studyDir = typeof options === 'object' && options?.studyDirection ? options.studyDirection : 'en_to_ko';
    setSessionStudyDirection(studyDir);
    const plan = generateSessionPlan(items, memoryStateMap, settings, options);

    if (plan.items.length === 0) {
      if (studyDir === 'ko_to_en') {
        alert('한국어 → 영어 인출은 장기기억으로 이동한 단어(학습 완료 및 숙련 단어)를 대상으로 합니다. 아직 장기기억 단어가 충분하지 않습니다. 기본 영→한 플래시카드로 먼저 학습해보세요!');
      } else if (studyDir === 'context_cloze') {
        alert('문맥 빈칸 문제는 장기기억으로 이동한 단어(학습 완료 및 숙련 단어)를 대상으로 합니다. 장기기억 단어가 아직 없습니다.');
      } else {
        alert('선택한 범위에 학습할 단어가 없습니다. 다른 폴더를 선택하거나 새 단어를 추가해보세요!');
      }
      return;
    }

    setSessionDurationMinutes(plan.estimatedMinutes);
    setSessionItems(plan.items);
    setIsReviewing(true);
    setIsSessionComplete(false);
  };

  // Review state save (immediate persistence)
  const handleSaveState = (state: MemoryState, event: ReviewEvent) => {
    saveMemoryState(state);
    logReviewEvent(event);
    setMemoryStateMap(prev => {
      const next = new Map(prev);
      next.set(state.vocabularyItemId, state);
      return next;
    });
    setStats(getStatsSummary());
  };

  // Review session completion
  const handleFinishReviewSession = (
    reviewedCount: number,
    strengthened: number,
    events: ReviewEvent[]
  ) => {
    setCompletedCardsCount(reviewedCount);
    setStrengthenedCount(strengthened);
    setCompletedEvents(events);
    setIsReviewing(false);
    setIsSessionComplete(true);
    setStats(getStatsSummary());
  };

  // Close completion and return to home
  const handleCloseSessionComplete = () => {
    setIsSessionComplete(false);
    reloadData();
  };

  // Add more review time or words from completion screen
  const handleAddMoreReview = (
    options:
      | {
          durationMinutes?: number;
          targetWordsCount?: number;
          mode?: 'time' | 'count';
        }
      | number
  ) => {
    setIsSessionComplete(false);
    handleStartReview(options);
  };

  // Item modifications
  const handleUpdateItem = (updated: VocabularyItem) => {
    updateVocabularyItem(updated);
    setItems(getVocabularyItems());
  };

  const handleDeleteItem = (id: string) => {
    deleteVocabularyItem(id);
    reloadData();
  };

  const handleDeleteItems = (ids: string[]) => {
    deleteVocabularyItems(ids);
    reloadData();
  };

  const handleMoveItemsToFolder = (ids: string[], folderId?: string) => {
    moveItemsToFolder(ids, folderId);
    reloadData();
  };

  const handleAddItem = (newItem: VocabularyItem) => {
    saveVocabularyItems([newItem]);
    reloadData();
  };

  const handleImportComplete = (importedItems: VocabularyItem[]) => {
    saveVocabularyItems(importedItems);
    reloadData();
  };

  const handleCreateCollection = (newCol: VocabularyCollection) => {
    saveCollection(newCol);
    setCollections(getCollections());
  };

  const handleDeleteCollection = (id: string) => {
    deleteCollection(id);
    reloadData();
  };

  const handleCreateFolder = (newFld: VocabularyFolder) => {
    saveFolder(newFld);
    setFolders(getFolders());
  };

  const handleDeleteFolder = (id: string) => {
    deleteFolder(id);
    reloadData();
  };

  const handleUpdateSettings = (partial: Partial<UserSettings>) => {
    const updated = updateUserSettings(partial);
    setSettings(updated);
  };

  // Full Screen Review Flow
  if (isReviewing) {
    return (
      <ReviewScreen
        sessionItems={sessionItems}
        allItems={items}
        memoryStateMap={memoryStateMap}
        settings={settings}
        durationMinutes={sessionDurationMinutes}
        studyDirection={sessionStudyDirection}
        onFinishSession={handleFinishReviewSession}
        onCancel={() => setIsReviewing(false)}
        onSaveState={handleSaveState}
      />
    );
  }

  // Session Complete Flow
  if (isSessionComplete) {
    return (
      <SessionCompleteScreen
        reviewedCardsCount={completedCardsCount}
        strengthenedCount={strengthenedCount}
        reviewEvents={completedEvents}
        allItems={items}
        onFinish={handleCloseSessionComplete}
        onMoreReview={handleAddMoreReview}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased selection:bg-indigo-100 selection:text-indigo-900">
      {/* Active Tab Screen */}
      <main className="min-h-screen">
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
            onStartReview={handleStartReview}
            onNavigateTab={tab => setCurrentTab(tab)}
            onSelectCollection={colId => {
              setSelectedCollectionId(colId);
              setCurrentTab('library');
            }}
            onUpdateDailyGoal={(newGoal, newMode) => {
              handleUpdateSettings({
                dailyWordGoal: newGoal,
                targetDailyReviews: newGoal,
                ...(newMode ? { preferredSessionMode: newMode } : {}),
              });
            }}
          />
        )}

        {currentTab === 'library' && (
          <VocabLibrary
            items={items}
            collections={collections}
            folders={folders}
            memoryStateMap={memoryStateMap}
            selectedCollectionId={selectedCollectionId}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
            onDeleteItems={handleDeleteItems}
            onMoveItemsToFolder={handleMoveItemsToFolder}
            onAddItem={handleAddItem}
            onCreateCollection={handleCreateCollection}
            onDeleteCollection={handleDeleteCollection}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onReloadData={reloadData}
          />
        )}

        {currentTab === 'import' && (
          <FileImportScreen
            collections={collections}
            folders={folders}
            existingItems={items}
            onImportComplete={handleImportComplete}
            onNavigateTab={tab => setCurrentTab(tab)}
          />
        )}

        {currentTab === 'stats' && (
          <StatsScreen
            stats={stats}
            items={items}
            memoryStates={Array.from(memoryStateMap.values())}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsScreen
            settings={settings}
            activeProfile={activeProfile}
            onOpenProfileModal={() => setShowProfileModal(true)}
            onUpdateSettings={handleUpdateSettings}
            onResetData={reloadData}
          />
        )}
      </main>

      {/* User Profile Switching & Creation Modal */}
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

      {/* First-time Onboarding Modal for Account Name & Starting Language */}
      {showOnboarding && (
        <WelcomeOnboardingModal
          initialName={activeProfile?.name || ''}
          initialLanguage={activeProfile?.targetLanguage || 'en'}
          onComplete={handleCompleteOnboarding}
        />
      )}

      {/* Mobile-first bottom tab bar */}
      <Navbar currentTab={currentTab} onTabChange={setCurrentTab} />
    </div>
  );
}

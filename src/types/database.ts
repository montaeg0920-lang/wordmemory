/**
 * Database Schema and Entity Types for VocaCurve
 * Designed for modularity, multilingual scalability, and personalized memory tracking.
 */

export type LanguageCode = 'en' | 'ko' | 'es' | 'ja' | 'de' | 'fr' | 'zh' | 'he' | 'el' | 'other';

export interface UserProfile {
  id: string;
  name: string;
  targetLanguage: LanguageCode; // Main foreign language studied by this user (e.g. 'ja', 'en')
  createdAt: number;
  avatarColor?: string;
}

export type MemoryStatus = 'new' | 'learning' | 'retaining' | 'mastered';

export type QuestionType =
  | 'level1_recognition'     // English -> Korean Multiple Choice
  | 'level2_meaning_recall'   // English -> Recall/Type Korean meaning
  | 'level3_production'       // Korean -> Type English word
  | 'level4_sentence';        // Context / Sentence Cloze

export type StudyDirection =
  | 'en_to_ko'       // 외국어(영어/스페인어/히브리어/헬라어 등) -> 한국어 인출
  | 'ko_to_en'       // 한국어 -> 영어 인출 (장기기억 단어 전용)
  | 'context_cloze'; // 문맥 / 실전문장 빈칸 문제 (장기기억 단어 전용)

export type ConfidenceRating =
  | 'ambiguous'
  | 'somewhat'
  | 'exact'
  | 'skip'
  | 'dont_know'   // 모르겠어요 (다시 복기 큐 재등록)
  | 'unsure'      // 애매해요 (다시 복기 큐 재등록)
  | 'know_well';  // 확실히 알아요 (완전 숙지)

export interface VocabularyCollection {
  id: string;
  name: string;
  description?: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  createdAt: number;
  updatedAt: number;
  color: string;
}

export interface VocabularyFolder {
  id: string;
  collectionId: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExampleSentence {
  id: string;
  source: 'user' | 'ai';
  en: string;
  ko: string;
  clozeBlank?: string; // target word in the sentence
}

export interface VocabularyItem {
  id: string;
  collectionId: string;
  folderId?: string;                 // Subfolder within collection
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  term: string;                      // e.g. "derive"
  lemma: string;                     // e.g. "derive"
  partOfSpeech?: string;             // e.g. "동사"
  userMeaning: string;               // primary user-provided meaning: e.g. "유래하다"
  aiSuggestedMeaning?: string;       // e.g. "~에서 비롯되다, 얻다"
  alternativeMeanings?: string[];    // valid alternative Korean definitions
  pronunciation?: string;            // IPA: e.g. "/dɪˈraɪv/"
  collocations?: string[];           // e.g. ["derive from", "derive pleasure"]
  exampleSentences: ExampleSentence[];
  distractors?: string[];            // pre-calculated or AI distractors
  difficultyEstimate?: number;       // 1 (elementary) to 5 (GRE/SAT)
  createdAt: number;
  updatedAt: number;
  tags?: string[];
}

export interface MemoryState {
  id: string;
  userId: string;
  vocabularyItemId: string;

  // Stabilities (measured in days until recall probability drops to ~90%)
  recognitionStability: number;  // stability for EN -> KO recognition
  productionStability: number;   // stability for KO -> EN active recall
  sentenceStability: number;     // stability for contextual usage
  transferStability: number;     // stability across varied cues/transfer

  // Difficulty multiplier (1.0 = standard, >1.0 harder, <1.0 easier)
  difficulty: number;

  // Strengths (0% to 100%)
  recognitionStrength: number;
  productionStrength: number;
  sentenceStrength: number;
  transferStrength: number;

  // Personalized Ebbinghaus estimates
  lastReviewedAt: number | null;
  nextReviewAt: number;
  estimatedRecallProbability: number; // 0.0 to 1.0 (e.g. 0.85 = 85%)

  // Review statistics
  correctCount: number;
  wrongCount: number;
  consecutiveCorrect: number;
  lapses: number;
  averageResponseTime: number; // in milliseconds
  hintCount: number;

  status: MemoryStatus;
  updatedAt: number;

  // Learning Science Engine (scienceSchedulerV1) backward-compatible extensions
  phase?: 'NEW' | 'STABILIZING' | 'MATURE' | 'RELEARN';
  lastReviewAt?: number | null;
  nextDueAt?: number;
  lastResponse?: 'UNKNOWN' | 'UNSURE' | 'SURE' | null;
  sureStreak?: number;
  lapseCount?: number;
  reviewCount?: number;
  responseTimeMs?: number;
  fastFlag?: boolean;
  supportLevel?: number;
  halfLife?: number;
  predictedRecall?: number;
  verifiedSureDates?: string[];
  importance?: 0.0 | 0.5 | 1.0;
  relearnStep?: number;
  stabilizingStep?: number;
  firstReviewedAt?: number; // 처음 학습한 시각 (하루 새 단어 수 계산용)
}

export interface ReviewEvent {
  id: string;
  userId: string;
  vocabularyItemId: string;
  collectionId: string;
  questionType: QuestionType;
  questionDirection: 'en_to_ko' | 'ko_to_en';
  userAnswer: string;
  correct: boolean;
  confidenceRating?: ConfidenceRating;
  isSkipped?: boolean;
  responseTimeMs: number;
  hintUsed: boolean;
  reviewedAt: number;
  recallProbabilityBefore: number;
  recallProbabilityAfter: number;
}

export interface ImportedFileRecord {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  totalExtracted: number;
  totalSaved: number;
  importedAt: number;
}

export interface UserSettings {
  userId: string;
  userName: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  preferredSessionMode: 'time' | 'count'; // 'time' (3/5/10 mins) or 'count' (daily word goal)
  preferredSessionDuration: 3 | 5 | 10;   // in minutes
  dailyWordGoal: number;                  // 하루 목표 단어 수 (e.g. 10, 20, 30, 50)
  sentenceModeEnabled: boolean;          // Default: false ("빠른 복습 중심")
  sentenceQuestionRatio: number;         // 0.20 to 0.30
  soundEffects: boolean;
  audioPronunciation: boolean;
  gentleReminders: boolean;
  reminderTime: string;                  // e.g. "20:30"
  targetDailyReviews: number;
  dailyNewWords?: number;                // 하루에 새로 배울 단어 수 (기본 10)
  theme?: 'system' | 'light' | 'dark';   // 화면 밝기 테마
}

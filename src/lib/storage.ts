/**
 * Persistent Storage Engine for VocaCurve
 * Supports offline-first IndexedDB / LocalStorage storage with seed data and JSON export/import.
 */

import {
  LanguageCode,
  MemoryState,
  ReviewEvent,
  UserProfile,
  UserSettings,
  VocabularyCollection,
  VocabularyFolder,
  VocabularyItem,
} from '../types/database';
import { createDefaultMemoryState, refreshMemoryState } from './memoryEngine';

const STORAGE_KEYS = {
  PROFILES: 'vocacurve_profiles_v1',
  ACTIVE_USER: 'vocacurve_active_user_id_v1',
  ONBOARDING_DONE: 'vocacurve_onboarding_completed_v1',
  COLLECTIONS: 'vocacurve_collections_v1',
  FOLDERS: 'vocacurve_folders_v1',
  ITEMS: 'vocacurve_items_v1',
  MEMORY_STATES: 'vocacurve_memory_states_v1',
  REVIEW_EVENTS: 'vocacurve_review_events_v1',
  SETTINGS: 'vocacurve_settings_v1',
};

const DEFAULT_SETTINGS: UserSettings = {
  userId: 'user_default',
  userName: '학습자',
  sourceLanguage: 'en',
  targetLanguage: 'ko',
  preferredSessionMode: 'time',
  preferredSessionDuration: 5,
  dailyWordGoal: 20,
  sentenceModeEnabled: false, // Default: "빠른 복습 중심"
  sentenceQuestionRatio: 0.25,
  soundEffects: true,
  audioPronunciation: true,
  gentleReminders: true,
  reminderTime: '20:00',
  targetDailyReviews: 20,
};

// High-quality seed collection & items demonstrating Ebbinghaus curve & progressive levels
const INITIAL_COLLECTIONS: VocabularyCollection[] = [
  {
    id: 'col_essential_advanced',
    name: '핵심 학술 & 비즈니스 어휘',
    description: '토플, 수능, 비즈니스 영어에서 빈출되는 정예 어휘 16선',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    createdAt: Date.now() - 7 * 86400000,
    updatedAt: Date.now(),
    color: '#3B82F6',
  },
  {
    id: 'col_daily_expressions',
    name: '일상 영어 실전 회화',
    description: '원어민들이 자주 사용하는 관용 표현과 동사',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    createdAt: Date.now() - 4 * 86400000,
    updatedAt: Date.now(),
    color: '#10B981',
  },
];

const INITIAL_FOLDERS: VocabularyFolder[] = [
  {
    id: 'folder_adv_day1',
    collectionId: 'col_essential_advanced',
    name: 'Day 1: 학술 기본 어휘',
    description: '논문 및 학술 텍스트 빈출 기본 어휘',
    color: '#3B82F6',
    createdAt: Date.now() - 7 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'folder_adv_day2',
    collectionId: 'col_essential_advanced',
    name: 'Day 2: 고급 논리 어휘',
    description: '추론 및 비판적 사고 고급 어휘',
    color: '#8B5CF6',
    createdAt: Date.now() - 6 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'folder_conv_essential',
    collectionId: 'col_daily_expressions',
    name: 'Day 1: 필수 생활 회화',
    description: '일상에서 매일 쓰는 핵심 회화 단어',
    color: '#10B981',
    createdAt: Date.now() - 4 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'folder_conv_idioms',
    collectionId: 'col_daily_expressions',
    name: 'Day 2: 관용구 & 이디엄',
    description: '원어민 뉘앙스 관용 표현',
    color: '#F59E0B',
    createdAt: Date.now() - 3 * 86400000,
    updatedAt: Date.now(),
  },
];

const INITIAL_ITEMS: VocabularyItem[] = [
  {
    id: 'vocab_derive',
    collectionId: 'col_essential_advanced',
    folderId: 'folder_adv_day1',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    term: 'derive',
    lemma: 'derive',
    partOfSpeech: '동사',
    userMeaning: '유래하다',
    aiSuggestedMeaning: '~에서 비롯되다, (이익 등을) 얻다',
    alternativeMeanings: ['비롯되다', '얻다', '이끌어내다'],
    pronunciation: '/dɪˈraɪv/',
    collocations: ['derive from', 'derive satisfaction', 'derive meaning'],
    exampleSentences: [
      {
        id: 's_derive_1',
        source: 'user',
        en: 'This English word derives from an ancient Latin root.',
        ko: '이 영어 단어는 고대 라틴어 어원에서 유래한다.',
        clozeBlank: 'derives',
      },
      {
        id: 's_derive_2',
        source: 'ai',
        en: 'Many people derive immense joy from helping others.',
        ko: '많은 사람들이 남을 돕는 것에서 큰 기쁨을 얻는다.',
        clozeBlank: 'derive',
      },
    ],
    distractors: ['파괴하다', '증가하다', '방해하다'],
    difficultyEstimate: 3,
    createdAt: Date.now() - 6 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'vocab_mitigate',
    collectionId: 'col_essential_advanced',
    folderId: 'folder_adv_day1',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    term: 'mitigate',
    lemma: 'mitigate',
    partOfSpeech: '동사',
    userMeaning: '완화하다',
    aiSuggestedMeaning: '경감하다, 줄이다',
    alternativeMeanings: ['경감하다', '가볍게 하다', '누그러뜨리다'],
    pronunciation: '/ˈmɪt.ɪ.ɡeɪt/',
    collocations: ['mitigate risks', 'mitigate the impact', 'mitigate effects'],
    exampleSentences: [
      {
        id: 's_mitigate_1',
        source: 'user',
        en: 'The new policy was designed to mitigate economic hardship.',
        ko: '새 정책은 경제적 어려움을 완화하기 위해 설계되었다.',
        clozeBlank: 'mitigate',
      },
      {
        id: 's_mitigate_2',
        source: 'ai',
        en: 'Planting trees can help mitigate the effects of urban heat.',
        ko: '나무를 심는 것은 도시 열섬 현상의 영향을 완화하는 데 도움이 될 수 있다.',
        clozeBlank: 'mitigate',
      },
    ],
    distractors: ['악화시키다', '선택하다', '지속하다'],
    difficultyEstimate: 4,
    createdAt: Date.now() - 5 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'vocab_abandon',
    collectionId: 'col_essential_advanced',
    folderId: 'folder_adv_day1',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    term: 'abandon',
    lemma: 'abandon',
    partOfSpeech: '동사',
    userMeaning: '포기하다',
    aiSuggestedMeaning: '버리다, 떠나다',
    alternativeMeanings: ['버리다', '단념하다', '유기하다'],
    pronunciation: '/əˈbæn.dən/',
    collocations: ['abandon hope', 'abandon an attempt', 'abandon a ship'],
    exampleSentences: [
      {
        id: 's_abandon_1',
        source: 'user',
        en: 'They had to abandon their car in the heavy snowstorm.',
        ko: '그들은 거센 눈보라 속에 차를 버려두고 떠나야 했다.',
        clozeBlank: 'abandon',
      },
    ],
    distractors: ['성공하다', '보호하다', '수락하다'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 5 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'vocab_subtle',
    collectionId: 'col_essential_advanced',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    term: 'subtle',
    lemma: 'subtle',
    partOfSpeech: '형용사',
    userMeaning: '미묘한',
    aiSuggestedMeaning: '감지하기 힘든, 섬세한',
    alternativeMeanings: ['섬세한', '미세한', '교묘한'],
    pronunciation: '/ˈsʌt.əl/',
    collocations: ['subtle difference', 'subtle hint', 'subtle nuance'],
    exampleSentences: [
      {
        id: 's_subtle_1',
        source: 'user',
        en: 'There is a subtle difference between the two definitions.',
        ko: '두 정의 사이에는 미묘한 차이가 있다.',
        clozeBlank: 'subtle',
      },
    ],
    distractors: ['명백한', '거대한', '복잡한'],
    difficultyEstimate: 3,
    createdAt: Date.now() - 4 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'vocab_contemplate',
    collectionId: 'col_essential_advanced',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    term: 'contemplate',
    lemma: 'contemplate',
    partOfSpeech: '동사',
    userMeaning: '심사숙고하다',
    aiSuggestedMeaning: '고려하다, 응시하다',
    alternativeMeanings: ['깊이 생각하다', '고민하다', '바라보다'],
    pronunciation: '/ˈkɒn.təm.pleɪt/',
    collocations: ['contemplate the future', 'contemplate leaving', 'seriously contemplate'],
    exampleSentences: [
      {
        id: 's_contemplate_1',
        source: 'user',
        en: 'She sat by the quiet lake to contemplate her future career.',
        ko: '그녀는 조용한 호숫가에 앉아 자신의 향후 진로를 심사숙고했다.',
        clozeBlank: 'contemplate',
      },
    ],
    distractors: ['즉시 결정하다', '거절하다', '망각하다'],
    difficultyEstimate: 4,
    createdAt: Date.now() - 4 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'vocab_scrutinize',
    collectionId: 'col_essential_advanced',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    term: 'scrutinize',
    lemma: 'scrutinize',
    partOfSpeech: '동사',
    userMeaning: '면밀히 조사하다',
    aiSuggestedMeaning: '세밀하게 검토하다',
    alternativeMeanings: ['철저히 검토하다', '자세히 살피다'],
    pronunciation: '/ˈskruː.tɪ.naɪz/',
    collocations: ['scrutinize the document', 'closely scrutinize', 'scrutinize results'],
    exampleSentences: [
      {
        id: 's_scrutinize_1',
        source: 'user',
        en: 'The auditors will scrutinize every financial transaction.',
        ko: '감사인들은 모든 금융 거래를 면밀히 조사할 것이다.',
        clozeBlank: 'scrutinize',
      },
    ],
    distractors: ['대충 훑어보다', '생략하다', '환영하다'],
    difficultyEstimate: 4,
    createdAt: Date.now() - 3 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'vocab_resilient',
    collectionId: 'col_essential_advanced',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    term: 'resilient',
    lemma: 'resilient',
    partOfSpeech: '형용사',
    userMeaning: '회복력 있는',
    aiSuggestedMeaning: '탄력 있는, 굳센',
    alternativeMeanings: ['탄력적인', '강인한'],
    pronunciation: '/rɪˈzɪl.jənt/',
    collocations: ['resilient economy', 'resilient people', 'highly resilient'],
    exampleSentences: [
      {
        id: 's_resilient_1',
        source: 'user',
        en: 'Children are often remarkably resilient in facing changes.',
        ko: '아이들은 변화를 맞닥뜨렸을 때 종종 놀라울 정도로 회복력이 있다.',
        clozeBlank: 'resilient',
      },
    ],
    distractors: ['연약한', '지루한', '고집스러운'],
    difficultyEstimate: 3,
    createdAt: Date.now() - 3 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'vocab_plausible',
    collectionId: 'col_essential_advanced',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    term: 'plausible',
    lemma: 'plausible',
    partOfSpeech: '형용사',
    userMeaning: '그럴듯한',
    aiSuggestedMeaning: '타당한 것 같은, 그럴싸한',
    alternativeMeanings: ['타당한', '믿을 만한'],
    pronunciation: '/ˈplɔː.zə.bəl/',
    collocations: ['plausible explanation', 'plausible excuse', 'sound plausible'],
    exampleSentences: [
      {
        id: 's_plausible_1',
        source: 'user',
        en: 'His explanation sounded plausible, but we needed more proof.',
        ko: '그의 설명은 그럴듯하게 들렸지만, 우리는 더 많은 증거가 필요했다.',
        clozeBlank: 'plausible',
      },
    ],
    distractors: ['불가능한', '터무니없는', '단순한'],
    difficultyEstimate: 3,
    createdAt: Date.now() - 2 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'vocab_tangible',
    collectionId: 'col_essential_advanced',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    term: 'tangible',
    lemma: 'tangible',
    partOfSpeech: '형용사',
    userMeaning: '유형의, 실질적인',
    aiSuggestedMeaning: '만질 수 있는, 명백한',
    alternativeMeanings: ['실체적인', '구체적인'],
    pronunciation: '/ˈtæn.dʒə.bəl/',
    collocations: ['tangible results', 'tangible assets', 'tangible benefits'],
    exampleSentences: [
      {
        id: 's_tangible_1',
        source: 'user',
        en: 'We need to see tangible progress before making the investment.',
        ko: '우리는 투자를 결정하기 전에 실질적인 성과를 보아야 한다.',
        clozeBlank: 'tangible',
      },
    ],
    distractors: ['가상의', '무형의', '추상적인'],
    difficultyEstimate: 3,
    createdAt: Date.now() - 2 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'vocab_coherent',
    collectionId: 'col_essential_advanced',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    term: 'coherent',
    lemma: 'coherent',
    partOfSpeech: '형용사',
    userMeaning: '일관성 있는',
    aiSuggestedMeaning: '조리 있는, 논리적인',
    alternativeMeanings: ['논리정연한', '일맥상통하는'],
    pronunciation: '/kəʊˈhɪə.rənt/',
    collocations: ['coherent argument', 'coherent strategy', 'coherent system'],
    exampleSentences: [
      {
        id: 's_coherent_1',
        source: 'user',
        en: 'She proposed a coherent strategy to solve the supply chain crisis.',
        ko: '그녀는 공급망 위기를 해결하기 위한 일관성 있는 전략을 제시했다.',
        clozeBlank: 'coherent',
      },
    ],
    distractors: ['모순된', '흩어진', '지연된'],
    difficultyEstimate: 3,
    createdAt: Date.now() - 1 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'vocab_ambiguous',
    collectionId: 'col_essential_advanced',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    term: 'ambiguous',
    lemma: 'ambiguous',
    partOfSpeech: '형용사',
    userMeaning: '모호한',
    aiSuggestedMeaning: '두 가지 뜻으로 해석되는, 분명치 않은',
    alternativeMeanings: ['불분명한', '다의적인'],
    pronunciation: '/æmˈbɪɡ.ju.əs/',
    collocations: ['ambiguous statement', 'ambiguous wording', 'remain ambiguous'],
    exampleSentences: [
      {
        id: 's_ambiguous_1',
        source: 'user',
        en: 'The contract clauses were surprisingly ambiguous.',
        ko: '계약서 조항들이 뜻밖에도 모호했다.',
        clozeBlank: 'ambiguous',
      },
    ],
    distractors: ['명확한', '엄격한', '공평한'],
    difficultyEstimate: 3,
    createdAt: Date.now() - 1 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'vocab_inevitable',
    collectionId: 'col_essential_advanced',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    term: 'inevitable',
    lemma: 'inevitable',
    partOfSpeech: '형용사',
    userMeaning: '불가피한',
    aiSuggestedMeaning: '피할 수 없는, 필연적인',
    alternativeMeanings: ['피할 수 없는', '필연적인'],
    pronunciation: '/ɪnˈev.ɪ.tə.bəl/',
    collocations: ['inevitable outcome', 'inevitable consequence', 'almost inevitable'],
    exampleSentences: [
      {
        id: 's_inevitable_1',
        source: 'user',
        en: 'With rising energy costs, price increases became inevitable.',
        ko: '에너지 비용이 상승함에 따라 가격 인상은 불가피해졌다.',
        clozeBlank: 'inevitable',
      },
    ],
    distractors: ['선택적인', '우연한', '일시적인'],
    difficultyEstimate: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// Generate realistic varied initial memory states for seed items
function generateInitialMemoryStates(items: VocabularyItem[]): MemoryState[] {
  const now = Date.now();
  return items.map((item, idx) => {
    const base = createDefaultMemoryState(item.id);
    if (idx === 0) {
      // derive: strong recognition, moderate production (as per user brief example!)
      return {
        ...base,
        recognitionStability: 8.5,
        productionStability: 3.2,
        recognitionStrength: 94,
        productionStrength: 63,
        lastReviewedAt: now - 1.2 * 86400000,
        nextReviewAt: now + 2.5 * 86400000,
        estimatedRecallProbability: 0.88,
        correctCount: 4,
        wrongCount: 0,
        consecutiveCorrect: 4,
        status: 'retaining',
      };
    } else if (idx === 1) {
      // mitigate: lower recall probability, overdue for review
      return {
        ...base,
        recognitionStability: 1.8,
        productionStability: 0.9,
        recognitionStrength: 52,
        productionStrength: 25,
        lastReviewedAt: now - 3.8 * 86400000,
        nextReviewAt: now - 1.2 * 86400000, // overdue!
        estimatedRecallProbability: 0.43,
        correctCount: 2,
        wrongCount: 1,
        consecutiveCorrect: 0,
        status: 'learning',
      };
    } else if (idx === 3) {
      // subtle: ~55% recall probability
      return {
        ...base,
        recognitionStability: 2.2,
        productionStability: 1.1,
        recognitionStrength: 65,
        productionStrength: 30,
        lastReviewedAt: now - 2.5 * 86400000,
        nextReviewAt: now - 0.4 * 86400000,
        estimatedRecallProbability: 0.55,
        correctCount: 3,
        wrongCount: 1,
        status: 'learning',
      };
    } else if (idx === 4) {
      // contemplate: ~43% recall probability
      return {
        ...base,
        recognitionStability: 1.4,
        productionStability: 0.7,
        recognitionStrength: 45,
        productionStrength: 15,
        lastReviewedAt: now - 2.8 * 86400000,
        nextReviewAt: now - 1.5 * 86400000,
        estimatedRecallProbability: 0.41,
        correctCount: 1,
        wrongCount: 1,
        status: 'learning',
      };
    } else if (idx >= 9) {
      // New words
      return {
        ...base,
        status: 'new',
        estimatedRecallProbability: 0.5,
      };
    } else {
      // General learning words
      return {
        ...base,
        recognitionStability: 3.5,
        productionStability: 1.5,
        recognitionStrength: 70,
        productionStrength: 40,
        lastReviewedAt: now - 1 * 86400000,
        nextReviewAt: now + 0.8 * 86400000,
        estimatedRecallProbability: 0.78,
        correctCount: 2,
        wrongCount: 0,
        status: 'learning',
      };
    }
  });
}

// ================= Japanese Seed Data =================
export const INITIAL_JA_COLLECTIONS: VocabularyCollection[] = [
  {
    id: 'col_ja_essential',
    name: '일본어 필수 기초 & 일상 어휘',
    description: 'JLPT N5~N3 및 일상 회화에서 가장 많이 쓰이는 필수 단어 10선',
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
    createdAt: Date.now() - 7 * 86400000,
    updatedAt: Date.now(),
    color: '#EF4444',
  },
];

export const INITIAL_JA_FOLDERS: VocabularyFolder[] = [
  {
    id: 'folder_ja_verbs',
    collectionId: 'col_ja_essential',
    name: 'Day 1: 핵심 일상 동사',
    description: '매일 사용하는 기본 행동 동사',
    color: '#EF4444',
    createdAt: Date.now() - 7 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'folder_ja_expressions',
    collectionId: 'col_ja_essential',
    name: 'Day 2: 감정 및 일상 표현',
    description: '기분과 소통을 위한 핵심 단어',
    color: '#F59E0B',
    createdAt: Date.now() - 5 * 86400000,
    updatedAt: Date.now(),
  },
];

export const INITIAL_JA_ITEMS: VocabularyItem[] = [
  {
    id: 'ja_vocab_taberu',
    collectionId: 'col_ja_essential',
    folderId: 'folder_ja_verbs',
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
    term: '食べる',
    lemma: '食べる',
    partOfSpeech: '동사',
    userMeaning: '먹다',
    aiSuggestedMeaning: '식사하다',
    pronunciation: 'たべる (taberu)',
    collocations: ['朝ごはんを食べる', '美味しく食べる'],
    exampleSentences: [
      {
        id: 's_ja_taberu_1',
        source: 'user',
        en: '毎日野菜をたくさん食べます。',
        ko: '매일 채소를 많이 먹습니다.',
        clozeBlank: '食べます',
      },
    ],
    distractors: ['마시다', '자다', '가다'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 6 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'ja_vocab_benkyou',
    collectionId: 'col_ja_essential',
    folderId: 'folder_ja_verbs',
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
    term: '勉強',
    lemma: '勉強',
    partOfSpeech: '명사/동사',
    userMeaning: '공부하다, 공부',
    aiSuggestedMeaning: '학습, 배우다',
    pronunciation: 'べんきょう (benkyou)',
    collocations: ['日本語を勉強する', '勉強を続ける'],
    exampleSentences: [
      {
        id: 's_ja_benkyou_1',
        source: 'user',
        en: '図書館で日本語を勉強します。',
        ko: '도서관에서 일본어를 공부합니다.',
        clozeBlank: '勉強',
      },
    ],
    distractors: ['운동', '휴식', '여행'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 6 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'ja_vocab_kansha',
    collectionId: 'col_ja_essential',
    folderId: 'folder_ja_expressions',
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
    term: '感謝',
    lemma: '感謝',
    partOfSpeech: '명사/동사',
    userMeaning: '감사하다, 고마움',
    aiSuggestedMeaning: '감사의 마음',
    pronunciation: 'かんしゃ (kansha)',
    collocations: ['感謝の気持ち', '心から感謝する'],
    exampleSentences: [
      {
        id: 's_ja_kansha_1',
        source: 'user',
        en: 'いつも温かい応援に感謝しています。',
        ko: '항상 따뜻한 응원에 감사하고 있습니다.',
        clozeBlank: '感謝',
      },
    ],
    distractors: ['사과', '거절', '부탁'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 5 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'ja_vocab_shiawase',
    collectionId: 'col_ja_essential',
    folderId: 'folder_ja_expressions',
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
    term: '幸せ',
    lemma: '幸せ',
    partOfSpeech: '형용사',
    userMeaning: '행복하다, 행복',
    aiSuggestedMeaning: '기쁨, 다행',
    pronunciation: 'しあわせ (shiawase)',
    collocations: ['幸せな時間', '幸せを感じる'],
    exampleSentences: [
      {
        id: 's_ja_shiawase_1',
        source: 'user',
        en: '家族と一緒に過ごせて幸せです。',
        ko: '가족과 함께 보낼 수 있어 행복합니다.',
        clozeBlank: '幸せ',
      },
    ],
    distractors: ['슬픔', '화남', '피곤함'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 5 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'ja_vocab_sanpo',
    collectionId: 'col_ja_essential',
    folderId: 'folder_ja_verbs',
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
    term: '散歩',
    lemma: '散歩',
    partOfSpeech: '명사/동사',
    userMeaning: '산책하다, 산책',
    aiSuggestedMeaning: '가벼운 걷기',
    pronunciation: 'さんぽ (sanpo)',
    collocations: ['公園を散歩する', '朝の散歩'],
    exampleSentences: [
      {
        id: 's_ja_sanpo_1',
        source: 'user',
        en: '毎朝公園を散歩するのが日課です。',
        ko: '매일 아침 공원을 산책하는 것이 일과입니다.',
        clozeBlank: '散歩',
      },
    ],
    distractors: ['달리기', '잠자기', '요리하기'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 4 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'ja_vocab_yakusoku',
    collectionId: 'col_ja_essential',
    folderId: 'folder_ja_verbs',
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
    term: '約束',
    lemma: '約束',
    partOfSpeech: '명사/동사',
    userMeaning: '약속하다, 약속',
    aiSuggestedMeaning: '다짐',
    pronunciation: 'やくそく (yakusoku)',
    collocations: ['約束を守る', '友達と約束する'],
    exampleSentences: [
      {
        id: 's_ja_yakusoku_1',
        source: 'user',
        en: '明日友達と会う約束があります。',
        ko: '내일 친구와 만날 약속이 있습니다.',
        clozeBlank: '約束',
      },
    ],
    distractors: ['취소', '이별', '거짓말'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 4 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'ja_vocab_shuukan',
    collectionId: 'col_ja_essential',
    folderId: 'folder_ja_expressions',
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
    term: '習慣',
    lemma: '習慣',
    partOfSpeech: '명사',
    userMeaning: '습관, 버릇',
    aiSuggestedMeaning: '관습',
    pronunciation: 'しゅうかん (shuukan)',
    collocations: ['良い習慣', '習慣をつける'],
    exampleSentences: [
      {
        id: 's_ja_shuukan_1',
        source: 'user',
        en: '読書はとても良い習慣です。',
        ko: '독서는 매우 좋은 습관입니다.',
        clozeBlank: '習慣',
      },
    ],
    distractors: ['우연', '기적', '계획'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 3 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'ja_vocab_egao',
    collectionId: 'col_ja_essential',
    folderId: 'folder_ja_expressions',
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
    term: '笑顔',
    lemma: '笑顔',
    partOfSpeech: '명사',
    userMeaning: '미소, 웃는 얼굴',
    aiSuggestedMeaning: '웃음',
    pronunciation: 'えがお (egao)',
    collocations: ['笑顔を絶やさない', '素敵な笑顔'],
    exampleSentences: [
      {
        id: 's_ja_egao_1',
        source: 'user',
        en: '彼女の笑顔はみんなを明るくします。',
        ko: '그녀의 미소는 모두를 밝게 만듭니다.',
        clozeBlank: '笑顔',
      },
    ],
    distractors: ['눈물', '한숨', '침묵'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 3 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'ja_vocab_taisetsu',
    collectionId: 'col_ja_essential',
    folderId: 'folder_ja_expressions',
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
    term: '大切',
    lemma: '大切',
    partOfSpeech: '형용사',
    userMeaning: '소중하다, 중요함',
    aiSuggestedMeaning: '귀중함, 아끼다',
    pronunciation: 'たいせつ (taisetsu)',
    collocations: ['大切な人', '時間を大切にする'],
    exampleSentences: [
      {
        id: 's_ja_taisetsu_1',
        source: 'user',
        en: '健康は何よりも大切です。',
        ko: '건강은 무엇보다도 소중합니다.',
        clozeBlank: '大切',
      },
    ],
    distractors: ['위험함', '하찮음', '불안함'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 2 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'ja_vocab_chousen',
    collectionId: 'col_ja_essential',
    folderId: 'folder_ja_verbs',
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
    term: '挑戦',
    lemma: '挑戦',
    partOfSpeech: '명사/동사',
    userMeaning: '도전하다, 도전',
    aiSuggestedMeaning: '시도하다',
    pronunciation: 'ちょうせん (chousen)',
    collocations: ['新しい挑戦', '限界に挑戦する'],
    exampleSentences: [
      {
        id: 's_ja_chousen_1',
        source: 'user',
        en: '新しい目標に向かって挑戦します。',
        ko: '새로운 목표를 향해 도전합니다.',
        clozeBlank: '挑戦',
      },
    ],
    distractors: ['포기', '후퇴', '방관'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 2 * 86400000,
    updatedAt: Date.now(),
  },
];

// ================= Hebrew (히브리어) Seed Data =================
export const INITIAL_HE_COLLECTIONS: VocabularyCollection[] = [
  {
    id: 'col_he_essential',
    name: '성서 & 기초 히브리어 필수 어휘',
    description: '구약 성서 원문 및 기초 히브리어 필수 정예 단어 10선',
    sourceLanguage: 'he',
    targetLanguage: 'ko',
    createdAt: Date.now() - 7 * 86400000,
    updatedAt: Date.now(),
    color: '#0284C7',
  },
];

export const INITIAL_HE_FOLDERS: VocabularyFolder[] = [
  {
    id: 'folder_he_basic',
    name: 'Day 1: 성서 핵심 기본 명사',
    collectionId: 'col_he_essential',
    description: '가장 빈출되는 창세기 및 성서 핵심 명사',
    color: '#0284C7',
    createdAt: Date.now() - 7 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'folder_he_life',
    name: 'Day 2: 핵심 관용 어휘 및 품사',
    collectionId: 'col_he_essential',
    description: '평화, 언약, 인애 등 중요 신학적 어휘',
    color: '#F59E0B',
    createdAt: Date.now() - 5 * 86400000,
    updatedAt: Date.now(),
  },
];

export const INITIAL_HE_ITEMS: VocabularyItem[] = [
  {
    id: 'he_vocab_shalom',
    collectionId: 'col_he_essential',
    folderId: 'folder_he_life',
    sourceLanguage: 'he',
    targetLanguage: 'ko',
    term: 'שָׁלוֹם',
    lemma: 'שלום',
    partOfSpeech: '명사',
    userMeaning: '평화, 안녕, 온전함',
    aiSuggestedMeaning: '평강, 번영, 안식',
    pronunciation: '샬롬 [ʃaˈlom]',
    exampleSentences: [
      {
        id: 's_he_shalom_1',
        source: 'user',
        en: 'שָׁלוֹם עֲלֵיכֶם',
        ko: '너희에게 평강(샬롬)이 있을지어다.',
        clozeBlank: 'שָׁלוֹם',
      },
    ],
    distractors: ['전쟁', '분노', '슬픔'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 6 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'he_vocab_bereshit',
    collectionId: 'col_he_essential',
    folderId: 'folder_he_basic',
    sourceLanguage: 'he',
    targetLanguage: 'ko',
    term: 'בְּרֵאשִׁית',
    lemma: 'ראשית',
    partOfSpeech: '부사/명사',
    userMeaning: '태초에, 시작에',
    aiSuggestedMeaning: '맨 처음에, 시초에',
    pronunciation: '베레쉬트 [bərɛˈʃit]',
    exampleSentences: [
      {
        id: 's_he_bereshit_1',
        source: 'user',
        en: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים',
        ko: '태초에 하나님이 창조하시니라.',
        clozeBlank: 'בְּרֵאשִׁית',
      },
    ],
    distractors: ['마지막에', '영원히', '지금'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 6 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'he_vocab_elohim',
    collectionId: 'col_he_essential',
    folderId: 'folder_he_basic',
    sourceLanguage: 'he',
    targetLanguage: 'ko',
    term: 'אֱלֹהִים',
    lemma: 'אלוהים',
    partOfSpeech: '명사',
    userMeaning: '하나님, 신',
    aiSuggestedMeaning: '창조주, 신격',
    pronunciation: '엘로힘 [ʔɛloˈhim]',
    exampleSentences: [
      {
        id: 's_he_elohim_1',
        source: 'user',
        en: 'וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר',
        ko: '하나님이 이르시되 빛이 있으라 하시니',
        clozeBlank: 'אֱלֹהִים',
      },
    ],
    distractors: ['인간', '천사', '피조물'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 5 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'he_vocab_chesed',
    collectionId: 'col_he_essential',
    folderId: 'folder_he_life',
    sourceLanguage: 'he',
    targetLanguage: 'ko',
    term: 'חֶסֶד',
    lemma: 'חסד',
    partOfSpeech: '명사',
    userMeaning: '인애, 자비, 은혜',
    aiSuggestedMeaning: '불변의 사랑, 헤세드',
    pronunciation: '헤세드 [ˈxɛsɛd]',
    exampleSentences: [
      {
        id: 's_he_chesed_1',
        source: 'user',
        en: 'כִּי לְעוֹלָם חַסְדּוֹ',
        ko: '그의 인자하심(헤세드)이 영원함이로다.',
        clozeBlank: 'חַסְדּוֹ',
      },
    ],
    distractors: ['심판', '거짓', '형벌'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 5 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'he_vocab_davar',
    collectionId: 'col_he_essential',
    folderId: 'folder_he_life',
    sourceLanguage: 'he',
    targetLanguage: 'ko',
    term: 'דָּבָר',
    lemma: 'דבר',
    partOfSpeech: '명사',
    userMeaning: '말씀, 일, 사건',
    aiSuggestedMeaning: '말, 이야기, 사물',
    pronunciation: '다바르 [daˈvar]',
    exampleSentences: [
      {
        id: 's_he_davar_1',
        source: 'user',
        en: 'דְּבַר־יְהוָה הָיָה',
        ko: '여호와의 말씀이 임하니라.',
        clozeBlank: 'דְּבַר',
      },
    ],
    distractors: ['침묵', '어둠', '눈물'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 4 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'he_vocab_yom',
    collectionId: 'col_he_essential',
    folderId: 'folder_he_basic',
    sourceLanguage: 'he',
    targetLanguage: 'ko',
    term: 'יוֹם',
    lemma: 'יום',
    partOfSpeech: '명사',
    userMeaning: '날, 하루, 낮',
    aiSuggestedMeaning: '시대, 일자',
    pronunciation: '욤 [jom]',
    exampleSentences: [
      {
        id: 's_he_yom_1',
        source: 'user',
        en: 'וַיְהִי־עֶרֶב וַיְהִי־בֹקֶר יוֹם אֶחָד',
        ko: '저녁이 되고 아침이 되니 이는 첫째 날이니라.',
        clozeBlank: 'יוֹם',
      },
    ],
    distractors: ['밤', '달', '해'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 4 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'he_vocab_bayit',
    collectionId: 'col_he_essential',
    folderId: 'folder_he_basic',
    sourceLanguage: 'he',
    targetLanguage: 'ko',
    term: 'בַּיִת',
    lemma: 'בית',
    partOfSpeech: '명사',
    userMeaning: '집, 가문, 성전',
    aiSuggestedMeaning: '거처, 가옥',
    pronunciation: '바이트 [ˈbajit]',
    exampleSentences: [
      {
        id: 's_he_bayit_1',
        source: 'user',
        en: 'בֵּית יְהוָה',
        ko: '여호와의 성전(집)',
        clozeBlank: 'בֵּית',
      },
    ],
    distractors: ['들판', '바다', '광야'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 3 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'he_vocab_melekh',
    collectionId: 'col_he_essential',
    folderId: 'folder_he_life',
    sourceLanguage: 'he',
    targetLanguage: 'ko',
    term: 'מֶלֶךְ',
    lemma: 'מלך',
    partOfSpeech: '명사',
    userMeaning: '왕, 통치자',
    aiSuggestedMeaning: '군주',
    pronunciation: '멜레크 [ˈmɛlɛx]',
    exampleSentences: [
      {
        id: 's_he_melekh_1',
        source: 'user',
        en: 'יְהוָה מֶלֶךְ לְעוֹלָם וָעֶד',
        ko: '여호와께서 영원무궁하도록 왕이시로다.',
        clozeBlank: 'מֶלֶךְ',
      },
    ],
    distractors: ['종', '군인', '백성'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 3 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'he_vocab_eretz',
    collectionId: 'col_he_essential',
    folderId: 'folder_he_basic',
    sourceLanguage: 'he',
    targetLanguage: 'ko',
    term: 'אֶרֶץ',
    lemma: 'ארץ',
    partOfSpeech: '명사',
    userMeaning: '땅, 세상, 흙',
    aiSuggestedMeaning: '토지, 대지',
    pronunciation: '에레츠 [ˈʔɛrɛts]',
    exampleSentences: [
      {
        id: 's_he_eretz_1',
        source: 'user',
        en: 'אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ',
        ko: '천지(하늘과 땅)를 창조하시니라.',
        clozeBlank: 'הָאָרֶץ',
      },
    ],
    distractors: ['하늘', '바다', '태양'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 2 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'he_vocab_av',
    collectionId: 'col_he_essential',
    folderId: 'folder_he_basic',
    sourceLanguage: 'he',
    targetLanguage: 'ko',
    term: 'אָב',
    lemma: 'אב',
    partOfSpeech: '명사',
    userMeaning: '아버지, 조상',
    aiSuggestedMeaning: '부친, 선조',
    pronunciation: '아브 [ʔav]',
    exampleSentences: [
      {
        id: 's_he_av_1',
        source: 'user',
        en: 'אָבִינוּ שֶׁבַּשָּׁמַיִם',
        ko: '하늘에 계신 우리 아버지',
        clozeBlank: 'אָבִינוּ',
      },
    ],
    distractors: ['아들', '어머니', '형제'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 2 * 86400000,
    updatedAt: Date.now(),
  },
];

// ================= Greek (헬라어 / 코이네) Seed Data =================
export const INITIAL_EL_COLLECTIONS: VocabularyCollection[] = [
  {
    id: 'col_el_essential',
    name: '코이네 & 신약 헬라어 필수 어휘',
    description: '신약 성서 원문 및 고전 그리스어 빈출 핵심 어휘 10선',
    sourceLanguage: 'el',
    targetLanguage: 'ko',
    createdAt: Date.now() - 7 * 86400000,
    updatedAt: Date.now(),
    color: '#2563EB',
  },
];

export const INITIAL_EL_FOLDERS: VocabularyFolder[] = [
  {
    id: 'folder_el_faith',
    name: 'Day 1: 신약 성서 핵심 신앙 어휘',
    collectionId: 'col_el_essential',
    description: '아가페, 로고스, 은혜 등 가장 중요한 헬라어 개념',
    color: '#2563EB',
    createdAt: Date.now() - 7 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'folder_el_truth',
    name: 'Day 2: 진리와 생명 어휘',
    collectionId: 'col_el_essential',
    description: '생명, 평화, 믿음, 진리 핵심 어휘',
    color: '#10B981',
    createdAt: Date.now() - 5 * 86400000,
    updatedAt: Date.now(),
  },
];

export const INITIAL_EL_ITEMS: VocabularyItem[] = [
  {
    id: 'el_vocab_agape',
    collectionId: 'col_el_essential',
    folderId: 'folder_el_faith',
    sourceLanguage: 'el',
    targetLanguage: 'ko',
    term: 'ἀγάπη',
    lemma: 'ἀγάπη',
    partOfSpeech: '명사',
    userMeaning: '사랑, 아가페, 헌신',
    aiSuggestedMeaning: '무조건적인 사랑, 자애',
    pronunciation: '아가페 [aˈɣa.pi]',
    exampleSentences: [
      {
        id: 's_el_agape_1',
        source: 'user',
        en: 'ἡ ἀγάπη οὐδέποτε πίπτει.',
        ko: '사랑(아가페)은 언제까지나 떨어지지 아니하되.',
        clozeBlank: 'ἀγάπη',
      },
    ],
    distractors: ['미움', '두려움', '시기'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 6 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'el_vocab_logos',
    collectionId: 'col_el_essential',
    folderId: 'folder_el_faith',
    sourceLanguage: 'el',
    targetLanguage: 'ko',
    term: 'λόγος',
    lemma: 'λόγος',
    partOfSpeech: '명사',
    userMeaning: '말씀, 로고스, 이성',
    aiSuggestedMeaning: '도(道), 교리, 진리의 말씀',
    pronunciation: '로고스 [ˈlo.ɣos]',
    exampleSentences: [
      {
        id: 's_el_logos_1',
        source: 'user',
        en: 'Ἐν ἀρχῇ ἦν ὁ λόγος.',
        ko: '태초에 말씀(로고스)이 계시니라.',
        clozeBlank: 'λόγος',
      },
    ],
    distractors: ['침묵', '거짓', '소문'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 6 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'el_vocab_charis',
    collectionId: 'col_el_essential',
    folderId: 'folder_el_faith',
    sourceLanguage: 'el',
    targetLanguage: 'ko',
    term: 'χάρις',
    lemma: 'χάρις',
    partOfSpeech: '명사',
    userMeaning: '은혜, 카리스, 호의',
    aiSuggestedMeaning: '거저 주는 사랑, 감사',
    pronunciation: '카리스 [ˈxa.ris]',
    exampleSentences: [
      {
        id: 's_el_charis_1',
        source: 'user',
        en: 'τῇ γὰρ χάριτί ἐστε σεσῳσμένοι.',
        ko: '너희는 그 은혜에 의하여 구원을 받았으니.',
        clozeBlank: 'χάριτι',
      },
    ],
    distractors: ['공로', '형벌', '빚'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 5 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'el_vocab_eirene',
    collectionId: 'col_el_essential',
    folderId: 'folder_el_truth',
    sourceLanguage: 'el',
    targetLanguage: 'ko',
    term: 'εἰρήνη',
    lemma: 'εἰρήνη',
    partOfSpeech: '명사',
    userMeaning: '평화, 에이레네, 화평',
    aiSuggestedMeaning: '평안, 안식, 고요',
    pronunciation: '에이레네 [iˈri.ni]',
    exampleSentences: [
      {
        id: 's_el_eirene_1',
        source: 'user',
        en: 'εἰρήνην ἀφίημι ὑμῖν.',
        ko: '평안(에이레네)을 너희에게 끼치노니.',
        clozeBlank: 'εἰρήνην',
      },
    ],
    distractors: ['혼란', '전쟁', '다툼'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 5 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'el_vocab_zoe',
    collectionId: 'col_el_essential',
    folderId: 'folder_el_truth',
    sourceLanguage: 'el',
    targetLanguage: 'ko',
    term: 'ζωή',
    lemma: 'ζωή',
    partOfSpeech: '명사',
    userMeaning: '생명, 조에, 삶',
    aiSuggestedMeaning: '영원한 생명, 존재',
    pronunciation: '조에 [zoˈi]',
    exampleSentences: [
      {
        id: 's_el_zoe_1',
        source: 'user',
        en: 'ἐγώ εἰμι ἡ ὁδὸς καὶ ἡ ἀλήθεια καὶ ἡ ζωή.',
        ko: '내가 곧 길이요 진리요 생명(조에)이니.',
        clozeBlank: 'ζωή',
      },
    ],
    distractors: ['죽음', '질병', '파멸'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 4 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'el_vocab_pistis',
    collectionId: 'col_el_essential',
    folderId: 'folder_el_truth',
    sourceLanguage: 'el',
    targetLanguage: 'ko',
    term: 'πίστις',
    lemma: 'πίστις',
    partOfSpeech: '명사',
    userMeaning: '믿음, 피스티스, 신뢰',
    aiSuggestedMeaning: '확신, 충성',
    pronunciation: '피스티스 [ˈpis.tis]',
    exampleSentences: [
      {
        id: 's_el_pistis_1',
        source: 'user',
        en: 'ὁ δὲ δίκαιος ἐκ πίστεως ζήσεται.',
        ko: '의인은 오직 믿음(피스티스)으로 살리라.',
        clozeBlank: 'πίστεως',
      },
    ],
    distractors: ['의심', '불신', '배신'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 4 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'el_vocab_theos',
    collectionId: 'col_el_essential',
    folderId: 'folder_el_faith',
    sourceLanguage: 'el',
    targetLanguage: 'ko',
    term: 'θεός',
    lemma: 'θεός',
    partOfSpeech: '명사',
    userMeaning: '하나님, 테오스, 신',
    aiSuggestedMeaning: '창조주, 신격',
    pronunciation: '테오스 [θeˈos]',
    exampleSentences: [
      {
        id: 's_el_theos_1',
        source: 'user',
        en: 'ὁ θεὸς ἀγάπη ἐστίν.',
        ko: '하나님은 사랑이시라.',
        clozeBlank: 'θεὸς',
      },
    ],
    distractors: ['우상', '피조물', '인간'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 3 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'el_vocab_aletheia',
    collectionId: 'col_el_essential',
    folderId: 'folder_el_truth',
    sourceLanguage: 'el',
    targetLanguage: 'ko',
    term: 'ἀλήθεια',
    lemma: 'ἀλήθεια',
    partOfSpeech: '명사',
    userMeaning: '진리, 알레테이아, 참됨',
    aiSuggestedMeaning: '실재, 사실',
    pronunciation: '알레테이아 [aˈli.θi.a]',
    exampleSentences: [
      {
        id: 's_el_aletheia_1',
        source: 'user',
        en: 'γνώσεσθε τὴν ἀλήθειαν, καὶ ἡ ἀλήθεια ἐλευθερώσει ὑμᾶς.',
        ko: '진리(알레테이아)를 알지니 진리가 너희를 자유롭게 하리라.',
        clozeBlank: 'ἀλήθειαν',
      },
    ],
    distractors: ['거짓', '허상', '속임'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 3 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'el_vocab_phos',
    collectionId: 'col_el_essential',
    folderId: 'folder_el_truth',
    sourceLanguage: 'el',
    targetLanguage: 'ko',
    term: 'φῶς',
    lemma: 'φῶς',
    partOfSpeech: '명사',
    userMeaning: '빛, 포스, 밝음',
    aiSuggestedMeaning: '광명, 비춤',
    pronunciation: '포스 [fos]',
    exampleSentences: [
      {
        id: 's_el_phos_1',
        source: 'user',
        en: 'ἐγώ εἰμι τὸ φῶς τοῦ κόσμου.',
        ko: '나는 세상의 빛(포스)이니.',
        clozeBlank: 'φῶς',
      },
    ],
    distractors: ['어둠', '그늘', '밤'],
    difficultyEstimate: 1,
    createdAt: Date.now() - 2 * 86400000,
    updatedAt: Date.now(),
  },
  {
    id: 'el_vocab_kardia',
    collectionId: 'col_el_essential',
    folderId: 'folder_el_faith',
    sourceLanguage: 'el',
    targetLanguage: 'ko',
    term: 'καρδία',
    lemma: 'καρδία',
    partOfSpeech: '명사',
    userMeaning: '마음, 카르디아, 심장',
    aiSuggestedMeaning: '중심, 영혼',
    pronunciation: '카르디아 [karˈði.a]',
    exampleSentences: [
      {
        id: 's_el_kardia_1',
        source: 'user',
        en: 'μακάριοι οἱ καθαροὶ τῇ καρδίᾳ.',
        ko: '마음(카르디아)이 청결한 자는 복이 있나니.',
        clozeBlank: 'καρδίᾳ',
      },
    ],
    distractors: ['외모', '육체', '손'],
    difficultyEstimate: 2,
    createdAt: Date.now() - 2 * 86400000,
    updatedAt: Date.now(),
  },
];

// ================= Multi-User Profile Management =================
export function getActiveProfileId(): string {
  if (typeof window === 'undefined') return 'user_default';
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_USER) || 'user_default';
}

export function setActiveProfileId(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, userId);
}

export function getUserScopedKey(baseKey: string, userId?: string): string {
  const uid = userId || getActiveProfileId();
  if (uid === 'user_default') {
    return baseKey; // Backwards compatible with existing single-user keys
  }
  return `${baseKey}_${uid}`;
}

export function getProfiles(): UserProfile[] {
  const defaultProfile: UserProfile = {
    id: 'user_default',
    name: '학습자 1',
    targetLanguage: 'en',
    createdAt: Date.now(),
    avatarColor: '#4F46E5',
  };
  const list = getJson<UserProfile[]>(STORAGE_KEYS.PROFILES, [defaultProfile]);
  if (!list || list.length === 0) {
    setJson(STORAGE_KEYS.PROFILES, [defaultProfile]);
    return [defaultProfile];
  }
  return list;
}

export function getActiveProfile(): UserProfile {
  const activeId = getActiveProfileId();
  const profiles = getProfiles();
  const found = profiles.find(p => p.id === activeId);
  return found || profiles[0] || {
    id: 'user_default',
    name: '학습자 1',
    targetLanguage: 'en',
    createdAt: Date.now(),
    avatarColor: '#4F46E5',
  };
}

export function getWordCountForProfile(profileId: string): number {
  const itemsKey = getUserScopedKey(STORAGE_KEYS.ITEMS, profileId);
  const items = getJson<VocabularyItem[] | null>(itemsKey, null);
  if (!items) {
    const profile = getProfiles().find(p => p.id === profileId);
    return getInitialSeedDataForLanguage(profile?.targetLanguage).items.length;
  }
  return items.length;
}

export function getInitialSeedDataForLanguage(lang?: LanguageCode) {
  if (lang === 'ja') {
    return {
      collections: INITIAL_JA_COLLECTIONS,
      folders: INITIAL_JA_FOLDERS,
      items: INITIAL_JA_ITEMS,
    };
  } else if (lang === 'he') {
    return {
      collections: INITIAL_HE_COLLECTIONS,
      folders: INITIAL_HE_FOLDERS,
      items: INITIAL_HE_ITEMS,
    };
  } else if (lang === 'el') {
    return {
      collections: INITIAL_EL_COLLECTIONS,
      folders: INITIAL_EL_FOLDERS,
      items: INITIAL_EL_ITEMS,
    };
  }
  return {
    collections: INITIAL_COLLECTIONS,
    folders: INITIAL_FOLDERS,
    items: INITIAL_ITEMS,
  };
}

export function createProfile(name: string, targetLanguage: LanguageCode = 'ja'): UserProfile {
  const profiles = getProfiles();
  const newId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const colors = ['#4F46E5', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EC4899', '#0284C7', '#2563EB'];
  const avatarColor = colors[profiles.length % colors.length];

  const newProfile: UserProfile = {
    id: newId,
    name: name.trim() || `학습자 ${profiles.length + 1}`,
    targetLanguage,
    createdAt: Date.now(),
    avatarColor,
  };

  profiles.push(newProfile);
  setJson(STORAGE_KEYS.PROFILES, profiles);
  setActiveProfileId(newId);

  // Initialize seed dataset matching the chosen language
  const seed = getInitialSeedDataForLanguage(targetLanguage);
  setJson(getUserScopedKey(STORAGE_KEYS.COLLECTIONS, newId), seed.collections);
  setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS, newId), seed.folders);
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS, newId), seed.items);
  setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES, newId), generateInitialMemoryStates(seed.items));

  const userSettings: UserSettings = {
    ...DEFAULT_SETTINGS,
    userId: newId,
    userName: newProfile.name,
    sourceLanguage: targetLanguage,
    targetLanguage: 'ko',
  };
  setJson(getUserScopedKey(STORAGE_KEYS.SETTINGS, newId), userSettings);

  return newProfile;
}

export function updateProfile(id: string, updates: Partial<UserProfile>): UserProfile {
  const profiles = getProfiles();
  const index = profiles.findIndex(p => p.id === id);
  if (index >= 0) {
    profiles[index] = { ...profiles[index], ...updates };
    setJson(STORAGE_KEYS.PROFILES, profiles);

    // Sync settings if active user
    if (id === getActiveProfileId()) {
      const currentSettings = getUserSettings();
      const updatedSettings: UserSettings = {
        ...currentSettings,
        ...(updates.name ? { userName: updates.name } : {}),
        ...(updates.targetLanguage ? { sourceLanguage: updates.targetLanguage } : {}),
      };
      setJson(getUserScopedKey(STORAGE_KEYS.SETTINGS, id), updatedSettings);
    }
    return profiles[index];
  }
  return getActiveProfile();
}

export function deleteProfile(id: string): void {
  const profiles = getProfiles();
  if (profiles.length <= 1) {
    return; // Don't delete the last profile
  }
  const filtered = profiles.filter(p => p.id !== id);
  setJson(STORAGE_KEYS.PROFILES, filtered);

  // Remove data keys if scoped
  if (id !== 'user_default' && typeof window !== 'undefined') {
    localStorage.removeItem(getUserScopedKey(STORAGE_KEYS.COLLECTIONS, id));
    localStorage.removeItem(getUserScopedKey(STORAGE_KEYS.FOLDERS, id));
    localStorage.removeItem(getUserScopedKey(STORAGE_KEYS.ITEMS, id));
    localStorage.removeItem(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES, id));
    localStorage.removeItem(getUserScopedKey(STORAGE_KEYS.REVIEW_EVENTS, id));
    localStorage.removeItem(getUserScopedKey(STORAGE_KEYS.SETTINGS, id));
  }

  if (getActiveProfileId() === id) {
    setActiveProfileId(filtered[0].id);
  }
}

export function hasCompletedOnboarding(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE) === 'true';
}

export function completeOnboarding(name: string, targetLanguage: LanguageCode = 'ja'): UserProfile {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
  }
  const activeProfile = getActiveProfile();
  // Update active profile
  const updated = updateProfile(activeProfile.id, {
    name: name.trim() || '학습자 1',
    targetLanguage,
  });

  // If initial user chose a non-English language and has default English items, switch to target language dataset
  if (targetLanguage !== 'en') {
    const currentItems = getVocabularyItems();
    if (currentItems.length <= 16 && currentItems.every(i => i.sourceLanguage === 'en')) {
      const seed = getInitialSeedDataForLanguage(targetLanguage);
      setJson(getUserScopedKey(STORAGE_KEYS.COLLECTIONS), seed.collections);
      setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), seed.folders);
      setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), seed.items);
      setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), generateInitialMemoryStates(seed.items));
    }
  }

  return updated;
}

// Local storage helpers with fallback
function getJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn(`Failed to read ${key} from storage:`, e);
    return fallback;
  }
}

function setJson<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`Failed to write ${key} to storage:`, e);
  }
}

/**
 * Initialize storage with default seed data if not yet present
 */
export function initializeStorageIfNeeded(): void {
  // Ensure profiles list is initialized
  getProfiles();
  const activeProfile = getActiveProfile();

  const colKey = getUserScopedKey(STORAGE_KEYS.COLLECTIONS);
  const existingCollections = getJson<VocabularyCollection[] | null>(colKey, null);

  if (!existingCollections || existingCollections.length === 0) {
    if (activeProfile.targetLanguage === 'ja') {
      setJson(colKey, INITIAL_JA_COLLECTIONS);
      setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), INITIAL_JA_FOLDERS);
      setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), INITIAL_JA_ITEMS);
      setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), generateInitialMemoryStates(INITIAL_JA_ITEMS));
    } else {
      setJson(colKey, INITIAL_COLLECTIONS);
      setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), INITIAL_FOLDERS);
      setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), INITIAL_ITEMS);
      setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), generateInitialMemoryStates(INITIAL_ITEMS));
    }
    const initialSettings: UserSettings = {
      ...DEFAULT_SETTINGS,
      userId: activeProfile.id,
      userName: activeProfile.name,
      sourceLanguage: activeProfile.targetLanguage || 'en',
    };
    setJson(getUserScopedKey(STORAGE_KEYS.SETTINGS), initialSettings);
  } else {
    // Ensure folders exist if collections were already saved
    const fldKey = getUserScopedKey(STORAGE_KEYS.FOLDERS);
    const existingFolders = getJson<VocabularyFolder[] | null>(fldKey, null);
    if (!existingFolders || existingFolders.length === 0) {
      setJson(fldKey, activeProfile.targetLanguage === 'ja' ? INITIAL_JA_FOLDERS : INITIAL_FOLDERS);
    }
    // Auto-repair any distorted or corrupted words in storage
    cleanAndRepairVocabulary();
  }
}

/**
 * Automatically repairs and cleans corrupted/distorted words in storage:
 * - Fixes words with trailing symbols (e.g. "derive -", "apple :")
 * - Swaps reversed words (where Korean was stored in term and English in meaning)
 * - Strips numbering prefixes (e.g. "1. derive", "[1] apple")
 * - Extracts IPA pronunciation from term (e.g. "derive /dɪˈraɪv/")
 * - Extracts POS tags like (v.) or [동사] from term
 * - Filters out invalid items (e.g. pure numbers like "1", "2")
 * - Deduplicates identical terms within the same collection
 */
export function cleanAndRepairVocabulary(): { repairedCount: number; removedCount: number } {
  const itemsKey = getUserScopedKey(STORAGE_KEYS.ITEMS);
  const items = getJson<VocabularyItem[]>(itemsKey, INITIAL_ITEMS);
  const cleaned: VocabularyItem[] = [];
  const seenKeys = new Set<string>();
  let repairedCount = 0;
  let removedCount = 0;

  for (const item of items) {
    let term = (item.term || '').trim();
    let meaning = (item.userMeaning || '').trim();
    let partOfSpeech = item.partOfSpeech;
    let pronunciation = item.pronunciation;
    let changed = false;

    // 1. Check if term and meaning were inverted (Korean in term, Foreign in meaning)
    const foreignRegex = /[a-zA-Z\u00C0-\u024F\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF]/;
    const isTermKorean = /[가-힣]/.test(term) && !foreignRegex.test(term);
    const isMeaningForeign = foreignRegex.test(meaning) && !/[가-힣]/.test(meaning);
    if (isTermKorean && isMeaningForeign) {
      const temp = term;
      term = meaning;
      meaning = temp;
      changed = true;
    }

    // 2. Remove number prefixes: "1. derive" -> "derive"
    const cleanedNumberTerm = term
      .replace(/^(?:no\.?\s*)?[0-9]+[.)\-:\s]+/i, '')
      .replace(/^[(\[]\s*[0-9]+\s*[)\]]\s*/, '')
      .trim();
    if (cleanedNumberTerm !== term && cleanedNumberTerm.length > 0) {
      term = cleanedNumberTerm;
      changed = true;
    }

    // 3. Extract pronunciation if in term: e.g. "derive /dɪˈraɪv/"
    const pronMatch = /\/([^/]+)\//.exec(term);
    if (pronMatch) {
      pronunciation = `/${pronMatch[1].trim()}/`;
      term = term.replace(pronMatch[0], ' ').trim();
      changed = true;
    }

    // 4. Extract POS if in term: e.g. "derive [동사]" or "apple (n.)"
    const posPatterns = [
      { regex: /(?:\(|\[)\s*(?:동사|동|v\.?|verb|vi|vt)\s*(?:\)|\])|(?:\b|(?<=\s))(?:v\.|verb)(?:\b|(?=\s))/i, pos: '동사' },
      { regex: /(?:\(|\[)\s*(?:명사|명|n\.?|noun)\s*(?:\)|\])|(?:\b|(?<=\s))(?:n\.|noun)(?:\b|(?=\s))/i, pos: '명사' },
      { regex: /(?:\(|\[)\s*(?:형용사|형|a\.?|adj\.?|adjective)\s*(?:\)|\])|(?:\b|(?<=\s))(?:adj\.|adjective)(?:\b|(?=\s))/i, pos: '형용사' },
      { regex: /(?:\(|\[)\s*(?:부사|부|adv\.?|adverb)\s*(?:\)|\])|(?:\b|(?<=\s))(?:adv\.|adverb)(?:\b|(?=\s))/i, pos: '부사' },
      { regex: /(?:\(|\[)\s*(?:전치사|prep\.?|preposition)\s*(?:\)|\])|(?:\b|(?<=\s))(?:prep\.|preposition)(?:\b|(?=\s))/i, pos: '전치사' },
      { regex: /(?:\(|\[)\s*(?:접속사|conj\.?|conjunction)\s*(?:\)|\])|(?:\b|(?<=\s))(?:conj\.|conjunction)(?:\b|(?=\s))/i, pos: '접속사' },
    ];
    for (const { regex, pos } of posPatterns) {
      if (regex.test(term)) {
        partOfSpeech = partOfSpeech || pos;
        term = term.replace(regex, ' ').trim();
        changed = true;
        break;
      }
    }

    // 5. Clean trailing/leading punctuation
    const cleanTerm = term
      .replace(/^[-–—:~=→>•·*|/\s,;]+/, '')
      .replace(/[-–—:~=→>•·*|/\s,;]+$/, '')
      .replace(/^["'`“‘]+|["'`”’]+$/g, '')
      .trim();
    if (cleanTerm !== term) {
      term = cleanTerm;
      changed = true;
    }

    const cleanMeaning = meaning
      .replace(/^[-–—:~=→>•·*|/\s,;]+/, '')
      .replace(/[-–—:~=→>•·*|/\s,;]+$/, '')
      .replace(/^["'`“‘]+|["'`”’]+$/g, '')
      .trim();
    if (cleanMeaning !== meaning) {
      meaning = cleanMeaning;
      changed = true;
    }

    // Check validity: must contain foreign letters (English, Spanish, Hebrew, Greek, etc.) and not be purely a number
    if (!foreignRegex.test(term) || /^\d+$/.test(term) || !meaning) {
      removedCount++;
      continue;
    }

    // Check duplicate key within collection
    const dupKey = `${item.collectionId}_${term.toLowerCase()}`;
    if (seenKeys.has(dupKey)) {
      removedCount++;
      continue;
    }
    seenKeys.add(dupKey);

    if (changed) {
      repairedCount++;
    }

    cleaned.push({
      ...item,
      term,
      lemma: term.toLowerCase(),
      userMeaning: meaning,
      partOfSpeech,
      pronunciation,
      updatedAt: changed ? Date.now() : item.updatedAt,
    });
  }

  if (repairedCount > 0 || removedCount > 0) {
    setJson(itemsKey, cleaned);

    // Sync memory states
    const memoryStates = getMemoryStates().filter(s =>
      cleaned.some(i => i.id === s.vocabularyItemId)
    );
    setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), memoryStates);
  }

  return { repairedCount, removedCount };
}

// Ensure init runs
if (typeof window !== 'undefined') {
  initializeStorageIfNeeded();
}

/* ================= CRUD Operations ================= */

export function getCollections(): VocabularyCollection[] {
  const activeProfile = getActiveProfile();
  const fallback = getInitialSeedDataForLanguage(activeProfile.targetLanguage).collections;
  return getJson<VocabularyCollection[]>(getUserScopedKey(STORAGE_KEYS.COLLECTIONS), fallback);
}

export function saveCollection(collection: VocabularyCollection): void {
  const list = getCollections();
  const index = list.findIndex(c => c.id === collection.id);
  if (index >= 0) {
    list[index] = { ...collection, updatedAt: Date.now() };
  } else {
    list.push(collection);
  }
  setJson(getUserScopedKey(STORAGE_KEYS.COLLECTIONS), list);
}

export function deleteCollection(id: string): void {
  const list = getCollections().filter(c => c.id !== id);
  setJson(getUserScopedKey(STORAGE_KEYS.COLLECTIONS), list);

  // Also remove items and folders in collection
  const items = getVocabularyItems().filter(i => i.collectionId !== id);
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), items);

  const folders = getFolders().filter(f => f.collectionId !== id);
  setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), folders);
}

/* ================= Folder Operations ================= */

export function getFolders(collectionId?: string): VocabularyFolder[] {
  const activeProfile = getActiveProfile();
  const fallback = getInitialSeedDataForLanguage(activeProfile.targetLanguage).folders;
  const folders = getJson<VocabularyFolder[]>(getUserScopedKey(STORAGE_KEYS.FOLDERS), fallback);
  if (collectionId && collectionId !== 'all') {
    return folders.filter(f => f.collectionId === collectionId);
  }
  return folders;
}

export function saveFolder(folder: VocabularyFolder): void {
  const list = getFolders();
  const index = list.findIndex(f => f.id === folder.id);
  if (index >= 0) {
    list[index] = { ...folder, updatedAt: Date.now() };
  } else {
    list.push(folder);
  }
  setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), list);
}

export function deleteFolder(id: string): void {
  const list = getFolders().filter(f => f.id !== id);
  setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), list);

  // Unassign folderId from items previously belonging to this folder
  const items = getVocabularyItems().map(item => {
    if (item.folderId === id) {
      const { folderId, ...rest } = item;
      return rest;
    }
    return item;
  });
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), items);
}

export function moveItemToFolder(itemId: string, folderId?: string): void {
  const items = getVocabularyItems();
  const index = items.findIndex(i => i.id === itemId);
  if (index >= 0) {
    items[index] = {
      ...items[index],
      folderId: folderId || undefined,
      updatedAt: Date.now(),
    };
    setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), items);
  }
}

export function moveItemsToFolder(itemIds: string[], folderId?: string): void {
  const idSet = new Set(itemIds);
  const items = getVocabularyItems();
  let changed = false;
  for (let i = 0; i < items.length; i++) {
    if (idSet.has(items[i].id)) {
      items[i] = {
        ...items[i],
        folderId: folderId || undefined,
        updatedAt: Date.now(),
      };
      changed = true;
    }
  }
  if (changed) {
    setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), items);
  }
}

export function getVocabularyItems(collectionId?: string): VocabularyItem[] {
  const activeProfile = getActiveProfile();
  const fallback = getInitialSeedDataForLanguage(activeProfile.targetLanguage).items;
  const items = getJson<VocabularyItem[]>(getUserScopedKey(STORAGE_KEYS.ITEMS), fallback);
  if (collectionId) {
    return items.filter(i => i.collectionId === collectionId);
  }
  return items;
}

export function saveVocabularyItems(newItems: VocabularyItem[]): void {
  const current = getVocabularyItems();
  const currentMap = new Map(current.map(i => [i.id, i]));
  const existingTermKeyToId = new Map(
    current.map(i => [`${i.collectionId}_${i.term.toLowerCase().trim()}`, i.id])
  );

  const foreignRegex = /[a-zA-Z\u00C0-\u024F\u0370-\u03FF\u0590-\u05FF\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF]/;
  const processedItems: VocabularyItem[] = [];

  for (const rawItem of newItems) {
    let term = (rawItem.term || '').trim();
    let meaning = (rawItem.userMeaning || '').trim();
    let partOfSpeech = rawItem.partOfSpeech;
    let pronunciation = rawItem.pronunciation;

    // Inverted term/meaning fix
    if (/[가-힣]/.test(term) && !foreignRegex.test(term) && foreignRegex.test(meaning) && !/[가-힣]/.test(meaning)) {
      const temp = term;
      term = meaning;
      meaning = temp;
    }

    // Number prefixes
    term = term.replace(/^(?:no\.?\s*)?[0-9]+[.)\-:\s]+/i, '').trim();

    // Clean punctuation
    term = term.replace(/^[-–—:~=→>•·*|/\s,;]+/, '').replace(/[-–—:~=→>•·*|/\s,;]+$/, '').trim();
    meaning = meaning.replace(/^[-–—:~=→>•·*|/\s,;]+/, '').replace(/[-–—:~=→>•·*|/\s,;]+$/, '').trim();

    if (!term || !meaning || /^\d+$/.test(term)) {
      continue;
    }

    const termKey = `${rawItem.collectionId}_${term.toLowerCase()}`;
    const existingId = existingTermKeyToId.get(termKey);

    const sanitizedItem: VocabularyItem = {
      ...rawItem,
      id: existingId || rawItem.id,
      term,
      lemma: term.toLowerCase(),
      userMeaning: meaning,
      partOfSpeech,
      pronunciation,
      updatedAt: Date.now(),
    };

    currentMap.set(sanitizedItem.id, sanitizedItem);
    existingTermKeyToId.set(termKey, sanitizedItem.id);
    processedItems.push(sanitizedItem);
  }

  const updated = Array.from(currentMap.values());
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), updated);

  // Initialize missing memory states
  const memoryStates = getMemoryStates();
  const stateMap = new Map(memoryStates.map(s => [s.vocabularyItemId, s]));

  let statesChanged = false;
  for (const item of processedItems) {
    if (!stateMap.has(item.id)) {
      stateMap.set(item.id, createDefaultMemoryState(item.id));
      statesChanged = true;
    }
  }

  if (statesChanged) {
    setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), Array.from(stateMap.values()));
  }
}

export function updateVocabularyItem(item: VocabularyItem): void {
  const items = getVocabularyItems();
  const index = items.findIndex(i => i.id === item.id);
  if (index >= 0) {
    items[index] = { ...item, updatedAt: Date.now() };
    setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), items);
  }
}

export function deleteVocabularyItem(id: string): void {
  const items = getVocabularyItems().filter(i => i.id !== id);
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), items);

  const states = getMemoryStates().filter(s => s.vocabularyItemId !== id);
  setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), states);
}

export function deleteVocabularyItems(ids: string[]): void {
  const idSet = new Set(ids);
  const items = getVocabularyItems().filter(i => !idSet.has(i.id));
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), items);

  const states = getMemoryStates().filter(s => !idSet.has(s.vocabularyItemId));
  setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), states);
}

export function batchMoveItemsToFolder(itemIds: string[], folderId?: string): void {
  const idSet = new Set(itemIds);
  const items = getVocabularyItems().map(item => {
    if (idSet.has(item.id)) {
      return {
        ...item,
        folderId: folderId && folderId !== 'all' ? folderId : undefined,
        updatedAt: Date.now(),
      };
    }
    return item;
  });
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), items);
}

export function getMemoryStates(): MemoryState[] {
  const states = getJson<MemoryState[]>(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), []);
  const now = Date.now();
  // Refresh retrievabilities
  return states.map(s => refreshMemoryState(s, now));
}

export function getMemoryStateMap(): Map<string, MemoryState> {
  const states = getMemoryStates();
  return new Map(states.map(s => [s.vocabularyItemId, s]));
}

export function saveMemoryState(state: MemoryState): void {
  const states = getMemoryStates();
  const index = states.findIndex(s => s.vocabularyItemId === state.vocabularyItemId);
  if (index >= 0) {
    states[index] = state;
  } else {
    states.push(state);
  }
  setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), states);
}

export function batchSaveMemoryStates(newStates: MemoryState[]): void {
  const states = getMemoryStates();
  const map = new Map(states.map(s => [s.vocabularyItemId, s]));
  for (const s of newStates) {
    map.set(s.vocabularyItemId, s);
  }
  setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), Array.from(map.values()));
}

export function getReviewEvents(): ReviewEvent[] {
  return getJson<ReviewEvent[]>(getUserScopedKey(STORAGE_KEYS.REVIEW_EVENTS), []);
}

export function logReviewEvent(event: ReviewEvent): void {
  const events = getReviewEvents();
  // Keep last 1000 events to prevent bloat
  events.push(event);
  if (events.length > 1000) {
    events.shift();
  }
  setJson(getUserScopedKey(STORAGE_KEYS.REVIEW_EVENTS), events);
}

export function getUserSettings(): UserSettings {
  const activeProfile = getActiveProfile();
  const loaded = getJson<UserSettings>(getUserScopedKey(STORAGE_KEYS.SETTINGS), DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    userId: activeProfile.id,
    userName: activeProfile.name || loaded?.userName || DEFAULT_SETTINGS.userName,
    sourceLanguage: activeProfile.targetLanguage || loaded?.sourceLanguage || 'en',
    targetLanguage: 'ko',
    dailyWordGoal: loaded?.dailyWordGoal || DEFAULT_SETTINGS.dailyWordGoal,
    preferredSessionMode: loaded?.preferredSessionMode || 'time',
  };
}

export function updateUserSettings(settings: Partial<UserSettings>): UserSettings {
  const current = getUserSettings();
  const updated = { ...current, ...settings };
  setJson(getUserScopedKey(STORAGE_KEYS.SETTINGS), updated);

  const activeProfile = getActiveProfile();
  if (
    (settings.userName && settings.userName !== activeProfile.name) ||
    (settings.sourceLanguage && settings.sourceLanguage !== activeProfile.targetLanguage)
  ) {
    updateProfile(activeProfile.id, {
      ...(settings.userName ? { name: settings.userName } : {}),
      ...(settings.sourceLanguage ? { targetLanguage: settings.sourceLanguage } : {}),
    });
  }

  return updated;
}

/**
 * High-level statistics summary
 */
export interface StatsSummary {
  totalWords: number;
  newWords: number;
  learningWords: number;
  retainingWords: number;
  masteredWords: number;
  averageRecallRate: number;
  todayReviewsCount: number;
  weeklyReviewsCount: number;
  averageResponseTimeSeconds: number;
  recognitionVsProductionRatio: {
    recognition: number;
    production: number;
    transfer: number;
  };
}

export function getStatsSummary(): StatsSummary {
  const items = getVocabularyItems();
  const states = getMemoryStates();
  const events = getReviewEvents();

  const now = Date.now();
  const oneDayAgo = now - 86400000;
  const oneWeekAgo = now - 7 * 86400000;

  const todayReviews = events.filter(e => e.reviewedAt >= oneDayAgo);
  const weeklyReviews = events.filter(e => e.reviewedAt >= oneWeekAgo);

  let newCount = 0;
  let learningCount = 0;
  let retainingCount = 0;
  let masteredCount = 0;
  let sumRecall = 0;
  let sumRecStrength = 0;
  let sumProdStrength = 0;
  let sumTransStrength = 0;
  let totalTime = 0;
  let timeCount = 0;

  for (const s of states) {
    if (s.status === 'new') newCount++;
    else if (s.status === 'learning') learningCount++;
    else if (s.status === 'retaining') retainingCount++;
    else if (s.status === 'mastered') masteredCount++;

    sumRecall += s.estimatedRecallProbability;
    sumRecStrength += s.recognitionStrength;
    sumProdStrength += s.productionStrength || 0;
    sumTransStrength += s.transferStrength || 0;

    if (s.averageResponseTime > 0) {
      totalTime += s.averageResponseTime;
      timeCount++;
    }
  }

  const total = items.length || 1;
  const averageRecallRate = Math.round((sumRecall / total) * 100);
  const avgRec = Math.round(sumRecStrength / total);
  const avgProd = Math.round(sumProdStrength / total);
  const avgTrans = Math.round(sumTransStrength / total);
  const avgResponseTime = timeCount > 0 ? (totalTime / timeCount / 1000).toFixed(1) : '2.1';

  return {
    totalWords: items.length,
    newWords: newCount,
    learningWords: learningCount,
    retainingWords: retainingCount,
    masteredWords: masteredCount,
    averageRecallRate: Math.max(50, Math.min(99, averageRecallRate)),
    todayReviewsCount: todayReviews.length,
    weeklyReviewsCount: weeklyReviews.length,
    averageResponseTimeSeconds: parseFloat(avgResponseTime),
    recognitionVsProductionRatio: {
      recognition: avgRec || 82,
      production: avgProd || 54,
      transfer: avgTrans || 42,
    },
  };
}

export function resetToSampleData(): void {
  const profile = getActiveProfile();
  const seed = getInitialSeedDataForLanguage(profile.targetLanguage);
  setJson(getUserScopedKey(STORAGE_KEYS.COLLECTIONS), seed.collections);
  setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), seed.folders);
  setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), seed.items);
  setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), generateInitialMemoryStates(seed.items));
  setJson(getUserScopedKey(STORAGE_KEYS.REVIEW_EVENTS), []);
  setJson(getUserScopedKey(STORAGE_KEYS.SETTINGS), {
    ...DEFAULT_SETTINGS,
    userId: profile.id,
    userName: profile.name,
    sourceLanguage: profile.targetLanguage,
  });
}

/**
 * Exports all user data as a downloadable JSON object
 */
export function exportUserDataAsJson(): string {
  const activeProfile = getActiveProfile();
  const exportPayload = {
    vocacurve_version: '1.0',
    exportedAt: new Date().toISOString(),
    profile: activeProfile,
    collections: getCollections(),
    folders: getFolders(),
    items: getVocabularyItems(),
    memoryStates: getMemoryStates(),
    reviewEvents: getReviewEvents(),
    settings: getUserSettings(),
  };
  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Imports user data from JSON string and updates active profile storage
 */
export function importUserDataFromJson(jsonStr: string): boolean {
  try {
    const data = JSON.parse(jsonStr);
    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('유효한 VocaCurve 단어 데이터 형식이 아닙니다.');
    }

    if (data.collections && Array.isArray(data.collections)) {
      setJson(getUserScopedKey(STORAGE_KEYS.COLLECTIONS), data.collections);
    }
    if (data.folders && Array.isArray(data.folders)) {
      setJson(getUserScopedKey(STORAGE_KEYS.FOLDERS), data.folders);
    }
    if (data.items && Array.isArray(data.items)) {
      setJson(getUserScopedKey(STORAGE_KEYS.ITEMS), data.items);
    }
    if (data.memoryStates && Array.isArray(data.memoryStates)) {
      setJson(getUserScopedKey(STORAGE_KEYS.MEMORY_STATES), data.memoryStates);
    }
    if (data.reviewEvents && Array.isArray(data.reviewEvents)) {
      setJson(getUserScopedKey(STORAGE_KEYS.REVIEW_EVENTS), data.reviewEvents);
    }
    if (data.settings) {
      setJson(getUserScopedKey(STORAGE_KEYS.SETTINGS), data.settings);
    }

    // Auto clean imported words
    cleanAndRepairVocabulary();
    return true;
  } catch (e) {
    console.error('Failed to import JSON data:', e);
    return false;
  }
}


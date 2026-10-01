import { LanguageCode } from '../types/database';

export interface LanguageMeta {
  code: LanguageCode;
  name: string;          // e.g. "일본어", "영어"
  wordName: string;      // e.g. "일본어 단어", "영단어"
  flag: string;          // e.g. "🇯🇵", "🇬🇧"
  sampleTerm: string;    // e.g. "食べる", "derive"
  sampleMeaning: string; // e.g. "먹다", "유래하다"
  ttsCode: string;       // e.g. "ja-JP", "en-US"
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  {
    code: 'en',
    name: '영어',
    wordName: '영단어',
    flag: '🇬🇧',
    sampleTerm: 'resilient',
    sampleMeaning: '회복력 있는',
    ttsCode: 'en-US',
  },
  {
    code: 'es',
    name: '스페인어',
    wordName: '스페인어 단어',
    flag: '🇪🇸',
    sampleTerm: 'esperanza',
    sampleMeaning: '희망',
    ttsCode: 'es-ES',
  },
  {
    code: 'ja',
    name: '일본어',
    wordName: '일본어 단어',
    flag: '🇯🇵',
    sampleTerm: '食べる',
    sampleMeaning: '먹다',
    ttsCode: 'ja-JP',
  },
  {
    code: 'zh',
    name: '중국어',
    wordName: '중국어 단어',
    flag: '🇨🇳',
    sampleTerm: '学习',
    sampleMeaning: '공부하다, 배우다',
    ttsCode: 'zh-CN',
  },
  {
    code: 'fr',
    name: '프랑스어',
    wordName: '프랑스어 단어',
    flag: '🇫🇷',
    sampleTerm: 'bonjour',
    sampleMeaning: '안녕하세요',
    ttsCode: 'fr-FR',
  },
  {
    code: 'de',
    name: '독일어',
    wordName: '독일어 단어',
    flag: '🇩🇪',
    sampleTerm: 'Herausforderung',
    sampleMeaning: '도전',
    ttsCode: 'de-DE',
  },
  {
    code: 'he',
    name: '히브리어',
    wordName: '히브리어 단어',
    flag: '🇮🇱',
    sampleTerm: 'שָׁלוֹם',
    sampleMeaning: '평화, 안녕',
    ttsCode: 'he-IL',
  },
  {
    code: 'el',
    name: '헬라어',
    wordName: '헬라어 단어',
    flag: '🇬🇷',
    sampleTerm: 'ἀγάπη',
    sampleMeaning: '사랑',
    ttsCode: 'el-GR',
  },
  {
    code: 'other',
    name: '기타 외국어',
    wordName: '외국어 단어',
    flag: '🌐',
    sampleTerm: 'vocabulaire',
    sampleMeaning: '단어, 어휘',
    ttsCode: 'en-US',
  },
];

const LANG_MAP = new Map<string, LanguageMeta>(
  SUPPORTED_LANGUAGES.map(l => [l.code, l])
);

export function getLanguageMeta(code?: string): LanguageMeta {
  if (!code) return LANG_MAP.get('ja') || LANG_MAP.get('en')!;
  return LANG_MAP.get(code) || {
    code: code as LanguageCode,
    name: code === 'ko' ? '한국어' : '외국어',
    wordName: code === 'ko' ? '한국어 단어' : '외국어 단어',
    flag: '🌐',
    sampleTerm: 'word',
    sampleMeaning: '단어 뜻',
    ttsCode: 'en-US',
  };
}

export function getLanguageName(code?: string): string {
  return getLanguageMeta(code).name;
}

export function getLanguageWordName(code?: string): string {
  return getLanguageMeta(code).wordName;
}

// Common Japanese Kanji vocabulary words (used to reliably identify Japanese even when pure Kanji without Kana)
const COMMON_JAPANESE_KANJI = new Set([
  '勉強', '約束', '感謝', '散歩', '挑戦', '笑顔', '習慣', '大切', '時間', '先生', '学生',
  '家族', '病院', '公園', '会社', '電話', '映画', '料理', '旅行', '仕事', '天気', '電車',
  '本屋', '銀行', '大学', '高校', '教室', '質問', '試験', '宿題', '練習', '復習', '予習',
  '準備', '計画', '成功', '失敗', '努力', '希望', '未来', '現在', '世界', '自然', '環境',
  '問題', '理由', '意味', '方法', '目的', '結果', '関係', '原因', '影響', '変化', '発表',
  '相談', '連絡', '報告', '案内', '紹介', '説明', '注意', '危険', '安全', '安心', '親切',
  '丁寧', '便利', '不便', '簡単', '複雑', '重要', '特別', '普通', '必要', '可能', '有名',
  '元気', '静か', '自由', '真面目', '熱心', '大丈夫', '残念', '素敵', '綺麗', '上手', '下手',
  '得意', '苦手', '写真', '会話', '生活', '毎日', '毎週', '毎月', '毎年', '朝御飯', '昼御飯',
  '晩御飯', '友達', '両親', '兄弟', '姉妹', '子供', '大人', '教室', '机', '椅子', '時計',
  '一番', '本当', '最初', '最後', '半分', '全部', '一緒', '自分', '気分', '気持ち', '具合'
]);

/**
 * Automatically detects the language of a word or phrase:
 * - Japanese (ja): Hiragana, Katakana, Japanese kanji/vocabulary
 * - Chinese (zh): Hanzi with pinyin or context
 * - Spanish (es): ñ, ¿, ¡, accents, spanish markers
 * - French (fr): œ, ç, french accents
 * - German (de): ä, ö, ü, ß
 * - English (en): standard Latin
 */
export function detectLanguage(text: string, currentContextLang?: LanguageCode): LanguageCode {
  if (!text || typeof text !== 'string') return currentContextLang || 'ja';
  const trimmed = text.trim();

  // 1. Japanese Kana (Hiragana or Katakana or Japanese punctuation) -> 100% Japanese
  const hasHiragana = /[\u3040-\u309F]/.test(trimmed);
  const hasKatakana = /[\u30A0-\u30FF\u31F0-\u31FF\uFF65-\uFF9F]/.test(trimmed);
  if (hasHiragana || hasKatakana) {
    return 'ja';
  }

  // 2. CJK Unified Ideographs (Kanji / Hanzi: \u4E00-\u9FFF)
  const hasCJK = /[\u4E00-\u9FFF]/.test(trimmed);
  if (hasCJK) {
    // Check known Japanese vocabulary
    if (COMMON_JAPANESE_KANJI.has(trimmed)) {
      return 'ja';
    }
    // If context is already Japanese or no Chinese context, prioritize Japanese
    if (currentContextLang === 'ja') {
      return 'ja';
    }
    if (currentContextLang === 'zh') {
      return 'zh';
    }
    // Default CJK to Japanese for users learning Japanese, or Japanese by default
    return 'ja';
  }

  // 3. Spanish specific characters
  if (/[ñÑ¿¡]/.test(trimmed) || (/[áéíóúÁÉÍÓÚ]/.test(trimmed) && currentContextLang === 'es')) {
    return 'es';
  }

  // 4. German specific characters
  if (/[äöüßÄÖÜ]/.test(trimmed)) {
    return 'de';
  }

  // 5. French specific characters
  if (/[œŒçÇàèùâêîôûëïü]/.test(trimmed)) {
    return 'fr';
  }

  // 6. Hebrew script (\u0590-\u05FF: Hebrew letters & vowel points / Nikkud)
  if (/[\u0590-\u05FF]/.test(trimmed)) {
    return 'he';
  }

  // 7. Greek script (\u0370-\u03FF: Greek and Coptic, \u1F00-\u1FFF: Greek Extended)
  if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(trimmed)) {
    return 'el';
  }

  // 8. Other scripts (Cyrillic, Arabic, etc.)
  if (/[\u0400-\u04FF\u0600-\u06FF]/.test(trimmed)) {
    return 'other';
  }

  // 9. Standard Latin alphabet
  if (/[a-zA-Z]/.test(trimmed)) {
    // If user's active context is Spanish, French, or German, maintain it
    if (currentContextLang && ['es', 'fr', 'de'].includes(currentContextLang)) {
      return currentContextLang;
    }
    return 'en';
  }

  return currentContextLang || 'en';
}

/**
 * Returns true if the language is written Right-to-Left (e.g. Hebrew)
 */
export function isRTL(langCode?: string): boolean {
  return langCode === 'he';
}

/**
 * Samples a list of terms and determines the dominant language
 */
export function detectDominantLanguage(terms: string[], fallback: LanguageCode = 'ja'): LanguageCode {
  if (!terms || terms.length === 0) return fallback;
  const counts: Record<string, number> = {};

  for (const term of terms) {
    const lang = detectLanguage(term, fallback);
    counts[lang] = (counts[lang] || 0) + 1;
  }

  let maxLang: LanguageCode = fallback;
  let maxCount = 0;

  for (const [lang, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxLang = lang as LanguageCode;
    }
  }

  return maxLang;
}

export function getDirectionLabels(code?: string) {
  const meta = getLanguageMeta(code);
  const name = meta.name;
  const wordName = meta.wordName;

  return {
    meta,
    name,
    wordName,
    foreignToKo: `${name} → 한국어`,
    koToForeign: `한국어 → ${name}`,
    foreignToKoFull: `${name} → 한국어 인출력 (기본 학습)`,
    koToForeignFull: `한국어 → ${name} 능동적 인출력 (전체 단어)`,
    foreignToKoShort: `${name.slice(0, 1)}→한`,
    koToForeignShort: `한→${name.slice(0, 1)}`,
    foreignToKoDesc: `${wordName}를 보고 뜻을 즉각 떠올리는 기본 기억력입니다. 클릭 시 상단 버튼으로 ${name.slice(0, 1)}→한 플래시카드를 시작합니다.`,
    koToForeignDesc: `한국어 뜻을 보고 ${name} 단어를 직접 역으로 연상해내는 능동적 인출입니다. 장기기억 도달 여부와 상관없이 모든 단어를 언제든 학습할 수 있습니다.`,
    clozeDesc: '단어 뜻과 예문의 문맥을 보고 빈칸에 들어갈 단어를 맞추는 실전 훈련입니다.',
    frontCardHint: `앞면 (${name} 단어)`,
    backCardHint: `뒷면 (뜻 & 문맥)`,
    koToForeignFront: `앞면 (한국어 → ${name} 인출)`,
    koToForeignBack: `뒷면 (${name} 정답)`,
    koToForeignPrompt: `한국어 뜻을 보고 ${wordName}를 인출하세요`,
    flipButtonText: `${wordName} 뒤집어서 뜻 확인하기 (Space)`,
  };
}

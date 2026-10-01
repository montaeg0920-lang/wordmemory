/**
 * A few sample words for the first-run "체험해 보기" button.
 * They are only pre-filled into the paste box — nothing is saved unless the learner presses save.
 */
import { LanguageCode } from '../types/database';

const TRIAL_WORDS: Partial<Record<LanguageCode, [string, string][]>> = {
  en: [['derive', '유래하다'], ['mitigate', '완화하다'], ['subtle', '미묘한'], ['resilient', '회복력 있는']],
  es: [['casa', '집'], ['libro', '책'], ['amigo', '친구'], ['agua', '물']],
  ja: [['食べる', '먹다'], ['水', '물'], ['学校', '학교'], ['友達', '친구']],
  zh: [['学习', '공부하다'], ['朋友', '친구'], ['水', '물'], ['学校', '학교']],
  fr: [['maison', '집'], ['livre', '책'], ['ami', '친구'], ['eau', '물']],
  de: [['Haus', '집'], ['Buch', '책'], ['Freund', '친구'], ['Wasser', '물']],
  he: [['שָׁלוֹם', '평화'], ['בַּיִת', '집'], ['מֶלֶךְ', '왕'], ['דָּבָר', '말씀']],
  el: [['ἀγάπη', '사랑'], ['λόγος', '말씀'], ['κόσμος', '세상'], ['ζωή', '생명']],
};

/** "term - meaning" lines for the paste box, or null when there are no samples for this language. */
export function getTrialPasteText(lang: LanguageCode): string | null {
  const words = TRIAL_WORDS[lang];
  return words ? words.map(([term, meaning]) => `${term} - ${meaning}`).join('\n') : null;
}

/**
 * High-Reliability File Import & Text Extraction Engine
 * Supports: XLSX, CSV, TXT, DOCX and pasted text (PDF/photos go through Gemini).
 *
 * Implements:
 * 1. Intelligent column auto-detection (distinguishes Numbers, English terms, Korean meanings)
 * 2. Robust delimiter parsing (Tab, Pipe, Colon, Hyphen, Em-dash, Slashes, Commas, Spaces)
 * 3. Direction auto-detection (auto-swaps if Korean is on the left and English is on the right)
 * 4. Automatic extraction of Part of Speech (POS) & Pronunciation (/.../)
 * 5. Numbering & symbol prefix/suffix cleaning (1., 1), (1), [1], dashes, colons)
 * 6. Deduplication & data validation (filters out pure numbers and corrupted rows)
 */

import * as XLSX from 'xlsx';
import { VocabularyItem } from '../types/database';

export interface ExtractedVocabRow {
  id: string;
  term: string;
  partOfSpeech?: string;
  userMeaning: string;
  pronunciation?: string;
  exampleSentenceEn?: string;
  exampleSentenceKo?: string;
  isDuplicate: boolean;
  isValid: boolean;
  warning?: string;
}

export interface ParsedImportResult {
  fileName: string;
  fileType: string;
  totalParsed: number;
  validCount: number;
  duplicateCount: number;
  rows: ExtractedVocabRow[];
}

const POS_PATTERNS = [
  { regex: /(?:\(|\[)\s*(?:동사|동|v\.?|verb|vi|vt)\s*(?:\)|\])|(?:\b|(?<=\s))(?:v\.|verb)(?:\b|(?=\s))/i, pos: '동사' },
  { regex: /(?:\(|\[)\s*(?:명사|명|n\.?|noun)\s*(?:\)|\])|(?:\b|(?<=\s))(?:n\.|noun)(?:\b|(?=\s))/i, pos: '명사' },
  { regex: /(?:\(|\[)\s*(?:형용사|형|a\.?|adj\.?|adjective)\s*(?:\)|\])|(?:\b|(?<=\s))(?:adj\.|adjective)(?:\b|(?=\s))/i, pos: '형용사' },
  { regex: /(?:\(|\[)\s*(?:부사|부|adv\.?|adverb)\s*(?:\)|\])|(?:\b|(?<=\s))(?:adv\.|adverb)(?:\b|(?=\s))/i, pos: '부사' },
  { regex: /(?:\(|\[)\s*(?:전치사|prep\.?|preposition)\s*(?:\)|\])|(?:\b|(?<=\s))(?:prep\.|preposition)(?:\b|(?=\s))/i, pos: '전치사' },
  { regex: /(?:\(|\[)\s*(?:접속사|conj\.?|conjunction)\s*(?:\)|\])|(?:\b|(?<=\s))(?:conj\.|conjunction)(?:\b|(?=\s))/i, pos: '접속사' },
  { regex: /(?:\(|\[)\s*(?:대명사|pron\.?|pronoun)\s*(?:\)|\])|(?:\b|(?<=\s))(?:pron\.|pronoun)(?:\b|(?=\s))/i, pos: '대명사' },
  { regex: /(?:\(|\[)\s*(?:감탄사|interj\.?)\s*(?:\)|\])|(?:\b|(?<=\s))(?:interj\.)(?:\b|(?=\s))/i, pos: '감탄사' },
];

/**
 * Extracts Part of Speech tag from a string segment and cleans empty leftover brackets
 */
export function extractPOS(text: string): { cleanText: string; pos?: string } {
  let cleanText = text;
  let detectedPos: string | undefined = undefined;

  for (const { regex, pos } of POS_PATTERNS) {
    if (regex.test(cleanText)) {
      detectedPos = pos;
      cleanText = cleanText.replace(regex, ' ').trim();
      break;
    }
  }

  // Remove empty or leftover brackets like (), [], {}
  cleanText = cleanText.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '').replace(/\{\s*\}/g, '').trim();
  // Remove leading/trailing stray brackets
  cleanText = cleanText.replace(/^[()[\]{}]+|[()[\]{}]+$/g, '').trim();

  return { cleanText, pos: detectedPos };
}

/**
 * Extracts IPA / pronunciation wrapped in slashes or brackets: e.g. /dɪˈraɪv/ or [dɪˈraɪv]
 */
export function extractPronunciation(text: string): { cleanText: string; pronunciation?: string } {
  let cleanText = text;
  let pronunciation: string | undefined = undefined;

  const slashMatch = /\/([^/]+)\//.exec(cleanText);
  if (slashMatch && slashMatch[1]) {
    pronunciation = `/${slashMatch[1].trim()}/`;
    cleanText = cleanText.replace(slashMatch[0], ' ').trim();
  }

  return { cleanText, pronunciation };
}

/**
 * Strips numbering prefixes such as:
 * "1. ", "1) ", "(1) ", "[1] ", "No.1 ", "1- "
 */
export function stripNumberPrefix(text: string): string {
  return text
    .replace(/^(?:no\.?\s*)?[0-9]+[.)\-:\s]+/i, '')
    .replace(/^[(\[]\s*[0-9]+\s*[)\]]\s*/, '')
    .trim();
}

/**
 * Strips leading/trailing punctuation and symbols (-, :, =, ~, ->, etc.)
 */
export function cleanPunctuation(text: string): string {
  return text
    .replace(/^[-–—:~=→>•·*|/\s,;]+/, '')
    .replace(/[-–—:~=→>•·*|/\s,;]+$/, '')
    .trim();
}

/**
 * Checks whether text contains Korean characters (Hangul syllables or Jamo)
 */
export function hasKorean(text: string): boolean {
  return /[가-힣ㄱ-ㅎ]/.test(text);
}

/**
 * Checks whether text contains foreign letters (English, Spanish, Hebrew, Greek, etc.)
 * Treats all non-Korean foreign scripts seamlessly as target learning terms.
 */
export function hasForeignTerm(text: string): boolean {
  if (!text) return false;
  // Matches Latin (English, Spanish with á, é, í, ó, ú, ñ), Greek (α-ω, polytonic), Hebrew (א-ת), Cyrillic, etc.
  const foreignRegex = /[a-zA-Z\u00C0-\u024F\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF]/;
  if (foreignRegex.test(text)) return true;
  const stripped = text.replace(/[\s\d.,!?;:()[\]{}'"~`\-+=/\\|*^%#@$&<>_가-힣ㄱ-ㅎ]/g, '');
  return stripped.length > 0;
}

export function hasEnglish(text: string): boolean {
  return hasForeignTerm(text);
}

/**
 * Detects whether term uses a non-English foreign script (e.g. Hebrew, Greek, Spanish accents, Cyrillic)
 */
export function isNonEnglishScript(text: string): boolean {
  if (!text) return false;
  return /[\u00C0-\u024F\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF]/.test(text) || /[¿¡áéíóúÁÉÍÓÚñÑüÜ]/.test(text);
}

/**
 * Checks whether an item or term is a non-English foreign language
 * (Spanish, Hebrew, Greek, etc.)
 */
export function isNonEnglishWord(itemOrTerm: VocabularyItem | string): boolean {
  if (!itemOrTerm) return false;
  if (typeof itemOrTerm === 'string') {
    return isNonEnglishScript(itemOrTerm);
  }
  if (itemOrTerm.sourceLanguage && itemOrTerm.sourceLanguage !== 'en') {
    return true;
  }
  return isNonEnglishScript(itemOrTerm.term);
}

/**
 * Calculates foreign letter ratio in string (supports English, Spanish, Hebrew, Greek, etc.)
 */
export function englishRatio(text: string): number {
  if (!text) return 0;
  const matches = text.match(/[a-zA-Z\u00C0-\u024F\u0370-\u03FF\u0590-\u05FF\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF]/g);
  return matches ? matches.length / text.length : 0;
}

/**
 * Calculates Korean character ratio in string
 */
export function koreanRatio(text: string): number {
  if (!text) return 0;
  const korMatches = text.match(/[가-힣]/g);
  return korMatches ? korMatches.length / text.length : 0;
}

/**
 * Thoroughly cleans an English term:
 * - Strips numbering
 * - Removes pronunciation
 * - Removes POS
 * - Removes enclosing quotes
 * - Cleans dangling symbols
 */
export function sanitizeTerm(raw: string): { term: string; pos?: string; pronunciation?: string } {
  let str = stripNumberPrefix(raw);
  const { cleanText: afterPron, pronunciation } = extractPronunciation(str);
  str = afterPron;
  const { cleanText: afterPos, pos } = extractPOS(str);
  str = afterPos;

  // Remove surrounding quotes or brackets
  str = str.replace(/^["'`“‘]+|["'`”’]+$/g, '').trim();
  str = cleanPunctuation(str);

  // Collapse multiple spaces
  str = str.replace(/\s{2,}/g, ' ');

  return { term: str, pos, pronunciation };
}

/**
 * Thoroughly cleans a Korean meaning:
 * - Strips leading punctuation (-, :, etc.)
 * - Removes POS tags
 * - Cleans quotes
 */
export function sanitizeMeaning(raw: string): { meaning: string; pos?: string } {
  let str = stripNumberPrefix(raw);
  const { cleanText: afterPos, pos } = extractPOS(str);
  str = afterPos;

  // Remove leading/trailing symbols and quotes
  str = str.replace(/^["'`“‘]+|["'`”’]+$/g, '').trim();
  str = cleanPunctuation(str);
  str = str.replace(/\s{2,}/g, ' ');

  return { meaning: str, pos };
}

/**
 * Parses a single text line accurately with all delimiter and format variations.
 */
export function parseRawLine(line: string): ExtractedVocabRow | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;

  // Remove outer numbering: e.g. "1. apple - 사과" -> "apple - 사과"
  let cleanLine = stripNumberPrefix(trimmed);
  if (!cleanLine) return null;

  // Split candidate tokens by priority delimiters:
  // 1) Pipe (|)
  // 2) Tab (\t)
  // 3) Arrow (-> or →)
  // 4) Hyphen / Dashes with surrounding space (" - ", " – ", " — ", " ~ ")
  // 5) Colon (:) if not part of URL - split at FIRST colon
  // 6) Equal sign (=) - split at FIRST equal sign
  // 7) Semicolon (;)
  // 8) CSV Comma (,) if line is exactly 2 columns and token 0 doesn't contain both foreign & Korean
  let tokens: string[] = [];

  if (cleanLine.includes('|')) {
    tokens = cleanLine.split('|').map(s => s.trim());
  } else if (cleanLine.includes('\t')) {
    tokens = cleanLine.split('\t').map(s => s.trim());
  } else if (/->|→/.test(cleanLine)) {
    tokens = cleanLine.split(/->|→/).map(s => s.trim());
  } else if (/[\s]+[-–—~][\s]+/.test(cleanLine)) {
    tokens = cleanLine.split(/[\s]+[-–—~][\s]+/).map(s => s.trim());
  } else if (cleanLine.includes(':') && !cleanLine.includes('://')) {
    const colonIdx = cleanLine.indexOf(':');
    tokens = [cleanLine.slice(0, colonIdx).trim(), cleanLine.slice(colonIdx + 1).trim()];
  } else if (cleanLine.includes('=')) {
    const eqIdx = cleanLine.indexOf('=');
    tokens = [cleanLine.slice(0, eqIdx).trim(), cleanLine.slice(eqIdx + 1).trim()];
  } else if (cleanLine.includes(';') && !cleanLine.includes('; ')) {
    tokens = cleanLine.split(';').map(s => s.trim());
  } else if (cleanLine.includes(',') && !cleanLine.includes('"')) {
    const parts = cleanLine.split(',').map(s => s.trim());
    if (parts.length === 2) {
      // Check if token 0 contains both foreign and Korean (meaning comma is inside Korean meaning)
      const t0Foreign = hasForeignTerm(parts[0]);
      const t0Korean = hasKorean(parts[0]);
      if (!(t0Foreign && t0Korean)) {
        tokens = parts;
      }
    }
  }

  if (tokens.length >= 2) {
    let partA = tokens[0];
    let partB = tokens[1];
    let partExample = tokens[2] || '';
    let extractedPron: string | undefined = undefined;

    // Check if middle token is IPA pronunciation: e.g. [word, /pron/, meaning, example]
    if (partB.startsWith('/') && partB.endsWith('/') && tokens.length >= 3) {
      extractedPron = partB;
      partB = tokens[2];
      partExample = tokens[3] || '';
    }

    // Check if tokens were reversed (Korean in partA and foreign term in partB)
    // e.g. "유래하다 | derive"
    if (hasKorean(partA) && !hasKorean(partB) && hasForeignTerm(partB)) {
      const temp = partA;
      partA = partB;
      partB = temp;
    }

    const { term, pos: posA, pronunciation: pronA } = sanitizeTerm(partA);
    const { meaning, pos: posB } = sanitizeMeaning(partB);

    if (term && meaning && hasForeignTerm(term)) {
      return {
        id: `import_${Math.random().toString(36).substring(2, 9)}`,
        term,
        partOfSpeech: posA || posB,
        pronunciation: extractedPron || pronA,
        userMeaning: meaning,
        exampleSentenceEn: partExample ? cleanPunctuation(partExample) : undefined,
        isDuplicate: false,
        isValid: true,
      };
    }
  }

  // Fallback: Space-separated line where Foreign term and Korean meet
  // e.g. "derive 유래하다" or "שָׁלוֹם 평화" or "유래하다 derive"
  const koreanCharRegex = /[가-힣]/;
  const match = koreanCharRegex.exec(cleanLine);

  if (match) {
    if (match.index > 0) {
      // Foreign term is first, Korean is second: e.g. "derive 유래하다" or "שָׁלוֹם 평화"
      const foreignSegment = cleanLine.substring(0, match.index).trim();
      const koreanSegment = cleanLine.substring(match.index).trim();

      const { term, pos: posA, pronunciation } = sanitizeTerm(foreignSegment);
      const { meaning, pos: posB } = sanitizeMeaning(koreanSegment);

      if (term && meaning && hasForeignTerm(term)) {
        return {
          id: `import_${Math.random().toString(36).substring(2, 9)}`,
          term,
          partOfSpeech: posA || posB,
          pronunciation,
          userMeaning: meaning,
          isDuplicate: false,
          isValid: true,
        };
      }
    } else {
      // Korean is first, Foreign is second: e.g. "유래하다 derive" or "평화 שָׁלוֹם"
      // Find where Foreign script begins after Korean
      const foreignCharRegex = /[a-zA-Z\u00C0-\u024F\u0370-\u03FF\u0590-\u05FF\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF]/;
      const fMatch = foreignCharRegex.exec(cleanLine);
      if (fMatch && fMatch.index > 0) {
        const koreanSegment = cleanLine.substring(0, fMatch.index).trim();
        const foreignSegment = cleanLine.substring(fMatch.index).trim();

        const { term, pos: posA, pronunciation } = sanitizeTerm(foreignSegment);
        const { meaning, pos: posB } = sanitizeMeaning(koreanSegment);

        if (term && meaning && hasForeignTerm(term)) {
          return {
            id: `import_${Math.random().toString(36).substring(2, 9)}`,
            term,
            partOfSpeech: posA || posB,
            pronunciation,
            userMeaning: meaning,
            isDuplicate: false,
            isValid: true,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Intelligent Spreadsheet & CSV parser:
 * Auto-detects which column has the English Word, which has the Meaning, and ignores Row ID numbers.
 */
export function parseSpreadsheetData(
  workbook: XLSX.WorkBook,
  fileName: string,
  existingItems: VocabularyItem[]
): ParsedImportResult {
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const jsonRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  const rows: ExtractedVocabRow[] = [];
  const existingSet = new Set(existingItems.map(i => i.term.toLowerCase().trim()));
  const inBatchSet = new Set<string>();

  if (!jsonRows || jsonRows.length === 0) {
    return {
      fileName,
      fileType: 'spreadsheet',
      totalParsed: 0,
      validCount: 0,
      duplicateCount: 0,
      rows: [],
    };
  }

  // 1. Check for named headers in row 0
  let termCol = -1;
  let meaningCol = -1;
  let exampleCol = -1;
  let posCol = -1;
  let startRow = 0;

  const headerRow = jsonRows[0];
  if (Array.isArray(headerRow)) {
    headerRow.forEach((cell: any, idx: number) => {
      const val = String(cell || '').toLowerCase().trim();
      if (/^(word|english|term|단어|영단어|vocab|vocabulary|표제어)/i.test(val)) termCol = idx;
      if (/^(meaning|korean|뜻|의미|해석|번역|한국어)/i.test(val)) meaningCol = idx;
      if (/^(example|sentence|예문|문장)/i.test(val)) exampleCol = idx;
      if (/^(pos|part|품사)/i.test(val)) posCol = idx;
    });

    if (termCol >= 0 || meaningCol >= 0) {
      startRow = 1;
    }
  }

  // 2. If headers were NOT found or only partial, auto-detect column semantics from data sampling!
  if (termCol === -1 || meaningCol === -1) {
    const colStats: { [col: number]: { engScore: number; korScore: number; numScore: number; total: number } } = {};

    const sampleLimit = Math.min(jsonRows.length, 25);
    for (let r = startRow; r < sampleLimit; r++) {
      const row = jsonRows[r];
      if (!Array.isArray(row)) continue;
      row.forEach((cell, cIdx) => {
        if (!colStats[cIdx]) colStats[cIdx] = { engScore: 0, korScore: 0, numScore: 0, total: 0 };
        const val = String(cell || '').trim();
        if (!val) return;
        colStats[cIdx].total++;
        if (/^\d+$/.test(val)) {
          colStats[cIdx].numScore++;
        } else {
          if (englishRatio(val) > 0.4) colStats[cIdx].engScore++;
          if (hasKorean(val)) colStats[cIdx].korScore++;
        }
      });
    }

    // Find best English column (highest engScore and not mostly numbers)
    let bestEngCol = -1;
    let maxEng = 0;
    let bestKorCol = -1;
    let maxKor = 0;

    Object.entries(colStats).forEach(([cStr, stat]) => {
      const c = Number(cStr);
      // Ignore pure numbering columns (e.g. 1, 2, 3...)
      if (stat.numScore > stat.total * 0.7) return;

      if (stat.engScore > maxEng) {
        maxEng = stat.engScore;
        bestEngCol = c;
      }
      if (stat.korScore > maxKor) {
        maxKor = stat.korScore;
        bestKorCol = c;
      }
    });

    if (termCol === -1 && bestEngCol !== -1) termCol = bestEngCol;
    if (meaningCol === -1 && bestKorCol !== -1) meaningCol = bestKorCol;

    // Ultimate fallback if still undecided
    if (termCol === -1) termCol = 0;
    if (meaningCol === -1) meaningCol = termCol === 0 ? 1 : 0;
  }

  // 3. Process all data rows
  for (let i = startRow; i < jsonRows.length; i++) {
    const row = jsonRows[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    let rawTerm = String(row[termCol] || '').trim();
    let rawMeaning = String(row[meaningCol] || '').trim();
    const rawExample = exampleCol >= 0 ? String(row[exampleCol] || '').trim() : '';
    const rawPos = posCol >= 0 ? String(row[posCol] || '').trim() : '';

    if (!rawTerm && !rawMeaning) continue;

    // Check if a single cell contained both e.g. "derive - 유래하다"
    if (rawTerm && !rawMeaning) {
      const singleParsed = parseRawLine(rawTerm);
      if (singleParsed) {
        const termKey = singleParsed.term.toLowerCase();
        const isDup = existingSet.has(termKey) || inBatchSet.has(termKey);
        inBatchSet.add(termKey);
        singleParsed.isDuplicate = isDup;
        if (isDup) singleParsed.warning = '이미 단어장에 존재하는 단어입니다.';
        rows.push(singleParsed);
        continue;
      }
    }

    // Auto-swap if Korean is in term column and foreign term is in meaning column
    if (hasKorean(rawTerm) && !hasKorean(rawMeaning) && hasForeignTerm(rawMeaning)) {
      const temp = rawTerm;
      rawTerm = rawMeaning;
      rawMeaning = temp;
    }

    const { term, pos: p1, pronunciation } = sanitizeTerm(rawTerm);
    const { meaning, pos: p2 } = sanitizeMeaning(rawMeaning);

    // Skip invalid rows (pure numbers, empty, or no foreign characters in term)
    if (!term || !meaning || !hasForeignTerm(term) || /^\d+$/.test(term)) {
      continue;
    }

    const termKey = term.toLowerCase();
    const isDup = existingSet.has(termKey) || inBatchSet.has(termKey);
    inBatchSet.add(termKey);

    rows.push({
      id: `import_${Math.random().toString(36).substring(2, 9)}`,
      term,
      partOfSpeech: rawPos || p1 || p2,
      pronunciation,
      userMeaning: meaning,
      exampleSentenceEn: rawExample || undefined,
      isDuplicate: isDup,
      isValid: true,
      warning: isDup ? '이미 단어장에 존재하는 단어입니다.' : undefined,
    });
  }

  return {
    fileName,
    fileType: 'spreadsheet',
    totalParsed: rows.length,
    validCount: rows.filter(r => r.isValid).length,
    duplicateCount: rows.filter(r => r.isDuplicate).length,
    rows,
  };
}

/**
 * Parses raw text string (from .txt or pasted string)
 */
export function parseTextContent(
  text: string,
  fileName: string,
  existingItems: VocabularyItem[]
): ParsedImportResult {
  const lines = text.split(/\r?\n/);
  const rows: ExtractedVocabRow[] = [];
  const existingSet = new Set(existingItems.map(i => i.term.toLowerCase().trim()));
  const inBatchSet = new Set<string>();

  for (const line of lines) {
    const parsed = parseRawLine(line);
    if (parsed) {
      // Must have foreign characters in term
      if (!hasForeignTerm(parsed.term) || /^\d+$/.test(parsed.term)) {
        continue;
      }

      const termKey = parsed.term.toLowerCase();
      const isDup = existingSet.has(termKey) || inBatchSet.has(termKey);
      inBatchSet.add(termKey);

      parsed.isDuplicate = isDup;
      if (isDup) {
        parsed.warning = '이미 단어장에 존재하는 단어입니다.';
      }
      rows.push(parsed);
    }
  }

  return {
    fileName,
    fileType: 'text',
    totalParsed: rows.length,
    validCount: rows.filter(r => r.isValid).length,
    duplicateCount: rows.filter(r => r.isDuplicate).length,
    rows,
  };
}

/**
 * Reads one file out of a ZIP archive (DOCX files are ZIP archives).
 * Uses the browser's built-in DecompressionStream, so no extra library is needed.
 */
async function readZipEntry(buffer: ArrayBuffer, entryName: string): Promise<Uint8Array | null> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  // Find "End of central directory" record (signature 0x06054b50) from the end.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let n = 0; n < entries; n++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) return null;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

    if (name === entryName) {
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const data = bytes.subarray(start, start + compSize);
      if (method === 0) return data;
      if (method !== 8 || typeof DecompressionStream === 'undefined') return null;
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/**
 * Extracts plain text from a DOCX file. Table cells are joined with a tab so
 * "word | meaning" tables are parsed as two columns.
 */
export async function parseDocxFile(
  buffer: ArrayBuffer,
  fileName: string,
  existingItems: VocabularyItem[]
): Promise<ParsedImportResult> {
  const empty: ParsedImportResult = { fileName, fileType: 'docx', totalParsed: 0, validCount: 0, duplicateCount: 0, rows: [] };
  try {
    const xmlBytes = await readZipEntry(buffer, 'word/document.xml');
    if (!xmlBytes) return empty;
    const xml = new TextDecoder('utf-8').decode(xmlBytes);

    const lines: string[] = [];
    const paragraphText = (p: string) =>
      (p.match(/<w:tab\/>|<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) || [])
        .map(t => (t === '<w:tab/>' ? '\t' : decodeXmlEntities(t.replace(/<[^>]+>/g, ''))))
        .join('')
        .trim();

    // Tables: one line per row, cells separated by tabs.
    const withoutTables = xml.replace(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g, table => {
      for (const row of table.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || []) {
        const cells = (row.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || []).map(c =>
          (c.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || []).map(paragraphText).join(' ').trim()
        );
        const line = cells.filter(Boolean).join('\t');
        if (line) lines.push(line);
      }
      return '';
    });
    for (const p of withoutTables.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || []) {
      const line = paragraphText(p);
      if (line) lines.push(line);
    }

    const result = parseTextContent(lines.join('\n'), fileName, existingItems);
    return { ...result, fileType: 'docx' };
  } catch (e) {
    console.error('DOCX parsing error:', e);
    return empty;
  }
}

export class NeedsAIExtractionError extends Error {
  constructor() {
    super('NEEDS_AI_EXTRACTION');
  }
}

/**
 * Universal file entry point. PDFs and images are read by Gemini instead
 * (throws NeedsAIExtractionError so the caller can route them).
 */
export async function processVocabularyFile(
  file: File,
  existingItems: VocabularyItem[]
): Promise<ParsedImportResult> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (extension === 'pdf' || file.type === 'application/pdf' || file.type.startsWith('image/')) {
    throw new NeedsAIExtractionError();
  }
  if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    return parseSpreadsheetData(workbook, file.name, existingItems);
  }
  if (extension === 'docx') {
    return parseDocxFile(await file.arrayBuffer(), file.name, existingItems);
  }
  return parseTextContent(await file.text(), file.name, existingItems);
}

import React from 'react';

/**
 * Returns dynamic responsive Tailwind text size class for vocabulary terms
 * based on character length so that words stay on the same line and don't overflow.
 */
export function getTermFontSizeClass(term: string | undefined): string {
  if (!term) return 'text-3xl sm:text-4xl';
  const len = term.trim().length;
  if (len <= 7) return 'text-4xl sm:text-5xl';
  if (len <= 13) return 'text-3xl sm:text-4xl';
  if (len <= 20) return 'text-2xl sm:text-3xl';
  if (len <= 30) return 'text-xl sm:text-2xl';
  return 'text-lg sm:text-xl';
}

/**
 * Returns dynamic responsive Tailwind text size class for meanings
 * shown on the front of a flashcard (in Korean -> Target recall mode).
 */
export function getFrontMeaningFontSizeClass(meaning: string | undefined): string {
  if (!meaning) return 'text-2xl sm:text-3xl';
  const len = meaning.trim().length;
  if (len <= 10) return 'text-3xl sm:text-4xl';
  if (len <= 18) return 'text-2xl sm:text-3xl';
  if (len <= 30) return 'text-xl sm:text-2xl';
  return 'text-lg sm:text-xl';
}

/**
 * Returns dynamic text size class for meanings on the back of a flashcard or modal.
 */
export function getBackMeaningFontSizeClass(meaning: string | undefined): string {
  if (!meaning) return 'text-xl';
  const len = meaning.trim().length;
  if (len <= 12) return 'text-2xl';
  if (len <= 24) return 'text-xl';
  if (len <= 38) return 'text-lg';
  return 'text-base';
}

/**
 * Returns dynamic text size class for full sentences (e.g. cloze cards, example sentences)
 * so long sentences scale down gracefully to keep words intact on lines without crowding.
 */
export function getSentenceFontSizeClass(sentence: string | undefined): string {
  if (!sentence) return 'text-base sm:text-lg';
  const len = sentence.trim().length;
  if (len <= 55) return 'text-base sm:text-lg';
  if (len <= 95) return 'text-sm sm:text-base';
  if (len <= 140) return 'text-[13px] sm:text-sm';
  return 'text-xs sm:text-[13px]';
}

/**
 * Helper to escape regex special characters
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Renders a sentence with the target term replaced by a non-breaking cloze blank.
 * Handles Unicode languages (Hebrew, Greek, Japanese, English, Korean) robustly,
 * ensuring the blank and individual words NEVER break across lines.
 */
interface ClozeSentenceDisplayProps {
  sentence: string;
  term: string;
  className?: string;
}

export const ClozeSentenceDisplay: React.FC<ClozeSentenceDisplayProps> = ({
  sentence,
  term,
  className = '',
}) => {
  if (!sentence) return null;

  // Clean term for matching (ignore surrounding whitespace)
  const cleanTerm = term.trim();
  const escaped = escapeRegExp(cleanTerm);

  // Unicode-aware regex to find term as a whole word or token
  // If term has CJK or Hebrew/Greek characters, standard \b does not work; use whitespace/punctuation boundaries
  const hasUnicodeScript = /[\u0590-\u05FF\u0370-\u03FF\u1F00-\u1FFF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(cleanTerm);

  let regex: RegExp;
  if (hasUnicodeScript) {
    // For non-ASCII scripts, match the term directly or bordered by non-word Unicode characters
    regex = new RegExp(escaped, 'gi');
  } else {
    // For Latin scripts, use standard word boundaries
    regex = new RegExp(`\\b${escaped}\\b`, 'gi');
  }

  // Split sentence into segments
  const parts: { text: string; isBlank: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sentence)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        text: sentence.substring(lastIndex, match.index),
        isBlank: false,
      });
    }
    parts.push({
      text: match[0],
      isBlank: true,
    });
    lastIndex = regex.lastIndex;
    if (match.index === regex.lastIndex) regex.lastIndex++; // prevent infinite loop on empty match
  }

  if (lastIndex < sentence.length) {
    parts.push({
      text: sentence.substring(lastIndex),
      isBlank: false,
    });
  }

  // Fallback if no match was found: replace first occurrence or display sentence with default placeholder
  if (parts.length === 0 || !parts.some(p => p.isBlank)) {
    return (
      <span className={`break-keep inline leading-relaxed ${className}`}>
        {sentence}
        {' '}
        <span className="inline-block whitespace-nowrap px-2 py-0.5 mx-1 rounded-lg bg-indigo-500/25 border border-indigo-400/40 text-indigo-300 font-bold tracking-wider select-none align-middle">
          [  _________  ]
        </span>
      </span>
    );
  }

  return (
    <span className={`break-keep inline leading-relaxed ${className}`}>
      {parts.map((part, idx) => {
        if (part.isBlank) {
          return (
            <span
              key={idx}
              className="inline-block whitespace-nowrap px-2 py-0.5 mx-1 rounded-lg bg-indigo-500/25 border border-indigo-400/40 text-indigo-300 font-bold tracking-wider select-none align-middle shadow-xs"
            >
              [  _________  ]
            </span>
          );
        }
        return <span key={idx} className="inline break-keep">{part.text}</span>;
      })}
    </span>
  );
};

/**
 * Renders an example sentence on the back of the card, highlighting the target term
 * in a non-breaking container so the term itself never splits across lines.
 */
interface HighlightedSentenceDisplayProps {
  sentence: string;
  term: string;
  className?: string;
  highlightClassName?: string;
}

export const HighlightedSentenceDisplay: React.FC<HighlightedSentenceDisplayProps> = ({
  sentence,
  term,
  className = '',
  highlightClassName = 'text-emerald-400 font-extrabold underline decoration-emerald-400/60 inline-block whitespace-nowrap',
}) => {
  if (!sentence) return null;
  const cleanTerm = term.trim();
  const escaped = escapeRegExp(cleanTerm);
  const hasUnicodeScript = /[\u0590-\u05FF\u0370-\u03FF\u1F00-\u1FFF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(cleanTerm);

  const regex = hasUnicodeScript
    ? new RegExp(escaped, 'gi')
    : new RegExp(`\\b${escaped}\\b`, 'gi');

  const parts: { text: string; isTarget: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sentence)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        text: sentence.substring(lastIndex, match.index),
        isTarget: false,
      });
    }
    parts.push({
      text: match[0],
      isTarget: true,
    });
    lastIndex = regex.lastIndex;
    if (match.index === regex.lastIndex) regex.lastIndex++;
  }

  if (lastIndex < sentence.length) {
    parts.push({
      text: sentence.substring(lastIndex),
      isTarget: false,
    });
  }

  if (parts.length === 0) {
    return <span className={`break-keep ${className}`}>{sentence}</span>;
  }

  return (
    <span className={`break-keep leading-relaxed ${className}`}>
      {parts.map((part, idx) => {
        if (part.isTarget) {
          return (
            <span key={idx} className={highlightClassName}>
              {part.text}
            </span>
          );
        }
        return <span key={idx} className="inline break-keep">{part.text}</span>;
      })}
    </span>
  );
};

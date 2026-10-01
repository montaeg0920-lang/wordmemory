/**
 * Web Audio API based subtle tactile audio feedback
 * Low cognitive load, pleasant, soft frequencies.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playSuccessSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const now = ctx.currentTime;
    osc.type = 'sine';
    // Pleasant major chord chime
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08); // E5
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.16); // G5

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  } catch {
    // Ignore audio failures
  }
}

export function playWrongSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const now = ctx.currentTime;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now); // A3
    osc.frequency.exponentialRampToValueAtTime(175, now + 0.18); // F3

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    // Ignore audio failures
  }
}

export function speakEnglishWord(word: string, rate: number = 0.95, targetLang?: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    
    // Explicit target language or auto-detection
    if (targetLang === 'ja' || /[\u3040-\u30FF\u31F0-\u31FF\uFF65-\uFF9F]/.test(word) || (targetLang === 'ja' && /[\u4E00-\u9FAF]/.test(word))) {
      utterance.lang = 'ja-JP'; // Japanese
    } else if (targetLang === 'zh' || /[\u4E00-\u9FFF]/.test(word)) {
      utterance.lang = 'zh-CN'; // Chinese
    } else if (targetLang === 'es' || /[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/i.test(word)) {
      utterance.lang = 'es-ES'; // Spanish
    } else if (targetLang === 'fr') {
      utterance.lang = 'fr-FR'; // French
    } else if (targetLang === 'de') {
      utterance.lang = 'de-DE'; // German
    } else if (targetLang === 'he' || /[\u0590-\u05FF]/.test(word)) {
      utterance.lang = 'he-IL'; // Hebrew (히브리어)
    } else if (targetLang === 'el' || /[\u0370-\u03FF\u1F00-\u1FFF]/.test(word)) {
      utterance.lang = 'el-GR'; // Greek / Koine Greek (헬라어)
    } else if (/[\u0400-\u04FF]/.test(word)) {
      utterance.lang = 'ru-RU'; // Cyrillic
    } else {
      utterance.lang = 'en-US'; // English default
    }

    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore speech errors
  }
}

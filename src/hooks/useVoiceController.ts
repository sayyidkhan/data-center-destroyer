import { useCallback, useEffect, useRef, useState } from 'react';
import type { TowerType } from '../game/types';
import sttConfig from '../../config.json';

export type VoiceCommand =
  | { type: 'build'; tower: TowerType; gridX: number; gridY: number }
  | { type: 'heroMove'; gridX: number; gridY: number }
  | { type: 'heroNudge'; dx: number; dy: number }
  | { type: 'scroll'; direction: 'left' | 'right'; steps: number }
  | { type: 'upgrade'; gridX: number; gridY: number; tower?: TowerType }
  | { type: 'scrollTo'; edge: 'start' | 'end' }
  | { type: 'scrollOps'; direction: 'up' | 'down'; steps: number }
  | { type: 'scrollOpsTo'; edge: 'top' | 'bottom' }
  | { type: 'attack'; package: 'grunt_pack' | 'speeder_rush' | 'tank_push' | 'swarm_burst' | 'boss_signal' }
  | { type: 'startWave' }
  | { type: 'pause' }
  | { type: 'cancel' };

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
  }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SttConfig = {
  openai?: {
    sttModel?: string;
  };
};

const OPENAI_SILENCE_MS = 1400;
const OPENAI_MIN_RECORDING_MS = 900;
const OPENAI_MAX_RECORDING_MS = 10000;
const OPENAI_MIN_VOICE_THRESHOLD = 0.012;
const OPENAI_NOISE_MULTIPLIER = 2.4;

/** Convert a column letter (A, B, … Z, AA, AB…) to a 0-based index. */
export function colLetterToIndex(letter: string): number {
  const s = letter.toUpperCase().trim();
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n - 1;
}

/** Convert a 0-based column index back to an Excel-style letter. */
export function colIndexToLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

// Canonical tower name lookup — includes common STT mishearings
const TOWER_WORDS: Record<string, TowerType> = {
  cannon: 'cannon',
  canon: 'cannon',
  can: 'cannon',
  canyon: 'cannon',
  kenya: 'cannon',
  'can on': 'cannon',
  laser: 'laser',
  lazer: 'laser',
  blazer: 'laser',
  razer: 'laser',
  frost: 'frost',
  frosty: 'frost',
  lost: 'frost',
  first: 'frost',
  tesla: 'tesla',
  testa: 'tesla',
  vessel: 'tesla',
  missile: 'missile',
  missal: 'missile',
  missel: 'missile',
  mistle: 'missile',
};

// Resolve an STT-produced word to a TowerType using exact match then fuzzy
function resolveTower(word: string): TowerType | null {
  const w = word.toLowerCase().trim();
  if (w in TOWER_WORDS) return TOWER_WORDS[w];
  // Partial prefix match: "miss" → missile, "las" → laser, "fro" → frost
  const canonical: TowerType[] = ['cannon', 'laser', 'frost', 'tesla', 'missile'];
  for (const t of canonical) {
    if (t.startsWith(w) || w.startsWith(t.slice(0, 4))) return t;
  }
  return null;
}

function parseNumber(value: string): number {
  const words: Record<string, number> = {
    zero: 0, oh: 0, o: 0, q: 0, cue: 0, queue: 0, owe: 0,
    one: 1, won: 1, wan: 1, once: 1,
    two: 2, to: 2, too: 2, tu: 2, twice: 2,
    three: 3, tree: 3, free: 3, through: 3,
    four: 4, for: 4, fore: 4, forth: 4, fourth: 4,
    five: 5, fife: 5, fav: 5,
    six: 6, sex: 6, sikh: 6,
    seven: 7,
    eight: 8, ate: 8, ait: 8,
    nine: 9, nein: 9, nigh: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
  };
  return words[value] ?? Number(value);
}


function parseVoiceCommand(text: string): VoiceCommand | null {
  const phrase = text.toLowerCase().trim().replace(/[.,!?]/g, '');

  // ── Column: a single letter spoken aloud — must be followed by a space or digit ─
  // Use a lookahead so the greedy [a-z]{1,2} doesn't swallow extra letters.
  const colLetter = '([a-z])(?=\\s|\\d|$)';

  // ── Row: a number word or digit string ─────────────────────────────────
  const rowWord = 'zero|oh|o|one|won|wan|once|two|too|to|tu|twice|three|tree|free|through|four|for|fore|forth|fourth|five|fife|fav|six|sex|sikh|seven|eight|ate|ait|nine|nein|nigh|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty';
  const rowCoord = `(\\d+|${rowWord})`;

  // Separator between column letter and row number — space/comma/dash, or nothing (e.g. "s14")
  const sep = '[\\s,\\-]*';

  // ── BUILD command ──────────────────────────────────────────────────────
  const buildVerb = '(?:build|place|add|put|set|drop|create|make|spawn|install)';
  // Optional preposition between tower name and coordinates
  const atPhrase = '(?:at|on|in|to|row|position|grid|coordinate|coords?|column|col)';
  const knownTowers = 'cannon|canon|laser|lazer|frost|tesla|missile|missal|missel|can|canyon|kenya|blazer|razer|frosty|testa|vessel|mistle';

  // Helper: try to extract gridX/gridY from a colLetter + rowCoord match pair
  const toCoords = (col: string, row: string): { gridX: number; gridY: number } | null => {
    const gridX = colLetterToIndex(col);
    const gridY = parseNumber(row) - 1; // ruler is 1-based, grid is 0-based
    if (isNaN(gridX) || isNaN(gridY) || gridY < 0) return null;
    return { gridX, gridY };
  };

  // Pattern A: known tower name, optional prep, then letter + number
  // e.g. "build laser at S 12" / "put lazer on s 12" / "place frost s 12"
  const buildKnown = new RegExp(
    `${buildVerb}\\s+(${knownTowers})\\s+(?:${atPhrase}\\s+)?${colLetter}${sep}${rowCoord}`
  );
  const buildKnownMatch = phrase.match(buildKnown);
  if (buildKnownMatch) {
    const tower = resolveTower(buildKnownMatch[1]);
    const coords = toCoords(buildKnownMatch[2], buildKnownMatch[3]);
    if (tower && coords) return { type: 'build', tower, ...coords };
  }

  // Pattern B: loose 1-word tower (fuzzy), optional prep, then letter + number
  // Captured tower word must NOT be a known prep or coord letter
  const buildLoose = new RegExp(
    `${buildVerb}\\s+([a-z]+)\\s+(?:${atPhrase}\\s+)?${colLetter}${sep}${rowCoord}`
  );
  const buildLooseMatch = phrase.match(buildLoose);
  if (buildLooseMatch) {
    const tower = resolveTower(buildLooseMatch[1].trim());
    const coords = toCoords(buildLooseMatch[2], buildLooseMatch[3]);
    if (tower && coords) return { type: 'build', tower, ...coords };
  }

  // ── UPGRADE command ────────────────────────────────────────────────────
  // "S7 laser level up", "upgrade laser at S7", "level up S7", "S7 level up"
  const upgradeVerb = '(?:upgrade|level\\s*up|power\\s*up|boost|improve|enhance)';

  // Pattern: coord + optional tower + upgrade verb  e.g. "S7 laser level up"
  const upgradeCoordFirst = new RegExp(
    `${colLetter}${sep}${rowCoord}\\s+(?:(${knownTowers})\\s+)?${upgradeVerb}`
  );
  const upgradeCoordFirstMatch = phrase.match(upgradeCoordFirst);
  if (upgradeCoordFirstMatch) {
    const coords = toCoords(upgradeCoordFirstMatch[1], upgradeCoordFirstMatch[2]);
    if (coords) {
      const tower = upgradeCoordFirstMatch[3] ? resolveTower(upgradeCoordFirstMatch[3]) ?? undefined : undefined;
      return { type: 'upgrade', ...coords, tower };
    }
  }

  // Pattern: upgrade verb + optional tower + coord  e.g. "upgrade laser at S7", "level up S7"
  const upgradeVerbFirst = new RegExp(
    `${upgradeVerb}\\s+(?:(${knownTowers})\\s+)?(?:${atPhrase}\\s+)?${colLetter}${sep}${rowCoord}`
  );
  const upgradeVerbFirstMatch = phrase.match(upgradeVerbFirst);
  if (upgradeVerbFirstMatch) {
    const coords = toCoords(upgradeVerbFirstMatch[2], upgradeVerbFirstMatch[3]);
    if (coords) {
      const tower = upgradeVerbFirstMatch[1] ? resolveTower(upgradeVerbFirstMatch[1]) ?? undefined : undefined;
      return { type: 'upgrade', ...coords, tower };
    }
  }

  // ── HERO MOVE command ──────────────────────────────────────────────────
  const heroWord = '(?:hero|mech|mecha|character|unit)';
  const moveVerb = '(?:move\\s+to|go\\s+to|go|move|teleport\\s+to|teleport|walk\\s+to|walk|run\\s+to|run|send\\s+to|send)';

  const movePattern = new RegExp(`${heroWord}\\s+(?:${moveVerb}\\s+)?${colLetter}${sep}${rowCoord}`);
  const moveMatch = phrase.match(movePattern);
  if (moveMatch) {
    const gridX = colLetterToIndex(moveMatch[1]);
    const gridY = parseNumber(moveMatch[2]) - 1;
    if (!isNaN(gridX) && !isNaN(gridY) && gridY >= 0) {
      return { type: 'heroMove', gridX, gridY };
    }
  }

  // ── HERO NUDGE ─────────────────────────────────────────────────────────
  const nudgeHero = new RegExp(`${heroWord}\\s+(up|down|left|right|north|south|east|west)`);
  const nudgeMatch = phrase.match(nudgeHero);
  if (nudgeMatch) {
    const dir = nudgeMatch[1];
    if (dir === 'up' || dir === 'north') return { type: 'heroNudge', dx: 0, dy: -1 };
    if (dir === 'down' || dir === 'south') return { type: 'heroNudge', dx: 0, dy: 1 };
    if (dir === 'left' || dir === 'west') return { type: 'heroNudge', dx: -1, dy: 0 };
    if (dir === 'right' || dir === 'east') return { type: 'heroNudge', dx: 1, dy: 0 };
  }

  // ── ATTACK PACKAGES ────────────────────────────────────────────────────
  const deployVerb = '(?:deploy|send|launch|attack\\s+with|use|activate|release|dispatch)';
  if (/\b(?:grunt|grunts?|grunt\s*pack|basic\s*attack|foot\s*soldiers?)\b/.test(phrase) && new RegExp(deployVerb).test(phrase))
    return { type: 'attack', package: 'grunt_pack' };
  if (/\b(?:speeder|speeders?|speeder\s*rush|speed\s*rush|fast\s*attack|runners?)\b/.test(phrase) && new RegExp(deployVerb).test(phrase))
    return { type: 'attack', package: 'speeder_rush' };
  if (/\b(?:tank|tanks?|tank\s*push|heavy\s*attack|armor(?:ed)?)\b/.test(phrase) && new RegExp(deployVerb).test(phrase))
    return { type: 'attack', package: 'tank_push' };
  if (/\b(?:swarm|swarms?|swarm\s*burst|bug\s*swarm|swarm\s*attack|bugs?)\b/.test(phrase) && new RegExp(deployVerb).test(phrase))
    return { type: 'attack', package: 'swarm_burst' };
  if (/\b(?:boss|boss\s*signal|big\s*guy|boss\s*attack|mega|titan)\b/.test(phrase) && new RegExp(deployVerb).test(phrase))
    return { type: 'attack', package: 'boss_signal' };

  // Also match shorthand like "grunt pack", "speeder rush" etc. without an explicit verb
  if (/\b(?:grunt\s*pack)\b/.test(phrase)) return { type: 'attack', package: 'grunt_pack' };
  if (/\b(?:speeder\s*rush)\b/.test(phrase)) return { type: 'attack', package: 'speeder_rush' };
  if (/\b(?:tank\s*push)\b/.test(phrase)) return { type: 'attack', package: 'tank_push' };
  if (/\b(?:swarm\s*burst)\b/.test(phrase)) return { type: 'attack', package: 'swarm_burst' };
  if (/\b(?:boss\s*signal)\b/.test(phrase)) return { type: 'attack', package: 'boss_signal' };

  // ── SCROLL ─────────────────────────────────────────────────────────────
  // Multiplier: "x 5", "x5", "times 5", "by 5", or spoken word "five"
  const numWord = 'one|two|three|four|five|six|seven|eight|nine|ten';
  const stepsCapture = `(?:\\s+(?:x|times|by|\\*)\\s*(\\d+|${numWord}))?`;
  const scrollVerb = '\\b(?:scroll|pan|skroll|scrawl|school|troll|stroll|move\\s+(?:camera|view|screen)|camera|look|slide|view)';
  const scrollRight = new RegExp(scrollVerb + '\\s+(?:right|east|forward)' + stepsCapture);
  const scrollLeft  = new RegExp(scrollVerb + '\\s+(?:left|west|back|backward)' + stepsCapture);
  const scrollRightMatch = phrase.match(scrollRight);
  if (scrollRightMatch) return { type: 'scroll', direction: 'right', steps: parseNumber(scrollRightMatch[1] ?? '1') || 1 };
  const scrollLeftMatch = phrase.match(scrollLeft);
  if (scrollLeftMatch) return { type: 'scroll', direction: 'left', steps: parseNumber(scrollLeftMatch[1] ?? '1') || 1 };
  // Plain directional fallback: "go right" / "go left" when no other command matched
  if (/\b(?:go|move|shift)\s+right\b/.test(phrase)) return { type: 'scroll', direction: 'right', steps: 1 };
  if (/\b(?:go|move|shift)\s+left\b/.test(phrase)) return { type: 'scroll', direction: 'left', steps: 1 };

  // ── CAMERA SCROLL TO EDGE ───────────────────────────────────────────────
  // "scroll to start", "go to beginning", "scroll to end", "scroll to the right end" etc.
  if (/\b(?:scroll|go|jump|move|pan)\s+to\s+(?:the\s+)?(?:start|beginning|left\s+end|far\s+left|leftmost)\b/.test(phrase))
    return { type: 'scrollTo', edge: 'start' };
  if (/\b(?:scroll|go|jump|move|pan)\s+to\s+(?:the\s+)?(?:end|right\s+end|far\s+right|rightmost|finish)\b/.test(phrase))
    return { type: 'scrollTo', edge: 'end' };

  // ── ATTACK OPS SCROLL (up / down) ─────────────────────────────────────
  // Matches many natural phrasings:
  //   "attack ops screen scroll down", "ops scroll up x 2", "scroll ops up",
  //   "ops down", "attack ops, scroll down", "ops panel scroll up"
  const opsKeyword = '\\b(?:attack\\s+)?ops?(?:\\s+(?:screen|panel|list|menu|section|window))?';
  const opsPhrase = `(?:${opsKeyword}[\\s,]+(?:scroll\\s+)?|(?:scroll\\s+)${opsKeyword}[\\s,]+)`;
  const opsScrollUp   = new RegExp(opsPhrase + '(?:up|north)' + stepsCapture);
  const opsScrollDown = new RegExp(opsPhrase + '(?:down|south)' + stepsCapture);
  const opsUpMatch   = phrase.match(opsScrollUp);
  if (opsUpMatch)   return { type: 'scrollOps', direction: 'up',   steps: parseNumber(opsUpMatch[1]   ?? '1') || 1 };
  const opsDownMatch = phrase.match(opsScrollDown);
  if (opsDownMatch) return { type: 'scrollOps', direction: 'down', steps: parseNumber(opsDownMatch[1] ?? '1') || 1 };

  // Ops scroll to top/bottom edge
  // "ops scroll to top", "attack ops go to bottom", "ops to the top" etc.
  const opsEdge = `${opsKeyword}[\\s,]+(?:(?:scroll|go|jump)\\s+to\\s+(?:the\\s+)?)?`;
  if (new RegExp(opsEdge + '(?:top|start|beginning)').test(phrase)) return { type: 'scrollOpsTo', edge: 'top' };
  if (new RegExp(opsEdge + '(?:bottom|end|finish)').test(phrase))   return { type: 'scrollOpsTo', edge: 'bottom' };
  // Also: "scroll to top of ops", "scroll to bottom of attack ops"
  if (/\b(?:scroll|go|jump)\s+to\s+(?:the\s+)?top\s+of\s+(?:attack\s+)?ops?\b/.test(phrase))    return { type: 'scrollOpsTo', edge: 'top' };
  if (/\b(?:scroll|go|jump)\s+to\s+(?:the\s+)?bottom\s+of\s+(?:attack\s+)?ops?\b/.test(phrase)) return { type: 'scrollOpsTo', edge: 'bottom' };

  // ── GLOBAL COMMANDS ────────────────────────────────────────────────────
  if (/\b(?:start\s+(?:wave|match|game|round)|launch\s+wave|begin\s+wave|send\s+wave)\b/.test(phrase)) return { type: 'startWave' };
  if (/\b(?:pause|resume|unpause)\b/.test(phrase)) return { type: 'pause' };
  if (/\b(?:cancel|clear|deselect|nevermind|never\s+mind|abort|stop)\b/.test(phrase)) return { type: 'cancel' };

  return null;
}

export function useVoiceController(
  onCommand: (command: VoiceCommand, transcript: string) => void,
  onFinalTranscript?: (transcript: string, matchedCommand: boolean) => void,
) {
  const openAiApiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  const openAiSttModel = (sttConfig as SttConfig).openai?.sttModel ?? 'gpt-4o-mini-transcribe';
  const shouldUseOpenAi = Boolean(openAiApiKey);
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const voiceRafRef = useRef<number | null>(null);
  const openAiSessionActiveRef = useRef(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const onCommandRef = useRef(onCommand);
  const onFinalTranscriptRef = useRef(onFinalTranscript);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    if (shouldUseOpenAi) {
      setIsSupported(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
      return;
    }

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ??
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript?.trim() ?? '';
        if (!transcript) continue;
        if (result.isFinal) finalTranscript += `${transcript} `;
        else interimTranscript += `${transcript} `;
      }

      const visibleTranscript = (interimTranscript || finalTranscript).trim();
      if (visibleTranscript) setLiveTranscript(visibleTranscript);
      setLastError(null);

      const completeTranscript = finalTranscript.trim();
      if (!completeTranscript) return;

      setLastTranscript(completeTranscript);
      setLiveTranscript('');

      const command = parseVoiceCommand(completeTranscript);
      onFinalTranscriptRef.current?.(completeTranscript, !!command);
      if (command) onCommandRef.current(command, completeTranscript);
    };

    recognition.onerror = (event) => {
      setLastError(event.error ?? 'Voice input failed');
    };

    recognition.onend = () => {
      setLiveTranscript('');
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, [shouldUseOpenAi]);

  const handleFinalTranscript = useCallback((completeTranscript: string) => {
    setLastTranscript(completeTranscript);
    setLiveTranscript('');

    const command = parseVoiceCommand(completeTranscript);
    onFinalTranscriptRef.current?.(completeTranscript, !!command);
    if (command) onCommandRef.current(command, completeTranscript);
  }, []);

  const transcribeWithOpenAi = useCallback(async (audioBlob: Blob) => {
    if (!openAiApiKey) return;

    setLiveTranscript('Transcribing with OpenAI...');
    setLastError(null);

    const form = new FormData();
    form.append('model', openAiSttModel);
    form.append('response_format', 'json');
    form.append('prompt', [
      'Tower defense game voice commands. Grid uses Excel-style coordinates: a column letter (A, B, C…) followed by a row number.',
      'Five tower types (spell exactly): cannon, laser, frost, tesla, missile.',
      'Build examples: "build cannon at D 6", "place laser at H 3", "put frost at Q 11", "add tesla at G 4", "build missile at C 9".',
      'Hero movement: "hero move to H 5", "hero up", "hero down", "hero left", "hero right".',
      'Camera: "scroll right", "scroll left", "pan right", "pan left".',
      'Attack: "grunt pack", "speeder rush", "tank push", "swarm burst", "boss signal".',
      'Other: "start wave", "pause", "cancel".',
      'IMPORTANT: always transcribe the column as a single letter and the row as a separate number (e.g. "Q 11" not "Q11" or "17 11").',
      'IMPORTANT: "frost" not "loss" or "first". "tesla" not "testa". "missile" not "missal". "cannon" not "canon".',
    ].join(' '));
    form.append('file', audioBlob, 'voice-command.webm');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`OpenAI STT failed (${response.status}): ${message}`);
    }

    const result = await response.json() as { text?: string };
    const transcript = result.text?.trim();
    if (!transcript) {
      setLiveTranscript('');
      setLastError('OpenAI returned an empty transcript');
      return;
    }

    handleFinalTranscript(transcript);
  }, [handleFinalTranscript, openAiApiKey, openAiSttModel]);

  const cleanupOpenAiRecording = useCallback(() => {
    if (voiceRafRef.current !== null) {
      cancelAnimationFrame(voiceRafRef.current);
      voiceRafRef.current = null;
    }

    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;

    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  const startOpenAiRecordingRef = useRef<() => void>(() => undefined);

  const startOpenAiRecording = useCallback(() => {
    if (!openAiSessionActiveRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setLastError('MediaRecorder is not supported in this browser');
      openAiSessionActiveRef.current = false;
      setIsListening(false);
      return;
    }

    void (async () => {
      try {
        setLastError(null);
        setLiveTranscript('Listening...');
        audioChunksRef.current = [];

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!openAiSessionActiveRef.current) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        mediaStreamRef.current = stream;
        const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        const audioContext = new AudioContextCtor();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);

        const samples = new Uint8Array(analyser.fftSize);
        let heardSpeech = false;
        let lastVoiceAt = performance.now();
        let noiseFloor = OPENAI_MIN_VOICE_THRESHOLD;
        const startedAt = performance.now();

        const preferredMime = 'audio/webm;codecs=opus';
        const mimeType = MediaRecorder.isTypeSupported(preferredMime) ? preferredMime : 'audio/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          audioChunksRef.current = [];
          cleanupOpenAiRecording();

          if (!heardSpeech || audioBlob.size === 0) {
            if (openAiSessionActiveRef.current) {
              setLiveTranscript('Listening...');
              window.setTimeout(() => startOpenAiRecordingRef.current(), 150);
            } else {
              setLiveTranscript('');
              setIsListening(false);
            }
            return;
          }

          void transcribeWithOpenAi(audioBlob)
            .catch((error: unknown) => {
              setLiveTranscript('');
              setLastError(error instanceof Error ? error.message : 'OpenAI STT failed');
            })
            .finally(() => {
              if (openAiSessionActiveRef.current) {
                window.setTimeout(() => startOpenAiRecordingRef.current(), 250);
              } else {
                setIsListening(false);
              }
            });
        };

        const stopRecorder = () => {
          if (recorder.state === 'recording') recorder.stop();
        };

        const monitorVoice = () => {
          if (!openAiSessionActiveRef.current || recorder.state !== 'recording') {
            return;
          }

          analyser.getByteTimeDomainData(samples);
          let sumSquares = 0;
          for (const sample of samples) {
            const centered = (sample - 128) / 128;
            sumSquares += centered * centered;
          }

          const rms = Math.sqrt(sumSquares / samples.length);
          const now = performance.now();
          const elapsed = now - startedAt;
          const threshold = Math.max(OPENAI_MIN_VOICE_THRESHOLD, noiseFloor * OPENAI_NOISE_MULTIPLIER);

          if (!heardSpeech) {
            noiseFloor = noiseFloor * 0.95 + rms * 0.05;
          }

          if (rms > threshold) {
            heardSpeech = true;
            lastVoiceAt = now;
            setLiveTranscript('Hearing you...');
          } else if (
            heardSpeech &&
            now - lastVoiceAt > OPENAI_SILENCE_MS &&
            elapsed > OPENAI_MIN_RECORDING_MS
          ) {
            setLiveTranscript('Transcribing with OpenAI...');
            stopRecorder();
            return;
          } else if (!heardSpeech && elapsed > OPENAI_MAX_RECORDING_MS) {
            stopRecorder();
            return;
          }

          if (elapsed > OPENAI_MAX_RECORDING_MS) {
            setLiveTranscript('Transcribing with OpenAI...');
            stopRecorder();
            return;
          }

          voiceRafRef.current = requestAnimationFrame(monitorVoice);
        };

        recorder.start(250);
        setIsListening(true);
        voiceRafRef.current = requestAnimationFrame(monitorVoice);
      } catch (error) {
        cleanupOpenAiRecording();
        setLiveTranscript('');
        setIsListening(false);
        openAiSessionActiveRef.current = false;
        setLastError(error instanceof Error ? error.message : 'Could not start microphone');
      }
    })();
  }, [cleanupOpenAiRecording, transcribeWithOpenAi]);

  useEffect(() => {
    startOpenAiRecordingRef.current = startOpenAiRecording;
  }, [startOpenAiRecording]);

  const startListening = useCallback(() => {
    if (shouldUseOpenAi) {
      if (openAiSessionActiveRef.current) return;
      openAiSessionActiveRef.current = true;
      setIsListening(true);
      startOpenAiRecording();
      return;
    }

    if (!recognitionRef.current) return;
    setLastError(null);
    recognitionRef.current.start();
    setIsListening(true);
  }, [shouldUseOpenAi, startOpenAiRecording]);

  const stopListening = useCallback(() => {
    if (shouldUseOpenAi) {
      openAiSessionActiveRef.current = false;
      setLiveTranscript('');
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      } else {
        cleanupOpenAiRecording();
        setIsListening(false);
      }
      return;
    }

    recognitionRef.current?.stop();
    setIsListening(false);
  }, [cleanupOpenAiRecording, shouldUseOpenAi]);

  return {
    isListening,
    isSupported,
    liveTranscript,
    lastTranscript,
    lastError,
    startListening,
    stopListening,
  };
}

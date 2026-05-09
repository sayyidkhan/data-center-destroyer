import { useCallback, useEffect, useRef, useState } from 'react';
export type VoicePhase = 'idle' | 'listening' | 'hearing' | 'processing' | 'done';
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

const OPENAI_SILENCE_MS = 700;          // cut after 700ms silence — shorter = snappier response
const OPENAI_MIN_RECORDING_MS = 400;    // minimum clip before processing
const OPENAI_MAX_RECORDING_MS = 8000;   // max clip length
const OPENAI_MIN_VOICE_THRESHOLD = 0.018; // lower floor — catches quieter speakers
const OPENAI_NOISE_MULTIPLIER = 2.5;    // threshold = noiseFloor × this — reduced to avoid missing speech

// Game keywords that must appear for a transcript to be acted on
const GAME_KEYWORDS = /\b(?:build|place|add|put|set|drop|create|make|spawn|install|deploy|send|launch|use|activate|release|dispatch|cannon|laser|frost|tesla|missile|hero|mech|scroll|pan|grunt|speeder|tank|swarm|boss|start|pause|cancel|upgrade|level\s*up|move|left|right|up|down|ops?|pop|attack|pack|rush|push|burst|signal)\b/i;

/** Returns true if the transcript looks like Whisper hallucination or background noise */
function isHallucination(transcript: string): boolean {
  const t = transcript.trim();
  if (!t) return true;
  // Common Whisper silence hallucinations — exact short filler phrases
  const fillers = /^(?:you|uh|um|hmm|hm|ah|oh|thank you|thanks|bye|goodbye|okay|ok|sure|yeah|yes|no|yep|nope|hi|hey|hello)\.?$/i;
  if (fillers.test(t)) return true;
  // Must contain at least one game-relevant keyword
  if (!GAME_KEYWORDS.test(t)) return true;
  return false;
}

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
// IMPORTANT: only include words that are unlikely to appear in everyday speech
// to avoid false-positive command triggers.
const TOWER_WORDS: Record<string, TowerType> = {
  // cannon variants
  cannon: 'cannon',
  canon: 'cannon',
  canyon: 'cannon',
  kenya: 'cannon',
  'can on': 'cannon',
  canning: 'cannon',
  ganon: 'cannon',
  // laser variants
  laser: 'laser',
  lazer: 'laser',
  blazer: 'laser',
  razer: 'laser',
  lazar: 'laser',
  lasers: 'laser',
  gazer: 'laser',
  'lay zer': 'laser',
  'lay ser': 'laser',
  fraser: 'laser',
  glazer: 'laser',
  // frost variants
  frost: 'frost',
  frosty: 'frost',
  // "lost", "first", "trust", "crossed" removed — too common, cause false positives
  // tesla variants
  tesla: 'tesla',
  testa: 'tesla',
  vessel: 'tesla',
  tesco: 'tesla',
  texla: 'tesla',
  // missile variants
  missile: 'missile',
  missal: 'missile',
  missel: 'missile',
  mistle: 'missile',
  missle: 'missile',
  mizzle: 'missile',
  // "mist" removed — too common an English word, causes false positives
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

  // ── Column: a single letter spoken aloud — must be followed by a space, digit, comma, dash or end ─
  // Use a lookahead so the greedy [a-z]{1,2} doesn't swallow extra letters.
  const colLetter = '([a-z])(?=\\s|\\d|[,\\-]|$)';

  // ── Row: a number word or digit string ─────────────────────────────────
  const rowWord = 'zero|oh|o|one|won|wan|once|two|too|to|tu|twice|three|tree|free|through|four|for|fore|forth|fourth|five|fife|fav|six|sex|sikh|seven|eight|ate|ait|nine|nein|nigh|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty';
  const rowCoord = `(\\d+|${rowWord})`;

  // Separator between column letter and row number — space/comma/dash/dot, or nothing (e.g. "s14", "s.14")
  const sep = '[\\s,\\.\\-]*';

  // ── BUILD command ──────────────────────────────────────────────────────
  const buildVerb = '(?:build|place|add|put|set|drop|create|make|spawn|install)';
  // Optional preposition between tower name and coordinates
  const atPhrase = '(?:at|on|in|to|row|position|grid|coordinate|coords?|column|col)';
  const knownTowers = 'cannon|canon|laser|lazer|lazar|blazer|razer|fraser|glazer|gazer|frost|frosty|tesla|testa|vessel|tesco|texla|missile|missal|missel|mistle|missle|mizzle|canyon|kenya|canning|ganon';

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
  // Require the captured word is ≥3 chars so single-letter prepositions (a, i) don't match as tower names
  const buildLoose = new RegExp(
    `${buildVerb}\\s+([a-z]{3,})\\s+(?:${atPhrase}\\s+)?${colLetter}${sep}${rowCoord}`
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
  // Deploy verb — intentionally narrow to avoid conflicts with scroll/hero/build verbs.
  // "send" excluded here because "send wave" → startWave must take priority (handled later).
  // "use" excluded — too generic. "launch" excluded — "launch wave" → startWave.
  const deployVerb = '(?:deploy|the\\s*ploy|eploy|imploy|de\\s*ploy|activate|release|dispatch|execute|trigger|initiate|attack\\s+with)';
  const hasDeployVerb = new RegExp(deployVerb).test(phrase);

  // Grunt pack — "grant pack", "prints pack" are common mishearings of "grunt pack"
  // "ground" removed — triggers on "hero go to ground level"
  const isGrunt = /\b(?:grunt|grunts?|grant|prints?)\b/.test(phrase);
  const isGruntPack = /\b(?:grunt\s*pack|grant\s*pack|prints?\s*pack)\b/.test(phrase);
  if (isGruntPack || (isGrunt && hasDeployVerb) || /\b(?:basic\s*attack|foot\s*soldiers?)\b/.test(phrase))
    return { type: 'attack', package: 'grunt_pack' };

  // Speeder rush — "spider rush", "speedster rush" are common mishearings
  // "speed" alone removed — triggers on "scroll speed" / "move speed"
  const isSpeeder = /\b(?:speeder|speeders?|spider|speedster)\b/.test(phrase);
  const isSpeederRush = /\b(?:speeder\s*rush|spider\s*rush|speed\s*rush|speedster\s*rush)\b/.test(phrase);
  if (isSpeederRush || (isSpeeder && hasDeployVerb) || /\b(?:fast\s*attack|runners?)\b/.test(phrase))
    return { type: 'attack', package: 'speeder_rush' };

  // Tank push
  const isTank = /\b(?:tank|tanks?)\b/.test(phrase);
  const isTankPush = /\b(?:tank\s*push)\b/.test(phrase);
  if (isTankPush || (isTank && hasDeployVerb) || /\b(?:heavy\s*attack|armou?red?\s*attack)\b/.test(phrase))
    return { type: 'attack', package: 'tank_push' };

  // Swarm burst — "storm" removed as alias: "start wave" could be heard as "storm wave"
  const isSwarm = /\b(?:swarm|swarms?)\b/.test(phrase);
  const isSwarmBurst = /\b(?:swarm\s*burst)\b/.test(phrase);
  if (isSwarmBurst || (isSwarm && hasDeployVerb) || /\b(?:bug\s*swarm|swarm\s*attack)\b/.test(phrase))
    return { type: 'attack', package: 'swarm_burst' };

  // Boss signal
  const isBoss = /\b(?:boss|mega|titan)\b/.test(phrase);
  const isBossSignal = /\b(?:boss\s*signal)\b/.test(phrase);
  if (isBossSignal || (isBoss && hasDeployVerb) || /\b(?:big\s*guy|boss\s*attack)\b/.test(phrase))
    return { type: 'attack', package: 'boss_signal' };

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
  // ── ATTACK OPS SCROLL ──────────────────────────────────────────────────
  // Two-pass: (1) does phrase mention the ops panel? (2) what direction?
  // Whisper mishearings of "ops": up, op, pop, ox, ups, oops, OP, "up screen"
  const hasOpsRef = /\b(?:attack\s+)?(?:ops?|pop|ox|ups?|oops)\b/i.test(phrase)
    || /\b(?:attack|op)\s+(?:screen|panel|list|menu|section|window)\b/i.test(phrase);

  if (hasOpsRef) {
    const hasDown = /\b(?:down|south|slow\s*down)\b/i.test(phrase);
    const hasUp   = /\b(?:up|north)\b/i.test(phrase)
      && !/\b(?:level\s*up|power\s*up|upgrade)\b/i.test(phrase); // exclude upgrade commands
    const hasTop    = /\b(?:top|beginning)\b/i.test(phrase);
    const hasBottom = /\b(?:bottom|end|finish)\b/i.test(phrase);

    const stepsMatch = phrase.match(/(?:x|times|by|\*)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
    const steps = stepsMatch ? parseNumber(stepsMatch[1]) || 1 : 1;

    if (hasBottom) return { type: 'scrollOpsTo', edge: 'bottom' };
    if (hasTop)    return { type: 'scrollOpsTo', edge: 'top' };
    if (hasDown)   return { type: 'scrollOps', direction: 'down', steps };
    if (hasUp)     return { type: 'scrollOps', direction: 'up',   steps };
  }

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
  const [audioLevel, setAudioLevel] = useState(0); // 0..1 RMS level
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');
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

    // Track which interim text we already fired a command for, to avoid double-firing
    let lastFiredInterim = '';

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
      if (visibleTranscript) {
        setLiveTranscript(visibleTranscript);
        setVoicePhase(interimTranscript ? 'hearing' : 'processing');
      }
      setLastError(null);

      // Early-fire: if an interim result is already a complete command, act now
      // without waiting for isFinal — this removes ~300-600ms of perceived latency
      if (interimTranscript && interimTranscript !== lastFiredInterim) {
        const interimCommand = parseVoiceCommand(interimTranscript.trim());
        if (interimCommand) {
          lastFiredInterim = interimTranscript;
          setLastTranscript(interimTranscript.trim());
          setLiveTranscript('');
          onFinalTranscriptRef.current?.(interimTranscript.trim(), true);
          onCommandRef.current(interimCommand, interimTranscript.trim());
          return;
        }
      }

      const completeTranscript = finalTranscript.trim();
      if (!completeTranscript) return;

      // Skip if we already fired this text as interim
      if (completeTranscript === lastFiredInterim.trim()) {
        lastFiredInterim = '';
        return;
      }
      lastFiredInterim = '';

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
      setVoicePhase('idle');
      setAudioLevel(0);
    };

    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, [shouldUseOpenAi]);

  const handleFinalTranscript = useCallback((completeTranscript: string) => {
    setLastTranscript(completeTranscript);
    setLiveTranscript('');
    setVoicePhase('done');
    setAudioLevel(0);

    const command = parseVoiceCommand(completeTranscript);
    onFinalTranscriptRef.current?.(completeTranscript, !!command);
    if (command) onCommandRef.current(command, completeTranscript);

    // Return to listening phase after brief "done" flash
    setTimeout(() => setVoicePhase(p => p === 'done' ? 'listening' : p), 600);
  }, []);

  /** Pass raw Whisper text through GPT to autocorrect into a valid game command. */
  const autocorrectTranscript = useCallback(async (raw: string): Promise<string> => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 60,
        messages: [
          {
            role: 'system',
            content: [
              'You are a voice-command corrector for a tower-defense game.',
              'The player speaks commands and speech-to-text may mishear words.',
              'Correct the raw transcript into the closest valid game command. Reply with ONLY the corrected command text, nothing else.',
              '',
              'Valid commands (output EXACTLY in this format, no brackets, no punctuation):',
              'build cannon at D 6',
              'build laser at H 3',
              'build frost at Q 11',
              'build tesla at G 4',
              'build missile at C 9',
              'hero up',
              'hero down',
              'hero left',
              'hero right',
              'hero move to H 5',
              'scroll right',
              'scroll right x 5',
              'scroll left x 3',
              'ops scroll down',
              'ops scroll down x 2',
              'ops scroll up',
              'ops scroll to bottom',
              'ops scroll to top',
              'upgrade D 6',
              'start wave',
              'pause',
              'cancel',
              'deploy grunt pack',
              'deploy speeder rush',
              'deploy tank push',
              'deploy swarm burst',
              'deploy boss signal',
              '',
              'Rules:',
              '- Output ONLY the corrected command. No brackets, no quotes, no explanation.',
              '- Grid column is a letter (A-Z), row is a number 1-14. Always separate with a space: D 6 not D6.',
              '- Multiplier is written as: x 5 (space between x and number, no brackets).',
              '- Tower mishearings: "canyon/canning/ganon" → "cannon", "lazer/blazer/lazar/razer/fraser/glazer/gazer" → "laser", "frosty" → "frost", "testa/vessel/tesco/texla" → "tesla", "missal/missel/mistle/missle/mizzle" → "missile".',
              '- Attack mishearings: "grant pack/prints pack" → "deploy grunt pack", "spider rush/speedster rush/speed rush" → "deploy speeder rush", "storm burst/bug swarm" → "deploy swarm burst", "big guy" → "deploy boss signal".',
              '- Other mishearings: "start mitch/start match" → "start wave", "send wave/launch wave" → "start wave", "op/pop/ox/up screen" → "ops scroll", "slow down" → "scroll down".',
              '- If the input is silence, noise, or cannot map to any command, reply exactly: NONE',
            ].join('\n'),
          },
          { role: 'user', content: raw },
        ],
      }),
    });

    if (!response.ok) return raw; // fall back to raw if autocorrect fails
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const corrected = (data.choices?.[0]?.message?.content ?? '').trim();
    if (!corrected || corrected === 'NONE') return '';
    // Strip any brackets/quotes GPT might still add despite instructions
    return corrected.replace(/[\[\]()"""'']/g, '').trim();
  }, [openAiApiKey]);

  const transcribeWithOpenAi = useCallback(async (audioBlob: Blob) => {
    if (!openAiApiKey) return;

    setLastError(null);

    const form = new FormData();
    form.append('model', openAiSttModel);
    form.append('response_format', 'json');
    // No prompt — Whisper hallucinates prompt text from silence, so we omit it entirely
    form.append('file', audioBlob, 'voice-command.webm');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiApiKey}` },
      body: form,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`OpenAI STT failed (${response.status}): ${message}`);
    }

    const result = await response.json() as { text?: string };
    const rawTranscript = (result.text ?? '').trim();

    // Drop obvious hallucinations before even calling autocorrect
    if (isHallucination(rawTranscript)) {
      setLiveTranscript('');
      return;
    }

    // Autocorrect with GPT — fixes mishearings like "start mitch" → "start wave"
    const transcript = await autocorrectTranscript(rawTranscript);

    if (!transcript || isHallucination(transcript)) {
      setLiveTranscript('');
      return;
    }

    handleFinalTranscript(transcript);
  }, [autocorrectTranscript, handleFinalTranscript, openAiApiKey, openAiSttModel]);

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

          // Minimum blob size — silence blobs are tiny; real speech even at 400ms is larger than this.
          // Kept low enough to not discard short commands like "pause" or "cancel".
          const MIN_BLOB_BYTES = 4000;
          if (!heardSpeech || audioBlob.size < MIN_BLOB_BYTES) {
            if (openAiSessionActiveRef.current) {
              // Nothing heard — restart silently, no UI changes
              startOpenAiRecordingRef.current();
            } else {
              setLiveTranscript('');
              setIsListening(false);
            }
            return;
          }

          // Speech detected — restart listening immediately while transcription runs in parallel
          if (openAiSessionActiveRef.current) {
            startOpenAiRecordingRef.current();
          }

          void transcribeWithOpenAi(audioBlob)
            .catch((error: unknown) => {
              setLastError(error instanceof Error ? error.message : 'OpenAI STT failed');
            })
            .finally(() => {
              if (!openAiSessionActiveRef.current) {
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

          // Update noise floor while quiet
          if (!heardSpeech) {
            noiseFloor = noiseFloor * 0.95 + rms * 0.05;
          }

          if (rms > threshold) {
            // Real voice detected — update UI
            heardSpeech = true;
            lastVoiceAt = now;
            setAudioLevel(Math.min(1, rms * 10));
            setLiveTranscript('Hearing you...');
            setVoicePhase('hearing');
          } else if (heardSpeech && now - lastVoiceAt > OPENAI_SILENCE_MS && elapsed > OPENAI_MIN_RECORDING_MS) {
            // Was speaking, now gone silent long enough — send to OpenAI
            setLiveTranscript('');
            setVoicePhase('processing');
            setAudioLevel(0);
            stopRecorder();
            return;
          } else if (!heardSpeech && elapsed > OPENAI_MAX_RECORDING_MS) {
            // Timed out with no voice — restart silently
            stopRecorder();
            return;
          } else if (elapsed > OPENAI_MAX_RECORDING_MS) {
            // Hard cap hit — send whatever we have
            setLiveTranscript('');
            setVoicePhase('processing');
            setAudioLevel(0);
            stopRecorder();
            return;
          }
          // While quiet and waiting: do NOT update audioLevel or liveTranscript — stay still

          voiceRafRef.current = requestAnimationFrame(monitorVoice);
        };

        recorder.start(100); // smaller chunks = less tail latency when we cut
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
      setVoicePhase('listening');
      startOpenAiRecording();
      return;
    }

    if (!recognitionRef.current) return;
    setLastError(null);
    setVoicePhase('listening');
    recognitionRef.current.start();
    setIsListening(true);
  }, [shouldUseOpenAi, startOpenAiRecording]);

  const stopListening = useCallback(() => {
    if (shouldUseOpenAi) {
      openAiSessionActiveRef.current = false;
      setLiveTranscript('');
      setVoicePhase('idle');
      setAudioLevel(0);
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
    setVoicePhase('idle');
    setAudioLevel(0);
  }, [cleanupOpenAiRecording, shouldUseOpenAi]);

  return {
    isListening,
    isSupported,
    liveTranscript,
    lastTranscript,
    lastError,
    audioLevel,
    voicePhase,
    startListening,
    stopListening,
  };
}

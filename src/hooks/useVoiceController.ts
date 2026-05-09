import { useCallback, useEffect, useRef, useState } from 'react';
import type { TowerType } from '../game/types';

export type VoiceCommand =
  | { type: 'build'; tower: TowerType; gridX: number; gridY: number }
  | { type: 'heroMove'; gridX: number; gridY: number }
  | { type: 'heroNudge'; dx: number; dy: number }
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

const TOWER_WORDS: Record<string, TowerType> = {
  cannon: 'cannon',
  laser: 'laser',
  frost: 'frost',
  tesla: 'tesla',
  missile: 'missile',
};

function parseNumber(value: string) {
  const words: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
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
  const phrase = text.toLowerCase().trim();
  const coord = '(\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
  const build = phrase.match(new RegExp(`(?:build|place|add)\\s+(cannon|laser|frost|tesla|missile)\\s+(?:at\\s+)?${coord}\\s+${coord}`));

  if (build) {
    return {
      type: 'build',
      tower: TOWER_WORDS[build[1]],
      gridX: parseNumber(build[2]),
      gridY: parseNumber(build[3]),
    };
  }

  const move = phrase.match(new RegExp(`(?:hero|mech|mecha)\\s+(?:move\\s+to|go\\s+to|to)\\s+${coord}\\s+${coord}`));
  if (move) {
    return {
      type: 'heroMove',
      gridX: parseNumber(move[1]),
      gridY: parseNumber(move[2]),
    };
  }

  if (phrase.includes('hero up') || phrase.includes('mech up') || phrase.includes('mecha up')) return { type: 'heroNudge', dx: 0, dy: -1 };
  if (phrase.includes('hero down') || phrase.includes('mech down') || phrase.includes('mecha down')) return { type: 'heroNudge', dx: 0, dy: 1 };
  if (phrase.includes('hero left') || phrase.includes('mech left') || phrase.includes('mecha left')) return { type: 'heroNudge', dx: -1, dy: 0 };
  if (phrase.includes('hero right') || phrase.includes('mech right') || phrase.includes('mecha right')) return { type: 'heroNudge', dx: 1, dy: 0 };

  if (phrase.includes('start wave') || phrase.includes('start match')) return { type: 'startWave' };
  if (phrase.includes('pause') || phrase.includes('resume')) return { type: 'pause' };
  if (phrase.includes('cancel') || phrase.includes('clear')) return { type: 'cancel' };

  return null;
}

export function useVoiceController(onCommand: (command: VoiceCommand, transcript: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onCommandRef = useRef(onCommand);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
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
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    setLastError(null);
    recognitionRef.current.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

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

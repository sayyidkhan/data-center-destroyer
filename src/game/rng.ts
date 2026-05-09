import seedrandom from 'seedrandom';

export function createSeededRandom(seed: number | string): () => number {
  return seedrandom(String(seed));
}

export function deterministicUid(playerId: string, tick: number, actionIndex: number): string {
  return `${playerId}_${tick}_${actionIndex}`;
}

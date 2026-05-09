import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'src', 'data');
const outputPath = path.join(dataDir, 'game-data.generated.json');

const GAME_DATA_VERSION = 'single-player-v1';

const sourceFiles = {
  map: 'map.json',
  economy: 'economy.json',
  hero: 'hero.json',
  towers: 'towers.json',
  enemies: 'enemies.json',
  waves: 'waves.json',
  combat: 'combat.json',
  pvpAttacks: 'pvp-attacks.json',
};

async function readJson(fileName) {
  const raw = await readFile(path.join(dataDir, fileName), 'utf8');
  return JSON.parse(raw);
}

const data = {};
for (const [key, fileName] of Object.entries(sourceFiles)) {
  data[key] = await readJson(fileName);
}

const hashInput = JSON.stringify({
  version: GAME_DATA_VERSION,
  data,
});

const contentHash = createHash('sha256').update(hashInput).digest('hex');

const bundle = {
  schema: 'data-center-destroyer/game-data-bundle',
  version: GAME_DATA_VERSION,
  contentHash,
  sources: sourceFiles,
  data,
};

await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`);

console.log(`Generated ${path.relative(rootDir, outputPath)}`);
console.log(`version=${GAME_DATA_VERSION}`);
console.log(`contentHash=${contentHash}`);

import type { GameId, GameMeta, GameModule } from '../engine/types';

export const GAME_CATALOG: readonly GameMeta[] = [
  {
    id: 'botanical-drift',
    number: 1,
    title: 'Botanical Drift',
    subtitle: 'Kyoto Maple Garden Circuit',
    genre: 'Drift Racer',
    style: 'Autumnal Kyoto',
    accentColor: '#C85A32',
    controls: [
      { keys: 'W / S', action: 'Accelerate & Brake' },
      { keys: 'A / D', action: 'Steer' },
      { keys: 'Space', action: 'Handbrake Drift' },
      { keys: 'Shift', action: 'Drift Boost' },
    ],
    objective: 'Carve smooth drifts beneath glowing autumn maples and set a blistering three-lap time.',
  },
  {
    id: 'meadow-shepherd',
    number: 2,
    title: 'Meadow Shepherd',
    subtitle: 'Sunlit Pastoral Valley',
    genre: 'Herding Adventure',
    style: 'Sunlit Pastoral',
    accentColor: '#5B8C4E',
    controls: [
      { keys: 'WASD / Arrows', action: 'Drive Across Meadow' },
      { keys: 'Space', action: 'Shepherd Whistle' },
      { keys: 'Shift', action: 'Burst Sprint' },
    ],
    objective: 'Guide the wandering wooly flock through wind-swept wildflowers into the stone paddock before dusk.',
  },
  {
    id: 'noir-quay',
    number: 3,
    title: 'Noir Quay',
    subtitle: 'Rain-Slicked Harbor Mystery',
    genre: 'Detective Exploration',
    style: 'Film Noir',
    accentColor: '#C79A4B',
    controls: [
      { keys: 'WASD / Arrows', action: 'Patrol the Dock' },
      { keys: 'Mouse / Q·E', action: 'Aim Headlamp' },
      { keys: 'Space / E', action: 'Inspect Clue' },
    ],
    objective: 'Sweep your dual brass headlamps through the rainy wharf, uncover hidden evidence, and solve the heist.',
  },
  {
    id: 'starlight-pinball',
    number: 4,
    title: 'Starlight Pinball',
    subtitle: 'Celestial Brass Observatory',
    genre: 'Kinetic Pinball',
    style: 'Brass Observatory',
    accentColor: '#D4A24E',
    controls: [
      { keys: 'A / D / Arrows', action: 'Left & Right Flippers / Move' },
      { keys: 'Space', action: 'Launch & Bump Pulse' },
      { keys: 'Shift', action: 'Nudge / Dash' },
    ],
    objective: 'Ricochet through astrolabe bumpers, light every constellation lane, and chain celestial multipliers.',
  },
  {
    id: 'sakura-parkour',
    number: 5,
    title: 'Sakura Parkour',
    subtitle: 'Twilight Pagoda Rooftops',
    genre: 'Precision Platformer',
    style: 'Sakura Dusk',
    accentColor: '#D4728C',
    controls: [
      { keys: 'WASD / Arrows', action: 'Drive & Air Control' },
      { keys: 'Space', action: 'Spring Hop' },
      { keys: 'Shift', action: 'Air Dash' },
    ],
    objective: 'Vault between lantern-lit shrine terraces and floating cherry-blossom platforms to reach the summit.',
  },
  {
    id: 'coral-delivery',
    number: 6,
    title: 'Coral Delivery',
    subtitle: 'Terracotta Cove Express',
    genre: 'Courier Rush',
    style: 'Sun-Baked Canyon',
    accentColor: '#D66D4B',
    controls: [
      { keys: 'WASD / Arrows', action: 'Navigate Cove Roads' },
      { keys: 'Shift', action: 'Turbo Dispatch' },
      { keys: 'Space', action: 'Toss Parcel / Brake' },
    ],
    objective: 'Deliver hand-tied botanical parcels across sun-drenched terracotta bridges before the courier timer expires.',
  },
  {
    id: 'synthwave-overdrive',
    number: 7,
    title: 'Synthwave Overdrive',
    subtitle: 'Twilight Horizon Highway',
    genre: 'Endless Runner',
    style: 'Retro Horizon',
    accentColor: '#C94B8B',
    controls: [
      { keys: 'A / D / Arrows', action: 'Weave Lanes' },
      { keys: 'Space', action: 'Jump Barrier' },
      { keys: 'Shift', action: 'Overdrive Surge' },
    ],
    objective: 'Thread glowing gate arches at full velocity, absorb energy prisms, and ride the sunset synth grid.',
  },
  {
    id: 'living-library',
    number: 8,
    title: 'Living Library',
    subtitle: 'Grand Glass Conservatory',
    genre: 'Tactile Puzzle',
    style: 'Botanical Archive',
    accentColor: '#4F8A7B',
    controls: [
      { keys: 'WASD / Arrows', action: 'Glide Through Aisles' },
      { keys: 'Space / E', action: 'Trigger Switch / Collect Tome' },
      { keys: 'R', action: 'Reset Chamber' },
    ],
    objective: 'Unlock shifting brass bookstacks beneath a sunlit conservatory dome to recover the lost illuminated folios.',
  },
  {
    id: 'glacier-slalom',
    number: 9,
    title: 'Glacier Slalom',
    subtitle: 'Nordic Fjord Descent',
    genre: 'Downhill Slalom',
    style: 'Nordic Winter',
    accentColor: '#4B89B5',
    controls: [
      { keys: 'A / D / Arrows', action: 'Carve Edges' },
      { keys: 'W / S', action: 'Tuck & Air-Brake' },
      { keys: 'Shift', action: 'Ice Boost' },
    ],
    objective: 'Thread crimson and cobalt slalom flags down a crystalline pine-lined fjord without clipping a gate.',
  },
  {
    id: 'orbital-greenhouse',
    number: 10,
    title: 'Orbital Greenhouse',
    subtitle: 'Zero-G Botanical Bio-Dome',
    genre: 'Zero-G Harvester',
    style: 'Orbital Sci-Fi',
    accentColor: '#5AA382',
    controls: [
      { keys: 'WASD / Arrows', action: 'RCS Thrusters' },
      { keys: 'Space / Shift', action: 'Ascend / Stabilize' },
      { keys: 'E', action: 'Tractor Harvest' },
    ],
    objective: 'Pilot your zero-gravity chair among floating bioluminescent orchids and return samples to the airlock pod.',
  },
];

// Automatic Vite module discovery so each game author simply creates `src/games/g0X-<id>/index.ts`
// exporting `default: GameModule` without ever modifying this file.
type ModuleImporter = () => Promise<{ default?: GameModule }>;
const discoveredModules = import.meta.glob<{ default?: GameModule }>('./*/index.ts') as Record<
  string,
  ModuleImporter
>;

function findLoaderForId(id: GameId): ModuleImporter | null {
  for (const [path, loader] of Object.entries(discoveredModules)) {
    if (path.endsWith(`/${id}/index.ts`) || path.endsWith(`-${id}/index.ts`)) {
      return loader;
    }
  }
  return null;
}

export function isGameAvailable(id: GameId): boolean {
  return findLoaderForId(id) !== null;
}

export function getGameMeta(id: string): GameMeta | undefined {
  return GAME_CATALOG.find((g) => g.id === id);
}

export async function loadGameModule(id: GameId): Promise<GameModule | null> {
  const loader = findLoaderForId(id);
  if (!loader) return null;
  const mod = await loader();
  if (!mod.default) {
    throw new Error(`Game module "${id}" did not provide a default GameModule export.`);
  }
  return mod.default;
}

const SCORE_PREFIX = 'atelier10:best:';

export function getBestScore(id: GameId): number | null {
  try {
    const raw = localStorage.getItem(`${SCORE_PREFIX}${id}`);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function saveBestScore(id: GameId, score: number): boolean {
  if (!Number.isFinite(score)) return false;
  const rounded = Math.round(score);
  const prev = getBestScore(id);
  if (prev === null || rounded > prev) {
    try {
      localStorage.setItem(`${SCORE_PREFIX}${id}`, String(rounded));
    } catch {
      // ignore storage errors
    }
    return true;
  }
  return false;
}

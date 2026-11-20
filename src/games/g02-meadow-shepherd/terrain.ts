import * as THREE from 'three';
import { getPBRTextures } from '../../art';

// ---------------------------------------------------------------------------
// World Constants & Layout Geometry
// ---------------------------------------------------------------------------

export const VALLEY_PLAY_RADIUS = 38.0;
export const WALL_RADIUS = 40.2;
export const TERRAIN_SIZE = 176;
export const TERRAIN_SEGMENTS = 148;
export const WATER_LEVEL = -0.22;

export const BARN_CENTER = new THREE.Vector2(-23.2, 2.0);
export const PADDOCK_CENTER = new THREE.Vector2(-13.0, 2.0);
export const PADDOCK_MIN_X = -18.2;
export const PADDOCK_MAX_X = -7.8;
export const PADDOCK_MIN_Z = -3.6;
export const PADDOCK_MAX_Z = 7.6;
export const PADDOCK_GATE_Z_MIN = -1.2;
export const PADDOCK_GATE_Z_MAX = 5.2;
export const PADDOCK_GATE_POS = new THREE.Vector2(PADDOCK_MAX_X, 2.0);

export const WINDMILL_POS = new THREE.Vector2(-12.5, -26.5);

export const BRIDGE_Z = 2.0;
export const BRIDGE_HALF_LEN = 4.9;
export const BRIDGE_HALF_WIDTH = 2.1;
export const BRIDGE_ARCH_HEIGHT = 0.96;

export const FORD_Z = -16.0;

export const CLOVER_PATCHES: readonly { x: number; z: number; radius: number }[] = [
  { x: 18.5, z: -10.5, radius: 4.0 },
  { x: 17.8, z: 16.5, radius: 4.0 },
];

export interface ObstacleCircle {
  x: number;
  z: number;
  radius: number;
}

export interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// ---------------------------------------------------------------------------
// Math Utilities
// ---------------------------------------------------------------------------

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 1e-6 ? clamp((wx * vx + wz * vz) / lenSq, 0, 1) : 0;
  const dx = px - (ax + vx * t);
  const dz = pz - (az + vz * t);
  return Math.hypot(dx, dz);
}

// ---------------------------------------------------------------------------
// Stream Meander & Bridge Coordinate Transforms
// ---------------------------------------------------------------------------

export function streamCenterX(z: number): number {
  return 4.8 + Math.sin((z - BRIDGE_Z) * 0.065) * 4.6;
}

export function streamSlopeDxDz(z: number): number {
  return Math.cos((z - BRIDGE_Z) * 0.065) * 4.6 * 0.065;
}

export const BRIDGE_CENTER_X = streamCenterX(BRIDGE_Z); // 4.8
// Bridge runs perpendicular to the stream tangent at z = BRIDGE_Z
// Stream tangent in XZ is (dx/dz, 1), so perpendicular across-stream vector is (1, -dx/dz)
export const BRIDGE_ANGLE = Math.atan(streamSlopeDxDz(BRIDGE_Z)); // yaw around Y so local +X points along (1, -dx/dz)
const BRIDGE_COS = Math.cos(BRIDGE_ANGLE);
const BRIDGE_SIN = Math.sin(BRIDGE_ANGLE);

export const FORD_CENTER_X = streamCenterX(FORD_Z);

/**
 * Signed local coordinates on the arched footbridge:
 * `lx` runs across the stream (-BRIDGE_HALF_LEN west -> +BRIDGE_HALF_LEN east),
 * `lz` runs along the bridge width (-BRIDGE_HALF_WIDTH -> +BRIDGE_HALF_WIDTH).
 */
export function worldToBridgeLocal(x: number, z: number): { lx: number; lz: number } {
  const dx = x - BRIDGE_CENTER_X;
  const dz = z - BRIDGE_Z;
  // Inverse rotation by BRIDGE_ANGLE around Y:
  // Local +X in Three.js rotated by Y(theta) points along (cos, -sin)
  // Local +Z in Three.js rotated by Y(theta) points along (sin, cos)
  const lx = dx * BRIDGE_COS - dz * BRIDGE_SIN;
  const lz = dx * BRIDGE_SIN + dz * BRIDGE_COS;
  return { lx, lz };
}

export function bridgeLocalToWorld(lx: number, lz: number): { x: number; z: number } {
  return {
    x: BRIDGE_CENTER_X + lx * BRIDGE_COS + lz * BRIDGE_SIN,
    z: BRIDGE_Z - lx * BRIDGE_SIN + lz * BRIDGE_COS,
  };
}

export function streamDistance(x: number, z: number): number {
  const cx = streamCenterX(z);
  const slope = streamSlopeDxDz(z);
  // Perpendicular distance correction for stream meander slope
  return Math.abs(x - cx) / Math.sqrt(1 + slope * slope);
}

export function streamHalfWidthAt(z: number): number {
  return 2.55 + Math.sin(z * 0.14 + 0.7) * 0.35;
}

/** Smoothly curved organic perimeter wall radius at angle theta */
export function wallRadiusAtAngle(theta: number): number {
  return WALL_RADIUS + Math.sin(theta * 3 + 0.5) * 1.15 + Math.cos(theta * 5 - 0.8) * 0.65;
}

// ---------------------------------------------------------------------------
// Dirt Footpath Network (for ground painting + grass/wildflower masking)
// ---------------------------------------------------------------------------

const PATH_POLYLINES: readonly (readonly [number, number])[] = [
  // Main path: spawn -> junction -> paddock gate
  [0.0, 24.0],
  [0.0, 17.5],
  [-1.2, 10.5],
  [-3.8, 4.8],
  [-7.8, 2.0],
];

const PATH_TO_BRIDGE: readonly (readonly [number, number])[] = [
  [-7.8, 2.0],
  [-3.2, 3.0],
  [BRIDGE_CENTER_X - 4.5, BRIDGE_Z + 1.3],
  [BRIDGE_CENTER_X + 4.5, BRIDGE_Z - 1.3],
  [12.5, -0.5],
  [17.5, -4.5],
  [18.5, -10.5],
];

const PATH_TO_MILL: readonly (readonly [number, number])[] = [
  [-3.8, 4.8],
  [-3.6, -4.5],
  [-2.5, -12.5],
  [FORD_CENTER_X, FORD_Z],
  [-5.5, -18.5],
  [-11.5, -21.5],
];

const ALL_PATHS = [PATH_POLYLINES, PATH_TO_BRIDGE, PATH_TO_MILL];

export function distanceToDirtPath(x: number, z: number): number {
  let minD = 999;
  for (const poly of ALL_PATHS) {
    for (let i = 0; i < poly.length - 1; i++) {
      const d = distToSegment(x, z, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1]);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

// ---------------------------------------------------------------------------
// Authoritative Terrain & Bridge Elevation Functions
// ---------------------------------------------------------------------------

export function terrainHeightAt(x: number, z: number): number {
  // 1. Base gentle sunlit pastoral hills across the valley
  let h =
    0.72 +
    Math.sin(x * 0.055 + 0.4) * Math.cos(z * 0.052 - 0.3) * 0.72 +
    Math.sin((x + z) * 0.038) * 0.48 +
    Math.cos(x * 0.11 - z * 0.09) * 0.22;

  // Slightly higher sunlit eastern meadow knoll
  const eastDist = Math.hypot(x - 24, z - 4);
  h += Math.exp(-(eastDist * eastDist) / 260) * 1.45;

  // Scenic northern-west Windmill Hilltop (flat crown at y ≈ 4.35)
  const millDist = Math.hypot(x - WINDMILL_POS.x, z - WINDMILL_POS.y);
  const millBump = Math.exp(-(millDist * millDist) / 145) * 3.85;
  h += millBump;
  if (millDist < 7.5) {
    const flatT = 1 - smoothstep(3.8, 7.5, millDist);
    h = lerp(h, 4.35, flatT * 0.85);
  }

  // Gentle outer cradled valley rim hills beyond the dry-stone perimeter wall
  const r = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  const wallR = wallRadiusAtAngle(theta);
  if (r > wallR - 2.0) {
    const rimT = smoothstep(wallR - 2.0, wallR + 28.0, r);
    const hillWaves =
      1.0 +
      0.34 * Math.sin(theta * 4 + 0.8) +
      0.24 * Math.cos(theta * 7 - 0.4) +
      0.16 * Math.sin(theta * 2 + 1.9);
    h += rimT * rimT * 10.5 * hillWaves;
  }

  // 2. Smoothly level the Barn & Paddock sunlit courtyard terrace (y ≈ 0.88)
  const dxP = Math.max(0, Math.abs(x - -17.0) - 10.5);
  const dzP = Math.max(0, Math.abs(z - 2.0) - 6.8);
  const barnPadDist = Math.hypot(dxP, dzP);
  if (barnPadDist < 7.5) {
    const t = 1 - smoothstep(1.2, 7.5, barnPadDist);
    h = lerp(h, 0.88, t);
  }

  // Keep player starting path gently graded
  const spawnDist = Math.hypot(x - 0, z - 20);
  if (spawnDist < 7.0) {
    const t = 1 - smoothstep(2.0, 7.0, spawnDist);
    h = lerp(h, 0.78, t * 0.65);
  }

  // 3. Carve the meandering babbling brook channel cleanly below WATER_LEVEL
  const sDist = streamDistance(x, z);
  const halfW = streamHalfWidthAt(z);
  const bankOuter = halfW + 4.8;

  if (sDist < bankOuter) {
    // Smoothly bring surrounding meadow down to consistent gentle bank elevation (+0.44m)
    const bankBlend = 1 - smoothstep(halfW + 0.4, bankOuter, sDist);
    h = lerp(h, 0.44, bankBlend * 0.88);

    // Ensure minimum clearance above water outside the wet channel
    if (sDist >= halfW * 1.08) {
      h = Math.max(h, WATER_LEVEL + 0.42);
    }

    // Carve smooth riverbed below WATER_LEVEL inside channel
    const channelT = 1 - smoothstep(halfW * 0.38, halfW * 1.18, sDist);
    // Shallow riffle at the Stepping-Stone Ford (z ≈ FORD_Z)
    const fordT = 1 - smoothstep(1.2, 4.6, Math.abs(z - FORD_Z));
    const bedDepth = lerp(-0.96, -0.35, fordT);
    h = lerp(h, bedDepth, channelT);
  } else {
    // Outside stream corridor, guarantee terrain always stays cleanly above the water plane!
    h = Math.max(h, WATER_LEVEL + 0.45);
  }

  return h;
}

/**
 * Returns the arched wooden footbridge deck elevation if `(x, z)` lies on the bridge,
 * or `null` if off the bridge.
 */
export function bridgeDeckHeightAt(x: number, z: number): number | null {
  const { lx, lz } = worldToBridgeLocal(x, z);
  if (Math.abs(lx) > BRIDGE_HALF_LEN || Math.abs(lz) > BRIDGE_HALF_WIDTH) {
    return null;
  }
  const u = clamp(lx / BRIDGE_HALF_LEN, -1, 1);
  // Smooth cosine arch resting flush on both west/east bank approaches
  const westBank = terrainHeightAt(
    BRIDGE_CENTER_X - BRIDGE_HALF_LEN * BRIDGE_COS,
    BRIDGE_Z + BRIDGE_HALF_LEN * BRIDGE_SIN,
  );
  const eastBank = terrainHeightAt(
    BRIDGE_CENTER_X + BRIDGE_HALF_LEN * BRIDGE_COS,
    BRIDGE_Z - BRIDGE_HALF_LEN * BRIDGE_SIN,
  );
  const baseLine = lerp(westBank, eastBank, (u + 1) * 0.5);
  const arch = Math.cos(u * Math.PI * 0.5);
  return baseLine + arch * arch * BRIDGE_ARCH_HEIGHT + 0.08;
}

/**
 * Authoritative walkable/drivable ground surface height (takes bridge deck over brook).
 */
export function surfaceHeightAt(x: number, z: number): number {
  const ground = terrainHeightAt(x, z);
  const deck = bridgeDeckHeightAt(x, z);
  if (deck !== null) {
    return Math.max(ground, deck);
  }
  return ground;
}

export function isOnBridge(x: number, z: number): boolean {
  const { lx, lz } = worldToBridgeLocal(x, z);
  return Math.abs(lx) <= BRIDGE_HALF_LEN && Math.abs(lz) <= BRIDGE_HALF_WIDTH;
}

export function isInWater(x: number, z: number): boolean {
  if (isOnBridge(x, z)) return false;
  return terrainHeightAt(x, z) < WATER_LEVEL - 0.03;
}

export function isInsidePaddock(x: number, z: number, margin = 0): boolean {
  return (
    x >= PADDOCK_MIN_X + margin &&
    x <= PADDOCK_MAX_X - margin &&
    z >= PADDOCK_MIN_Z + margin &&
    z <= PADDOCK_MAX_Z - margin
  );
}

/**
 * Computes unit surface normal at `(x, z)` via central finite differences.
 */
export function surfaceNormalAt(x: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
  const eps = 0.45;
  const hL = surfaceHeightAt(x - eps, z);
  const hR = surfaceHeightAt(x + eps, z);
  const hD = surfaceHeightAt(x, z - eps);
  const hU = surfaceHeightAt(x, z + eps);
  return target.set(hL - hR, 2 * eps, hD - hU).normalize();
}

/**
 * Flora placement mask: returns `true` where lush grass / wildflowers may grow.
 * Cleanly excludes the brook channel, dirt footpaths, bridge footprint, barn & paddock yard,
 * and windmill stone base.
 */
export function meadowGrassMask(x: number, z: number): boolean {
  const r = Math.hypot(x, z);
  const wallR = wallRadiusAtAngle(Math.atan2(z, x));
  if (r > wallR - 0.8) return false;

  // Exclude stream channel + immediate wet gravel edge
  if (streamDistance(x, z) < streamHalfWidthAt(z) + 0.65) return false;

  // Exclude bridge approach footprint
  const { lx, lz } = worldToBridgeLocal(x, z);
  if (Math.abs(lx) < BRIDGE_HALF_LEN + 0.9 && Math.abs(lz) < BRIDGE_HALF_WIDTH + 0.8) {
    return false;
  }

  // Exclude Barn & Paddock yard
  if (x > -29.2 && x < -7.2 && z > -4.4 && z < 8.4) return false;

  // Exclude Windmill stone base & terrace border
  if (Math.hypot(x - WINDMILL_POS.x, z - WINDMILL_POS.y) < 4.9) return false;

  // Exclude dirt footpaths
  if (distanceToDirtPath(x, z) < 1.55) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Sculpted Pastoral Valley Terrain Mesh
// ---------------------------------------------------------------------------

export function createMeadowTerrain(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS,
  );
  geo.rotateX(-Math.PI * 0.5);

  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);

  const cLushGrass = new THREE.Color('#6ca848');
  const cSunlitHill = new THREE.Color('#95bc52');
  const cDeepMeadow = new THREE.Color('#4f8838');
  const cDirtPath = new THREE.Color('#c2a574');
  const cPaddockStraw = new THREE.Color('#cbb177');
  const cStreamBank = new THREE.Color('#537e3c');
  const cRiverPebble = new THREE.Color('#8f8268');
  const cCloverGreen = new THREE.Color('#47a246');
  const cOuterHill = new THREE.Color('#5a8e40');
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrainHeightAt(x, z);
    pos.setY(i, y);

    // Rich pastoral color zoning blended softly with multi-frequency meadow variation
    const n1 =
      Math.sin(x * 0.09 + 1.2) * Math.cos(z * 0.085 - 0.6) * 0.5 +
      Math.sin((x - z) * 0.16) * 0.25 +
      0.5;
    tmp.copy(cLushGrass).lerp(cSunlitHill, clamp(n1 * 0.58 + (y - 0.7) * 0.14, 0, 0.75));
    tmp.lerp(cDeepMeadow, clamp((0.45 - n1) * 0.6, 0, 0.45));

    // Outer rolling hills take on slightly richer deep pastoral olive-emerald
    const r = Math.hypot(x, z);
    if (r > WALL_RADIUS - 3) {
      tmp.lerp(cOuterHill, smoothstep(WALL_RADIUS - 3, WALL_RADIUS + 20, r) * 0.65);
    }

    // Lush emerald clover patches
    for (const cp of CLOVER_PATCHES) {
      const cd = Math.hypot(x - cp.x, z - cp.z);
      if (cd < cp.radius + 1.8) {
        const ct = 1 - smoothstep(cp.radius * 0.4, cp.radius + 1.8, cd);
        tmp.lerp(cCloverGreen, ct * 0.72);
      }
    }

    // Warm compacted straw-earth inside barn courtyard & paddock
    if (x > -29.5 && x < -6.5 && z > -5.5 && z < 9.5) {
      const dx = Math.max(0, Math.abs(x - -16.8) - 9.8);
      const dz = Math.max(0, Math.abs(z - 2.0) - 5.8);
      const padT = 1 - smoothstep(0.4, 2.8, Math.hypot(dx, dz));
      tmp.lerp(cPaddockStraw, padT * 0.85);
    }

    // Dirt footpath ribbon
    const pathD = distanceToDirtPath(x, z);
    if (pathD < 2.6) {
      const pathT = 1 - smoothstep(0.95, 2.55, pathD);
      tmp.lerp(cDirtPath, pathT * 0.86);
    }

    // Windmill stone-dust apron
    const millD = Math.hypot(x - WINDMILL_POS.x, z - WINDMILL_POS.y);
    if (millD < 6.2) {
      const millT = 1 - smoothstep(3.2, 6.2, millD);
      tmp.lerp(cDirtPath, millT * 0.65);
    }

    // Damp mossy stream banks & sunlit pebbled brook bed
    const sDist = streamDistance(x, z);
    const halfW = streamHalfWidthAt(z);
    if (sDist < halfW + 2.4) {
      const bankT = 1 - smoothstep(halfW * 0.8, halfW + 2.4, sDist);
      tmp.lerp(cStreamBank, bankT * 0.45);
      const bedT = 1 - smoothstep(halfW * 0.45, halfW * 1.15, sDist);
      tmp.lerp(cRiverPebble, bedT * 0.92);
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const pbr = getPBRTextures('grassSoil', {
    repeatX: 28,
    repeatY: 28,
    mossAmount: 0.72,
    seed: 202,
  });

  const mat = new THREE.MeshStandardMaterial({
    map: pbr.map,
    bumpMap: pbr.bumpMap,
    bumpScale: 0.04,
    roughnessMap: pbr.roughnessMap,
    roughness: 0.94,
    metalness: 0.0,
    vertexColors: true,
    envMapIntensity: 0.55,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'meadow_terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

import * as THREE from 'three';
import { createPBRMaterial } from '../../art';

export const SUMMIT_Z = 4.0;
export const SLOPE_START_Z = -4.0;
export const SLOPE_END_Z = -166.0;
export const SUMMIT_HEIGHT = 22.0;

export const LANE_HALF_WIDTH = 13.5;
export const CURLING_ENTRY_Z = -168.0;
export const RINK_CENTER_Z = -205.0;
export const RINK_RADIUS = 35.0;
export const RINK_WALL_RADIUS = 33.4;

export const HOUSE_CENTER_X = 0.0;
export const HOUSE_CENTER_Z = -212.0;
export const HOUSE_OUTER_RADIUS = 11.5;
export const HOUSE_INNER_RADIUS = 7.2;
export const HOUSE_BUTTON_RADIUS = 3.2;

export const CHALET_POS = new THREE.Vector3(38.0, 2.2, -206.0);
export const TOTAL_ROUNDS = 3;
export const GATES_PER_ROUND = 10;

export interface SlalomGateDef {
  index: number;
  z: number;
  centerX: number;
  halfWidth: number;
  colorType: 'crimson' | 'cobalt';
}

export interface StoneStartSpec {
  team: 'gold' | 'rival';
  x: number;
  z: number;
}

export interface RoundConfig {
  round: number;
  name: string;
  subtitle: string;
  gateHalfWidth: number;
  gates: SlalomGateDef[];
  stones: StoneStartSpec[];
}

export interface GateInstance {
  def: SlalomGateDef;
  group: THREE.Group;
  leftPolePivot: THREE.Group;
  rightPolePivot: THREE.Group;
  leftFlag: THREE.Mesh;
  rightFlag: THREE.Mesh;
  leftPoleMat: THREE.MeshStandardMaterial;
  rightPoleMat: THREE.MeshStandardMaterial;
  flagMat: THREE.MeshStandardMaterial;
  ribbonMat: THREE.MeshBasicMaterial;
  ribbonMesh: THREE.Mesh;
  leftPoleWorldX: number;
  rightPoleWorldX: number;
  groundY: number;
  status: 'upcoming' | 'cleared' | 'missed';
  leftBendX: number;
  leftBendZ: number;
  leftBendVelX: number;
  leftBendVelZ: number;
  rightBendX: number;
  rightBendZ: number;
  rightBendVelX: number;
  rightBendVelZ: number;
  celebration: number;
}

export interface GlacierCourse {
  group: THREE.Group;
  gates: GateInstance[];
  houseGroup: THREE.Group;
  houseRingMaterials: {
    button: THREE.MeshBasicMaterial;
    inner: THREE.MeshBasicMaterial;
    outer: THREE.MeshBasicMaterial;
  };
  applyRoundGates: (roundIndex: number) => void;
  resetGateStates: () => void;
  triggerPoleHit: (gate: GateInstance, side: 'left' | 'right', velX: number, velZ: number) => void;
  markGateCleared: (gate: GateInstance) => void;
  markGateMissed: (gate: GateInstance) => void;
  setHouseGlow: (buttonPulse: number, innerPulse: number, outerPulse: number) => void;
  update: (dt: number, time: number) => void;
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// Mathematical Course & Terrain Queries (Shared by Mesh, Scenery & Physics)
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Polynomial smooth minimum for seamless fjord-to-lake transitions. */
function smin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

/** Winding glacier fjord centerline X as a function of Z. */
export function getTrackCenterX(z: number): number {
  if (z >= -6) return 0;
  if (z <= -162) return 0;
  const u = (-6 - z) / 156;
  const env = smoothstep(0.0, 0.14, u) * smoothstep(1.0, 0.84, u);
  return env * (8.6 * Math.sin(u * Math.PI * 2.5) + 2.4 * Math.sin(u * Math.PI * 5.0 + 0.55));
}

/** Derivative d(centerX)/dz for tangent orientation along the slope. */
export function getTrackSlopeX(z: number): number {
  const eps = 0.5;
  return (getTrackCenterX(z - eps) - getTrackCenterX(z + eps)) / (2 * eps);
}

/** Base gleaming ice surface elevation along Z (smooth downhill into flat lake). */
export function getIceSurfaceHeight(z: number): number {
  if (z >= SLOPE_START_Z) return SUMMIT_HEIGHT;
  if (z <= SLOPE_END_Z) return 0.0;
  const t = (SLOPE_START_Z - z) / (SLOPE_START_Z - SLOPE_END_Z);
  const s = t * t * (3 - 2 * t);
  const base = SUMMIT_HEIGHT * (1 - s);
  const gentleRoll = 0.36 * Math.sin(t * Math.PI * 3.0) * (4 * t * (1 - t));
  return Math.max(0, base + gentleRoll);
}

/**
 * Signed distance outside the playable glacier ice & circular frozen alpine lake.
 * <= 0 on playable ice; > 0 rising up onto flanking snow embankments & mountains.
 */
export function getSignedDistOutsideIce(x: number, z: number): number {
  const cx = getTrackCenterX(z);
  // Chute ends smoothly at back of start platform (+11) and feeds into lake (-172)
  const backExcess = Math.max(0, z - 11.0);
  const frontExcess = Math.max(0, -172.0 - z);
  const dxChute = Math.abs(x - cx) - LANE_HALF_WIDTH;
  let dChute: number;
  if (backExcess > 0 || frontExcess > 0) {
    const outX = Math.max(0, dxChute);
    const outZ = Math.max(backExcess, frontExcess);
    dChute = Math.hypot(outX, outZ);
  } else {
    dChute = dxChute;
  }

  // Circular frozen alpine lake curling arena
  const dLake = Math.hypot(x, z - RINK_CENTER_Z) - RINK_RADIUS;

  return smin(dChute, dLake, 7.5);
}

/** Deterministic organic alpine terrain noise for snowdrifts and mountain ridges. */
function alpineNoise(x: number, z: number): number {
  const n1 = Math.sin(x * 0.055 + z * 0.032) * Math.cos(z * 0.048 - x * 0.021);
  const n2 = Math.sin(x * 0.13 - z * 0.09 + 1.4) * 0.5;
  const n3 = Math.cos(x * 0.028 + z * 0.024 + 2.1) * 1.4;
  return n1 + n2 + n3;
}

/**
 * Full snow/mountain terrain height at (x, z).
 * Dips cleanly below the ice surface inside the playable channel so the gleaming
 * ice mesh sits flush with zero z-fighting, and rises into sculpted snowdrifts &
 * alpine peaks outside the lane.
 */
export function getSnowTerrainHeight(x: number, z: number): number {
  const iceY = getIceSurfaceHeight(z);
  const sd = getSignedDistOutsideIce(x, z);

  // Inside the ice channel, tuck snow floor cleanly below ice sheet
  if (sd <= -1.2) {
    return iceY - 0.65;
  }

  // Smooth lip rising from under ice (-1.2..0) to snow bank edge
  const edgeBlend = smoothstep(-1.2, 0.4, sd);
  const bankBase = iceY - 0.65 * (1 - edgeBlend);

  if (sd <= 0.0) {
    return bankBase;
  }

  // Sculpted snow embankments flanking the ice lane
  const bankT = smoothstep(0.0, 15.5, sd);
  const bankRise = bankT * 4.4;

  // Forested alpine foothills & snowdrifts
  const driftNoise = alpineNoise(x, z) * 1.15 * smoothstep(2.0, 14.0, sd);

  // Dramatic Nordic granite mountain walls framing the valley and far lake horizon
  const ridgeT = smoothstep(19.0, 68.0, sd);
  const jagged =
    Math.abs(Math.sin(x * 0.045 + z * 0.038)) * 12.0 +
    Math.abs(Math.cos(x * 0.072 - z * 0.055 + 0.8)) * 8.0 +
    Math.sin(x * 0.022 + z * 0.019) * 6.0;
  const mountainWall = ridgeT * ridgeT * (24.0 + jagged);

  // Extra dramatic backdrop peak range behind the frozen lake (z < -248)
  const farLakeT = smoothstep(-246, -305, z);
  const farPeak =
    farLakeT *
    farLakeT *
    (36.0 + Math.abs(Math.sin(x * 0.042 + 0.4)) * 22.0 + Math.abs(Math.cos(x * 0.085)) * 11.0);

  let h = bankBase + bankRise + driftNoise + mountainWall + farPeak;

  // Carve a flat cozy snow terrace for the Nordic Timber Chalet overlooking the curling rink!
  const chaletDist = Math.hypot(x - CHALET_POS.x, z - CHALET_POS.z);
  if (chaletDist < 22.0) {
    const flatBlend = 1.0 - smoothstep(10.5, 22.0, chaletDist);
    h = h * (1 - flatBlend) + CHALET_POS.y * flatBlend;
  }

  return h;
}

/** Playable surface height under the wheelchair (ice + gentle snowbank climb). */
export function getPlayableHeight(x: number, z: number): number {
  const iceY = getIceSurfaceHeight(z);
  const sd = getSignedDistOutsideIce(x, z);
  if (sd <= 0.1) return iceY;
  const bankClimb = smoothstep(0.1, 8.0, sd) * 2.1;
  return iceY + bankClimb;
}

/** Surface normal of the playable ice/bank surface for smooth wheelchair pitch & roll. */
export function getPlayableNormal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = 0.45;
  const hL = getPlayableHeight(x - e, z);
  const hR = getPlayableHeight(x + e, z);
  const hD = getPlayableHeight(x, z - e);
  const hU = getPlayableHeight(x, z + e);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}

// ---------------------------------------------------------------------------
// 3 Escalating Nordic Rounds (Slalom Gates + Strategic Curling Formations)
// ---------------------------------------------------------------------------

function buildRoundGates(offsets: number[], halfWidth: number): SlalomGateDef[] {
  const gates: SlalomGateDef[] = [];
  for (let i = 0; i < GATES_PER_ROUND; i++) {
    const z = -18.0 - i * 14.8;
    const baseCx = getTrackCenterX(z);
    const offset = offsets[i] ?? 0;
    const clampedOffset = clamp(offset, -(LANE_HALF_WIDTH - halfWidth - 1.3), LANE_HALF_WIDTH - halfWidth - 1.3);
    gates.push({
      index: i,
      z,
      centerX: baseCx + clampedOffset,
      halfWidth,
      colorType: i % 2 === 0 ? 'crimson' : 'cobalt',
    });
  }
  return gates;
}

export const ROUND_CONFIGS: readonly RoundConfig[] = [
  {
    round: 1,
    name: 'Fjord Sprint',
    subtitle: 'Wide rhythmic gates & clean billiard approach',
    gateHalfWidth: 4.4,
    gates: buildRoundGates([-3.6, 3.8, -4.0, 4.1, -3.8, 4.0, -4.2, 3.8, -3.5, 0.0], 4.4),
    stones: [
      // 3 Golden friendly stones primed near the approach & flanks for gratifying shots
      { team: 'gold', x: -0.4, z: -189.5 },
      { team: 'gold', x: 5.4, z: -195.0 },
      { team: 'gold', x: -5.8, z: -196.5 },
      // 3 Rival crimson stones sitting inside the Curling House waiting to be cleared!
      { team: 'rival', x: 0.9, z: -211.0 },
      { team: 'rival', x: -4.8, z: -214.2 },
      { team: 'rival', x: 5.2, z: -216.0 },
    ],
  },
  {
    round: 2,
    name: 'Glacier Switchback',
    subtitle: 'Tighter slalom carves & guarded house rings',
    gateHalfWidth: 4.0,
    gates: buildRoundGates([4.8, -5.0, 5.2, -4.8, 5.4, -5.2, 5.0, -5.0, 4.2, -1.2], 4.0),
    stones: [
      { team: 'gold', x: -3.2, z: -188.5 },
      { team: 'gold', x: 3.6, z: -191.5 },
      { team: 'gold', x: -7.5, z: -201.0 },
      // Guarded house formation
      { team: 'rival', x: 0.0, z: -204.2 },
      { team: 'rival', x: -2.2, z: -212.5 },
      { team: 'rival', x: 2.6, z: -213.2 },
    ],
  },
  {
    round: 3,
    name: 'Nordic Olympic Finale',
    subtitle: 'Technical championship gates & fortress button',
    gateHalfWidth: 3.7,
    gates: buildRoundGates([-5.4, 5.6, -5.8, 5.4, -5.8, 5.8, -5.5, 5.4, -4.6, 1.5], 3.7),
    stones: [
      { team: 'gold', x: 0.5, z: -187.0 },
      { team: 'gold', x: -6.4, z: -193.0 },
      { team: 'gold', x: 6.8, z: -194.5 },
      // Tight rival triangle defending the crimson button
      { team: 'rival', x: 0.0, z: -210.2 },
      { team: 'rival', x: -2.4, z: -214.0 },
      { team: 'rival', x: 2.4, z: -214.0 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Procedural Canvas Textures (Olympic Curling House & Approach Lines)
// ---------------------------------------------------------------------------

function createCurlingHouseTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Outer soft icy frost halo
  const haloGrad = ctx.createRadialGradient(half, half, half * 0.86, half, half, half);
  haloGrad.addColorStop(0, 'rgba(220, 240, 255, 0.25)');
  haloGrad.addColorStop(1, 'rgba(220, 240, 255, 0.0)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(half, half, half, 0, Math.PI * 2);
  ctx.fill();

  const outerR = half * 0.94; // corresponds to HOUSE_OUTER_RADIUS (11.5m)
  const innerR = outerR * (HOUSE_INNER_RADIUS / HOUSE_OUTER_RADIUS);
  const buttonR = outerR * (HOUSE_BUTTON_RADIUS / HOUSE_OUTER_RADIUS);

  // Outer Olympic Cobalt Ring
  ctx.beginPath();
  ctx.arc(half, half, outerR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(26, 98, 178, 0.78)';
  ctx.fill();

  // Crisp frost outline around outer ring
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(240, 250, 255, 0.85)';
  ctx.stroke();

  // Inner Snow-White Ring
  ctx.beginPath();
  ctx.arc(half, half, innerR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(236, 246, 255, 0.84)';
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(130, 175, 215, 0.75)';
  ctx.stroke();

  // Crimson Bullseye Button
  ctx.beginPath();
  ctx.arc(half, half, buttonR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(204, 42, 58, 0.85)';
  ctx.fill();

  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255, 232, 168, 0.92)';
  ctx.stroke();

  // Center pin dot
  ctx.beginPath();
  ctx.arc(half, half, buttonR * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 248, 224, 0.95)';
  ctx.fill();

  // Crisp Olympic Tee & Center Crosshair Lines
  ctx.strokeStyle = 'rgba(26, 52, 82, 0.45)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(half - outerR * 1.03, half);
  ctx.lineTo(half + outerR * 1.03, half);
  ctx.moveTo(half, half - outerR * 1.03);
  ctx.lineTo(half, half + outerR * 1.03);
  ctx.stroke();

  // Subtle frozen ice glaze streaks across the painted rings for realism
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 42; i++) {
    const a = (i * 1.37) % (Math.PI * 2);
    const r0 = (i * 23) % (outerR * 0.8);
    const len = 45 + (i % 5) * 35;
    ctx.beginPath();
    ctx.moveTo(half + Math.cos(a) * r0, half + Math.sin(a) * r0);
    ctx.lineTo(half + Math.cos(a + 0.2) * (r0 + len), half + Math.sin(a + 0.2) * (r0 + len));
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function createApproachChevronTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 512);

  // Hog line across the top
  ctx.fillStyle = 'rgba(205, 52, 66, 0.72)';
  ctx.fillRect(16, 40, 480, 22);
  ctx.fillStyle = 'rgba(240, 248, 255, 0.6)';
  ctx.fillRect(16, 66, 480, 6);

  // 3 pointing translucent ice chevrons leading straight to the curling house
  for (let i = 0; i < 3; i++) {
    const y = 145 + i * 115;
    ctx.beginPath();
    ctx.moveTo(156, y);
    ctx.lineTo(256, y + 66);
    ctx.lineTo(356, y);
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = i === 1 ? 'rgba(244, 198, 78, 0.56)' : 'rgba(62, 148, 224, 0.46)';
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Course Mesh Builder
// ---------------------------------------------------------------------------

export function buildGlacierCourse(): GlacierCourse {
  const group = new THREE.Group();
  group.name = 'GlacierCourseRoot';

  const ownedGeometries: THREE.BufferGeometry[] = [];
  const ownedMaterials: THREE.Material[] = [];
  const ownedTextures: THREE.Texture[] = [];

  // 1. Gleaming Glacier Ice & Frozen Alpine Lake Sheet
  // Covers x in [-42, 42], z in [-246, 16] — smoothly tucks under snowbanks everywhere
  const iceWidth = 84;
  const iceLength = 264;
  const iceSegX = 56;
  const iceSegZ = 160;
  const iceGeo = new THREE.PlaneGeometry(iceWidth, iceLength, iceSegX, iceSegZ);
  iceGeo.rotateX(-Math.PI / 2);
  const icePos = iceGeo.attributes.position as THREE.BufferAttribute;
  const iceColors = new Float32Array(icePos.count * 3);
  const iceShallowCol = new THREE.Color('#d8effc');
  const iceDeepCol = new THREE.Color('#8bc4e8');
  const iceLakeCol = new THREE.Color('#7ab8e2');
  const tmpCol = new THREE.Color();

  for (let i = 0; i < icePos.count; i++) {
    const x = icePos.getX(i);
    // Map plane Z from [-iceLength/2, iceLength/2] to [-248, +16]
    const z = icePos.getZ(i) - 116;
    const y = getIceSurfaceHeight(z);
    icePos.setXYZ(i, x, y, z);

    const sd = getSignedDistOutsideIce(x, z);
    const inLake = smoothstep(-162, -182, z);
    const depthFactor = smoothstep(0.0, -11.0, sd);
    tmpCol.copy(iceShallowCol).lerp(iceDeepCol, depthFactor * 0.72);
    tmpCol.lerp(iceLakeCol, inLake * 0.32 * depthFactor);
    iceColors[i * 3] = tmpCol.r;
    iceColors[i * 3 + 1] = tmpCol.g;
    iceColors[i * 3 + 2] = tmpCol.b;
  }
  iceGeo.setAttribute('color', new THREE.BufferAttribute(iceColors, 3));
  iceGeo.computeVertexNormals();
  ownedGeometries.push(iceGeo);

  const iceMat = createPBRMaterial('ice', {
    repeatX: 10,
    repeatY: 32,
    seed: 901,
  });
  iceMat.vertexColors = true;
  iceMat.roughness = 0.16;
  iceMat.metalness = 0.08;
  iceMat.envMapIntensity = 1.45;
  ownedMaterials.push(iceMat);

  const iceMesh = new THREE.Mesh(iceGeo, iceMat);
  iceMesh.name = 'GlacierIceSurface';
  iceMesh.receiveShadow = true;
  group.add(iceMesh);

  // Subtle carved lane edge frost rails along the downhill chute so player reads bends early
  const edgeTrackMat = new THREE.MeshBasicMaterial({
    color: 0x56a4df,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  ownedMaterials.push(edgeTrackMat);

  for (const side of [-1, 1]) {
    const railPts: THREE.Vector3[] = [];
    for (let s = 0; s <= 64; s++) {
      const z = 4 - (s / 64) * 172;
      const cx = getTrackCenterX(z);
      const x = cx + side * (LANE_HALF_WIDTH - 1.1);
      railPts.push(new THREE.Vector3(x, getIceSurfaceHeight(z) + 0.035, z));
    }
    const curve = new THREE.CatmullRomCurve3(railPts);
    const ribbonGeo = new THREE.TubeGeometry(curve, 96, 0.14, 5, false);
    ribbonGeo.scale(1, 0.18, 1);
    ownedGeometries.push(ribbonGeo);
    const railMesh = new THREE.Mesh(ribbonGeo, edgeTrackMat);
    group.add(railMesh);
  }

  // 2. Sculpted Alpine Snow Banks, Valley Shelves & Mountain Ridges
  const snowW = 240;
  const snowL = 370;
  const snowSegX = 110;
  const snowSegZ = 156;
  const snowGeo = new THREE.PlaneGeometry(snowW, snowL, snowSegX, snowSegZ);
  snowGeo.rotateX(-Math.PI / 2);
  const snowPos = snowGeo.attributes.position as THREE.BufferAttribute;
  const snowCols = new Float32Array(snowPos.count * 3);

  const snowBright = new THREE.Color('#f4f9ff');
  const snowShadowBlue = new THREE.Color('#c7dcf0');
  const graniteRock = new THREE.Color('#5a6a7d');
  const frostGranite = new THREE.Color('#8699ad');

  for (let i = 0; i < snowPos.count; i++) {
    const x = snowPos.getX(i);
    // Cover z from [-325, +45]
    const z = snowPos.getZ(i) - 140;
    const y = getSnowTerrainHeight(x, z);
    snowPos.setXYZ(i, x, y, z);
  }
  snowGeo.computeVertexNormals();
  const snowNormals = snowGeo.attributes.normal as THREE.BufferAttribute;

  for (let i = 0; i < snowPos.count; i++) {
    const x = snowPos.getX(i);
    const y = snowPos.getY(i);
    const z = snowPos.getZ(i);
    const ny = snowNormals.getY(i);
    const sd = getSignedDistOutsideIce(x, z);

    // Exposed granite rock facets on steep mountain cliff faces; glistening snow elsewhere!
    const steepRock = smoothstep(0.76, 0.44, ny) * smoothstep(14.0, 28.0, sd);
    const shadeBlue = smoothstep(0.99, 0.82, ny) * 0.45 + smoothstep(8.0, 0.0, y) * 0.12;
    tmpCol.copy(snowBright).lerp(snowShadowBlue, clamp(shadeBlue, 0, 0.55));

    if (steepRock > 0.01) {
      const rockTone = tmpCol.clone().copy(graniteRock).lerp(frostGranite, smoothstep(18, 42, y));
      tmpCol.lerp(rockTone, steepRock);
    }

    snowCols[i * 3] = tmpCol.r;
    snowCols[i * 3 + 1] = tmpCol.g;
    snowCols[i * 3 + 2] = tmpCol.b;
  }
  snowGeo.setAttribute('color', new THREE.BufferAttribute(snowCols, 3));
  ownedGeometries.push(snowGeo);

  const snowMat = createPBRMaterial('snow', {
    repeatX: 28,
    repeatY: 42,
    seed: 902,
  });
  snowMat.vertexColors = true;
  snowMat.roughness = 0.72;
  snowMat.metalness = 0.02;
  ownedMaterials.push(snowMat);

  const snowMesh = new THREE.Mesh(snowGeo, snowMat);
  snowMesh.name = 'AlpineSnowTerrain';
  snowMesh.receiveShadow = true;
  snowMesh.castShadow = true;
  group.add(snowMesh);

  // 3. Inlaid Olympic Curling House & Approach Chevrons
  const houseGroup = new THREE.Group();
  houseGroup.name = 'OlympicCurlingHouse';
  houseGroup.position.set(HOUSE_CENTER_X, 0.024, HOUSE_CENTER_Z);
  group.add(houseGroup);

  const houseTex = createCurlingHouseTexture();
  ownedTextures.push(houseTex);
  const housePlaneGeo = new THREE.PlaneGeometry(HOUSE_OUTER_RADIUS * 2.13, HOUSE_OUTER_RADIUS * 2.13);
  housePlaneGeo.rotateX(-Math.PI / 2);
  ownedGeometries.push(housePlaneGeo);

  const housePlaneMat = new THREE.MeshStandardMaterial({
    map: houseTex,
    transparent: true,
    roughness: 0.14,
    metalness: 0.05,
    envMapIntensity: 1.3,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  ownedMaterials.push(housePlaneMat);
  const housePlane = new THREE.Mesh(housePlaneGeo, housePlaneMat);
  housePlane.receiveShadow = true;
  houseGroup.add(housePlane);

  // Reactive luminous score rings inlaid along the bullseye edges
  const makeGlowRing = (innerR: number, outerR: number, hex: number) => {
    const geo = new THREE.RingGeometry(innerR, outerR, 64);
    geo.rotateX(-Math.PI / 2);
    ownedGeometries.push(geo);
    const mat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    ownedMaterials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.01;
    houseGroup.add(mesh);
    return mat;
  };

  const houseRingMaterials = {
    button: makeGlowRing(HOUSE_BUTTON_RADIUS - 0.28, HOUSE_BUTTON_RADIUS + 0.12, 0xffd452),
    inner: makeGlowRing(HOUSE_INNER_RADIUS - 0.25, HOUSE_INNER_RADIUS + 0.1, 0x99e0ff),
    outer: makeGlowRing(HOUSE_OUTER_RADIUS - 0.28, HOUSE_OUTER_RADIUS + 0.12, 0x4ca8ff),
  };

  // Brushed brass center tee pin
  const pinGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.04, 16);
  ownedGeometries.push(pinGeo);
  const pinMat = createPBRMaterial('brushedBrass', { repeatX: 1, repeatY: 1, seed: 903 });
  ownedMaterials.push(pinMat);
  const pinMesh = new THREE.Mesh(pinGeo, pinMat);
  pinMesh.position.y = 0.02;
  houseGroup.add(pinMesh);

  // Approach Hog Line & Chevrons leading from Gate 10 into the Curling House
  const approachTex = createApproachChevronTexture();
  ownedTextures.push(approachTex);
  const approachGeo = new THREE.PlaneGeometry(18, 22);
  approachGeo.rotateX(-Math.PI / 2);
  ownedGeometries.push(approachGeo);
  const approachMat = new THREE.MeshBasicMaterial({
    map: approachTex,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  ownedMaterials.push(approachMat);
  const approachMesh = new THREE.Mesh(approachGeo, approachMat);
  approachMesh.position.set(0, 0.028, -184.0);
  group.add(approachMesh);

  // 4. Sculpted Timber Spectator Dasher Boards around the Frozen Curling Rink
  // Open arc along the +Z fjord mouth so you glide effortlessly onto the lake!
  const woodMat = createPBRMaterial('woodPlanks', { repeatX: 4, repeatY: 1, seed: 904, tint: '#8b5e3c' });
  const snowCapMat = createPBRMaterial('snow', { repeatX: 3, repeatY: 1, seed: 905 });
  const darkTimberMat = createPBRMaterial('bark', { repeatX: 1, repeatY: 2, seed: 906, tint: '#4a3525' });
  ownedMaterials.push(woodMat, snowCapMat, darkTimberMat);

  const boardSegments = 40;
  const segArc = (Math.PI * 2) / boardSegments;
  const chordLen = 2 * RINK_WALL_RADIUS * Math.sin(segArc * 0.5) + 0.14;

  const boardGeo = new THREE.BoxGeometry(chordLen, 1.05, 0.34);
  const capGeo = new THREE.BoxGeometry(chordLen + 0.08, 0.22, 0.44);
  const postGeo = new THREE.BoxGeometry(0.32, 1.48, 0.38);
  ownedGeometries.push(boardGeo, capGeo, postGeo);

  const rinkBoardsGroup = new THREE.Group();
  rinkBoardsGroup.name = 'CurlingRinkBoards';
  group.add(rinkBoardsGroup);

  for (let i = 0; i < boardSegments; i++) {
    const theta = (i + 0.5) * segArc; // 0 = +X, PI/2 = +Z (entrance mouth!)
    const bx = Math.cos(theta) * RINK_WALL_RADIUS;
    const bz = RINK_CENTER_Z + Math.sin(theta) * RINK_WALL_RADIUS;

    // Leave wide fjord entrance opening on the +Z side connecting to downhill slope
    if (bz > -175.5 && Math.abs(bx) < 16.5) continue;

    const segGroup = new THREE.Group();
    segGroup.position.set(bx, 0, bz);
    segGroup.rotation.y = -theta + Math.PI / 2;

    const board = new THREE.Mesh(boardGeo, woodMat);
    board.position.y = 0.52;
    board.castShadow = true;
    board.receiveShadow = true;

    const cap = new THREE.Mesh(capGeo, snowCapMat);
    cap.position.y = 1.1;
    cap.castShadow = true;
    cap.receiveShadow = true;

    const post = new THREE.Mesh(postGeo, darkTimberMat);
    post.position.set(chordLen * 0.48, 0.72, -0.05);
    post.castShadow = true;

    segGroup.add(board, cap, post);
    rinkBoardsGroup.add(segGroup);
  }

  // 5. Slalom Gates (10 Flexible Twin-Pole Alpine Gates with Fluttering Flags)
  const gatesGroup = new THREE.Group();
  gatesGroup.name = 'SlalomGates';
  group.add(gatesGroup);

  const poleGeo = new THREE.CylinderGeometry(0.085, 0.105, 3.25, 10);
  poleGeo.translate(0, 1.625, 0);
  const baseGrommetGeo = new THREE.CylinderGeometry(0.24, 0.34, 0.24, 12);
  baseGrommetGeo.translate(0, 0.12, 0);
  const finialGeo = new THREE.OctahedronGeometry(0.19, 0);
  const flagGeo = new THREE.PlaneGeometry(1.15, 0.68, 6, 2);
  flagGeo.translate(0.58, 0, 0);
  const ribbonGeo = new THREE.PlaneGeometry(1.0, 0.62);
  ribbonGeo.rotateX(-Math.PI / 2);

  ownedGeometries.push(poleGeo, baseGrommetGeo, finialGeo, flagGeo, ribbonGeo);

  const grommetMat = new THREE.MeshStandardMaterial({
    color: 0x202936,
    roughness: 0.7,
    metalness: 0.2,
  });
  const stripeWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf4f8ff,
    roughness: 0.32,
    metalness: 0.08,
  });
  const stripeGeo = new THREE.CylinderGeometry(0.095, 0.098, 0.42, 10);
  ownedGeometries.push(stripeGeo);
  ownedMaterials.push(grommetMat, stripeWhiteMat);

  const gates: GateInstance[] = [];

  for (let i = 0; i < GATES_PER_ROUND; i++) {
    const def = ROUND_CONFIGS[0].gates[i];
    const gateGroup = new THREE.Group();
    gateGroup.name = `SlalomGate_${i + 1}`;
    gatesGroup.add(gateGroup);

    const baseColor = def.colorType === 'crimson' ? 0xd93042 : 0x1f73d1;
    const leftPoleMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.32,
      metalness: 0.15,
    });
    const rightPoleMat = leftPoleMat.clone();
    const flagMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor,
      emissiveIntensity: 0.18,
      roughness: 0.48,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    ownedMaterials.push(leftPoleMat, rightPoleMat, flagMat, ribbonMat);

    const makePoleAssembly = (poleMat: THREE.MeshStandardMaterial, flagDir: number) => {
      const base = new THREE.Group();
      const grommet = new THREE.Mesh(baseGrommetGeo, grommetMat);
      grommet.receiveShadow = true;
      base.add(grommet);

      const pivot = new THREE.Group();
      const shaft = new THREE.Mesh(poleGeo, poleMat);
      shaft.castShadow = true;
      pivot.add(shaft);

      const stripe1 = new THREE.Mesh(stripeGeo, stripeWhiteMat);
      stripe1.position.y = 1.25;
      const stripe2 = new THREE.Mesh(stripeGeo, stripeWhiteMat);
      stripe2.position.y = 2.25;
      pivot.add(stripe1, stripe2);

      const finial = new THREE.Mesh(finialGeo, flagMat);
      finial.position.y = 3.38;
      pivot.add(finial);

      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(0, 2.75, 0);
      flag.scale.x = flagDir; // flags wave outward from gate opening for super clean center sightline!
      flag.castShadow = true;
      pivot.add(flag);

      base.add(pivot);
      return { base, pivot, flag };
    };

    const left = makePoleAssembly(leftPoleMat, -1);
    const right = makePoleAssembly(rightPoleMat, 1);

    const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    ribbonMesh.position.y = 0.032;

    gateGroup.add(left.base, right.base, ribbonMesh);

    const inst: GateInstance = {
      def,
      group: gateGroup,
      leftPolePivot: left.pivot,
      rightPolePivot: right.pivot,
      leftFlag: left.flag,
      rightFlag: right.flag,
      leftPoleMat,
      rightPoleMat,
      flagMat,
      ribbonMat,
      ribbonMesh,
      leftPoleWorldX: def.centerX - def.halfWidth,
      rightPoleWorldX: def.centerX + def.halfWidth,
      groundY: getIceSurfaceHeight(def.z),
      status: 'upcoming',
      leftBendX: 0,
      leftBendZ: 0,
      leftBendVelX: 0,
      leftBendVelZ: 0,
      rightBendX: 0,
      rightBendZ: 0,
      rightBendVelX: 0,
      rightBendVelZ: 0,
      celebration: 0,
    };
    gates.push(inst);
  }

  const positionGateVisuals = (inst: GateInstance) => {
    const { def } = inst;
    const gy = getIceSurfaceHeight(def.z);
    inst.groundY = gy;
    inst.leftPoleWorldX = def.centerX - def.halfWidth;
    inst.rightPoleWorldX = def.centerX + def.halfWidth;
    inst.group.position.set(def.centerX, gy, def.z);
    // Align ribbon cleanly with local slope pitch
    const gyAhead = getIceSurfaceHeight(def.z - 1.0);
    const slopePitch = Math.atan2(gy - gyAhead, 1.0);

    // children[0] = left base, children[1] = right base
    inst.group.children[0].position.set(-def.halfWidth, 0, 0);
    inst.group.children[1].position.set(def.halfWidth, 0, 0);

    inst.ribbonMesh.scale.set(def.halfWidth * 2 - 0.5, 1, 1);
    inst.ribbonMesh.rotation.x = slopePitch;
  };

  const resetSingleGateVisual = (inst: GateInstance) => {
    inst.status = 'upcoming';
    inst.leftBendX = 0;
    inst.leftBendZ = 0;
    inst.leftBendVelX = 0;
    inst.leftBendVelZ = 0;
    inst.rightBendX = 0;
    inst.rightBendZ = 0;
    inst.rightBendVelX = 0;
    inst.rightBendVelZ = 0;
    inst.celebration = 0;
    inst.leftPolePivot.rotation.set(0, 0, 0);
    inst.rightPolePivot.rotation.set(0, 0, 0);

    const hex = inst.def.colorType === 'crimson' ? 0xd93042 : 0x1f73d1;
    inst.leftPoleMat.color.setHex(hex);
    inst.leftPoleMat.emissive.setHex(0x000000);
    inst.leftPoleMat.emissiveIntensity = 0;
    inst.rightPoleMat.color.setHex(hex);
    inst.rightPoleMat.emissive.setHex(0x000000);
    inst.rightPoleMat.emissiveIntensity = 0;
    inst.flagMat.color.setHex(hex);
    inst.flagMat.emissive.setHex(hex);
    inst.flagMat.emissiveIntensity = 0.2;
    inst.ribbonMat.color.setHex(hex);
    inst.ribbonMat.opacity = 0.34;
  };

  const applyRoundGates = (roundIndex: number) => {
    const cfg = ROUND_CONFIGS[clamp(roundIndex, 0, ROUND_CONFIGS.length - 1)];
    for (let i = 0; i < gates.length; i++) {
      gates[i].def = cfg.gates[i];
      positionGateVisuals(gates[i]);
      resetSingleGateVisual(gates[i]);
    }
  };

  const resetGateStates = () => {
    for (const g of gates) {
      resetSingleGateVisual(g);
    }
  };

  const triggerPoleHit = (gate: GateInstance, side: 'left' | 'right', velX: number, velZ: number) => {
    // Spring impulse bending the breakaway slalom pole away from the impact direction
    const pushZ = clamp(-velZ * 0.45, -14, 14);
    const pushX = clamp(velX * 0.45, -12, 12);
    if (side === 'left') {
      gate.leftBendVelX += pushZ;
      gate.leftBendVelZ -= pushX;
    } else {
      gate.rightBendVelX += pushZ;
      gate.rightBendVelZ -= pushX;
    }
  };

  const markGateCleared = (gate: GateInstance) => {
    gate.status = 'cleared';
    gate.celebration = 1.0;
    const gold = 0xf7c948;
    gate.leftPoleMat.color.setHex(gold);
    gate.leftPoleMat.emissive.setHex(0xffb830);
    gate.leftPoleMat.emissiveIntensity = 0.65;
    gate.rightPoleMat.color.setHex(gold);
    gate.rightPoleMat.emissive.setHex(0xffb830);
    gate.rightPoleMat.emissiveIntensity = 0.65;
    gate.flagMat.color.setHex(0xffe178);
    gate.flagMat.emissive.setHex(0xffb830);
    gate.flagMat.emissiveIntensity = 0.78;
    gate.ribbonMat.color.setHex(0xffe478);
    gate.ribbonMat.opacity = 0.62;
    // Celebratory outward spring bow of both poles!
    gate.leftBendVelZ += 5.0;
    gate.rightBendVelZ -= 5.0;
  };

  const markGateMissed = (gate: GateInstance) => {
    gate.status = 'missed';
    gate.leftPoleMat.color.setHex(0x647488);
    gate.rightPoleMat.color.setHex(0x647488);
    gate.flagMat.color.setHex(0x6b7c90);
    gate.flagMat.emissiveIntensity = 0.03;
    gate.ribbonMat.color.setHex(0x6c7c8e);
    gate.ribbonMat.opacity = 0.14;
  };

  const setHouseGlow = (buttonPulse: number, innerPulse: number, outerPulse: number) => {
    houseRingMaterials.button.opacity = 0.16 + clamp(buttonPulse, 0, 1) * 0.55;
    houseRingMaterials.inner.opacity = 0.12 + clamp(innerPulse, 0, 1) * 0.45;
    houseRingMaterials.outer.opacity = 0.1 + clamp(outerPulse, 0, 1) * 0.35;
  };

  // Initialize Round 1 gates
  applyRoundGates(0);

  const update = (dt: number, time: number) => {
    const safeDt = Math.min(dt, 0.05);
    const stiff = 62;
    const damp = 7.2;

    for (const g of gates) {
      // Spring-damper pole flex physics
      g.leftBendVelX += (-g.leftBendX * stiff - g.leftBendVelX * damp) * safeDt;
      g.leftBendVelZ += (-g.leftBendZ * stiff - g.leftBendVelZ * damp) * safeDt;
      g.leftBendX = clamp(g.leftBendX + g.leftBendVelX * safeDt, -1.15, 1.15);
      g.leftBendZ = clamp(g.leftBendZ + g.leftBendVelZ * safeDt, -1.15, 1.15);

      g.rightBendVelX += (-g.rightBendX * stiff - g.rightBendVelX * damp) * safeDt;
      g.rightBendVelZ += (-g.rightBendZ * stiff - g.rightBendVelZ * damp) * safeDt;
      g.rightBendX = clamp(g.rightBendX + g.rightBendVelX * safeDt, -1.15, 1.15);
      g.rightBendZ = clamp(g.rightBendZ + g.rightBendVelZ * safeDt, -1.15, 1.15);

      g.leftPolePivot.rotation.x = g.leftBendX;
      g.leftPolePivot.rotation.z = g.leftBendZ;
      g.rightPolePivot.rotation.x = g.rightBendX;
      g.rightPolePivot.rotation.z = g.rightBendZ;

      // Crisp mountain breeze flag flutter
      const phase = time * 5.2 + g.def.index * 1.17;
      const flutter = Math.sin(phase) * 0.18 + Math.sin(phase * 1.9) * 0.08;
      g.leftFlag.rotation.y = flutter;
      g.rightFlag.rotation.y = -flutter * 0.92;
      g.leftFlag.rotation.z = Math.sin(phase * 0.7) * 0.05;
      g.rightFlag.rotation.z = -Math.sin(phase * 0.7) * 0.05;

      // Golden celebration pulse decay
      if (g.celebration > 0) {
        g.celebration = Math.max(0, g.celebration - safeDt * 1.4);
        const glow = 0.45 + g.celebration * 0.65;
        g.leftPoleMat.emissiveIntensity = glow;
        g.rightPoleMat.emissiveIntensity = glow;
        g.flagMat.emissiveIntensity = glow + 0.15;
        g.ribbonMat.opacity = 0.28 + g.celebration * 0.44;
      }
    }
  };

  const dispose = () => {
    for (const g of ownedGeometries) g.dispose();
    for (const m of ownedMaterials) m.dispose();
    for (const t of ownedTextures) t.dispose();
    ownedGeometries.length = 0;
    ownedMaterials.length = 0;
    ownedTextures.length = 0;
  };

  return {
    group,
    gates,
    houseGroup,
    houseRingMaterials,
    applyRoundGates,
    resetGateStates,
    triggerPoleHit,
    markGateCleared,
    markGateMissed,
    setHouseGlow,
    update,
    dispose,
  };
}

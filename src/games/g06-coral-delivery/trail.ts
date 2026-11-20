import * as THREE from 'three';
import { createPBRMaterial } from '../../art';

export type SurfaceType = 'pier' | 'cobblestone' | 'dirt' | 'gravel' | 'bridge';

export interface TrailSample {
  index: number;
  s: number;
  t: number;
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  width: number;
  surface: SurfaceType;
  hasSeaParapetLeft: boolean;
  hasSeaParapetRight: boolean;
}

export interface CheckpointDef {
  id: number;
  name: string;
  subtitle: string;
  s: number;
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  radius: number;
  isFinish: boolean;
}

export interface NearestTrailResult {
  sample: TrailSample;
  s: number;
  lateralOffset: number; // + = right of trail tangent, - = left of trail tangent
  distance: number;
  roadY: number;
  roadSlopeX: number; // along tangent
  surface: SurfaceType;
  width: number;
  onBridge: boolean;
}

export interface BridgeEffect {
  active: boolean;
  sagY: number;
  swayRoll: number;
  swayTorque: number;
}

export interface CanyonTrail {
  readonly group: THREE.Group;
  readonly samples: readonly TrailSample[];
  readonly totalLength: number;
  readonly checkpoints: readonly CheckpointDef[];
  readonly bridgeStartS: number;
  readonly bridgeEndS: number;
  readonly waterLevel: number;
  sampleAtS(s: number): TrailSample;
  findNearest(x: number, z: number): NearestTrailResult;
  getTerrainHeight(x: number, z: number): number;
  getGroundInfo(x: number, z: number, heading: number, time: number): {
    y: number;
    pitch: number;
    roll: number;
    surface: SurfaceType;
    nearest: NearestTrailResult;
    bridge: BridgeEffect;
  };
  updateBridge(time: number, playerS: number, playerSpeed: number): BridgeEffect;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Deterministic Noise Helpers
// ---------------------------------------------------------------------------

function hash2(ix: number, iz: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + 1442695041;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function fbm2D(x: number, z: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.04;
  }
  return sum / norm;
}

// ---------------------------------------------------------------------------
// Trail Spine Definition
// ---------------------------------------------------------------------------

const RAW_CONTROL_POINTS: Array<[number, number, number]> = [
  [-22, 2.2, 74],   // P0: Harbor Pier Start
  [-18, 2.2, 56],   // P1: Pier Boardwalk
  [-12, 3.0, 38],   // P2: Pier Landfall onto Cobblestone
  [-2, 4.8, 22],    // P3: Coastal Parapet Sweep
  [14, 6.4, 12],    // P4: Checkpoint 1 — Harbor Café Plaza
  [30, 8.3, 0],     // P5: Packed Ochre Dirt Canyon Ramp
  [40, 10.6, -16],  // P6: Terracotta Switchback Bend
  [30, 12.6, -34],  // P7: Rocky Gravel Rumble Climb
  [10, 13.8, -40],  // P8: Checkpoint 2 — Cypress Arch Terrace
  [-12, 15.2, -36], // P9: Cobblestone Cliffside Curve
  [-28, 16.6, -44], // P10: South Bridgehead
  [-42, 17.5, -56], // P11: Midpoint of Chasm Suspension Bridge
  [-56, 18.6, -68], // P12: North Bridgehead
  [-62, 19.6, -78], // P13: Checkpoint 3 — Chasm Bridge Post
  [-52, 21.8, -96], // P14: Upper Ochre Canyon Climb
  [-32, 24.0, -104],// P15: Upper Gravel Ridge Bend
  [-12, 25.6, -98], // P16: Lighthouse Promenade
  [4, 26.2, -88],   // P17: Checkpoint 4 — Cliffside Lighthouse Villa
  [14, 26.2, -82],  // P18: Villa Courtyard Runout
];

const WATER_LEVEL = 0.0;
const BRIDGE_CENTER = new THREE.Vector3(-42, 17.5, -56);
// Bridge runs along (-14, -12) normalized -> (-0.7592, -0.6508)
// Chasm inlet runs perpendicular -> (+0.6508, -0.7592)
const BRIDGE_DIR_XZ = new THREE.Vector2(-14, -12).normalize();
const CHASM_DIR_XZ = new THREE.Vector2(BRIDGE_DIR_XZ.y, -BRIDGE_DIR_XZ.x);

function classifySurface(s: number, bridgeStartS: number, bridgeEndS: number): SurfaceType {
  if (s < 26) return 'pier';
  if (s >= bridgeStartS && s <= bridgeEndS) return 'bridge';
  if (s >= 84 && s < 114) return 'dirt';
  if (s >= 114 && s < 142) return 'gravel';
  if (s >= 254 && s < 282) return 'dirt';
  if (s >= 282 && s < 302) return 'gravel';
  return 'cobblestone';
}

function widthForS(s: number, cpSList: number[], bridgeStartS: number, bridgeEndS: number): number {
  if (s < 24) return 6.4;
  if (s >= bridgeStartS - 3 && s <= bridgeEndS + 3) {
    const inner = smoothstep(bridgeStartS - 3, bridgeStartS + 2, s) *
      (1 - smoothstep(bridgeEndS - 2, bridgeEndS + 3, s));
    return THREE.MathUtils.lerp(7.6, 5.2, inner);
  }
  let base = 7.8;
  for (const cpS of cpSList) {
    const dist = Math.abs(s - cpS);
    if (dist < 14) {
      const widen = 1 - smoothstep(4, 14, dist);
      base = Math.max(base, 7.8 + widen * 2.4);
    }
  }
  // Finish Lighthouse Villa Plaza is extra grand
  const finS = cpSList[cpSList.length - 1] ?? 325;
  if (s > finS - 12) {
    const finWiden = smoothstep(finS - 12, finS, s);
    base = Math.max(base, 7.8 + finWiden * 4.4);
  }
  return base;
}

// ---------------------------------------------------------------------------
// Canyon Trail Builder
// ---------------------------------------------------------------------------

export function buildCanyonTrail(): CanyonTrail {
  const group = new THREE.Group();
  group.name = 'CoralCanyonTrail';

  const ownedGeos: THREE.BufferGeometry[] = [];
  const ownedMats: THREE.Material[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    ownedGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    ownedMats.push(m);
    return m;
  };

  // 1. Sample smooth spline at uniform arc-length intervals
  const ctrlVecs = RAW_CONTROL_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(ctrlVecs, false, 'centripetal', 0.45);
  const totalLength = curve.getLength();
  const sampleCount = 440;

  // Locate approximate arc-lengths of key landmarks (control point projections)
  const findApproxS = (target: THREE.Vector3): number => {
    let bestS = 0;
    let bestD2 = Infinity;
    for (let i = 0; i <= 500; i++) {
      const u = i / 500;
      const p = curve.getPointAt(u);
      const d2 = p.distanceToSquared(target);
      if (d2 < bestD2) {
        bestD2 = d2;
        bestS = u * totalLength;
      }
    }
    return bestS;
  };

  const cp1S = findApproxS(ctrlVecs[4]);  // Harbor Café
  const cp2S = findApproxS(ctrlVecs[8]);  // Cypress Arch Terrace
  const bridgeMidS = findApproxS(ctrlVecs[11]);
  const bridgeStartS = bridgeMidS - 16.5;
  const bridgeEndS = bridgeMidS + 16.5;
  const cp3S = findApproxS(ctrlVecs[13]); // Chasm Bridge Post
  const cp4S = findApproxS(ctrlVecs[17]); // Cliffside Lighthouse Villa
  const cpSList = [cp1S, cp2S, cp3S, cp4S];

  const samples: TrailSample[] = [];
  const worldUp = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / (sampleCount - 1);
    const s = t * totalLength;
    const pos = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const right = new THREE.Vector3().crossVectors(tan, worldUp).normalize();
    const surface = classifySurface(s, bridgeStartS, bridgeEndS);
    const width = widthForS(s, cpSList, bridgeStartS, bridgeEndS);

    // Seaward parapet walls protect cliff drops without blocking views
    const inRoad = surface !== 'pier' && surface !== 'bridge';
    const hasSeaParapetLeft =
      inRoad &&
      ((s >= 28 && s <= bridgeStartS - 3) || (s >= bridgeEndS + 3 && s <= cp4S - 10));
    const hasSeaParapetRight =
      inRoad && s >= cp3S + 18 && s <= cp4S - 10;

    samples.push({
      index: i,
      s,
      t,
      pos,
      tangent: tan,
      right,
      width,
      surface,
      hasSeaParapetLeft,
      hasSeaParapetRight,
    });
  }

  // 2. Spatial Hash Grid for O(1) nearest-sample lookups
  const cellSize = 14;
  const grid = new Map<string, number[]>();
  const cellKey = (cx: number, cz: number) => `${cx},${cz}`;

  for (let i = 0; i < samples.length; i++) {
    const p = samples[i].pos;
    const cx = Math.floor(p.x / cellSize);
    const cz = Math.floor(p.z / cellSize);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const key = cellKey(cx + dx, cz + dz);
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(i);
      }
    }
  }

  const sampleAtS = (s: number): TrailSample => {
    const clamped = Math.max(0, Math.min(totalLength, s));
    const idx = Math.min(
      samples.length - 1,
      Math.max(0, Math.round((clamped / totalLength) * (samples.length - 1))),
    );
    return samples[idx];
  };

  const findNearest = (x: number, z: number): NearestTrailResult => {
    const cx = Math.floor(x / cellSize);
    const cz = Math.floor(z / cellSize);
    const bucket = grid.get(cellKey(cx, cz));

    let bestIdx = 0;
    let bestD2 = Infinity;

    if (bucket && bucket.length > 0) {
      for (let i = 0; i < bucket.length; i++) {
        const idx = bucket[i];
        const p = samples[idx].pos;
        const dx = x - p.x;
        const dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = idx;
        }
      }
    } else {
      // Fallback coarse scan (only outside the road corridor)
      for (let i = 0; i < samples.length; i += 3) {
        const p = samples[i].pos;
        const dx = x - p.x;
        const dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = i;
        }
      }
      const lo = Math.max(0, bestIdx - 3);
      const hi = Math.min(samples.length - 1, bestIdx + 3);
      for (let i = lo; i <= hi; i++) {
        const p = samples[i].pos;
        const dx = x - p.x;
        const dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = i;
        }
      }
    }

    // Sub-segment projection between bestIdx-1, bestIdx, bestIdx+1 for butter-smooth height & s!
    const s0 = samples[bestIdx];
    let bestS = s0.s;
    let roadY = s0.pos.y;
    let lateralOffset =
      (x - s0.pos.x) * s0.right.x + (z - s0.pos.z) * s0.right.z;
    let dist = Math.sqrt(bestD2);
    let slopeX = s0.tangent.y;

    const candidates: Array<[number, number]> = [];
    if (bestIdx > 0) candidates.push([bestIdx - 1, bestIdx]);
    if (bestIdx < samples.length - 1) candidates.push([bestIdx, bestIdx + 1]);

    let minSegDist = Infinity;
    for (const [iA, iB] of candidates) {
      const a = samples[iA];
      const b = samples[iB];
      const abx = b.pos.x - a.pos.x;
      const abz = b.pos.z - a.pos.z;
      const len2 = abx * abx + abz * abz;
      if (len2 < 1e-6) continue;
      const u = Math.max(0, Math.min(1, ((x - a.pos.x) * abx + (z - a.pos.z) * abz) / len2));
      const px = a.pos.x + abx * u;
      const pz = a.pos.z + abz * u;
      const d = Math.hypot(x - px, z - pz);
      if (d < minSegDist) {
        minSegDist = d;
        bestS = THREE.MathUtils.lerp(a.s, b.s, u);
        roadY = THREE.MathUtils.lerp(a.pos.y, b.pos.y, u);
        const rx = THREE.MathUtils.lerp(a.right.x, b.right.x, u);
        const rz = THREE.MathUtils.lerp(a.right.z, b.right.z, u);
        const rLen = Math.hypot(rx, rz) || 1;
        lateralOffset = ((x - px) * rx + (z - pz) * rz) / rLen;
        dist = d;
        const segHoriz = Math.sqrt(len2);
        slopeX = (b.pos.y - a.pos.y) / Math.max(0.01, segHoriz);
      }
    }

    const surface = classifySurface(bestS, bridgeStartS, bridgeEndS);
    const width = widthForS(bestS, cpSList, bridgeStartS, bridgeEndS);
    const onBridge = surface === 'bridge' && Math.abs(lateralOffset) <= width * 0.56;

    return {
      sample: s0,
      s: bestS,
      lateralOffset,
      distance: dist,
      roadY,
      roadSlopeX: slopeX,
      surface,
      width,
      onBridge,
    };
  };

  // 3. Natural Stratified Terracotta Canyon + Coastal Bay Heightfield
  const getTerrainHeight = (x: number, z: number): number => {
    const near = findNearest(x, z);

    // Base coastal topography: sea to the west/south, canyon cliffs rising to the east/north
    const coastGradient = (x + 28) * 0.21 + (-z + 24) * 0.24;
    const macroNoise = fbm2D(x * 0.016 + 4.2, z * 0.016 - 2.1, 4);
    const ridgeNoise = 1 - Math.abs(fbm2D(x * 0.032 - 1.7, z * 0.032 + 3.4, 3) * 2 - 1);

    let naturalH = coastGradient - 2.5 + (macroNoise - 0.45) * 16 + ridgeNoise * 8.5;

    // Carve the Harbor Bay cove cleanly around the Start Pier
    const harborDist = Math.hypot((x + 36) * 0.85, (z - 64) * 0.72);
    const harborMask = 1 - smoothstep(14, 48, harborDist);
    naturalH = THREE.MathUtils.lerp(naturalH, -3.2, harborMask);

    // Open Mediterranean Sea along far southwest/west border
    const seaSweep = smoothstep(12, -52, x - z * 0.35 + 16);
    naturalH = THREE.MathUtils.lerp(naturalH, -3.8, seaSweep * 0.92);

    // Dramatic Red-Rock Canyon Mesa backdrop behind the east/northeast cliffs
    const mesaBoost = smoothstep(26, 78, x + 6) * 18 + smoothstep(-76, -138, z) * 14;
    naturalH += mesaBoost;

    // Sedona/Amalfi horizontal geological sandstone strata ledges!
    if (naturalH > 3.2) {
      const strata = 3.4;
      const local = ((naturalH % strata) + strata) % strata;
      const quantized = naturalH - local + smoothstep(0.16, 0.84, local / strata) * strata;
      naturalH = THREE.MathUtils.lerp(naturalH, quantized, 0.66);
    }

    // Carve the dramatic Chasm Inlet beneath the suspension bridge down to turquoise sea!
    const relBx = x - BRIDGE_CENTER.x;
    const relBz = z - BRIDGE_CENTER.z;
    const alongBridge = relBx * BRIDGE_DIR_XZ.x + relBz * BRIDGE_DIR_XZ.y;
    const alongChasm = relBx * CHASM_DIR_XZ.x + relBz * CHASM_DIR_XZ.y;
    const chasmWidthFactor = 1 - smoothstep(8.5, 16.2, Math.abs(alongBridge));
    const chasmLengthFactor = 1 - smoothstep(26, 62, Math.abs(alongChasm - 6));
    const chasmCarve = chasmWidthFactor * chasmLengthFactor;

    // Blend cleanly with trail roadbed (EXCEPT pier over harbor water & bridge over chasm!)
    const isPierOrBridge = near.surface === 'pier' || near.surface === 'bridge';
    if (!isPierOrBridge) {
      const halfW = near.width * 0.5;
      // Exact roadbed support plateau slightly beneath the road ribbon (prevents Z-fighting)
      const roadBlend = 1 - smoothstep(halfW + 0.85, halfW + 14.5, near.distance);

      // On the seaward (left) side, drop faster toward the bay; on inland (right), rise into sandstone strata!
      const sideBias = near.lateralOffset > 0
        ? smoothstep(halfW + 1.5, halfW + 16, near.lateralOffset) * 7.8
        : -smoothstep(halfW + 1.5, halfW + 18, -near.lateralOffset) * 6.2;

      const targetRoadSupport = near.roadY - 0.1;
      const flankH = Math.max(-3.2, naturalH + sideBias * 0.55);
      naturalH = THREE.MathUtils.lerp(flankH, targetRoadSupport, roadBlend);

      // Extra smooth plaza terrace around the Cliffside Lighthouse Villa cape so the villa sits proudly
      const villaDist = Math.hypot(x - 16, z + 81);
      if (villaDist < 30) {
        const villaBlend = 1 - smoothstep(16, 30, villaDist);
        naturalH = THREE.MathUtils.lerp(naturalH, 26.05, villaBlend);
      }
    } else if (near.surface === 'pier') {
      // Smoothly slope seabed down from pier landfall (s=26) into harbor water
      const pierWaterFactor = 1 - smoothstep(18, 28, near.s);
      const nearPier = 1 - smoothstep(6, 22, near.distance);
      naturalH = THREE.MathUtils.lerp(naturalH, -2.8, pierWaterFactor * nearPier);
    }

    // Apply Chasm Inlet carve LAST so the chasm beneath the suspension bridge is genuinely open to the sea!
    if (chasmCarve > 0.001) {
      naturalH = THREE.MathUtils.lerp(naturalH, -2.6, chasmCarve);
    }

    return naturalH;
  };

  // 4. Build Sculpted Stratified Terracotta Terrain Mesh
  {
    const minX = -115;
    const maxX = 105;
    const minZ = -155;
    const maxZ = 105;
    const segX = 148;
    const segZ = 160;
    const width = maxX - minX;
    const depth = maxZ - minZ;

    const geo = trackGeo(new THREE.PlaneGeometry(width, depth, segX, segZ));
    geo.rotateX(-Math.PI / 2);
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const vCount = posAttr.count;
    const colors = new Float32Array(vCount * 3);

    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;

    for (let i = 0; i < vCount; i++) {
      const wx = posAttr.getX(i) + cx;
      const wz = posAttr.getZ(i) + cz;
      const wy = getTerrainHeight(wx, wz);
      posAttr.setXYZ(i, wx, wy, wz);
    }

    geo.computeVertexNormals();
    const normAttr = geo.attributes.normal as THREE.BufferAttribute;

    const cDeepReef = new THREE.Color('#2c6b6e');
    const cSand = new THREE.Color('#dfbc8a');
    const cTerracotta = new THREE.Color('#c86342');
    const cSienna = new THREE.Color('#9c442c');
    const cOchre = new THREE.Color('#db965b');
    const cLimestone = new THREE.Color('#e6cda6');
    const cDrySage = new THREE.Color('#8e8f55');
    const tmpCol = new THREE.Color();

    for (let i = 0; i < vCount; i++) {
      const wx = posAttr.getX(i);
      const wy = posAttr.getY(i);
      const wz = posAttr.getZ(i);
      const ny = normAttr.getY(i);

      if (wy < 0.35) {
        const t = smoothstep(-2.4, 0.35, wy);
        tmpCol.copy(cDeepReef).lerp(cSand, t);
      } else if (wy < 2.2) {
        const t = smoothstep(0.35, 2.2, wy);
        tmpCol.copy(cSand).lerp(cOchre, t * 0.72);
      } else {
        // Horizontal sedimentary strata bands (Sedona/Amalfi red-rock palette)
        const n = valueNoise2D(wx * 0.08, wz * 0.08);
        const strataWave = Math.sin(wy * 1.32 + n * 1.4);
        const fineBand = Math.sin(wy * 3.8 + n * 2.2) * 0.5 + 0.5;

        if (strataWave > 0.35) {
          tmpCol.copy(cOchre).lerp(cLimestone, fineBand * 0.55);
        } else if (strataWave < -0.25) {
          tmpCol.copy(cSienna).lerp(cTerracotta, fineBand * 0.6);
        } else {
          tmpCol.copy(cTerracotta).lerp(cOchre, fineBand * 0.65);
        }

        // Flatter sunlit terraces get dry Mediterranean sage-olive topsoil!
        const flatness = smoothstep(0.76, 0.94, ny);
        const sageNoise = smoothstep(0.28, 0.72, valueNoise2D(wx * 0.055 + 11, wz * 0.055 - 7));
        tmpCol.lerp(cDrySage, flatness * sageNoise * 0.58);
      }

      colors[i * 3] = tmpCol.r;
      colors[i * 3 + 1] = tmpCol.g;
      colors[i * 3 + 2] = tmpCol.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const terrainMat = trackMat(
      createPBRMaterial('sandstone', {
        repeatX: 28,
        repeatY: 30,
        seed: 601,
        tint: '#ffffff',
      }),
    );
    terrainMat.vertexColors = true;
    terrainMat.roughness = 0.9;
    terrainMat.bumpScale = 0.08;

    const terrainMesh = new THREE.Mesh(geo, terrainMat);
    terrainMesh.name = 'CanyonTerrain';
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    group.add(terrainMesh);
  }

  // 5. Build Multi-Surface Road Ribbons (Cobblestone, Ochre Dirt, Gravel) + Stone Curbs
  const buildRoadSurfaceSegment = (
    indices: number[],
    mat: THREE.Material,
    yOffset: number,
    widthScale: number,
    uvScaleV: number,
    skirtDrop: number,
    name: string,
  ) => {
    if (indices.length < 2) return;
    // Build a top strip + left & right downward skirts so the road locks solidly into terrain
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const triIndices: number[] = [];

    // 4 vertices per cross-section: [leftSkirt, leftEdge, rightEdge, rightSkirt]
    let vDist = 0;
    for (let k = 0; k < indices.length; k++) {
      const samp = samples[indices[k]];
      if (k > 0) {
        vDist += samp.pos.distanceTo(samples[indices[k - 1]].pos);
      }
      const hw = samp.width * 0.5 * widthScale;
      const rx = samp.right.x;
      const rz = samp.right.z;
      const cx = samp.pos.x;
      const cy = samp.pos.y + yOffset;
      const cz = samp.pos.z;
      const vCoord = vDist * uvScaleV;

      // 0: left skirt bottom
      positions.push(cx - rx * (hw + 0.35), cy - skirtDrop, cz - rz * (hw + 0.35));
      normals.push(-rx, 0.25, -rz);
      uvs.push(0, vCoord);

      // 1: left road edge
      positions.push(cx - rx * hw, cy, cz - rz * hw);
      normals.push(0, 1, 0);
      uvs.push(0.12, vCoord);

      // 2: right road edge
      positions.push(cx + rx * hw, cy, cz + rz * hw);
      normals.push(0, 1, 0);
      uvs.push(0.88, vCoord);

      // 3: right skirt bottom
      positions.push(cx + rx * (hw + 0.35), cy - skirtDrop, cz + rz * (hw + 0.35));
      normals.push(rx, 0.25, rz);
      uvs.push(1, vCoord);

      if (k > 0) {
        const prev = (k - 1) * 4;
        const curr = k * 4;
        for (let q = 0; q < 3; q++) {
          const a = prev + q;
          const b = prev + q + 1;
          const c = curr + q;
          const d = curr + q + 1;
          triIndices.push(a, c, b, b, c, d);
        }
      }
    }

    const geo = trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(triIndices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);
  };

  const cobbleMat = trackMat(
    createPBRMaterial('cobblestone', {
      repeatX: 2.4,
      repeatY: 1,
      seed: 602,
      tint: '#e9d3b8',
    }),
  );
  cobbleMat.roughness = 0.84;

  const dirtMat = trackMat(
    createPBRMaterial('sandstone', {
      repeatX: 2.2,
      repeatY: 1,
      seed: 603,
      tint: '#d98952',
    }),
  );
  dirtMat.roughness = 0.94;

  const gravelMat = trackMat(
    createPBRMaterial('cobblestone', {
      repeatX: 3.4,
      repeatY: 1,
      seed: 604,
      tint: '#b89477',
    }),
  );
  gravelMat.roughness = 0.96;
  gravelMat.bumpScale = 0.14;

  const pierWoodMat = trackMat(
    createPBRMaterial('woodPlanks', {
      repeatX: 2,
      repeatY: 1,
      seed: 605,
      tint: '#b7895c',
    }),
  );
  pierWoodMat.roughness = 0.85;

  // Group contiguous runs by surface type (overlapping by 1 index for seamless joins!)
  const surfaceRuns: Array<{ surface: SurfaceType; indices: number[] }> = [];
  for (let i = 0; i < samples.length; i++) {
    const surf = samples[i].surface;
    const last = surfaceRuns[surfaceRuns.length - 1];
    if (!last || last.surface !== surf) {
      const startIndices = last ? [i - 1, i] : [i];
      surfaceRuns.push({ surface: surf, indices: startIndices });
    } else {
      last.indices.push(i);
    }
  }

  for (let r = 0; r < surfaceRuns.length; r++) {
    const run = surfaceRuns[r];
    if (run.surface === 'cobblestone') {
      buildRoadSurfaceSegment(run.indices, cobbleMat, 0.02, 1.0, 0.28, 0.9, `CobbleRoad_${r}`);
    } else if (run.surface === 'dirt') {
      buildRoadSurfaceSegment(run.indices, dirtMat, 0.015, 1.0, 0.22, 0.85, `DirtRoad_${r}`);
    } else if (run.surface === 'gravel') {
      buildRoadSurfaceSegment(run.indices, gravelMat, 0.02, 1.0, 0.34, 0.85, `GravelRoad_${r}`);
    }
  }

  // Add subtle tactile rocky gravel strips on gravel segments so players visually read them ahead!
  {
    const stripGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.05, 0.28));
    const stripMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#a97a58',
        roughness: 0.94,
        metalness: 0.02,
      }),
    );
    const gravelSamples = samples.filter((s) => s.surface === 'gravel');
    const pebbleCount = gravelSamples.length * 4;
    if (pebbleCount > 0) {
      const pebbles = new THREE.InstancedMesh(stripGeo, stripMat, pebbleCount);
      pebbles.receiveShadow = true;
      const dummy = new THREE.Object3D();
      let idx = 0;
      for (let i = 0; i < gravelSamples.length; i++) {
        const s = gravelSamples[i];
        const yaw = Math.atan2(s.tangent.x, s.tangent.z);
        for (let k = 0; k < 4; k++) {
          const r1 = hash2(i * 7 + k, 31) - 0.5;
          const r2 = hash2(i * 11 + k, 47) - 0.5;
          const lat = r1 * (s.width - 1.2);
          dummy.position.set(
            s.pos.x + s.right.x * lat + s.tangent.x * r2 * 0.6,
            s.pos.y + 0.012,
            s.pos.z + s.right.z * lat + s.tangent.z * r2 * 0.6,
          );
          dummy.rotation.set(0, yaw + r2 * 1.4, 0);
          dummy.scale.set(0.6 + Math.abs(r1) * 1.1, 0.75, 0.6 + Math.abs(r2) * 0.9);
          dummy.updateMatrix();
          pebbles.setMatrixAt(idx++, dummy.matrix);
        }
      }
      pebbles.instanceMatrix.needsUpdate = true;
      group.add(pebbles);
    }
  }

  // 6. Build Sunlit Coastal Harbor Pier (Start Zone over Turquoise Sea)
  {
    const pierGroup = new THREE.Group();
    pierGroup.name = 'HarborPier';
    const pierSamples = samples.filter((s) => s.surface === 'pier');

    // Individual boardwalk planks + edge beams + heavy timber pilings descending below water
    const plankGeo = trackGeo(new THREE.BoxGeometry(6.6, 0.16, 0.56));
    const pilingGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 5.4, 10));
    const bollardGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 0.65, 10));
    const bollardCapGeo = trackGeo(new THREE.CylinderGeometry(0.23, 0.23, 0.12, 10));

    const pilingMat = trackMat(
      createPBRMaterial('bark', { repeatX: 1, repeatY: 2, seed: 606, tint: '#705843' }),
    );
    const railWoodMat = trackMat(
      createPBRMaterial('woodPlanks', { repeatX: 1, repeatY: 1, seed: 607, tint: '#9a714a' }),
    );
    const ironMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#3b3c40', roughness: 0.55, metalness: 0.72 }),
    );
    const ropeMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#d5bd91', roughness: 0.92, metalness: 0.0 }),
    );

    const plankStep = 0.68;
    const totalPierS = 26.5;
    const plankCount = Math.floor(totalPierS / plankStep);
    const planksInst = new THREE.InstancedMesh(plankGeo, pierWoodMat, plankCount);
    planksInst.receiveShadow = true;
    planksInst.castShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < plankCount; i++) {
      const sVal = i * plankStep;
      const samp = sampleAtS(sVal);
      const yaw = Math.atan2(samp.tangent.x, samp.tangent.z);
      const jitter = (hash2(i, 19) - 0.5) * 0.015;
      dummy.position.set(samp.pos.x, samp.pos.y - 0.08 + jitter, samp.pos.z);
      dummy.rotation.set(0, yaw, (hash2(i, 23) - 0.5) * 0.012);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      planksInst.setMatrixAt(i, dummy.matrix);
    }
    planksInst.instanceMatrix.needsUpdate = true;
    pierGroup.add(planksInst);

    // Support pilings, bollards & low side timber stringers every 4.2m
    const ropePtsL: THREE.Vector3[] = [];
    const ropePtsR: THREE.Vector3[] = [];
    for (let sVal = 0.5; sVal <= totalPierS; sVal += 4.2) {
      const samp = sampleAtS(sVal);
      for (const side of [-1, 1]) {
        const px = samp.pos.x + samp.right.x * side * 3.1;
        const pz = samp.pos.z + samp.right.z * side * 3.1;

        const piling = new THREE.Mesh(pilingGeo, pilingMat);
        piling.position.set(px, samp.pos.y - 2.2, pz);
        piling.castShadow = true;
        piling.receiveShadow = true;
        pierGroup.add(piling);

        const post = new THREE.Mesh(bollardGeo, railWoodMat);
        post.position.set(px, samp.pos.y + 0.34, pz);
        post.castShadow = true;
        pierGroup.add(post);

        const cap = new THREE.Mesh(bollardCapGeo, ironMat);
        cap.position.set(px, samp.pos.y + 0.68, pz);
        pierGroup.add(cap);

        const ropeAnchor = new THREE.Vector3(px, samp.pos.y + 0.54, pz);
        if (side < 0) ropePtsL.push(ropeAnchor);
        else ropePtsR.push(ropeAnchor);
      }
    }

    // Draped hemp ropes between harbor bollards
    for (const pts of [ropePtsL, ropePtsR]) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const mid = a.clone().lerp(b, 0.5);
        mid.y -= 0.16;
        const ropeCurve = new THREE.CatmullRomCurve3([a, mid, b]);
        const ropeGeo = trackGeo(new THREE.TubeGeometry(ropeCurve, 10, 0.045, 6, false));
        const ropeMesh = new THREE.Mesh(ropeGeo, ropeMat);
        pierGroup.add(ropeMesh);
      }
    }

    // End timber bumper cap behind start line (prevents backing off pier)
    if (pierSamples.length > 0) {
      const s0 = pierSamples[0];
      const backBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.7, 0.45, 0.35)), railWoodMat);
      backBar.position.set(
        s0.pos.x - s0.tangent.x * 0.6,
        s0.pos.y + 0.22,
        s0.pos.z - s0.tangent.z * 0.6,
      );
      backBar.rotation.y = Math.atan2(s0.tangent.x, s0.tangent.z);
      backBar.castShadow = true;
      pierGroup.add(backBar);
    }

    group.add(pierGroup);
  }

  // 7. Build Handcrafted Wooden Rope-and-Plank Suspension Bridge over the Chasm!
  const bridgeGroup = new THREE.Group();
  bridgeGroup.name = 'SuspensionBridge';
  const bridgeLen = bridgeEndS - bridgeStartS;
  const bridgePlankCount = 54;
  const bridgeStartSample = sampleAtS(bridgeStartS);
  const bridgeEndSample = sampleAtS(bridgeEndS);
  const bridgeYaw = Math.atan2(
    bridgeEndSample.pos.x - bridgeStartSample.pos.x,
    bridgeEndSample.pos.z - bridgeStartSample.pos.z,
  );

  interface BridgePlankMeta {
    u: number; // [0..1] along bridge
    s: number;
    basePos: THREE.Vector3;
    right: THREE.Vector3;
    yaw: number;
    baseTilt: number;
    jitterRoll: number;
  }

  const bridgePlanks: BridgePlankMeta[] = [];
  const bridgePlankGeo = trackGeo(new THREE.BoxGeometry(5.2, 0.16, 0.52));
  const bridgePlankMat = trackMat(
    createPBRMaterial('woodPlanks', {
      repeatX: 1.5,
      repeatY: 1,
      seed: 608,
      tint: '#b8824e',
    }),
  );
  bridgePlankMat.roughness = 0.84;

  const bridgePlanksInst = new THREE.InstancedMesh(
    bridgePlankGeo,
    bridgePlankMat,
    bridgePlankCount,
  );
  bridgePlanksInst.castShadow = true;
  bridgePlanksInst.receiveShadow = true;
  bridgePlanksInst.frustumCulled = false;

  for (let i = 0; i < bridgePlankCount; i++) {
    const u = (i + 0.5) / bridgePlankCount;
    const sVal = bridgeStartS + u * bridgeLen;
    const basePos = new THREE.Vector3().lerpVectors(
      bridgeStartSample.pos,
      bridgeEndSample.pos,
      u,
    );
    // Natural graceful catenary dip (0.55m sag in middle)
    const catenaryDip = Math.sin(u * Math.PI) * 0.55;
    basePos.y -= catenaryDip;

    const right = new THREE.Vector3(Math.cos(bridgeYaw), 0, -Math.sin(bridgeYaw));
    // Note: in Three.js yaw around Y, local +Z = (sin yaw, 0, cos yaw) = bridge forward,
    // so local +X = (cos yaw, 0, -sin yaw). Check right-handedness!
    bridgePlanks.push({
      u,
      s: sVal,
      basePos,
      right,
      yaw: bridgeYaw,
      baseTilt: (hash2(i, 73) - 0.5) * 0.025,
      jitterRoll: (hash2(i, 91) - 0.5) * 0.028,
    });
  }
  bridgeGroup.add(bridgePlanksInst);

  // Massive weathered timber A-frame support towers at both ends + catenary cables + vertical ropes
  {
    const towerWoodMat = trackMat(
      createPBRMaterial('bark', { repeatX: 1, repeatY: 3, seed: 609, tint: '#7a5233' }),
    );
    const ironStrapMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#39373a', roughness: 0.45, metalness: 0.78 }),
    );
    const cableMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#c8ab79', roughness: 0.9, metalness: 0.05 }),
    );
    const railTimberMat = trackMat(
      createPBRMaterial('woodPlanks', { repeatX: 4, repeatY: 1, seed: 610, tint: '#a47041' }),
    );

    const postGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.3, 6.8, 10));
    const crossBeamGeo = trackGeo(new THREE.BoxGeometry(6.6, 0.34, 0.34));
    const ironRingGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.24, 10));
    const stonePedestalGeo = trackGeo(new THREE.BoxGeometry(1.3, 4.6, 1.4));
    const stoneMat = trackMat(
      createPBRMaterial('sandstone', { repeatX: 1, repeatY: 2, seed: 611, tint: '#d4b48f' }),
    );

    const towerTopsLeft: THREE.Vector3[] = [];
    const towerTopsRight: THREE.Vector3[] = [];

    for (const endSample of [bridgeStartSample, bridgeEndSample]) {
      const yaw = bridgeYaw;
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const halfSpan = 2.95;

      for (const side of [-1, 1]) {
        const px = endSample.pos.x + right.x * side * halfSpan;
        const pz = endSample.pos.z + right.z * side * halfSpan;
        const py = endSample.pos.y;

        // Stone abutment pier descending into cliff rock
        const pedestal = new THREE.Mesh(stonePedestalGeo, stoneMat);
        pedestal.position.set(px, py - 2.1, pz);
        pedestal.rotation.y = yaw;
        pedestal.castShadow = true;
        pedestal.receiveShadow = true;
        bridgeGroup.add(pedestal);

        // Tall timber tower post
        const post = new THREE.Mesh(postGeo, towerWoodMat);
        post.position.set(px, py + 3.1, pz);
        post.castShadow = true;
        bridgeGroup.add(post);

        // Iron reinforcement bands
        for (const hOff of [1.2, 5.6]) {
          const band = new THREE.Mesh(ironRingGeo, ironStrapMat);
          band.position.set(px, py + hOff, pz);
          bridgeGroup.add(band);
        }

        const topPt = new THREE.Vector3(px, py + 6.1, pz);
        if (side < 0) towerTopsLeft.push(topPt);
        else towerTopsRight.push(topPt);
      }

      // High overhead cross-beam (6.15m clearance — completely above chase camera!)
      const topBeam = new THREE.Mesh(crossBeamGeo, towerWoodMat);
      topBeam.position.set(endSample.pos.x, endSample.pos.y + 6.0, endSample.pos.z);
      topBeam.rotation.y = yaw;
      topBeam.castShadow = true;
      bridgeGroup.add(topBeam);
    }

    // Catenary main suspension cables, timber handrails, and vertical suspender ropes!
    const sideOffsets = [-2.82, 2.82];
    const pennantColors = ['#e05a3c', '#f2b84b', '#3a9ea5', '#f7ede2', '#d6456b'];
    const pennantGeo = trackGeo(new THREE.ConeGeometry(0.18, 0.42, 3));
    pennantGeo.rotateX(Math.PI);

    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const side = sideOffsets[sideIdx];
      const topA = sideIdx === 0 ? towerTopsLeft[0] : towerTopsRight[0];
      const topB = sideIdx === 0 ? towerTopsLeft[1] : towerTopsRight[1];

      const cablePts: THREE.Vector3[] = [];
      const railPts: THREE.Vector3[] = [];
      const segs = 20;
      for (let k = 0; k <= segs; k++) {
        const u = k / segs;
        const pDeck = new THREE.Vector3().lerpVectors(
          bridgeStartSample.pos,
          bridgeEndSample.pos,
          u,
        );
        const right = new THREE.Vector3(Math.cos(bridgeYaw), 0, -Math.sin(bridgeYaw));
        const deckDip = Math.sin(u * Math.PI) * 0.55;
        const cableTopY = THREE.MathUtils.lerp(topA.y, topB.y, u);
        const cableSag = Math.sin(u * Math.PI) * 4.35;

        const cx = pDeck.x + right.x * side;
        const cz = pDeck.z + right.z * side;
        cablePts.push(new THREE.Vector3(cx, cableTopY - cableSag, cz));
        railPts.push(new THREE.Vector3(cx, pDeck.y - deckDip + 1.05, cz));
      }

      const mainCableCurve = new THREE.CatmullRomCurve3(cablePts);
      const mainCableGeo = trackGeo(new THREE.TubeGeometry(mainCableCurve, 36, 0.075, 7, false));
      const mainCableMesh = new THREE.Mesh(mainCableGeo, cableMat);
      mainCableMesh.castShadow = true;
      bridgeGroup.add(mainCableMesh);

      const handRailCurve = new THREE.CatmullRomCurve3(railPts);
      const handRailGeo = trackGeo(new THREE.TubeGeometry(handRailCurve, 28, 0.06, 6, false));
      const handRailMesh = new THREE.Mesh(handRailGeo, railTimberMat);
      bridgeGroup.add(handRailMesh);

      // Vertical suspender ropes connecting main catenary cable to deck edge
      const ropeCylGeo = trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 1, 5));
      for (let k = 1; k < segs; k++) {
        const u = k / segs;
        const cPt = mainCableCurve.getPointAt(u);
        const rPt = handRailCurve.getPointAt(u);
        const deckY = rPt.y - 1.05;
        const len = Math.max(0.25, cPt.y - deckY);
        const susp = new THREE.Mesh(ropeCylGeo, cableMat);
        susp.scale.set(1, len, 1);
        susp.position.set(cPt.x, deckY + len * 0.5, cPt.z);
        bridgeGroup.add(susp);
      }

      // Festive coastal bunting flags fluttering along the high outer cables
      for (let k = 2; k <= segs - 2; k += 2) {
        const u = k / segs;
        const pt = mainCableCurve.getPointAt(u);
        const pMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: pennantColors[(k + sideIdx) % pennantColors.length],
            roughness: 0.72,
            side: THREE.DoubleSide,
          }),
        );
        const flag = new THREE.Mesh(pennantGeo, pMat);
        flag.position.set(pt.x, pt.y - 0.22, pt.z);
        flag.rotation.y = bridgeYaw;
        bridgeGroup.add(flag);
      }
    }
  }
  group.add(bridgeGroup);

  // 8. Low Whitewashed Mediterranean Stone Parapet Walls with Terracotta Flowerpots!
  {
    const parapetGroup = new THREE.Group();
    parapetGroup.name = 'MediterraneanParapets';

    const stuccoMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#f2e8d9',
        roughness: 0.88,
        metalness: 0.02,
      }),
    );
    const copingMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#c96843',
        roughness: 0.78,
        metalness: 0.04,
      }),
    );
    const potMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#c45b39',
        roughness: 0.75,
        metalness: 0.03,
      }),
    );
    const bushLeafMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#4e7844',
        roughness: 0.84,
      }),
    );
    const bougColors = ['#d63384', '#e85d44', '#f2a93b', '#c4459c'];
    const bougMats = bougColors.map((col) =>
      trackMat(new THREE.MeshStandardMaterial({ color: col, roughness: 0.72 })),
    );

    const wallBlockGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.82, 2.35));
    const copingGeo = trackGeo(new THREE.BoxGeometry(0.54, 0.12, 2.42));
    const potGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.16, 0.34, 10));
    const foliageGeo = trackGeo(new THREE.DodecahedronGeometry(0.28, 1));
    const blossomGeo = trackGeo(new THREE.DodecahedronGeometry(0.11, 0));

    // Collect parapet placements
    const wallTransforms: THREE.Matrix4[] = [];
    const copingTransforms: THREE.Matrix4[] = [];
    const potPlacements: Array<{ x: number; y: number; z: number; seed: number }> = [];
    const dummy = new THREE.Object3D();

    const stepS = 2.45;
    let potCounter = 0;
    for (let sVal = 29; sVal < totalLength - 18; sVal += stepS) {
      const samp = sampleAtS(sVal);
      if (samp.surface === 'pier' || samp.surface === 'bridge') continue;
      const yaw = Math.atan2(samp.tangent.x, samp.tangent.z);

      const sides: number[] = [];
      if (samp.hasSeaParapetLeft) sides.push(-1);
      if (samp.hasSeaParapetRight) sides.push(1);

      for (const side of sides) {
        const offset = samp.width * 0.5 + 0.28;
        const wx = samp.pos.x + samp.right.x * side * offset;
        const wz = samp.pos.z + samp.right.z * side * offset;
        const wy = samp.pos.y;

        dummy.position.set(wx, wy + 0.32, wz);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        wallTransforms.push(dummy.matrix.clone());

        dummy.position.set(wx, wy + 0.76, wz);
        dummy.updateMatrix();
        copingTransforms.push(dummy.matrix.clone());

        potCounter++;
        if (potCounter % 4 === 0) {
          potPlacements.push({ x: wx, y: wy + 0.82, z: wz, seed: potCounter });
        }
      }
    }

    if (wallTransforms.length > 0) {
      const wallsInst = new THREE.InstancedMesh(wallBlockGeo, stuccoMat, wallTransforms.length);
      wallsInst.castShadow = true;
      wallsInst.receiveShadow = true;
      const copingsInst = new THREE.InstancedMesh(copingGeo, copingMat, copingTransforms.length);
      copingsInst.castShadow = true;
      copingsInst.receiveShadow = true;

      for (let i = 0; i < wallTransforms.length; i++) {
        wallsInst.setMatrixAt(i, wallTransforms[i]);
        copingsInst.setMatrixAt(i, copingTransforms[i]);
      }
      wallsInst.instanceMatrix.needsUpdate = true;
      copingsInst.instanceMatrix.needsUpdate = true;
      parapetGroup.add(wallsInst, copingsInst);
    }

    // Terracotta flowerpots sitting along the parapet wall coping!
    if (potPlacements.length > 0) {
      const potsInst = new THREE.InstancedMesh(potGeo, potMat, potPlacements.length);
      potsInst.castShadow = true;
      const bushInst = new THREE.InstancedMesh(foliageGeo, bushLeafMat, potPlacements.length);
      bushInst.castShadow = true;

      for (let i = 0; i < potPlacements.length; i++) {
        const p = potPlacements[i];
        dummy.position.set(p.x, p.y + 0.16, p.z);
        dummy.rotation.set(0, p.seed * 1.1, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        potsInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(p.x, p.y + 0.44, p.z);
        dummy.scale.set(1.05, 0.88, 1.05);
        dummy.updateMatrix();
        bushInst.setMatrixAt(i, dummy.matrix);

        // Vibrant bougainvillea / marigold blooms atop the pot!
        const bMat = bougMats[i % bougMats.length];
        for (let b = 0; b < 3; b++) {
          const ang = p.seed * 1.7 + b * 2.1;
          const bloom = new THREE.Mesh(blossomGeo, bMat);
          bloom.position.set(
            p.x + Math.cos(ang) * 0.16,
            p.y + 0.56 + (b % 2) * 0.08,
            p.z + Math.sin(ang) * 0.16,
          );
          parapetGroup.add(bloom);
        }
      }
      potsInst.instanceMatrix.needsUpdate = true;
      bushInst.instanceMatrix.needsUpdate = true;
      parapetGroup.add(potsInst, bushInst);
    }

    group.add(parapetGroup);
  }

  // 9. Define the 4 Scenic Coastal Delivery Checkpoints
  const makeCheckpoint = (
    id: number,
    name: string,
    subtitle: string,
    sVal: number,
    radius: number,
    isFinish: boolean,
  ): CheckpointDef => {
    const samp = sampleAtS(sVal);
    return {
      id,
      name,
      subtitle,
      s: samp.s,
      pos: samp.pos.clone(),
      tangent: samp.tangent.clone(),
      right: samp.right.clone(),
      radius,
      isFinish,
    };
  };

  const checkpoints: CheckpointDef[] = [
    makeCheckpoint(1, 'Harbor Café', 'Sunlit Espresso Terrace', cp1S, 5.4, false),
    makeCheckpoint(2, 'Cypress Arch Terrace', 'Panoramic Coastal Overlook', cp2S, 5.4, false),
    makeCheckpoint(3, 'Chasm Bridge Post', 'Canyon Crossing Station', cp3S, 5.4, false),
    makeCheckpoint(4, 'Cliffside Lighthouse Villa', 'Grand Coastal Beacon', cp4S, 6.2, true),
  ];

  // 10. Dynamic Suspension Bridge Plank Animation & Sway Physics
  const plankDummy = new THREE.Object3D();
  let bridgeSwayAmp = 0.025;
  let lastBridgeEffect: BridgeEffect = { active: false, sagY: 0, swayRoll: 0, swayTorque: 0 };

  const updateBridge = (time: number, playerS: number, playerSpeed: number): BridgeEffect => {
    const onBridge = playerS >= bridgeStartS && playerS <= bridgeEndS;
    const playerU = onBridge ? (playerS - bridgeStartS) / bridgeLen : -1;

    // Rolling speed excites bridge sway amplitude smoothly
    const targetAmp = onBridge
      ? 0.048 + Math.min(0.055, Math.abs(playerSpeed) * 0.0052)
      : 0.022;
    bridgeSwayAmp += (targetAmp - bridgeSwayAmp) * 0.06;

    for (let i = 0; i < bridgePlankCount; i++) {
      const m = bridgePlanks[i];
      const envelope = Math.sin(m.u * Math.PI);
      const waveRoll =
        Math.sin(time * 2.15 + m.u * Math.PI * 1.4) * bridgeSwayAmp * envelope;
      const waveY = Math.sin(time * 3.1 + m.u * 4.5) * 0.045 * envelope;

      // Local wheel-load sag directly beneath the wheelchair!
      let wheelSag = 0;
      if (onBridge) {
        const du = Math.abs(m.u - playerU);
        if (du < 0.22) {
          const load = 1 - smoothstep(0, 0.22, du);
          wheelSag = load * 0.24 * envelope;
        }
      }

      plankDummy.position.set(
        m.basePos.x,
        m.basePos.y + waveY - wheelSag - 0.08,
        m.basePos.z,
      );
      plankDummy.rotation.set(m.baseTilt, m.yaw, waveRoll + m.jitterRoll);
      plankDummy.scale.set(1, 1, 1);
      plankDummy.updateMatrix();
      bridgePlanksInst.setMatrixAt(i, plankDummy.matrix);
    }
    bridgePlanksInst.instanceMatrix.needsUpdate = true;

    if (onBridge) {
      const env = Math.sin(playerU * Math.PI);
      const catenaryDip = env * 0.55;
      const wheelSag = 0.22 * env;
      const waveY = Math.sin(time * 3.1 + playerU * 4.5) * 0.045 * env;
      const swayRoll = Math.sin(time * 2.15 + playerU * Math.PI * 1.4) * bridgeSwayAmp * env;
      const swayTorque = Math.cos(time * 2.15 + playerU * Math.PI * 1.4) * bridgeSwayAmp * 2.15 * env;

      lastBridgeEffect = {
        active: true,
        sagY: -(catenaryDip + wheelSag) + waveY,
        swayRoll,
        swayTorque,
      };
    } else {
      lastBridgeEffect = { active: false, sagY: 0, swayRoll: 0, swayTorque: 0 };
    }
    return lastBridgeEffect;
  };

  // Initialize bridge planks once so first frame renders perfectly
  updateBridge(0, -10, 0);

  // 11. Unified Ground Sampler (Height + Road/Slope Pitch & Roll for Wheelchair Alignment)
  const getGroundInfo = (x: number, z: number, heading: number, time: number) => {
    const nearest = findNearest(x, z);
    const fwdX = -Math.sin(heading);
    const fwdZ = -Math.cos(heading);
    const rightX = Math.cos(heading);
    const rightZ = -Math.sin(heading);

    const evalY = (px: number, pz: number): number => {
      const n = findNearest(px, pz);
      if (n.onBridge) {
        const u = Math.max(0, Math.min(1, (n.s - bridgeStartS) / bridgeLen));
        const env = Math.sin(u * Math.PI);
        const dip = env * 0.55 + env * 0.22;
        const waveY = Math.sin(time * 3.1 + u * 4.5) * 0.045 * env;
        return n.roadY - dip + waveY;
      }
      if (n.distance <= n.width * 0.54) {
        return n.roadY + 0.02;
      }
      return Math.max(WATER_LEVEL + 0.1, getTerrainHeight(px, pz));
    };

    const yCenter = evalY(x, z);
    const span = 0.65;
    const yFront = evalY(x + fwdX * span, z + fwdZ * span);
    const yBack = evalY(x - fwdX * span, z - fwdZ * span);
    const yRight = evalY(x + rightX * span, z + rightZ * span);
    const yLeft = evalY(x - rightX * span, z - rightZ * span);

    const pitch = THREE.MathUtils.clamp(Math.atan2(yFront - yBack, span * 2), -0.34, 0.34);
    let roll = THREE.MathUtils.clamp(Math.atan2(yRight - yLeft, span * 2), -0.3, 0.3);

    let bridge: BridgeEffect = { active: false, sagY: 0, swayRoll: 0, swayTorque: 0 };
    if (nearest.onBridge) {
      const u = Math.max(0, Math.min(1, (nearest.s - bridgeStartS) / bridgeLen));
      const env = Math.sin(u * Math.PI);
      const swayRoll = Math.sin(time * 2.15 + u * Math.PI * 1.4) * bridgeSwayAmp * env;
      const swayTorque =
        Math.cos(time * 2.15 + u * Math.PI * 1.4) * bridgeSwayAmp * 2.15 * env;
      roll += swayRoll * 1.6;
      bridge = {
        active: true,
        sagY: -(env * 0.77),
        swayRoll,
        swayTorque,
      };
    }

    return {
      y: yCenter,
      pitch,
      roll,
      surface: nearest.surface,
      nearest,
      bridge,
    };
  };

  const dispose = () => {
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMats) m.dispose();
    ownedGeos.length = 0;
    ownedMats.length = 0;
  };

  return {
    group,
    samples,
    totalLength,
    checkpoints,
    bridgeStartS,
    bridgeEndS,
    waterLevel: WATER_LEVEL,
    sampleAtS,
    findNearest,
    getTerrainHeight,
    getGroundInfo,
    updateBridge,
    dispose,
  };
}

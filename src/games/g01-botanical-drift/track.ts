import * as THREE from 'three';
import { createPBRMaterial } from '../../art';

export interface TrackFrame {
  arcDist: number;
  t: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  bankAngle: number;
  curvature: number;
}

export interface TrackProjection {
  arcDist: number;
  t: number;
  lateralOffset: number;
  roadY: number;
  roadCenter: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  bankAngle: number;
  curvature: number;
  frameIndex: number;
}

export interface ApexDriftZone {
  id: number;
  name: string;
  startArc: number;
  endArc: number;
  direction: -1 | 1; // +1 right turn, -1 left turn
}

export interface BoostPadDef {
  id: number;
  arcDist: number;
  lateralOffset: number;
  length: number;
  width: number;
  worldPos: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
}

export interface CheckpointDef {
  index: number; // 0 = Start/Finish, 1 = CP1, 2 = CP2
  name: string;
  arcDist: number;
  t: number;
}

export interface MountainTrack {
  readonly group: THREE.Group;
  readonly curve: THREE.CatmullRomCurve3;
  readonly frames: readonly TrackFrame[];
  readonly totalLength: number;
  readonly roadHalfWidth: number;
  readonly curbOuterWidth: number;
  readonly checkpoints: readonly CheckpointDef[];
  readonly apexZones: readonly ApexDriftZone[];
  readonly boostPads: readonly BoostPadDef[];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  readonly waterLevel: number;
  sampleAtArc(arcDist: number, out?: TrackFrame): TrackFrame;
  projectPoint(pos: THREE.Vector3, hintIndex?: number): TrackProjection;
  distanceToRoadXZ(x: number, z: number): { dist: number; roadY: number; side: number; frameIndex: number };
  terrainHeightAt(x: number, z: number): number;
  isOnOrNearRoad(x: number, z: number, margin?: number): boolean;
  wrapArc(s: number): number;
  arcDelta(fromArc: number, toArc: number): number;
}

const ROAD_HALF_WIDTH = 5.75;
const CURB_WIDTH = 0.65;
const CURB_OUTER = ROAD_HALF_WIDTH + CURB_WIDTH;
const FRAME_COUNT = 520;
const VALLEY_WATER_Y = -10.5;

// Deterministic 2D value noise + FBM for sculpted Kyoto mountain ridges
function hash2(ix: number, iz: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + 1442695041;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function noise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
}

function fbm2D(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return value / norm;
}

function buildControlPoints(): THREE.Vector3[] {
  // Sculpted closed Kyoto mountain touge circuit (~555m), clockwise from top.
  // Starts at elevated shrine terrace facing -Z through the grand vermilion Torii gate,
  // drops dramatically through Momiji Sweeper & Bamboo S-bend to the misty valley overlook,
  // then climbs back up the cedar-maple switchbacks to the summit terrace.
  const s = 0.86;
  const raw: [number, number, number][] = [
    [0, 14.0, 26],      // P0: Start grid approach (heading -Z)
    [0, 13.8, -26],     // P1: Grand Start Torii straight & crest
    [18, 11.4, -78],    // P2: Fast downhill entry
    [68, 8.2, -92],     // P3: Momiji Hairpin apex
    [106, 4.9, -54],    // P4: Maple Canyon descent
    [94, 2.3, -4],      // P5: Checkpoint 1 Torii & bamboo entry
    [60, 1.3, 18],      // P6: Inner Bamboo S-bend
    [92, 0.7, 66],      // P7: Valley Overlook Hairpin (Teahouse cliff!)
    [54, 2.1, 106],     // P8: Misty Valley straight
    [8, 4.7, 114],      // P9: Checkpoint 2 Torii & uphill sweep
    [-44, 7.9, 100],    // P10: Lantern Switchback climb
    [-54, 11.0, 62],    // P11: Crimson Ridge S-bend
    [-16, 13.2, 56],    // P12: Final chicane onto home straight
  ];
  return raw.map(([x, y, z]) => new THREE.Vector3(x * s, y, z * s));
}

function createStartFinishTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2d2c30';
  ctx.fillRect(0, 0, w, h);

  // Elegant crimson & warm ivory Japanese checkered finish band
  const cols = 16;
  const rows = 4;
  const cw = w / cols;
  const rh = (h - 24) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const even = (r + c) % 2 === 0;
      ctx.fillStyle = even ? '#efe6d5' : '#b83227';
      ctx.fillRect(c * cw, 12 + r * rh, cw + 0.5, rh + 0.5);
    }
  }

  // Gold border trims
  ctx.fillStyle = '#d9a441';
  ctx.fillRect(0, 6, w, 6);
  ctx.fillRect(0, h - 12, w, 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createCurbStripeTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Weathered carved granite with subtle red-ivory touge alternating curb paint
  ctx.fillStyle = '#c8bfb2';
  ctx.fillRect(0, 0, size, size);

  const bands = 4;
  const bandH = size / bands;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#b93b29' : '#dfd6c5';
    ctx.fillRect(0, i * bandH, size, bandH);
    // Stone seam mortar groove
    ctx.fillStyle = 'rgba(42, 36, 32, 0.45)';
    ctx.fillRect(0, i * bandH, size, 4);
  }
  // Subtle grime speckle
  for (let i = 0; i < 900; i++) {
    const x = (hash2(i, 17) * size) | 0;
    const y = (hash2(i, 53) * size) | 0;
    const alpha = 0.06 + hash2(i, 91) * 0.1;
    ctx.fillStyle = `rgba(38, 32, 28, ${alpha.toFixed(2)})`;
    ctx.fillRect(x, y, 3, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function buildMountainTrack(): MountainTrack {
  const group = new THREE.Group();
  group.name = 'KyotoMountainTrack';

  const controlPoints = buildControlPoints();
  const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.45);
  const totalLength = curve.getLength();

  // 1. Pre-sample evenly spaced frames along arc length
  const rawPositions: THREE.Vector3[] = [];
  const rawTangents: THREE.Vector3[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const u = i / FRAME_COUNT;
    rawPositions.push(curve.getPointAt(u));
    rawTangents.push(curve.getTangentAt(u).normalize());
  }

  // Compute signed horizontal curvature & smooth it for natural banked touge turns
  const rawCurvature = new Float32Array(FRAME_COUNT);
  const segLen = totalLength / FRAME_COUNT;
  for (let i = 0; i < FRAME_COUNT; i++) {
    const prevT = rawTangents[(i - 2 + FRAME_COUNT) % FRAME_COUNT];
    const nextT = rawTangents[(i + 2) % FRAME_COUNT];
    // Signed yaw rate: positive when turning LEFT (CCW), negative when turning RIGHT (CW)
    const crossY = nextT.x * prevT.z - nextT.z * prevT.x;
    const dotXZ = THREE.MathUtils.clamp(prevT.x * nextT.x + prevT.z * nextT.z, -1, 1);
    const angle = Math.atan2(crossY, dotXZ);
    rawCurvature[i] = angle / (4 * segLen);
  }

  // Gaussian-like multi-pass smooth of curvature for silky banking
  let smoothCurv = new Float32Array(rawCurvature);
  for (let pass = 0; pass < 5; pass++) {
    const next = new Float32Array(FRAME_COUNT);
    for (let i = 0; i < FRAME_COUNT; i++) {
      const a = smoothCurv[(i - 2 + FRAME_COUNT) % FRAME_COUNT];
      const b = smoothCurv[(i - 1 + FRAME_COUNT) % FRAME_COUNT];
      const c = smoothCurv[i];
      const d = smoothCurv[(i + 1) % FRAME_COUNT];
      const e = smoothCurv[(i + 2) % FRAME_COUNT];
      next[i] = a * 0.1 + b * 0.22 + c * 0.36 + d * 0.22 + e * 0.1;
    }
    smoothCurv = next;
  }

  const worldUp = new THREE.Vector3(0, 1, 0);
  const frames: TrackFrame[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < FRAME_COUNT; i++) {
    const pos = rawPositions[i];
    const tangent = rawTangents[i];
    const flatRight = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
    const baseUp = new THREE.Vector3().crossVectors(flatRight, tangent).normalize();

    // Bank into corners: positive curvature (turning LEFT) lifts the RIGHT outer edge (+bankAngle)
    const curv = smoothCurv[i];
    const bankAngle = THREE.MathUtils.clamp(curv * 3.1, -0.15, 0.15);

    const cosB = Math.cos(bankAngle);
    const sinB = Math.sin(bankAngle);
    const right = flatRight
      .clone()
      .multiplyScalar(cosB)
      .addScaledVector(baseUp, sinB)
      .normalize();
    const up = new THREE.Vector3().crossVectors(right, tangent).normalize();

    frames.push({
      arcDist: (i / FRAME_COUNT) * totalLength,
      t: i / FRAME_COUNT,
      position: pos,
      tangent,
      right,
      up,
      bankAngle,
      curvature: curv,
    });

    if (pos.x < minX) minX = pos.x;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.z < minZ) minZ = pos.z;
    if (pos.z > maxZ) maxZ = pos.z;
  }

  // Expand bounds for surrounding mountains
  const bounds = {
    minX: minX - 88,
    maxX: maxX + 88,
    minZ: minZ - 88,
    maxZ: maxZ + 88,
  };

  // Spatial lookup grid for ultra-fast terrain & foliage road masking
  const gridCell = 6.0;
  const gridMinX = bounds.minX - 20;
  const gridMinZ = bounds.minZ - 20;
  const gridCols = Math.ceil((bounds.maxX - bounds.minX + 40) / gridCell);
  const gridRows = Math.ceil((bounds.maxZ - bounds.minZ + 40) / gridCell);
  const spatialBuckets: number[][] = Array.from({ length: gridCols * gridRows }, () => []);

  const bucketRadius = 3; // stamp each frame into nearby cells
  for (let i = 0; i < FRAME_COUNT; i++) {
    const p = frames[i].position;
    const cx = Math.floor((p.x - gridMinX) / gridCell);
    const cz = Math.floor((p.z - gridMinZ) / gridCell);
    for (let dz = -bucketRadius; dz <= bucketRadius; dz++) {
      const rz = cz + dz;
      if (rz < 0 || rz >= gridRows) continue;
      for (let dx = -bucketRadius; dx <= bucketRadius; dx++) {
        const rx = cx + dx;
        if (rx < 0 || rx >= gridCols) continue;
        spatialBuckets[rz * gridCols + rx].push(i);
      }
    }
  }

  const wrapArc = (s: number): number => ((s % totalLength) + totalLength) % totalLength;

  const arcDelta = (fromArc: number, toArc: number): number => {
    let d = wrapArc(toArc) - wrapArc(fromArc);
    if (d > totalLength * 0.5) d -= totalLength;
    if (d < -totalLength * 0.5) d += totalLength;
    return d;
  };

  const sampleAtArc = (arcDist: number, out?: TrackFrame): TrackFrame => {
    const wrapped = wrapArc(arcDist);
    const exact = (wrapped / totalLength) * FRAME_COUNT;
    const i0 = Math.floor(exact) % FRAME_COUNT;
    const i1 = (i0 + 1) % FRAME_COUNT;
    const alpha = exact - Math.floor(exact);
    const f0 = frames[i0];
    const f1 = frames[i1];

    const target: TrackFrame = out ?? {
      arcDist: 0,
      t: 0,
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      bankAngle: 0,
      curvature: 0,
    };

    target.arcDist = wrapped;
    target.t = wrapped / totalLength;
    target.position.lerpVectors(f0.position, f1.position, alpha);
    target.tangent.lerpVectors(f0.tangent, f1.tangent, alpha).normalize();
    target.right.lerpVectors(f0.right, f1.right, alpha).normalize();
    target.up.lerpVectors(f0.up, f1.up, alpha).normalize();
    target.bankAngle = THREE.MathUtils.lerp(f0.bankAngle, f1.bankAngle, alpha);
    target.curvature = THREE.MathUtils.lerp(f0.curvature, f1.curvature, alpha);
    return target;
  };

  const distanceToRoadXZ = (
    x: number,
    z: number,
  ): { dist: number; roadY: number; side: number; frameIndex: number } => {
    const cx = Math.floor((x - gridMinX) / gridCell);
    const cz = Math.floor((z - gridMinZ) / gridCell);
    let bestDistSq = Infinity;
    let bestIdx = 0;

    if (cx >= 0 && cx < gridCols && cz >= 0 && cz < gridRows) {
      const bucket = spatialBuckets[cz * gridCols + cx];
      for (let b = 0; b < bucket.length; b++) {
        const idx = bucket[b];
        const p = frames[idx].position;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
    }

    // Fallback scan for points far from the road corridor
    if (bestDistSq === Infinity) {
      for (let i = 0; i < FRAME_COUNT; i += 3) {
        const p = frames[i].position;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
      // Refine around best coarse sample
      const base = bestIdx;
      for (let offset = -3; offset <= 3; offset++) {
        const idx = (base + offset + FRAME_COUNT) % FRAME_COUNT;
        const p = frames[idx].position;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
    }

    const f = frames[bestIdx];
    const nextF = frames[(bestIdx + 1) % FRAME_COUNT];
    const prevF = frames[(bestIdx - 1 + FRAME_COUNT) % FRAME_COUNT];

    // Project onto local chord for sub-frame precision (eliminates faceted terrain seams)
    const vx = x - f.position.x;
    const vz = z - f.position.z;
    const tx = nextF.position.x - prevF.position.x;
    const tz = nextF.position.z - prevF.position.z;
    const tLenSq = tx * tx + tz * tz || 1;
    const along = THREE.MathUtils.clamp((vx * tx + vz * tz) / tLenSq, -0.5, 0.5);

    const interpX = f.position.x + tx * along * 0.5;
    const interpY = f.position.y + (nextF.position.y - prevF.position.y) * along * 0.5;
    const interpZ = f.position.z + tz * along * 0.5;

    const rx = x - interpX;
    const rz = z - interpZ;
    const dist = Math.hypot(rx, rz);
    const side = rx * f.right.x + rz * f.right.z >= 0 ? 1 : -1;
    // Account for banking height at road edge
    const bankY = Math.min(dist, CURB_OUTER) * side * Math.sin(f.bankAngle);

    return {
      dist,
      roadY: interpY + bankY,
      side,
      frameIndex: bestIdx,
    };
  };

  const projectPoint = (pos: THREE.Vector3, hintIndex?: number): TrackProjection => {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < FRAME_COUNT) {
      const searchWindow = 28;
      for (let off = -searchWindow; off <= searchWindow; off++) {
        const idx = (hintIndex + off + FRAME_COUNT) % FRAME_COUNT;
        const p = frames[idx].position;
        const dx = pos.x - p.x;
        const dz = pos.z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
    }

    // Full scan fallback if far from hint
    if (bestDistSq > 400) {
      bestDistSq = Infinity;
      for (let i = 0; i < FRAME_COUNT; i++) {
        const p = frames[i].position;
        const dx = pos.x - p.x;
        const dz = pos.z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    const f = frames[bestIdx];
    const relX = pos.x - f.position.x;
    const relZ = pos.z - f.position.z;
    // Compute signed tangent projection along XZ to interpolate exact arcDist
    const tXZLen = Math.hypot(f.tangent.x, f.tangent.z) || 1;
    const along = (relX * f.tangent.x + relZ * f.tangent.z) / tXZLen;
    const exactArc = wrapArc(f.arcDist + along);
    const exactFrame = sampleAtArc(exactArc);

    const dx = pos.x - exactFrame.position.x;
    const dz = pos.z - exactFrame.position.z;
    const rightXZLen = Math.hypot(exactFrame.right.x, exactFrame.right.z) || 1;
    const lateralOffset = (dx * exactFrame.right.x + dz * exactFrame.right.z) / rightXZLen;
    const roadY = exactFrame.position.y + lateralOffset * Math.sin(exactFrame.bankAngle);

    return {
      arcDist: exactArc,
      t: exactArc / totalLength,
      lateralOffset,
      roadY,
      roadCenter: exactFrame.position,
      tangent: exactFrame.tangent,
      right: exactFrame.right,
      up: exactFrame.up,
      bankAngle: exactFrame.bankAngle,
      curvature: exactFrame.curvature,
      frameIndex: Math.floor((exactArc / totalLength) * FRAME_COUNT) % FRAME_COUNT,
    };
  };

  // Continuous sculpted Kyoto mountain heightfield seamlessly stitched to road shoulders
  const terrainHeightAt = (x: number, z: number): number => {
    const info = distanceToRoadXZ(x, z);

    // Natural Kyoto hillside base: higher mountain massif in the NW & inner peak,
    // descending gracefully into a wide sunlit river valley in the SE
    const nLarge = fbm2D(x * 0.011 + 11.4, z * 0.011 - 7.2, 4);
    const nMed = fbm2D(x * 0.032 - 3.7, z * 0.032 + 9.1, 3);
    const nDetail = noise2D(x * 0.09, z * 0.09);

    // Distant majestic peaks around northern/western backdrop
    const northSlope = smoothstep(-25, -140, z) * 32;
    const westSlope = smoothstep(-35, -145, x) * 26;

    // Inner shrine hill peak nestled inside the upper loop around (24, -18)
    const innerDist = Math.hypot((x - 24) * 1.05, (z + 16) * 0.92);
    const innerPeak = Math.exp(-(innerDist * innerDist) / (34 * 34)) * 18.5;

    // Dramatic sunlit misty valley to the SE (around x=75..180, z=45..180)
    const valleyMask =
      smoothstep(20, 125, x) * smoothstep(-10, 110, z) * 1.15 +
      smoothstep(75, 160, z) * 0.65;
    const valleyDrop = Math.min(1.35, valleyMask) * 18.5;

    // Outer distant mountain rim far beyond the valley so the horizon feels grand
    const radialDist = Math.hypot(x - 18, z - 12);
    const distantRim = smoothstep(138, 210, radialDist) * (20 + nLarge * 18);

    const naturalY =
      2.5 +
      (nLarge - 0.45) * 18.0 +
      (nMed - 0.5) * 6.5 +
      (nDetail - 0.5) * 1.4 +
      northSlope +
      westSlope +
      innerPeak -
      valleyDrop +
      distantRim;

    // Seamless blend with roadbed:
    // Under the road surface: push slightly below roadbed to avoid any z-fighting
    if (info.dist < ROAD_HALF_WIDTH + 0.55) {
      return info.roadY - 0.48;
    }

    // Shoulder collar right outside the curbs: gently hugs the curb base then blends into mountain
    const shoulderBlend = smoothstep(ROAD_HALF_WIDTH + 0.55, CURB_OUTER + 1.1, info.dist);
    const outerBlend = smoothstep(CURB_OUTER + 0.8, CURB_OUTER + 14.5, info.dist);

    // On outer cliff overlooks (valley side), drop slightly faster; on inner hills, rise gently
    const shoulderY = info.roadY - 0.14;
    const collarY = THREE.MathUtils.lerp(info.roadY - 0.48, shoulderY, shoulderBlend);
    return THREE.MathUtils.lerp(collarY, naturalY, outerBlend);
  };

  const isOnOrNearRoad = (x: number, z: number, margin = 2.0): boolean => {
    return distanceToRoadXZ(x, z).dist < CURB_OUTER + margin;
  };

  // -------------------------------------------------------------------------
  // 2. Build Road Surface, Carved Stone Curbs, Embankment Skirt, Guardrails & Retaining Walls
  // -------------------------------------------------------------------------
  const roadSegs = 380;
  // Exact integer V-repeats so painted asphalt dashes wrap with zero seam at s=0
  const vRepeatTotal = Math.max(24, Math.round(totalLength / 11.5));

  // Main Asphalt Ribbon
  {
    const crossVerts = 5; // smooth banked cross-section
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= roadSegs; i++) {
      const s = (i / roadSegs) * totalLength;
      const f = sampleAtArc(s);
      const vCoord = (i / roadSegs) * vRepeatTotal;

      for (let j = 0; j < crossVerts; j++) {
        const u = j / (crossVerts - 1); // 0 = left edge, 1 = right edge
        const lat = (u - 0.5) * 2 * ROAD_HALF_WIDTH;
        // Subtle 4cm road crown for authentic drainage feel
        const crown = (1 - Math.pow((u - 0.5) * 2, 2)) * 0.04;
        const px = f.position.x + f.right.x * lat + f.up.x * crown;
        const py = f.position.y + f.right.y * lat + f.up.y * crown;
        const pz = f.position.z + f.right.z * lat + f.up.z * crown;

        positions.push(px, py, pz);
        normals.push(f.up.x, f.up.y, f.up.z);
        uvs.push(u, vCoord);
      }
    }

    for (let i = 0; i < roadSegs; i++) {
      const rowA = i * crossVerts;
      const rowB = (i + 1) * crossVerts;
      for (let j = 0; j < crossVerts - 1; j++) {
        const a = rowA + j;
        const b = rowA + j + 1;
        const c = rowB + j;
        const d = rowB + j + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();

    const asphaltMat = createPBRMaterial('asphalt', {
      roadMarkings: true,
      repeatX: 1,
      repeatY: 1,
      anisotropy: 16,
      bumpScale: 0.032,
      roughness: 0.92,
      color: '#e8dfd5', // warm autumn sun tone on charcoal asphalt
    });

    const roadMesh = new THREE.Mesh(roadGeo, asphaltMat);
    roadMesh.name = 'TougeAsphaltRoad';
    roadMesh.receiveShadow = true;
    group.add(roadMesh);
  }

  // Start / Finish Checkered Crimson-Ivory Strip (positioned slightly ahead of spawn at s = 26m -> z ≈ -3)
  const startLineArc = 26.0;
  {
    const stripSegs = 6;
    const stripLen = 3.2;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= stripSegs; i++) {
      const frac = i / stripSegs;
      const s = startLineArc + (frac - 0.5) * stripLen;
      const f = sampleAtArc(s);
      for (const side of [-1, 1]) {
        const lat = side * (ROAD_HALF_WIDTH - 0.28);
        const lift = 0.055;
        positions.push(
          f.position.x + f.right.x * lat + f.up.x * lift,
          f.position.y + f.right.y * lat + f.up.y * lift,
          f.position.z + f.right.z * lat + f.up.z * lift,
        );
        normals.push(f.up.x, f.up.y, f.up.z);
        uvs.push(side === -1 ? 0 : 1, frac);
      }
    }
    for (let i = 0; i < stripSegs; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }

    const sfGeo = new THREE.BufferGeometry();
    sfGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    sfGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    sfGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    sfGeo.setIndex(indices);
    const sfMat = new THREE.MeshStandardMaterial({
      map: createStartFinishTexture(),
      roughness: 0.72,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const sfMesh = new THREE.Mesh(sfGeo, sfMat);
    sfMesh.receiveShadow = true;
    group.add(sfMesh);
  }

  // Raised Stone Curbs + Deep Masonry Embankment Skirts on Left & Right Sides
  {
    const curbTex = createCurbStripeTexture();
    const curbMat = new THREE.MeshStandardMaterial({
      map: curbTex,
      roughness: 0.85,
      metalness: 0.04,
    });
    const skirtMat = createPBRMaterial('cobblestone', {
      repeatX: 1,
      repeatY: 1,
      bumpScale: 0.06,
      color: '#a3998b',
    });

    for (const side of [-1, 1] as const) {
      // Curb profile: inner base -> inner lip -> outer top -> outer drop
      const profile: [number, number][] = [
        [ROAD_HALF_WIDTH - 0.05, 0.0],
        [ROAD_HALF_WIDTH + 0.08, 0.16],
        [CURB_OUTER, 0.16],
        [CURB_OUTER + 0.12, -0.22],
      ];
      const pCount = profile.length;
      const cPos: number[] = [];
      const cUv: number[] = [];
      const cIdx: number[] = [];

      const sPos: number[] = [];
      const sUv: number[] = [];
      const sIdx: number[] = [];

      for (let i = 0; i <= roadSegs; i++) {
        const s = (i / roadSegs) * totalLength;
        const f = sampleAtArc(s);
        const vCurb = s / 4.2;
        const vSkirt = s / 5.0;

        for (let k = 0; k < pCount; k++) {
          const lat = side * profile[k][0];
          const h = profile[k][1];
          cPos.push(
            f.position.x + f.right.x * lat + f.up.x * h,
            f.position.y + f.right.y * lat + f.up.y * h,
            f.position.z + f.right.z * lat + f.up.z * h,
          );
          cUv.push(k / (pCount - 1), vCurb);
        }

        // Solid masonry roadbed retaining embankment extending 6.5m below road edge
        const topLat = side * (CURB_OUTER + 0.06);
        const botLat = side * (CURB_OUTER + 2.6);
        sPos.push(
          f.position.x + f.right.x * topLat,
          f.position.y + f.right.y * topLat - 0.14,
          f.position.z + f.right.z * topLat,
          f.position.x + f.right.x * botLat,
          f.position.y + f.right.y * botLat - 6.8,
          f.position.z + f.right.z * botLat,
        );
        sUv.push(0, vSkirt, 1.35, vSkirt);
      }

      for (let i = 0; i < roadSegs; i++) {
        const rA = i * pCount;
        const rB = (i + 1) * pCount;
        for (let k = 0; k < pCount - 1; k++) {
          const a = rA + k;
          const b = rA + k + 1;
          const c = rB + k;
          const d = rB + k + 1;
          if (side === 1) {
            cIdx.push(a, b, c, b, d, c);
          } else {
            cIdx.push(a, c, b, b, c, d);
          }
        }

        const sa = i * 2;
        const sb = sa + 1;
        const sc = sa + 2;
        const sd = sa + 3;
        if (side === 1) {
          sIdx.push(sa, sb, sc, sb, sd, sc);
        } else {
          sIdx.push(sa, sc, sb, sb, sc, sd);
        }
      }

      const curbGeo = new THREE.BufferGeometry();
      curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
      curbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(cUv, 2));
      curbGeo.setIndex(cIdx);
      curbGeo.computeVertexNormals();
      const curbMesh = new THREE.Mesh(curbGeo, curbMat);
      curbMesh.castShadow = true;
      curbMesh.receiveShadow = true;
      group.add(curbMesh);

      const skirtGeo = new THREE.BufferGeometry();
      skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
      skirtGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sUv, 2));
      skirtGeo.setIndex(sIdx);
      skirtGeo.computeVertexNormals();
      const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
      skirtMesh.receiveShadow = true;
      group.add(skirtMesh);
    }
  }

  // Timber & Wrought-Iron Mountain Touge Guardrails along both cliff/outer edges
  {
    const railPostGeo = new THREE.BoxGeometry(0.16, 1.05, 0.16);
    const railCapGeo = new THREE.BoxGeometry(0.21, 0.08, 0.21);
    const reflectorGeo = new THREE.BoxGeometry(0.06, 0.14, 0.14);

    const timberMat = createPBRMaterial('woodPlanks', {
      repeatX: 1,
      repeatY: 1,
      color: '#5a3a28',
      roughness: 0.78,
    });
    const ironRailMat = new THREE.MeshStandardMaterial({
      color: '#34363a',
      roughness: 0.42,
      metalness: 0.72,
    });
    const reflectorMat = new THREE.MeshStandardMaterial({
      color: '#ffcf66',
      emissive: '#ff9d2e',
      emissiveIntensity: 1.5,
      roughness: 0.22,
    });

    const postSpacing = 5.5;
    const postMatrices: THREE.Matrix4[] = [];
    const capMatrices: THREE.Matrix4[] = [];
    const reflMatrices: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    for (const side of [-1, 1] as const) {
      const railLat = side * (CURB_OUTER - 0.14);

      // Continuous upper & lower wrought-iron/timber rail ribbons
      const railHeights = [0.46, 0.84];
      for (const railH of railHeights) {
        const thick = 0.075;
        const halfH = 0.06;
        const rPos: number[] = [];
        const rIdx: number[] = [];

        for (let i = 0; i <= roadSegs; i++) {
          const s = (i / roadSegs) * totalLength;
          const f = sampleAtArc(s);
          const cx = f.position.x + f.right.x * railLat + f.up.x * railH;
          const cy = f.position.y + f.right.y * railLat + f.up.y * railH;
          const cz = f.position.z + f.right.z * railLat + f.up.z * railH;

          // 4-sided tubular rectangular beam cross-section
          const inLat = -side * thick;
          const outLat = side * thick;
          rPos.push(
            cx + f.right.x * inLat + f.up.x * halfH,
            cy + f.right.y * inLat + f.up.y * halfH,
            cz + f.right.z * inLat + f.up.z * halfH,

            cx + f.right.x * outLat + f.up.x * halfH,
            cy + f.right.y * outLat + f.up.y * halfH,
            cz + f.right.z * outLat + f.up.z * halfH,

            cx + f.right.x * outLat - f.up.x * halfH,
            cy + f.right.y * outLat - f.up.y * halfH,
            cz + f.right.z * outLat - f.up.z * halfH,

            cx + f.right.x * inLat - f.up.x * halfH,
            cy + f.right.y * inLat - f.up.y * halfH,
            cz + f.right.z * inLat - f.up.z * halfH,
          );
        }

        for (let i = 0; i < roadSegs; i++) {
          const a0 = i * 4;
          const b0 = (i + 1) * 4;
          for (let face = 0; face < 4; face++) {
            const fNext = (face + 1) % 4;
            const v0 = a0 + face;
            const v1 = a0 + fNext;
            const v2 = b0 + face;
            const v3 = b0 + fNext;
            if (side === 1) {
              rIdx.push(v0, v1, v2, v1, v3, v2);
            } else {
              rIdx.push(v0, v2, v1, v1, v2, v3);
            }
          }
        }

        const railGeo = new THREE.BufferGeometry();
        railGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
        railGeo.setIndex(rIdx);
        railGeo.computeVertexNormals();
        const railMesh = new THREE.Mesh(railGeo, railH > 0.7 ? timberMat : ironRailMat);
        railMesh.castShadow = true;
        railMesh.receiveShadow = true;
        group.add(railMesh);
      }

      // Instanced cedar fence posts + iron caps + amber touge curve reflectors
      const postCount = Math.floor(totalLength / postSpacing);
      for (let p = 0; p < postCount; p++) {
        const s = (p + 0.5) * postSpacing;
        // Leave clean gap right around the 3 Torii gate pillars
        if (Math.abs(arcDelta(s, startLineArc)) < 3.6) continue;
        if (Math.abs(arcDelta(s, totalLength * 0.36)) < 3.4) continue;
        if (Math.abs(arcDelta(s, totalLength * 0.70)) < 3.4) continue;

        const f = sampleAtArc(s);
        const yaw = Math.atan2(f.tangent.x, f.tangent.z);

        dummy.position.set(
          f.position.x + f.right.x * railLat + f.up.x * 0.52,
          f.position.y + f.right.y * railLat + f.up.y * 0.52,
          f.position.z + f.right.z * railLat + f.up.z * 0.52,
        );
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        postMatrices.push(dummy.matrix.clone());

        dummy.position.y += 0.54;
        dummy.updateMatrix();
        capMatrices.push(dummy.matrix.clone());

        // Glowing amber reflector facing the road on curves
        if (Math.abs(f.curvature) > 0.012 || p % 3 === 0) {
          dummy.position.set(
            f.position.x + f.right.x * (railLat - side * 0.1) + f.up.x * 0.84,
            f.position.y + f.right.y * (railLat - side * 0.1) + f.up.y * 0.84,
            f.position.z + f.right.z * (railLat - side * 0.1) + f.up.z * 0.84,
          );
          dummy.rotation.set(0, yaw, 0);
          dummy.updateMatrix();
          reflMatrices.push(dummy.matrix.clone());
        }
      }
    }

    const postInst = new THREE.InstancedMesh(railPostGeo, timberMat, postMatrices.length);
    postInst.castShadow = true;
    postInst.receiveShadow = true;
    for (let i = 0; i < postMatrices.length; i++) postInst.setMatrixAt(i, postMatrices[i]);
    postInst.instanceMatrix.needsUpdate = true;
    group.add(postInst);

    const capInst = new THREE.InstancedMesh(railCapGeo, ironRailMat, capMatrices.length);
    for (let i = 0; i < capMatrices.length; i++) capInst.setMatrixAt(i, capMatrices[i]);
    capInst.instanceMatrix.needsUpdate = true;
    group.add(capInst);

    const reflInst = new THREE.InstancedMesh(reflectorGeo, reflectorMat, reflMatrices.length);
    for (let i = 0; i < reflMatrices.length; i++) reflInst.setMatrixAt(i, reflMatrices[i]);
    reflInst.instanceMatrix.needsUpdate = true;
    group.add(reflInst);
  }

  // -------------------------------------------------------------------------
  // 3. Sculpted Kyoto Autumn Mountain Hillside Terrain Mesh (Vertex-Painted + PBR)
  // -------------------------------------------------------------------------
  {
    const width = bounds.maxX - bounds.minX + 120;
    const depth = bounds.maxZ - bounds.minZ + 120;
    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
    const segsX = 148;
    const segsZ = 148;

    const terrainGeo = new THREE.PlaneGeometry(width, depth, segsX, segsZ);
    terrainGeo.rotateX(-Math.PI / 2);
    terrainGeo.translate(centerX, 0, centerZ);

    const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);

    // First pass: set heights
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const vy = terrainHeightAt(vx, vz);
      posAttr.setY(i, vy);
    }
    terrainGeo.computeVertexNormals();

    // Second pass: painterly Ghibli Kyoto autumn vertex colors based on slope, elevation & leaf litter
    const normAttr = terrainGeo.attributes.normal as THREE.BufferAttribute;
    const colMoss = new THREE.Color('#6f7e43');
    const colAutumnLeafBed = new THREE.Color('#9e5232');
    const colGoldenGrass = new THREE.Color('#9a8948');
    const colRockCliff = new THREE.Color('#66625c');
    const colValleyFloor = new THREE.Color('#4a5b44');
    const tmpCol = new THREE.Color();

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      const ny = normAttr.getY(i);

      const leafPatch = fbm2D(vx * 0.045 + 3.1, vz * 0.045 - 5.2, 3);
      const goldenPatch = fbm2D(vx * 0.025 - 8.4, vz * 0.025 + 4.8, 2);

      // Blend moss green -> golden autumn meadow -> russet fallen maple beds
      tmpCol.copy(colMoss).lerp(colGoldenGrass, smoothstep(0.36, 0.72, goldenPatch) * 0.75);
      tmpCol.lerp(colAutumnLeafBed, smoothstep(0.52, 0.78, leafPatch) * 0.65);

      // Steep rocky cliff faces turn warm Kyoto slate granite
      const cliffMask = smoothstep(0.84, 0.56, ny);
      tmpCol.lerp(colRockCliff, cliffMask * 0.88);

      // Deep valley moisture darkening near river
      const valleyMask = smoothstep(-2.0, -11.5, vy);
      tmpCol.lerp(colValleyFloor, valleyMask * 0.72);

      colors[i * 3] = tmpCol.r;
      colors[i * 3 + 1] = tmpCol.g;
      colors[i * 3 + 2] = tmpCol.b;
    }

    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const terrainMat = createPBRMaterial('grassSoil', {
      repeatX: 38,
      repeatY: 38,
      mossAmount: 0.55,
      bumpScale: 0.08,
      roughness: 0.94,
    });
    terrainMat.vertexColors = true;

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.name = 'KyotoMountainTerrain';
    terrainMesh.receiveShadow = true;
    group.add(terrainMesh);
  }

  // -------------------------------------------------------------------------
  // 4. Define Checkpoints, Apex Drift Zones & Boost Pads
  // -------------------------------------------------------------------------
  const checkpoints: CheckpointDef[] = [
    { index: 0, name: 'Momiji Shrine Gate', arcDist: startLineArc, t: startLineArc / totalLength },
    { index: 1, name: 'Bamboo Pass Torii', arcDist: totalLength * 0.36, t: 0.36 },
    { index: 2, name: 'Valley Overlook Torii', arcDist: totalLength * 0.70, t: 0.70 },
  ];

  // Signature named touge hairpins along normalized t; derive inner apex side directly from spline curvature
  const apexSpecs: { name: string; tStart: number; tEnd: number }[] = [
    { name: 'MOMIJI HAIRPIN', tStart: 0.13, tEnd: 0.27 },
    { name: 'BAMBOO SWITCHBACK', tStart: 0.39, tEnd: 0.49 },
    { name: 'VALLEY OVERLOOK', tStart: 0.52, tEnd: 0.65 },
    { name: 'LANTERN HAIRPIN', tStart: 0.74, tEnd: 0.85 },
    { name: 'SHRINE CHICANE', tStart: 0.88, tEnd: 0.96 },
  ];

  const apexZones: ApexDriftZone[] = apexSpecs.map((spec, id) => {
    const startArc = spec.tStart * totalLength;
    const endArc = spec.tEnd * totalLength;
    let avgCurv = 0;
    const samples = 12;
    for (let k = 0; k < samples; k++) {
      const s = startArc + ((k + 0.5) / samples) * (endArc - startArc);
      avgCurv += sampleAtArc(s).curvature;
    }
    // Negative curvature = right turn -> inner apex on +right (+1); positive = left turn -> inner apex on -right (-1)
    const direction: -1 | 1 = avgCurv <= 0 ? 1 : -1;
    return {
      id,
      name: spec.name,
      startArc,
      endArc,
      direction,
    };
  });

  // 4 well-placed boost pads on straights & hairpin exits
  const boostPadSpecs: { t: number; lat: number }[] = [
    { t: 0.10, lat: 0.0 },
    { t: 0.31, lat: -0.9 },
    { t: 0.66, lat: 0.6 },
    { t: 0.975, lat: 0.0 },
  ];

  const boostPads: BoostPadDef[] = boostPadSpecs.map((spec, id) => {
    const s = spec.t * totalLength;
    const f = sampleAtArc(s);
    const worldPos = f.position
      .clone()
      .addScaledVector(f.right, spec.lat)
      .addScaledVector(f.up, 0.06);
    return {
      id,
      arcDist: s,
      lateralOffset: spec.lat,
      length: 5.4,
      width: 3.1,
      worldPos,
      tangent: f.tangent.clone(),
      right: f.right.clone(),
      up: f.up.clone(),
    };
  });

  return {
    group,
    curve,
    frames,
    totalLength,
    roadHalfWidth: ROAD_HALF_WIDTH,
    curbOuterWidth: CURB_OUTER,
    checkpoints,
    apexZones,
    boostPads,
    bounds,
    waterLevel: VALLEY_WATER_Y,
    sampleAtArc,
    projectPoint,
    distanceToRoadXZ,
    terrainHeightAt,
    isOnOrNearRoad,
    wrapArc,
    arcDelta,
  };
}

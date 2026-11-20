import * as THREE from 'three';

export type PBRTextureType =
  | 'cobblestone'
  | 'asphalt'
  | 'bark'
  | 'woodPlanks'
  | 'sandstone'
  | 'marbleTiles'
  | 'grassSoil'
  | 'snow'
  | 'roofTiles'
  | 'brushedBrass'
  | 'ice'
  | 'rock';

export type LeafCardStyle =
  | 'oak'
  | 'maple'
  | 'sakura'
  | 'pine'
  | 'snow_pine'
  | 'cypress'
  | 'olive'
  | 'fern'
  | 'bamboo'
  | 'palm_leaflet';

export interface PBRTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export interface LeafCardTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  alphaTest: number;
}

export interface TextureOptions {
  repeatX?: number;
  repeatY?: number;
  anisotropy?: number;
  seed?: number;
  size?: number;
  tint?: string;
  roadMarkings?: boolean;
  wet?: boolean;
  mossAmount?: number;
}

// ---------------------------------------------------------------------------
// Deterministic Seeded PRNG & Seamless Tileable Procedural Noise
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(ix: number, iy: number, periodX: number, periodY: number, seed: number): number {
  const x = ((ix % periodX) + periodX) % periodX;
  const y = ((iy % periodY) + periodY) % periodY;
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function tileableValueNoise(
  u: number,
  v: number,
  periodX: number,
  periodY: number,
  seed: number,
): number {
  const fx = u * periodX;
  const fy = v * periodY;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smoothstep(fx - ix);
  const ty = smoothstep(fy - iy);

  const n00 = hash2D(ix, iy, periodX, periodY, seed);
  const n10 = hash2D(ix + 1, iy, periodX, periodY, seed);
  const n01 = hash2D(ix, iy + 1, periodX, periodY, seed);
  const n11 = hash2D(ix + 1, iy + 1, periodX, periodY, seed);

  return lerp(lerp(n00, n10, tx), lerp(n01, n11, tx), ty);
}

function tileableFbm(
  u: number,
  v: number,
  basePeriodX: number,
  basePeriodY: number,
  octaves: number,
  seed: number,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let px = basePeriodX;
  let py = basePeriodY;
  for (let i = 0; i < octaves; i++) {
    sum += tileableValueNoise(u, v, px, py, seed + i * 97) * amp;
    norm += amp;
    amp *= gain;
    px *= 2;
    py *= 2;
  }
  return sum / norm;
}

function tileableRidged(
  u: number,
  v: number,
  basePeriodX: number,
  basePeriodY: number,
  octaves: number,
  seed: number,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let px = basePeriodX;
  let py = basePeriodY;
  for (let i = 0; i < octaves; i++) {
    const n = tileableValueNoise(u, v, px, py, seed + i * 131);
    const r = 1 - Math.abs(n * 2 - 1);
    sum += r * r * amp;
    norm += amp;
    amp *= 0.5;
    px *= 2;
    py *= 2;
  }
  return sum / norm;
}

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas context for procedural texture');
  }
  return [canvas, ctx];
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
  wrap: THREE.Wrapping = THREE.RepeatWrapping,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.userData = {
    shared: true,
    sharedAsset: true,
    artKitCached: true,
    __atelierSharedResource: true,
  };
  tex.needsUpdate = true;
  return tex;
}

function parseHexTint(hex?: string): [number, number, number] | null {
  if (!hex) return null;
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function applyPixelBuffers(
  size: number,
  colorData: Uint8ClampedArray,
  bumpData: Uint8ClampedArray,
  roughData: Uint8ClampedArray,
  tintHex: string | undefined,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
): PBRTextureSet {
  const tint = parseHexTint(tintHex);
  if (tint) {
    for (let i = 0; i < colorData.length; i += 4) {
      colorData[i] = clampByte(colorData[i] * tint[0]);
      colorData[i + 1] = clampByte(colorData[i + 1] * tint[1]);
      colorData[i + 2] = clampByte(colorData[i + 2] * tint[2]);
    }
  }

  const [cCanvas, cCtx] = createCanvas(size);
  const cImg = cCtx.createImageData(size, size);
  cImg.data.set(colorData);
  cCtx.putImageData(cImg, 0, 0);

  const [bCanvas, bCtx] = createCanvas(size);
  const bImg = bCtx.createImageData(size, size);
  bImg.data.set(bumpData);
  bCtx.putImageData(bImg, 0, 0);

  const [rCanvas, rCtx] = createCanvas(size);
  const rImg = rCtx.createImageData(size, size);
  rImg.data.set(roughData);
  rCtx.putImageData(rImg, 0, 0);

  return {
    map: configureTexture(cCanvas, true, repeatX, repeatY, anisotropy),
    bumpMap: configureTexture(bCanvas, false, repeatX, repeatY, anisotropy),
    roughnessMap: configureTexture(rCanvas, false, repeatX, repeatY, anisotropy),
  };
}

function writeGray(buf: Uint8ClampedArray, idx: number, val01: number): void {
  const b = clampByte(val01 * 255);
  buf[idx] = b;
  buf[idx + 1] = b;
  buf[idx + 2] = b;
  buf[idx + 3] = 255;
}

// ---------------------------------------------------------------------------
// 11 Procedural PBR Material Generators
// ---------------------------------------------------------------------------

function generateCobblestone(size: number, seed: number, opts: TextureOptions): {
  color: Uint8ClampedArray;
  bump: Uint8ClampedArray;
  rough: Uint8ClampedArray;
} {
  const n = size * size * 4;
  const color = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const rough = new Uint8ClampedArray(n);

  const rows = 8;
  const cols = 6;
  const wet = opts.wet ? 1 : 0;

  // Precompute per-stone palettes (slate, warm granite, basalt, rose-ochre)
  const palette: [number, number, number][] = [
    [134, 130, 124],
    [118, 122, 128],
    [146, 136, 124],
    [104, 108, 114],
    [138, 124, 116],
    [125, 132, 122],
  ];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;

      // Subtle warp so stone rows feel hand-laid & organic
      const warpX = (tileableFbm(u, v, 4, 4, 2, seed + 11) - 0.5) * 0.025;
      const warpY = (tileableFbm(u, v, 4, 4, 2, seed + 29) - 0.5) * 0.022;
      const wu = ((u + warpX) % 1 + 1) % 1;
      const wv = ((v + warpY) % 1 + 1) % 1;

      const rowF = wv * rows;
      const row = Math.floor(rowF);
      const rowLocalY = rowF - row;
      const stagger = (row % 2) * 0.5 + (hash2D(0, row, 1, rows, seed + 3) - 0.5) * 0.14;
      const colF = (wu * cols + stagger + cols) % cols;
      const col = Math.floor(colF);
      const colLocalX = colF - col;

      const stoneId = hash2D(col, row, cols, rows, seed + 7);
      const stoneVar = hash2D(col, row, cols, rows, seed + 19);

      // Rounded super-ellipse distance inside cell for natural beveled cobbles
      const dx = Math.abs(colLocalX - 0.5) * 2;
      const dy = Math.abs(rowLocalY - 0.5) * 2;
      const edgeNoise = (tileableFbm(u, v, 16, 16, 2, seed + 41) - 0.5) * 0.08;
      const superDist = Math.pow(Math.pow(dx, 3.2) + Math.pow(dy, 3.2), 1 / 3.2) + edgeNoise;

      const groutThresh = 0.84;
      const bevelWidth = 0.14;
      const stoneMask = clamp((groutThresh - superDist) / bevelWidth, 0, 1);
      const smoothStone = smoothstep(stoneMask);

      const fineGrain = tileableFbm(u, v, 24, 24, 3, seed + 53);
      const microSpeck = tileableValueNoise(u, v, 64, 64, seed + 71);
      const macroMottle = tileableFbm(u, v, 4, 4, 3, seed + 89);

      const baseCol = palette[Math.floor(stoneId * palette.length) % palette.length];
      const shade = 0.78 + stoneVar * 0.34 + (fineGrain - 0.5) * 0.18 + (microSpeck - 0.5) * 0.08;
      // Domed crown lighting baked softly into height & subtle AO
      const dome = Math.sqrt(Math.max(0, 1 - (dx * dx * 0.45 + dy * dy * 0.45)));
      const sr = baseCol[0] * shade * (0.86 + dome * 0.18);
      const sg = baseCol[1] * shade * (0.86 + dome * 0.18);
      const sb = baseCol[2] * shade * (0.86 + dome * 0.18);

      // Mortar dark damp earth/sand + faint moss hint in crevices
      const mossHint = Math.max(0, macroMottle - 0.55) * 1.4;
      const mr = 46 + fineGrain * 22 - mossHint * 12;
      const mg = 44 + fineGrain * 22 + mossHint * 24;
      const mb = 41 + fineGrain * 18 - mossHint * 10;

      const idx = (y * size + x) * 4;
      const wetDarken = wet ? 0.78 + macroMottle * 0.14 : 1.0;
      color[idx] = clampByte(lerp(mr, sr, smoothStone) * wetDarken);
      color[idx + 1] = clampByte(lerp(mg, sg, smoothStone) * wetDarken);
      color[idx + 2] = clampByte(lerp(mb, sb, smoothStone) * wetDarken);
      color[idx + 3] = 255;

      const heightVal = lerp(0.1 + fineGrain * 0.1, 0.55 + dome * 0.35 + (fineGrain - 0.5) * 0.12, smoothStone);
      writeGray(bump, idx, clamp(heightVal, 0, 1));

      // Wet puddles / sheen on polished stone crowns vs matte rough grout
      const puddle = smoothstep(clamp((macroMottle - 0.42) * 2.5, 0, 1));
      const stoneRough = wet
        ? lerp(0.14, 0.38, 1 - puddle)
        : lerp(0.54, 0.78, fineGrain * 0.6 + (1 - puddle) * 0.4);
      const mortarRough = wet ? 0.45 : 0.92;
      writeGray(rough, idx, clamp(lerp(mortarRough, stoneRough, smoothStone), 0.08, 0.98));
    }
  }
  return { color, bump, rough };
}

function generateAsphalt(size: number, seed: number, opts: TextureOptions): {
  color: Uint8ClampedArray;
  bump: Uint8ClampedArray;
  rough: Uint8ClampedArray;
} {
  const n = size * size * 4;
  const color = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const rough = new Uint8ClampedArray(n);
  const wet = opts.wet ? 1 : 0;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const macro = tileableFbm(u, v, 4, 4, 3, seed + 5);
      const med = tileableFbm(u, v, 16, 16, 3, seed + 17);
      const grit = tileableValueNoise(u, v, 96, 96, seed + 37);
      const mica = tileableValueNoise(u, v, 128, 128, seed + 61);

      // Subtle branched tar cracks using sharp ridge threshold
      const crackWarpU = u + (macro - 0.5) * 0.12;
      const crackWarpV = v + (med - 0.5) * 0.08;
      const ridge = tileableRidged(crackWarpU, crackWarpV, 3, 3, 3, seed + 83);
      const crackMask = smoothstep(clamp((ridge - 0.87) * 14, 0, 1));

      // Tire wear tracks along u ~ 0.25 and 0.75
      const trackA = Math.exp(-Math.pow((u - 0.26) * 8, 2));
      const trackB = Math.exp(-Math.pow((u - 0.74) * 8, 2));
      const wear = Math.max(trackA, trackB);

      let base = 46 + macro * 18 + (med - 0.5) * 14 + (grit - 0.5) * 20;
      if (mica > 0.92) base += 24; // quartz aggregate sparkle
      base -= wear * 5;
      base = lerp(base, 22, crackMask * 0.85);

      let r = base;
      let g = base + 1;
      let b = base + 3;

      // Optional crisp road edge stripes + subtle worn center dash
      let paintMask = 0;
      if (opts.roadMarkings) {
        const edgeStripe = (u > 0.045 && u < 0.075) || (u > 0.925 && u < 0.955);
        const centerDash = u > 0.488 && u < 0.512 && ((v * 4) % 1) < 0.55;
        if (edgeStripe || centerDash) {
          const paintWear = clamp(0.65 + med * 0.45 - (grit > 0.75 ? 0.2 : 0), 0, 1);
          paintMask = paintWear;
          if (centerDash) {
            r = lerp(r, 228, paintMask);
            g = lerp(g, 192, paintMask);
            b = lerp(b, 82, paintMask);
          } else {
            r = lerp(r, 228, paintMask);
            g = lerp(g, 226, paintMask);
            b = lerp(b, 218, paintMask);
          }
        }
      }

      const idx = (y * size + x) * 4;
      const wetMul = wet ? 0.74 : 1.0;
      color[idx] = clampByte(r * wetMul);
      color[idx + 1] = clampByte(g * wetMul);
      color[idx + 2] = clampByte(b * wetMul);
      color[idx + 3] = 255;

      const h = lerp(0.45 + grit * 0.32 + (med - 0.5) * 0.18, 0.08, crackMask);
      writeGray(bump, idx, clamp(h, 0, 1));

      const puddle = smoothstep(clamp((macro - 0.48) * 3.0, 0, 1));
      let rgh = wet
        ? lerp(0.12, 0.42, 1 - puddle)
        : 0.78 + (grit - 0.5) * 0.14 - wear * 0.08;
      rgh = lerp(rgh, 0.32, crackMask * 0.6); // shiny bitumen tar seal
      rgh = lerp(rgh, 0.62, paintMask);
      writeGray(rough, idx, clamp(rgh, 0.08, 0.98));
    }
  }
  return { color, bump, rough };
}

function generateBark(size: number, seed: number): {
  color: Uint8ClampedArray;
  bump: Uint8ClampedArray;
  rough: Uint8ClampedArray;
} {
  const n = size * size * 4;
  const color = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const rough = new Uint8ClampedArray(n);

  // Place 3 deterministic gnarled knots
  const rng = mulberry32(seed + 404);
  const knots: { u: number; v: number; rx: number; ry: number }[] = [];
  for (let i = 0; i < 3; i++) {
    knots.push({
      u: 0.15 + rng() * 0.7,
      v: 0.15 + rng() * 0.7,
      rx: 0.055 + rng() * 0.035,
      ry: 0.09 + rng() * 0.05,
    });
  }

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;

      // Warp around knots
      let knotBump = 0;
      let knotDark = 0;
      let wu = u;
      for (const k of knots) {
        let du = u - k.u;
        if (du > 0.5) du -= 1;
        if (du < -0.5) du += 1;
        let dv = v - k.v;
        if (dv > 0.5) dv -= 1;
        if (dv < -0.5) dv += 1;
        const d = Math.hypot(du / k.rx, dv / k.ry);
        if (d < 2.2) {
          const push = Math.exp(-d * d * 1.4) * 0.04;
          wu += Math.sign(du) * push;
          if (d < 1.15) {
            const ring = Math.sin(d * Math.PI * 3.5) * 0.5 + 0.5;
            const rim = Math.exp(-Math.pow((d - 0.72) * 3.5, 2));
            knotBump += rim * 0.35 - Math.exp(-d * d * 4.5) * 0.25;
            knotDark = Math.max(knotDark, (1 - d / 1.15) * (0.45 + ring * 0.3));
          }
        }
      }

      const wU = ((wu % 1) + 1) % 1;
      const sway = (tileableFbm(wU, v, 3, 2, 3, seed + 13) - 0.5) * 0.09;
      const ridge1 = tileableRidged(((wU + sway) % 1 + 1) % 1, v, 14, 3, 4, seed + 27);
      const ridge2 = tileableFbm(((wU + sway * 0.6) % 1 + 1) % 1, v, 28, 6, 3, seed + 49);
      const plateBreak = tileableFbm(wU, v, 8, 12, 3, seed + 67);
      const fineFiber = tileableValueNoise(wU, v, 64, 16, seed + 91);

      const height = clamp(ridge1 * 0.62 + ridge2 * 0.24 + (plateBreak - 0.5) * 0.2 + knotBump, 0, 1);

      // Deep dark reddish-umber crevices -> warm weathered grey-brown outer ridges
      const crevice = smoothstep(clamp((height - 0.22) / 0.58, 0, 1));
      let r = lerp(42, 114, crevice) + (plateBreak - 0.5) * 20 + (fineFiber - 0.5) * 12;
      let g = lerp(31, 90, crevice) + (plateBreak - 0.5) * 16 + (fineFiber - 0.5) * 10;
      let b = lerp(24, 70, crevice) + (plateBreak - 0.5) * 12 + (fineFiber - 0.5) * 8;

      // Subtle pale sage/chartreuse lichen nestled on outer plates
      const lichenNoise = tileableFbm(u, v, 6, 6, 4, seed + 113);
      const lichen = smoothstep(clamp((lichenNoise - 0.67) * 7.5, 0, 1)) * smoothstep(clamp((height - 0.45) * 3, 0, 1));
      r = lerp(r, 134, lichen * 0.58);
      g = lerp(g, 148, lichen * 0.62);
      b = lerp(b, 112, lichen * 0.52);

      // Darken knot center
      r *= 1 - knotDark * 0.45;
      g *= 1 - knotDark * 0.48;
      b *= 1 - knotDark * 0.5;

      const idx = (y * size + x) * 4;
      color[idx] = clampByte(r);
      color[idx + 1] = clampByte(g);
      color[idx + 2] = clampByte(b);
      color[idx + 3] = 255;

      writeGray(bump, idx, height);
      writeGray(rough, idx, clamp(0.95 - crevice * 0.16 + lichen * 0.08, 0.65, 0.99));
    }
  }
  return { color, bump, rough };
}

function generateWoodPlanks(size: number, seed: number): {
  color: Uint8ClampedArray;
  bump: Uint8ClampedArray;
  rough: Uint8ClampedArray;
} {
  const n = size * size * 4;
  const color = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const rough = new Uint8ClampedArray(n);

  const plankCount = 6;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const plankF = v * plankCount;
    const plankIdx = Math.floor(plankF);
    const py = plankF - plankIdx;
    const endOffset = hash2D(0, plankIdx, 1, plankCount, seed + 7);

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const shiftedU = (u + endOffset) % 1;
      const boardIdx = shiftedU < 0.5 ? 0 : 1;
      const localU = shiftedU < 0.5 ? shiftedU * 2 : (shiftedU - 0.5) * 2;

      const boardSeed = hash2D(boardIdx, plankIdx, 2, plankCount, seed + 23);
      const toneShift = (boardSeed - 0.5) * 32;

      // Flowing wood grain rings stretched along U
      const grainWarp = tileableFbm(u, v, 3, 12, 3, seed + 41 + plankIdx * 17) * 0.18;
      const rings = Math.sin((py * 18 + grainWarp * 28 + boardSeed * 12) * Math.PI);
      const fineStreaks = tileableFbm(u, v, 4, 48, 3, seed + 61);
      const grain = rings * 0.35 + 0.5 + (fineStreaks - 0.5) * 0.45;

      // Bevel seams between planks (horizontal) and butt joints (vertical)
      const hEdge = Math.min(py, 1 - py);
      const vEdge = Math.min(localU, 1 - localU) * 0.5;
      const seam = Math.min(smoothstep(clamp((hEdge - 0.015) / 0.03, 0, 1)), smoothstep(clamp((vEdge - 0.005) / 0.012, 0, 1)));

      // Recessed iron nail heads near plank ends
      let nailMask = 0;
      const nailPositions: [number, number][] = [
        [0.04, 0.25],
        [0.04, 0.75],
        [0.96, 0.25],
        [0.96, 0.75],
      ];
      for (const [nu, nv] of nailPositions) {
        const d = Math.hypot((localU - nu) * 2.5, (py - nv) * 1.0);
        if (d < 0.055) {
          nailMask = Math.max(nailMask, smoothstep(clamp((0.055 - d) / 0.025, 0, 1)));
        }
      }

      let r = 152 + toneShift + (grain - 0.5) * 38;
      let g = 108 + toneShift * 0.8 + (grain - 0.5) * 30;
      let b = 70 + toneShift * 0.55 + (grain - 0.5) * 20;

      // Darken seams & nails
      r = lerp(34, r, seam);
      g = lerp(24, g, seam);
      b = lerp(18, b, seam);

      r = lerp(r, 48, nailMask * 0.9);
      g = lerp(g, 46, nailMask * 0.9);
      b = lerp(b, 44, nailMask * 0.9);

      const idx = (y * size + x) * 4;
      color[idx] = clampByte(r);
      color[idx + 1] = clampByte(g);
      color[idx + 2] = clampByte(b);
      color[idx + 3] = 255;

      const h = lerp(0.12, 0.62 + (grain - 0.5) * 0.22, seam) - nailMask * 0.35;
      writeGray(bump, idx, clamp(h, 0, 1));
      const rgh = lerp(0.88, 0.58 + (1 - grain) * 0.22, seam);
      writeGray(rough, idx, clamp(lerp(rgh, 0.42, nailMask), 0.2, 0.96));
    }
  }
  return { color, bump, rough };
}

function generateSandstone(size: number, seed: number): {
  color: Uint8ClampedArray;
  bump: Uint8ClampedArray;
  rough: Uint8ClampedArray;
} {
  const n = size * size * 4;
  const color = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const rough = new Uint8ClampedArray(n);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Layered undulating terracotta / ochre geological strata
      const undulation = (tileableFbm(u, v, 3, 2, 3, seed + 11) - 0.5) * 0.14;
      const strataV = ((v + undulation) % 1 + 1) % 1;
      const band1 = Math.sin(strataV * Math.PI * 10) * 0.5 + 0.5;
      const band2 = tileableValueNoise(0.25, strataV, 2, 24, seed + 29);
      const fineGrit = tileableFbm(u, v, 32, 32, 3, seed + 47);
      const streak = tileableFbm(u, v, 14, 3, 3, seed + 63);

      const strata = band1 * 0.45 + band2 * 0.55;
      // Blend warm cream-ochre, terracotta, burnt sienna
      let r = lerp(178, 224, strata) + (fineGrit - 0.5) * 24 - (1 - streak) * 14;
      let g = lerp(102, 166, strata) + (fineGrit - 0.5) * 18 - (1 - streak) * 12;
      let b = lerp(64, 114, strata) + (fineGrit - 0.5) * 14 - (1 - streak) * 8;

      // Subtle wind-carved horizontal ledge creases
      const ledge = Math.pow(Math.abs(Math.sin(strataV * Math.PI * 12)), 0.35);
      const idx = (y * size + x) * 4;
      color[idx] = clampByte(r * (0.86 + ledge * 0.14));
      color[idx + 1] = clampByte(g * (0.86 + ledge * 0.14));
      color[idx + 2] = clampByte(b * (0.86 + ledge * 0.14));
      color[idx + 3] = 255;

      const h = clamp(0.32 + ledge * 0.38 + (fineGrit - 0.5) * 0.24 + (strata - 0.5) * 0.15, 0, 1);
      writeGray(bump, idx, h);
      writeGray(rough, idx, clamp(0.78 + (fineGrit - 0.5) * 0.18, 0.55, 0.96));
    }
  }
  return { color, bump, rough };
}

function generateMarbleTiles(size: number, seed: number): {
  color: Uint8ClampedArray;
  bump: Uint8ClampedArray;
  rough: Uint8ClampedArray;
} {
  const n = size * size * 4;
  const color = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const rough = new Uint8ClampedArray(n);

  const tiles = 4;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const tv = v * tiles;
    const ty = Math.floor(tv);
    const ly = tv - ty;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const tu = u * tiles;
      const tx = Math.floor(tu);
      const lx = tu - tx;

      const isLight = (tx + ty) % 2 === 0;
      const tileSeed = seed + tx * 31 + ty * 73;

      // Domain-warped organic marble veins
      const warpA = tileableFbm(u, v, 4, 4, 4, tileSeed + 13);
      const warpB = tileableFbm(u, v, 8, 8, 3, tileSeed + 37);
      const veinField = Math.sin((u * 6 + v * 4 + warpA * 3.8 + warpB * 1.4) * Math.PI);
      const vein = Math.pow(1 - Math.abs(veinField), 5.5);
      const fineVein = Math.pow(tileableRidged(u + warpA * 0.15, v + warpB * 0.15, 6, 6, 3, seed + 89), 4);
      const totalVein = clamp(vein * 0.7 + fineVein * 0.55, 0, 1);

      let r: number;
      let g: number;
      let b: number;
      if (isLight) {
        // Honed Carrara ivory-white marble with warm dove-grey/gold veins
        r = lerp(236 + (warpB - 0.5) * 14, 152, totalVein * 0.72);
        g = lerp(233 + (warpB - 0.5) * 14, 150, totalVein * 0.72);
        b = lerp(225 + (warpB - 0.5) * 14, 146, totalVein * 0.72);
      } else {
        // Deep Victorian conservatory verde-antique / slate marble with pale ivory veins
        r = lerp(42 + (warpB - 0.5) * 12, 168, totalVein * 0.65);
        g = lerp(58 + (warpB - 0.5) * 14, 182, totalVein * 0.65);
        b = lerp(54 + (warpB - 0.5) * 12, 170, totalVein * 0.65);
      }

      // Crisp beveled tile grout seam
      const edge = Math.min(lx, 1 - lx, ly, 1 - ly);
      const tileMask = smoothstep(clamp((edge - 0.012) / 0.018, 0, 1));

      const idx = (y * size + x) * 4;
      color[idx] = clampByte(lerp(88, r, tileMask));
      color[idx + 1] = clampByte(lerp(86, g, tileMask));
      color[idx + 2] = clampByte(lerp(82, b, tileMask));
      color[idx + 3] = 255;

      const h = lerp(0.18, 0.85 - totalVein * 0.08, tileMask);
      writeGray(bump, idx, clamp(h, 0, 1));
      const rgh = lerp(0.82, 0.18 + totalVein * 0.1 + warpB * 0.06, tileMask);
      writeGray(rough, idx, clamp(rgh, 0.1, 0.92));
    }
  }
  return { color, bump, rough };
}

function generateGrassSoil(size: number, seed: number, opts: TextureOptions): {
  color: Uint8ClampedArray;
  bump: Uint8ClampedArray;
  rough: Uint8ClampedArray;
} {
  const n = size * size * 4;
  const color = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const rough = new Uint8ClampedArray(n);
  const mossAmount = opts.mossAmount ?? 0.68;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const macro = tileableFbm(u, v, 4, 4, 4, seed + 9);
      const med = tileableFbm(u, v, 16, 16, 3, seed + 31);
      const fine = tileableValueNoise(u, v, 64, 64, seed + 53);
      const cloverField = tileableFbm(u, v, 24, 24, 3, seed + 77);

      // Rich damp woodland/meadow loam
      const soilR = 64 + med * 34 + (fine - 0.5) * 18;
      const soilG = 52 + med * 26 + (fine - 0.5) * 14;
      const soilB = 34 + med * 16 + (fine - 0.5) * 10;

      // Lush moss & clover carpet blending organically over loam
      const mossMask = smoothstep(clamp((macro + (med - 0.5) * 0.35 - (1 - mossAmount) * 0.72) * 2.4, 0, 1));
      const mossR = 54 + cloverField * 38 + (fine - 0.5) * 18;
      const mossG = 94 + cloverField * 52 + (fine - 0.5) * 22;
      const mossB = 38 + cloverField * 20 + (fine - 0.5) * 12;

      let r = lerp(soilR, mossR, mossMask);
      let g = lerp(soilG, mossG, mossMask);
      let b = lerp(soilB, mossB, mossMask);

      // Tiny scattered dry straw/leaf flecks & tiny warm earth pebbles
      if (fine > 0.935 && med > 0.55) {
        r = lerp(r, 142, 0.65);
        g = lerp(g, 128, 0.65);
        b = lerp(b, 86, 0.65);
      }

      const idx = (y * size + x) * 4;
      color[idx] = clampByte(r);
      color[idx + 1] = clampByte(g);
      color[idx + 2] = clampByte(b);
      color[idx + 3] = 255;

      const h = clamp(0.35 + med * 0.35 + (fine - 0.5) * 0.25 + mossMask * 0.12, 0, 1);
      writeGray(bump, idx, h);
      writeGray(rough, idx, clamp(0.84 + (1 - mossMask) * 0.1 - fine * 0.08, 0.65, 0.98));
    }
  }
  return { color, bump, rough };
}

function generateSnow(size: number, seed: number): {
  color: Uint8ClampedArray;
  bump: Uint8ClampedArray;
  rough: Uint8ClampedArray;
} {
  const n = size * size * 4;
  const color = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const rough = new Uint8ClampedArray(n);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Soft wind-sculpted sastrugi snow ripples
      const warp = (tileableFbm(u, v, 3, 3, 3, seed + 17) - 0.5) * 0.18;
      const drift = tileableFbm(((u + warp) % 1 + 1) % 1, v, 3, 8, 4, seed + 37);
      const fine = tileableValueNoise(u, v, 64, 64, seed + 71);
      const crystal = tileableValueNoise(u, v, 128, 128, seed + 109);

      // Subtle cool glacial blue in wind troughs, crisp luminous white on crests
      const r = lerp(218, 250, drift) + (fine - 0.5) * 6;
      const g = lerp(230, 252, drift) + (fine - 0.5) * 5;
      const b = lerp(245, 255, drift) + (fine - 0.5) * 4;

      const idx = (y * size + x) * 4;
      color[idx] = clampByte(r);
      color[idx + 1] = clampByte(g);
      color[idx + 2] = clampByte(b);
      color[idx + 3] = 255;

      const h = clamp(0.25 + drift * 0.6 + (fine - 0.5) * 0.1, 0, 1);
      writeGray(bump, idx, h);

      // Crystalline sparkle glint dots in roughness!
      const sparkle = crystal > 0.955 ? 0.14 : 0.62 + (1 - drift) * 0.22;
      writeGray(rough, idx, clamp(sparkle, 0.1, 0.92));
    }
  }
  return { color, bump, rough };
}

function generateRoofTiles(size: number, seed: number): {
  color: Uint8ClampedArray;
  bump: Uint8ClampedArray;
  rough: Uint8ClampedArray;
} {
  const n = size * size * 4;
  const color = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const rough = new Uint8ClampedArray(n);

  const cols = 8;
  const rows = 8;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const rf = v * rows;
    const row = Math.floor(rf);
    const ly = rf - row;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const cf = u * cols;
      const col = Math.floor(cf);
      const lx = cf - col;

      const tileTone = hash2D(col, row, cols, rows, seed + 19);
      const glazeVar = tileableFbm(u, v, 8, 8, 3, seed + 43);

      // Curved Japanese kawara clay tile profile: concave pan + raised round cover ridge at edges
      const arch = Math.cos((lx - 0.5) * Math.PI * 2) * 0.5 + 0.5; // 0 at center pan, 1 at ridges
      const ridgeCap = Math.pow(arch, 1.6);
      // Scalloped lower overlap shadow at top of each row
      const scallopOffset = (1 - ridgeCap) * 0.08;
      const overlapY = ly - scallopOffset;
      const overlapShadow = smoothstep(clamp(overlapY / 0.16, 0, 1));
      const slopeStep = clamp(overlapY, 0, 1);

      // Kiln-fired ibushi-kawara silver-charcoal / dark slate blue-grey clay
      const base = 56 + tileTone * 22 + (glazeVar - 0.5) * 16 + ridgeCap * 16;
      const ao = 0.42 + overlapShadow * 0.58;

      // Subtle garden moss dust tucked under overlaps
      const moss = (1 - overlapShadow) * smoothstep(clamp((glazeVar - 0.52) * 3.5, 0, 1)) * 0.42;

      const idx = (y * size + x) * 4;
      color[idx] = clampByte(lerp(base * 0.94 * ao, 74, moss));
      color[idx + 1] = clampByte(lerp(base * 0.98 * ao, 96, moss));
      color[idx + 2] = clampByte(lerp(base * 1.07 * ao, 62, moss));
      color[idx + 3] = 255;

      const h = clamp((0.25 + ridgeCap * 0.55 + (1 - slopeStep) * 0.2) * (0.4 + overlapShadow * 0.6), 0, 1);
      writeGray(bump, idx, h);
      writeGray(rough, idx, clamp(0.36 + (1 - ridgeCap) * 0.2 + moss * 0.35 + (glazeVar - 0.5) * 0.14, 0.22, 0.92));
    }
  }
  return { color, bump, rough };
}

function generateBrushedBrass(size: number, seed: number): {
  color: Uint8ClampedArray;
  bump: Uint8ClampedArray;
  rough: Uint8ClampedArray;
} {
  const n = size * size * 4;
  const color = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const rough = new Uint8ClampedArray(n);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const rowStreak = tileableValueNoise(0.1, v, 2, 128, seed + 17);
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Ultra-fine anisotropic horizontal brushed metal hairlines + subtle warm patina
      const fineBrush = tileableFbm(u, v, 4, 96, 3, seed + 31);
      const patina = tileableFbm(u, v, 4, 4, 3, seed + 59);
      const streak = fineBrush * 0.65 + rowStreak * 0.35;

      const r = 208 + (streak - 0.5) * 28 - (1 - patina) * 18;
      const g = 172 + (streak - 0.5) * 24 - (1 - patina) * 18;
      const b = 96 + (streak - 0.5) * 16 - (1 - patina) * 12;

      const idx = (y * size + x) * 4;
      color[idx] = clampByte(r);
      color[idx + 1] = clampByte(g);
      color[idx + 2] = clampByte(b);
      color[idx + 3] = 255;

      writeGray(bump, idx, clamp(0.5 + (streak - 0.5) * 0.35, 0, 1));
      writeGray(rough, idx, clamp(0.24 + (1 - streak) * 0.16 + (1 - patina) * 0.12, 0.14, 0.58));
    }
  }
  return { color, bump, rough };
}

function generateIce(size: number, seed: number): {
  color: Uint8ClampedArray;
  bump: Uint8ClampedArray;
  rough: Uint8ClampedArray;
} {
  const n = size * size * 4;
  const color = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const rough = new Uint8ClampedArray(n);

  // First compute base glacial blue-white frosted depth & fractures
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const depthCloud = tileableFbm(u, v, 4, 4, 4, seed + 13);
      const frost = tileableFbm(u, v, 14, 14, 3, seed + 37);
      const fracture = Math.pow(tileableRidged(u, v, 5, 5, 3, seed + 71), 5.0);

      let r = lerp(164, 224, depthCloud * 0.6 + frost * 0.4) + fracture * 34;
      let g = lerp(206, 242, depthCloud * 0.6 + frost * 0.4) + fracture * 26;
      let b = lerp(234, 254, depthCloud * 0.6 + frost * 0.4) + fracture * 12;

      const idx = (y * size + x) * 4;
      color[idx] = clampByte(r);
      color[idx + 1] = clampByte(g);
      color[idx + 2] = clampByte(b);
      color[idx + 3] = 255;

      writeGray(bump, idx, clamp(0.52 + (frost - 0.5) * 0.18 - fracture * 0.35, 0, 1));
      writeGray(rough, idx, clamp(0.12 + frost * 0.24 + fracture * 0.35, 0.06, 0.85));
    }
  }

  // Overlay crisp skate & wheelchair-tire carve scratches on canvas then blend back
  const [, sCtx] = createCanvas(size);
  sCtx.clearRect(0, 0, size, size);
  const rng = mulberry32(seed + 909);
  for (let i = 0; i < 65; i++) {
    const x0 = rng() * size;
    const y0 = rng() * size;
    const angle = rng() * Math.PI * 2;
    const len = size * (0.18 + rng() * 0.45);
    const curve = (rng() - 0.5) * size * 0.16;
    const x1 = x0 + Math.cos(angle) * len;
    const y1 = y0 + Math.sin(angle) * len;
    const cx = (x0 + x1) * 0.5 - Math.sin(angle) * curve;
    const cy = (y0 + y1) * 0.5 + Math.cos(angle) * curve;
    const alpha = 0.22 + rng() * 0.55;
    const lw = 0.7 + rng() * 1.4;

    // Draw wrapped across tile boundaries for seamless repeat
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        sCtx.beginPath();
        sCtx.moveTo(x0 + ox * size, y0 + oy * size);
        sCtx.quadraticCurveTo(cx + ox * size, cy + oy * size, x1 + ox * size, y1 + oy * size);
        sCtx.strokeStyle = `rgba(255,255,255,${alpha})`;
        sCtx.lineWidth = lw;
        sCtx.stroke();
      }
    }
  }
  const sData = sCtx.getImageData(0, 0, size, size).data;
  for (let i = 0; i < n; i += 4) {
    const sc = sData[i + 3] / 255;
    if (sc > 0.01) {
      color[i] = clampByte(lerp(color[i], 246, sc * 0.8));
      color[i + 1] = clampByte(lerp(color[i + 1], 252, sc * 0.8));
      color[i + 2] = clampByte(lerp(color[i + 2], 255, sc * 0.8));
      const newBump = clampByte(bump[i] - sc * 55);
      bump[i] = bump[i + 1] = bump[i + 2] = newBump;
      const newRough = clampByte(lerp(rough[i], 210, sc * 0.85));
      rough[i] = rough[i + 1] = rough[i + 2] = newRough;
    }
  }

  return { color, bump, rough };
}

function generateRock(size: number, seed: number): {
  color: Uint8ClampedArray;
  bump: Uint8ClampedArray;
  rough: Uint8ClampedArray;
} {
  const n = size * size * 4;
  const color = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const rough = new Uint8ClampedArray(n);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Domain-warped organic weathered granite / limestone — zero grid or banding
      const warpU = (tileableFbm(u, v, 3, 3, 3, seed + 7) - 0.5) * 0.14;
      const warpV = (tileableFbm(u, v, 3, 3, 3, seed + 23) - 0.5) * 0.14;
      const wu = ((u + warpU) % 1 + 1) % 1;
      const wv = ((v + warpV) % 1 + 1) % 1;

      const macro = tileableFbm(wu, wv, 4, 4, 4, seed + 41);
      const med = tileableFbm(u, v, 12, 12, 3, seed + 67);
      const grain = tileableValueNoise(u, v, 64, 64, seed + 89);
      const quartz = tileableValueNoise(u, v, 128, 128, seed + 127);

      // Subtle hairline mineral cracks / cleavage facets
      const ridge = tileableRidged(wu, wv, 5, 5, 3, seed + 151);
      const crack = smoothstep(clamp((ridge - 0.84) * 9.0, 0, 1));

      // Balanced neutral-warm mineral stone base (tints cleanly to granite or light travertine)
      let base = 152 + (macro - 0.5) * 44 + (med - 0.5) * 24 + (grain - 0.5) * 18;
      if (quartz > 0.90) base += 16; // fine crystalline feldspar/quartz fleck
      if (quartz < 0.08) base -= 18; // fine dark biotite mineral fleck
      base = lerp(base, base * 0.62, crack * 0.72);

      const warmShift = (macro - 0.5) * 8;
      const idx = (y * size + x) * 4;
      color[idx] = clampByte(base + 3 + warmShift);
      color[idx + 1] = clampByte(base + 1 + warmShift * 0.5);
      color[idx + 2] = clampByte(base - 3 - warmShift * 0.5);
      color[idx + 3] = 255;

      const h = clamp(0.48 + (macro - 0.5) * 0.34 + (med - 0.5) * 0.22 + (grain - 0.5) * 0.14 - crack * 0.32, 0, 1);
      writeGray(bump, idx, h);
      writeGray(rough, idx, clamp(0.76 + (1 - macro) * 0.16 + crack * 0.14 - (quartz > 0.9 ? 0.12 : 0), 0.45, 0.98));
    }
  }
  return { color, bump, rough };
}

// ---------------------------------------------------------------------------
// Public PBR Texture Cache & Accessor
// ---------------------------------------------------------------------------

const pbrCache = new Map<string, PBRTextureSet>();

export function getPBRTextures(
  type: PBRTextureType,
  options: TextureOptions = {},
): PBRTextureSet {
  const size = options.size ?? 512;
  const seed = options.seed ?? 101;
  const repeatX = options.repeatX ?? 1;
  const repeatY = options.repeatY ?? 1;
  const anisotropy = options.anisotropy ?? 8;
  const tint = options.tint ?? '';
  const roadMarkings = Boolean(options.roadMarkings);
  const wet = Boolean(options.wet);
  const mossAmount = options.mossAmount ?? 0.68;

  const key = `${type}|${size}|${seed}|${repeatX}|${repeatY}|${anisotropy}|${tint}|${roadMarkings}|${wet}|${mossAmount.toFixed(2)}`;
  const cached = pbrCache.get(key);
  if (cached) return cached;

  let buffers: { color: Uint8ClampedArray; bump: Uint8ClampedArray; rough: Uint8ClampedArray };
  switch (type) {
    case 'cobblestone':
      buffers = generateCobblestone(size, seed, options);
      break;
    case 'asphalt':
      buffers = generateAsphalt(size, seed, options);
      break;
    case 'bark':
      buffers = generateBark(size, seed);
      break;
    case 'woodPlanks':
      buffers = generateWoodPlanks(size, seed);
      break;
    case 'sandstone':
      buffers = generateSandstone(size, seed);
      break;
    case 'marbleTiles':
      buffers = generateMarbleTiles(size, seed);
      break;
    case 'grassSoil':
      buffers = generateGrassSoil(size, seed, options);
      break;
    case 'snow':
      buffers = generateSnow(size, seed);
      break;
    case 'roofTiles':
      buffers = generateRoofTiles(size, seed);
      break;
    case 'brushedBrass':
      buffers = generateBrushedBrass(size, seed);
      break;
    case 'ice':
      buffers = generateIce(size, seed);
      break;
    case 'rock':
      buffers = generateRock(size, seed);
      break;
  }

  const set = applyPixelBuffers(
    size,
    buffers.color,
    buffers.bump,
    buffers.rough,
    options.tint,
    repeatX,
    repeatY,
    anisotropy,
  );
  pbrCache.set(key, set);
  return set;
}

export function createPBRMaterial(
  type: PBRTextureType,
  options: TextureOptions & {
    bumpScale?: number;
    roughness?: number;
    metalness?: number;
    color?: THREE.ColorRepresentation;
    envMapIntensity?: number;
    side?: THREE.Side;
  } = {},
): THREE.MeshStandardMaterial {
  const textures = getPBRTextures(type, options);
  const defaultMetalness = type === 'brushedBrass' ? 0.88 : 0.04;
  const defaultBump =
    type === 'bark' ? 0.09 :
    type === 'cobblestone' ? 0.07 :
    type === 'roofTiles' ? 0.06 :
    type === 'sandstone' ? 0.05 :
    type === 'brushedBrass' ? 0.015 :
    type === 'marbleTiles' ? 0.018 : 0.035;

  return new THREE.MeshStandardMaterial({
    map: textures.map,
    bumpMap: textures.bumpMap,
    bumpScale: options.bumpScale ?? defaultBump,
    roughnessMap: textures.roughnessMap,
    roughness: options.roughness ?? 1.0,
    metalness: options.metalness ?? defaultMetalness,
    color: options.color !== undefined ? new THREE.Color(options.color) : new THREE.Color(0xffffff),
    envMapIntensity: options.envMapIntensity ?? 1.0,
    side: options.side ?? THREE.FrontSide,
  });
}

// ---------------------------------------------------------------------------
// High-Craft Alpha-Cutout Botanical Leaf Sprig Cards + Alpha-Edge Color Bleed
// ---------------------------------------------------------------------------

/**
 * Dilates RGB pixels outward into transparent regions so hardware mipmapping
 * NEVER creates dark black fringes around alpha-cutout botanical foliage!
 */
function bleedAlphaEdges(ctx: CanvasRenderingContext2D, size: number, passes = 10): void {
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  const origAlpha = new Uint8Array(size * size);
  const filled = new Uint8Array(size * size);

  for (let i = 0; i < size * size; i++) {
    const a = data[i * 4 + 3];
    origAlpha[i] = a;
    if (a > 24) filled[i] = 1;
  }

  let curr = new Uint8ClampedArray(data);
  let next = new Uint8ClampedArray(data);
  let currFilled = new Uint8Array(filled);
  let nextFilled = new Uint8Array(filled);

  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (currFilled[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= size) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= size) continue;
            const ni = ny * size + nx;
            if (currFilled[ni]) {
              r += curr[ni * 4];
              g += curr[ni * 4 + 1];
              b += curr[ni * 4 + 2];
              count++;
            }
          }
        }
        if (count > 0) {
          next[i * 4] = Math.round(r / count);
          next[i * 4 + 1] = Math.round(g / count);
          next[i * 4 + 2] = Math.round(b / count);
          nextFilled[i] = 1;
        }
      }
    }
    const tmp = curr;
    curr = next;
    next = tmp;
    const tmpF = currFilled;
    currFilled = nextFilled;
    nextFilled = tmpF;
  }

  for (let i = 0; i < size * size; i++) {
    data[i * 4] = curr[i * 4];
    data[i * 4 + 1] = curr[i * 4 + 1];
    data[i * 4 + 2] = curr[i * 4 + 2];
    data[i * 4 + 3] = origAlpha[i];
  }
  ctx.putImageData(img, 0, 0);
}

function buildBumpFromColorCanvas(colorCanvas: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const [bCanvas, bCtx] = createCanvas(size);
  const cCtx = colorCanvas.getContext('2d', { willReadFrequently: true })!;
  const src = cCtx.getImageData(0, 0, size, size).data;
  const dstImg = bCtx.createImageData(size, size);
  const dst = dstImg.data;
  for (let i = 0; i < size * size; i++) {
    const a = src[i * 4 + 3] / 255;
    const lum = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
    const h = clampByte((0.15 + lum * 0.85) * a * 255);
    dst[i * 4] = h;
    dst[i * 4 + 1] = h;
    dst[i * 4 + 2] = h;
    dst[i * 4 + 3] = 255;
  }
  bCtx.putImageData(dstImg, 0, 0);
  return bCanvas;
}

function drawOakLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  width: number,
  angle: number,
  lightness: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Lobed oak leaf silhouette (4 wavy lobes per side + rounded tip)
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const env = Math.sin(Math.pow(t, 0.72) * Math.PI);
    const lobe = 0.74 + 0.28 * Math.sin(t * Math.PI * 7.2 - 0.5);
    const rx = width * 0.5 * env * lobe;
    const ry = -length * t;
    ctx.lineTo(rx, ry);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const env = Math.sin(Math.pow(t, 0.72) * Math.PI);
    const lobe = 0.74 + 0.28 * Math.sin(t * Math.PI * 7.2 - 0.5);
    const rx = -width * 0.5 * env * lobe;
    const ry = -length * t;
    ctx.lineTo(rx, ry);
  }
  ctx.closePath();

  // High-value luminance base so instanceColor tints cleanly without muddying!
  const grad = ctx.createLinearGradient(0, 0, 0, -length);
  const l0 = Math.round(clamp(lightness * 175, 110, 235));
  const l1 = Math.round(clamp(lightness * 238, 165, 255));
  grad.addColorStop(0, `rgb(${l0 - 8},${l0 + 8},${l0 - 14})`);
  grad.addColorStop(0.55, `rgb(${l1 - 10},${l1},${l1 - 18})`);
  grad.addColorStop(1, `rgb(${Math.min(255, l1 + 10)},${Math.min(255, l1 + 12)},${l1 - 10})`);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = `rgba(95, 112, 78, 0.35)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Central midrib + pinnate lateral veins
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(0, -length * 0.92);
  ctx.strokeStyle = `rgba(245, 252, 224, 0.65)`;
  ctx.lineWidth = Math.max(1.4, width * 0.04);
  ctx.stroke();

  ctx.lineWidth = Math.max(0.9, width * 0.022);
  for (let k = 1; k <= 5; k++) {
    const ty = -length * (0.16 + k * 0.14);
    const span = width * 0.36 * Math.sin((0.16 + k * 0.14) * Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, ty + length * 0.05);
    ctx.lineTo(span, ty - length * 0.06);
    ctx.moveTo(0, ty + length * 0.05);
    ctx.lineTo(-span, ty - length * 0.06);
    ctx.stroke();
  }

  ctx.restore();
}

function drawMapleLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  angle: number,
  lightness: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Iconic 7-pointed Japanese momiji palmate maple leaf with sharp serrations
  const lobeAngles = [-2.05, -1.38, -0.68, 0, 0.68, 1.38, 2.05];
  const lobeLens = [0.42, 0.72, 0.94, 1.08, 0.94, 0.72, 0.42];

  // Delicate petiole stem
  ctx.beginPath();
  ctx.moveTo(0, radius * 0.38);
  ctx.lineTo(0, 0);
  ctx.strokeStyle = 'rgba(130, 88, 72, 0.9)';
  ctx.lineWidth = Math.max(1.8, radius * 0.04);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  const segsPerLobe = 10;
  for (let l = 0; l < lobeAngles.length; l++) {
    const a = lobeAngles[l] - Math.PI * 0.5;
    const len = radius * lobeLens[l];
    const halfSpread = 0.28;
    for (let s = 0; s <= segsPerLobe; s++) {
      const t = s / segsPerLobe; // 0->0.5 up, 0.5->1 down
      const up = t <= 0.5 ? t * 2 : (1 - t) * 2;
      const side = t <= 0.5 ? -1 : 1;
      const serrate = 1 + Math.sin(up * Math.PI * 6) * 0.09 * up;
      const r = lerp(radius * 0.24, len, Math.pow(up, 0.85)) * serrate;
      const ang = a + side * halfSpread * (1 - Math.pow(up, 0.78));
      ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
  }
  ctx.closePath();

  const grad = ctx.createRadialGradient(0, -radius * 0.1, radius * 0.05, 0, -radius * 0.25, radius * 1.15);
  const cBase = Math.round(clamp(lightness * 212, 145, 245));
  const cTip = Math.round(clamp(lightness * 252, 195, 255));
  grad.addColorStop(0, `rgb(${cBase},${Math.round(cBase * 0.92)},${Math.round(cBase * 0.88)})`);
  grad.addColorStop(0.65, `rgb(${cTip},${Math.round(cTip * 0.96)},${Math.round(cTip * 0.92)})`);
  grad.addColorStop(1, `rgb(255,${Math.min(255, Math.round(cTip * 0.98))},${Math.round(cTip * 0.85)})`);
  ctx.fillStyle = grad;
  ctx.fill();

  // Subtle darker outline for crisp readability between overlapping leaves
  ctx.strokeStyle = 'rgba(128, 76, 62, 0.35)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Radiating palmate veins
  ctx.strokeStyle = 'rgba(255, 245, 228, 0.6)';
  ctx.lineWidth = Math.max(1.1, radius * 0.022);
  for (let l = 0; l < lobeAngles.length; l++) {
    const a = lobeAngles[l] - Math.PI * 0.5;
    const len = radius * lobeLens[l] * 0.86;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSakuraBlossom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  angle: number,
  lightness: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // 5 iconic heart-notched sakura petals
  for (let p = 0; p < 5; p++) {
    ctx.save();
    ctx.rotate((p * Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(
      -radius * 0.48, -radius * 0.35,
      -radius * 0.44, -radius * 0.92,
      -radius * 0.11, -radius * 0.98,
    );
    // Signature cherry blossom apical notch!
    ctx.lineTo(0, -radius * 0.81);
    ctx.lineTo(radius * 0.11, -radius * 0.98);
    ctx.bezierCurveTo(
      radius * 0.44, -radius * 0.92,
      radius * 0.48, -radius * 0.35,
      0, 0,
    );
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, -radius);
    const hi = Math.round(clamp(lightness * 255, 215, 255));
    const mid = Math.round(clamp(lightness * 242, 195, 252));
    grad.addColorStop(0, `rgb(${Math.round(mid * 0.96)},${Math.round(mid * 0.78)},${Math.round(mid * 0.86)})`);
    grad.addColorStop(0.5, `rgb(${hi},${Math.round(hi * 0.93)},${Math.round(hi * 0.96)})`);
    grad.addColorStop(1, `rgb(255,250,253)`);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(205, 145, 165, 0.32)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
  }

  // Deep rosy throat + delicate golden stamen filaments
  const centerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.32);
  centerGrad.addColorStop(0, 'rgba(182, 74, 108, 0.9)');
  centerGrad.addColorStop(1, 'rgba(218, 128, 152, 0)');
  ctx.fillStyle = centerGrad;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
  ctx.fill();

  for (let s = 0; s < 10; s++) {
    const a = (s / 10) * Math.PI * 2 + 0.2;
    const sl = radius * (0.24 + (s % 2) * 0.1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * sl, Math.sin(a) * sl);
    ctx.strokeStyle = 'rgba(255, 224, 175, 0.85)';
    ctx.lineWidth = 1.0;
    ctx.stroke();
    ctx.fillStyle = '#f5c249';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * sl, Math.sin(a) * sl, radius * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawLanceLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  width: number,
  angle: number,
  fillTop: string,
  fillBase: string,
  midribColor = 'rgba(245, 252, 232, 0.6)',
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-width * 0.65, -length * 0.32, -width * 0.45, -length * 0.78, 0, -length);
  ctx.bezierCurveTo(width * 0.45, -length * 0.78, width * 0.65, -length * 0.32, 0, 0);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, 0, 0, -length);
  grad.addColorStop(0, fillBase);
  grad.addColorStop(1, fillTop);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -length * 0.92);
  ctx.strokeStyle = midribColor;
  ctx.lineWidth = Math.max(1.1, width * 0.07);
  ctx.stroke();
  ctx.restore();
}

const leafCardCache = new Map<string, LeafCardTextureSet>();

export function getLeafCardTexture(
  style: LeafCardStyle,
  size = 512,
): LeafCardTextureSet {
  const key = `${style}|${size}`;
  const cached = leafCardCache.get(key);
  if (cached) return cached;

  const [canvas, ctx] = createCanvas(size);
  ctx.clearRect(0, 0, size, size);
  const rng = mulberry32(style.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 17));
  const cx = size * 0.5;
  const s = size / 512;

  if (style === 'oak') {
    // Woody branching twig
    ctx.strokeStyle = '#5c4632';
    ctx.lineCap = 'round';
    ctx.lineWidth = 7 * s;
    ctx.beginPath();
    ctx.moveTo(cx, size * 0.96);
    ctx.quadraticCurveTo(cx - 10 * s, size * 0.6, cx + 4 * s, size * 0.28);
    ctx.stroke();

    const leaves: [number, number, number, number, number, number][] = [
      [cx - 8 * s, size * 0.80, 150 * s, 96 * s, -0.92, 0.82],
      [cx + 10 * s, size * 0.78, 154 * s, 98 * s, 0.88, 0.85],
      [cx - 16 * s, size * 0.62, 168 * s, 108 * s, -1.18, 0.9],
      [cx + 14 * s, size * 0.60, 166 * s, 106 * s, 1.12, 0.92],
      [cx - 26 * s, size * 0.45, 162 * s, 104 * s, -0.62, 0.96],
      [cx + 22 * s, size * 0.44, 160 * s, 102 * s, 0.58, 0.98],
      [cx - 4 * s, size * 0.54, 152 * s, 96 * s, -0.18, 0.94],
      [cx + 8 * s, size * 0.36, 158 * s, 100 * s, 0.14, 1.04],
      [cx - 10 * s, size * 0.28, 140 * s, 92 * s, -0.35, 1.06],
    ];
    for (const [lx, ly, len, wid, ang, lit] of leaves) {
      drawOakLeaf(ctx, lx, ly, len, wid, ang, lit);
    }
  } else if (style === 'maple') {
    // Graceful slender Kyoto twig
    ctx.strokeStyle = '#4e332c';
    ctx.lineCap = 'round';
    ctx.lineWidth = 5.5 * s;
    ctx.beginPath();
    ctx.moveTo(cx, size * 0.95);
    ctx.quadraticCurveTo(cx + 12 * s, size * 0.62, cx - 6 * s, size * 0.28);
    ctx.stroke();

    const leaves: [number, number, number, number, number][] = [
      [cx - 58 * s, size * 0.75, 112 * s, -0.78, 0.84],
      [cx + 66 * s, size * 0.73, 115 * s, 0.82, 0.86],
      [cx - 98 * s, size * 0.52, 118 * s, -1.05, 0.92],
      [cx + 96 * s, size * 0.50, 120 * s, 1.02, 0.94],
      [cx - 12 * s, size * 0.58, 124 * s, -0.12, 0.96],
      [cx - 58 * s, size * 0.31, 116 * s, -0.45, 1.02],
      [cx + 56 * s, size * 0.30, 118 * s, 0.42, 1.04],
      [cx + 4 * s, size * 0.23, 112 * s, 0.08, 1.08],
    ];
    for (const [lx, ly, rad, ang, lit] of leaves) {
      drawMapleLeaf(ctx, lx, ly, rad, ang, lit);
    }
  } else if (style === 'sakura') {
    // Dark cherry bough with branching spurs
    ctx.strokeStyle = '#4a2e33';
    ctx.lineCap = 'round';
    ctx.lineWidth = 6.5 * s;
    ctx.beginPath();
    ctx.moveTo(cx - 20 * s, size * 0.94);
    ctx.quadraticCurveTo(cx + 8 * s, size * 0.58, cx - 10 * s, size * 0.2);
    ctx.moveTo(cx - 2 * s, size * 0.68);
    ctx.quadraticCurveTo(cx - 75 * s, size * 0.54, cx - 125 * s, size * 0.42);
    ctx.moveTo(cx + 4 * s, size * 0.62);
    ctx.quadraticCurveTo(cx + 80 * s, size * 0.48, cx + 130 * s, size * 0.38);
    ctx.stroke();

    // Lush dense overlapping sakura blossom cluster (19 blossoms!)
    const blossoms: [number, number, number, number][] = [
      [cx - 88 * s, size * 0.72, 56 * s, 0.86],
      [cx + 82 * s, size * 0.70, 58 * s, 0.88],
      [cx - 18 * s, size * 0.74, 54 * s, 0.85],
      [cx + 34 * s, size * 0.76, 52 * s, 0.88],
      [cx - 134 * s, size * 0.50, 56 * s, 0.92],
      [cx + 132 * s, size * 0.48, 56 * s, 0.93],
      [cx - 74 * s, size * 0.55, 64 * s, 0.94],
      [cx + 68 * s, size * 0.54, 62 * s, 0.95],
      [cx - 4 * s, size * 0.56, 66 * s, 0.96],
      [cx - 112 * s, size * 0.34, 54 * s, 0.98],
      [cx + 108 * s, size * 0.33, 54 * s, 0.98],
      [cx - 52 * s, size * 0.36, 64 * s, 1.0],
      [cx + 50 * s, size * 0.35, 62 * s, 1.0],
      [cx + 2 * s, size * 0.38, 66 * s, 1.02],
      [cx - 64 * s, size * 0.20, 50 * s, 1.04],
      [cx + 60 * s, size * 0.20, 50 * s, 1.04],
      [cx - 14 * s, size * 0.19, 58 * s, 1.06],
      [cx + 24 * s, size * 0.22, 54 * s, 1.05],
    ];
    for (const [bx, by, rad, lit] of blossoms) {
      drawSakuraBlossom(ctx, bx, by, rad, rng() * Math.PI * 2, lit);
    }
  } else if (style === 'pine' || style === 'snow_pine') {
    const isSnow = style === 'snow_pine';
    // Woody branching conifer bough shoot
    ctx.strokeStyle = '#5c3c28';
    ctx.lineCap = 'round';
    ctx.lineWidth = 8 * s;
    ctx.beginPath();
    ctx.moveTo(cx, size * 0.96);
    ctx.lineTo(cx, size * 0.24);
    ctx.stroke();

    const shoots: [number, number, number, number][] = [
      [cx, size * 0.84, -0.82, 165 * s],
      [cx, size * 0.84, 0.82, 165 * s],
      [cx, size * 0.66, -0.72, 185 * s],
      [cx, size * 0.66, 0.72, 185 * s],
      [cx, size * 0.48, -0.58, 168 * s],
      [cx, size * 0.48, 0.58, 168 * s],
      [cx, size * 0.34, -0.35, 130 * s],
      [cx, size * 0.34, 0.35, 130 * s],
      [cx, size * 0.26, 0.0, 128 * s],
    ];

    for (const [sx, sy, ang, len] of shoots) {
      const ex = sx + Math.sin(ang) * len;
      const ey = sy - Math.cos(ang) * len;
      ctx.strokeStyle = '#62412c';
      ctx.lineWidth = 4.5 * s;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Fan of crisp individual pine needles radiating along shoot
      const steps = 22;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const bx = lerp(sx, ex, t);
        const by = lerp(sy, ey, t);
        const nLen = (52 - t * 18) * s;
        for (const side of [-1, 1]) {
          for (let f = 0; f < 3; f++) {
            const nAng = ang + side * (0.48 + f * 0.24 + (rng() - 0.5) * 0.14);
            const nx = bx + Math.sin(nAng) * nLen;
            const ny = by - Math.cos(nAng) * nLen;
            const shade = Math.round(145 + t * 55 + f * 12);
            ctx.strokeStyle = `rgb(${Math.round(shade * 0.78)},${shade},${Math.round(shade * 0.82)})`;
            ctx.lineWidth = (2.6 + rng() * 1.1) * s;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(nx, ny);
            ctx.stroke();
          }
        }
      }
    }

    if (isSnow) {
      // Soft sculpted snow cushions nestled across upper pine needle clusters
      for (let i = 0; i < 16; i++) {
        const px = cx + (rng() - 0.5) * size * 0.62;
        const py = size * (0.18 + rng() * 0.44);
        const rx = (28 + rng() * 34) * s;
        const ry = (16 + rng() * 20) * s;
        const grad = ctx.createRadialGradient(px, py - ry * 0.2, 2, px, py, rx);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
        grad.addColorStop(0.65, 'rgba(232, 243, 255, 0.92)');
        grad.addColorStop(1, 'rgba(210, 228, 248, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, (rng() - 0.5) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (style === 'cypress') {
    // Upright dense feathery Mediterranean cypress spray plume
    ctx.strokeStyle = '#4e3c2e';
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.moveTo(cx, size * 0.95);
    ctx.lineTo(cx, size * 0.15);
    ctx.stroke();

    for (let i = 0; i < 42; i++) {
      const t = i / 41;
      const y = size * (0.90 - t * 0.78);
      const spread = Math.sin(Math.pow(t, 0.72) * Math.PI) * 145 * s;
      const side = i % 2 === 0 ? -1 : 1;
      const bx = cx + side * spread * (0.18 + rng() * 0.35);
      const len = (58 + Math.sin(t * Math.PI) * 58) * s;
      const wid = (22 + Math.sin(t * Math.PI) * 16) * s;
      const ang = side * (0.22 + (1 - t) * 0.32 + (rng() - 0.5) * 0.16);
      const l = Math.round(168 + t * 65 + (rng() - 0.5) * 24);
      drawLanceLeaf(
        ctx,
        bx,
        y,
        len,
        wid,
        ang,
        `rgb(${Math.round(l * 0.85)},${l},${Math.round(l * 0.82)})`,
        `rgb(${Math.round(l * 0.62)},${Math.round(l * 0.78)},${Math.round(l * 0.62)})`,
        'rgba(220, 236, 200, 0.38)',
      );
    }
  } else if (style === 'olive') {
    // Airy Mediterranean olive twig with paired silvery-sage slender lance leaves
    ctx.strokeStyle = '#7c7465';
    ctx.lineCap = 'round';
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.moveTo(cx, size * 0.94);
    ctx.quadraticCurveTo(cx - 10 * s, size * 0.58, cx + 6 * s, size * 0.16);
    ctx.moveTo(cx - 4 * s, size * 0.68);
    ctx.lineTo(cx - 102 * s, size * 0.44);
    ctx.moveTo(cx + 2 * s, size * 0.62);
    ctx.lineTo(cx + 108 * s, size * 0.40);
    ctx.stroke();

    const drawPair = (px: number, py: number, baseAng: number, len: number, wid: number, flip: number) => {
      const top1 = flip > 0.5 ? '#eef4e8' : '#d5e0cb';
      const bot1 = flip > 0.5 ? '#bac8b2' : '#96a88c';
      drawLanceLeaf(ctx, px, py, len, wid, baseAng - 0.58, top1, bot1);
      drawLanceLeaf(ctx, px, py, len, wid, baseAng + 0.58, '#e8f0e2', '#a8b89f');
    };

    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      drawPair(cx + (t - 0.4) * 14 * s, size * (0.82 - t * 0.58), 0, (108 - t * 18) * s, 28 * s, rng());
    }
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      drawPair(lerp(cx - 10 * s, cx - 102 * s, t), lerp(size * 0.66, size * 0.44, t), -1.0, 90 * s, 24 * s, rng());
      drawPair(lerp(cx + 8 * s, cx + 108 * s, t), lerp(size * 0.60, size * 0.40, t), 1.0, 90 * s, 24 * s, rng());
    }
    drawLanceLeaf(ctx, cx + 6 * s, size * 0.22, 92 * s, 25 * s, 0.05, '#f2f7ec', '#b6c6ac');
  } else if (style === 'fern') {
    // Graceful botanical compound fern frond (full rachis + 20 pairs of finely serrated pinnae!)
    ctx.strokeStyle = '#5f7e34';
    ctx.lineCap = 'round';
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.moveTo(cx, size * 0.97);
    ctx.quadraticCurveTo(cx + 4 * s, size * 0.52, cx, size * 0.05);
    ctx.stroke();

    const pairs = 20;
    for (let i = 0; i < pairs; i++) {
      const t = i / (pairs - 1);
      const y = size * (0.91 - t * 0.82);
      const profile = Math.sin(Math.pow(t, 0.62) * Math.PI * 0.95) * (1 - t * 0.25);
      const pinnaLen = (18 + profile * 165) * s;
      const pinnaWid = (11 + profile * 20) * s;
      const baseTilt = 1.28 - t * 0.46;

      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(cx, y);
        ctx.rotate(side * baseTilt);
        const subCount = Math.max(3, Math.round(pinnaLen / (16 * s)));
        for (let k = 0; k < subCount; k++) {
          const kt = k / subCount;
          const subLen = pinnaWid * (1 - kt * 0.65);
          const py = -pinnaLen * kt;
          const lum = Math.round(165 + t * 55 + kt * 22);
          drawLanceLeaf(
            ctx,
            0,
            py,
            subLen * 1.35,
            subLen * 0.62,
            0.55,
            `rgb(${Math.round(lum * 0.72)},${lum},${Math.round(lum * 0.42)})`,
            `rgb(${Math.round(lum * 0.52)},${Math.round(lum * 0.78)},${Math.round(lum * 0.28)})`,
            'rgba(215, 240, 165, 0.35)',
          );
          drawLanceLeaf(
            ctx,
            0,
            py,
            subLen * 1.35,
            subLen * 0.62,
            -0.55,
            `rgb(${Math.round(lum * 0.74)},${Math.min(255, lum + 8)},${Math.round(lum * 0.44)})`,
            `rgb(${Math.round(lum * 0.54)},${Math.round(lum * 0.8)},${Math.round(lum * 0.3)})`,
            'rgba(215, 240, 165, 0.35)',
          );
        }
        ctx.restore();
      }
    }
  } else if (style === 'bamboo') {
    // Graceful slender bamboo node shoot + radiating pointed lance leaves
    ctx.strokeStyle = '#6c8a44';
    ctx.lineCap = 'round';
    ctx.lineWidth = 4.5 * s;
    ctx.beginPath();
    ctx.moveTo(cx, size * 0.94);
    ctx.quadraticCurveTo(cx + 12 * s, size * 0.6, cx - 8 * s, size * 0.26);
    ctx.stroke();

    const tufts: [number, number, number][] = [
      [cx + 6 * s, size * 0.76, -0.45],
      [cx + 4 * s, size * 0.72, 0.55],
      [cx - 2 * s, size * 0.54, -0.65],
      [cx + 4 * s, size * 0.50, 0.48],
      [cx - 6 * s, size * 0.32, 0.0],
    ];
    for (const [tx, ty, baseAng] of tufts) {
      for (let k = -2; k <= 2; k++) {
        const ang = baseAng + k * 0.34 + (rng() - 0.5) * 0.1;
        const len = (118 + (2 - Math.abs(k)) * 22 + rng() * 18) * s;
        const wid = (18 + rng() * 6) * s;
        const lum = Math.round(182 + rng() * 48);
        drawLanceLeaf(
          ctx,
          tx,
          ty,
          len,
          wid,
          ang,
          `rgb(${Math.round(lum * 0.86)},${lum},${Math.round(lum * 0.64)})`,
          `rgb(${Math.round(lum * 0.62)},${Math.round(lum * 0.82)},${Math.round(lum * 0.46)})`,
        );
      }
    }
  } else if (style === 'palm_leaflet') {
    // Rich fibrous palm frond feather texture
    const grad = ctx.createLinearGradient(0, size, 0, 0);
    grad.addColorStop(0, '#5a8a36');
    grad.addColorStop(0.55, '#7cb848');
    grad.addColorStop(1, '#a4d464');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    // Fine parallel leaflet veins
    for (let i = 0; i < 64; i++) {
      const px = (i / 64) * size;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(220,248,170,0.22)' : 'rgba(35,68,20,0.18)';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, size);
      ctx.stroke();
    }
  }

  if (style !== 'palm_leaflet') {
    bleedAlphaEdges(ctx, size, 12);
  }

  const bumpCanvas = buildBumpFromColorCanvas(canvas, size);
  const wrap = style === 'palm_leaflet' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;

  const set: LeafCardTextureSet = {
    map: configureTexture(canvas, true, 1, 1, 8, wrap),
    bumpMap: configureTexture(bumpCanvas, false, 1, 1, 8, wrap),
    alphaTest: 0.42,
  };
  leafCardCache.set(key, set);
  return set;
}

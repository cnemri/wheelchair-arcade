import * as THREE from 'three';
import {
  applyAtmosphere,
  createDetailedTree,
  createFernCluster,
  createGrassField,
  createLantern,
  createMossyBoulder,
  createPBRMaterial,
  createParticleSystem,
  createWildflowerPatch,
  updateFoliageWind,
  type AtmosphereRig,
  type DetailedTree,
  type GrassField,
  type ParticleSystem,
  type WildflowerPatch,
} from '../../art';

export interface ArenaObstacle {
  x: number;
  z: number;
  radius: number;
}

export interface LibraryArena {
  readonly playableRadius: number;
  readonly obstacles: readonly ArenaObstacle[];
  readonly atmosphere: AtmosphereRig;
  readonly sparks: ParticleSystem;
  readonly confetti: ParticleSystem;
  setRuneIntensity(intensity: number): void;
  update(dt: number, elapsed: number, playerPos: THREE.Vector3, cameraPos: THREE.Vector3): void;
  dispose(): void;
}

export const ARENA_PLAYABLE_RADIUS = 18.2;
const HALL_RADIUS = 20.0;
const BAY_COUNT = 12;

export const GARDEN_BEDS: readonly ArenaObstacle[] = [
  { x: -10.2, z: -9.0, radius: 2.35 }, // NW Oak Conservatory Bed
  { x: 10.2, z: -9.0, radius: 2.35 },  // NE Olive Conservatory Bed
  { x: -11.0, z: 8.0, radius: 2.25 },  // SW Emerald Bonsai Bed
  { x: 11.0, z: 8.0, radius: 2.25 },   // SE Maple Bonsai Bed
];

function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a crisp veined checkerboard marble tile texture blended with
 * dark forest-slate & warm ivory tiles for the Grand Victorian Library floor.
 */
function createCheckerboardMarbleTexture(): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d')!;

  const rand = createSeededRandom(80811);
  const tiles = 4;
  const step = size / tiles;

  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const isDark = (tx + ty) % 2 === 1;
      const x0 = tx * step;
      const y0 = ty * step;

      // Subtle per-tile tonal variation
      const v = (rand() - 0.5) * 10;
      if (isDark) {
        const r = Math.round(44 + v * 0.6);
        const g = Math.round(62 + v * 0.8);
        const b = Math.round(54 + v * 0.7);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        rctx.fillStyle = `rgb(${Math.round(78 + v)},${Math.round(78 + v)},${Math.round(78 + v)})`;
      } else {
        const r = Math.round(230 + v);
        const g = Math.round(221 + v);
        const b = Math.round(202 + v * 0.9);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        rctx.fillStyle = `rgb(${Math.round(62 + v)},${Math.round(62 + v)},${Math.round(62 + v)})`;
      }
      ctx.fillRect(x0, y0, step, step);
      rctx.fillRect(x0, y0, step, step);

      // Organic marble veining
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, step, step);
      ctx.clip();
      const veinCount = 4 + Math.floor(rand() * 4);
      for (let i = 0; i < veinCount; i++) {
        ctx.beginPath();
        let vx = x0 + rand() * step;
        let vy = y0 + rand() * step;
        ctx.moveTo(vx, vy);
        for (let seg = 0; seg < 4; seg++) {
          vx += (rand() - 0.45) * step * 0.5;
          vy += (rand() - 0.45) * step * 0.5;
          ctx.lineTo(vx, vy);
        }
        ctx.strokeStyle = isDark
          ? `rgba(176, 198, 184, ${0.09 + rand() * 0.12})`
          : `rgba(148, 134, 112, ${0.11 + rand() * 0.14})`;
        ctx.lineWidth = 0.8 + rand() * 2.1;
        ctx.stroke();
      }
      ctx.restore();

      // Fine warm brass/mortar grout bevel
      ctx.strokeStyle = 'rgba(136, 114, 78, 0.36)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 + 1, y0 + 1, step - 2, step - 2);

      rctx.strokeStyle = 'rgb(200,200,200)';
      rctx.lineWidth = 2;
      rctx.strokeRect(x0 + 1, y0 + 1, step - 2, step - 2);
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(9, 9);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(9, 9);
  roughnessMap.anisotropy = 4;

  return { map, roughnessMap };
}

/**
 * Generates a gilded leather-bound book spine texture for InstancedMesh books.
 */
function createBookSpineTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e8e4dc';
  ctx.fillRect(0, 0, 128, 256);

  // Subtle vertical shading along spine curve
  const grad = ctx.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.28)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.04)');
  grad.addColorStop(0.82, 'rgba(0,0,0,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);

  // Gold leaf horizontal spine bands
  ctx.fillStyle = '#e8c472';
  for (const y of [22, 34, 72, 188, 224, 234]) {
    ctx.fillRect(10, y, 108, 4);
  }
  // Ornate center title cartouche
  ctx.strokeStyle = '#e8c472';
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 92, 84, 70);
  ctx.fillStyle = 'rgba(232, 196, 114, 0.35)';
  ctx.fillRect(34, 112, 60, 8);
  ctx.fillRect(42, 130, 44, 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Generates an inlaid Victorian brass compass-rose & arcane rune floor medallion.
 */
function createCompassMedallionTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Deep forest marble backing disc
  const bg = ctx.createRadialGradient(cx, cy, 18, cx, cy, 240);
  bg.addColorStop(0, 'rgba(24, 44, 38, 0.94)');
  bg.addColorStop(0.62, 'rgba(30, 48, 42, 0.88)');
  bg.addColorStop(0.86, 'rgba(22, 34, 31, 0.92)');
  bg.addColorStop(1, 'rgba(22, 34, 31, 0)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, 244, 0, Math.PI * 2);
  ctx.fill();

  // Concentric engraved brass rings
  ctx.strokeStyle = '#d9b364';
  for (const [r, w] of [
    [234, 6],
    [220, 2.5],
    [176, 4],
    [164, 2],
    [72, 3.5],
  ] as const) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Degree tick marks & arcane glyphs around outer ring
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const inner = i % 4 === 0 ? 182 : 196;
    const outer = 218;
    ctx.lineWidth = i % 4 === 0 ? 3 : 1.5;
    ctx.strokeStyle = i % 4 === 0 ? '#f0cf82' : 'rgba(217, 179, 100, 0.65)';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.stroke();
  }

  // 8-point brass compass rose
  const drawStar = (points: number, outerR: number, innerR: number, rotOffset: number, colA: string, colB: string) => {
    for (let i = 0; i < points; i++) {
      const a = rotOffset + (i / points) * Math.PI * 2;
      const aL = a - Math.PI / points;
      const aR = a + Math.PI / points;

      ctx.fillStyle = colA;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
      ctx.lineTo(cx + Math.cos(aR) * innerR, cy + Math.sin(aR) * innerR);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = colB;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
      ctx.lineTo(cx + Math.cos(aL) * innerR, cy + Math.sin(aL) * innerR);
      ctx.closePath();
      ctx.fill();
    }
  };

  drawStar(4, 148, 34, Math.PI / 4, '#c39749', '#8a662b');
  drawStar(4, 174, 38, 0, '#f3d488', '#b8893c');

  // Center jewel cap
  ctx.fillStyle = '#2d6e5e';
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f5d98e';
  ctx.lineWidth = 4;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Builds an ornate Victorian suspended wrought-iron candle chandelier with flickering wax tapers.
 */
function buildCandleChandelier(
  ironMat: THREE.Material,
  brassMat: THREE.Material,
  waxMat: THREE.Material,
  flameMat: THREE.MeshBasicMaterial,
  withLight: boolean
): { group: THREE.Group; flames: THREE.Mesh[]; light: THREE.PointLight | null } {
  const group = new THREE.Group();
  const flames: THREE.Mesh[] = [];

  // Central suspension chain rod + ornate finial
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.8, 8), ironMat);
  rod.position.y = 1.9;
  group.add(rod);

  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), brassMat);
  group.add(hub);

  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 8), brassMat);
  finial.rotation.x = Math.PI;
  finial.position.y = -0.24;
  group.add(finial);

  // Main wrought-iron hoop
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.042, 10, 28), ironMat);
  hoop.rotation.x = Math.PI / 2;
  group.add(hoop);

  const innerHoop = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 8, 20), brassMat);
  innerHoop.rotation.x = Math.PI / 2;
  innerHoop.position.y = 0.25;
  group.add(innerHoop);

  const candleGeo = new THREE.CylinderGeometry(0.038, 0.042, 0.32, 8);
  const saucerGeo = new THREE.CylinderGeometry(0.095, 0.06, 0.04, 10);
  const flameGeo = new THREE.ConeGeometry(0.042, 0.15, 7);
  const spokeGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.96, 6);

  const count = 8;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const cx = Math.cos(a) * 0.95;
    const cz = Math.sin(a) * 0.95;

    // Radial iron spoke
    const spoke = new THREE.Mesh(spokeGeo, ironMat);
    spoke.position.set(cx * 0.5, 0.02, cz * 0.5);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = -a;
    group.add(spoke);

    // Brass drip saucer + wax candle + teardrop flame
    const saucer = new THREE.Mesh(saucerGeo, brassMat);
    saucer.position.set(cx, 0.05, cz);
    group.add(saucer);

    const candle = new THREE.Mesh(candleGeo, waxMat);
    candle.position.set(cx, 0.22, cz);
    group.add(candle);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(cx, 0.45, cz);
    group.add(flame);
    flames.push(flame);
  }

  let light: THREE.PointLight | null = null;
  if (withLight) {
    light = new THREE.PointLight(0xffb55a, 7.5, 22, 1.55);
    light.position.set(0, -0.25, 0);
    group.add(light);
  }

  return { group, flames, light };
}

/**
 * Builds an antique carved oak reading lectern holding an open illuminated manuscript.
 */
function buildReadingLectern(
  oakMat: THREE.Material,
  brassMat: THREE.Material,
  pageMat: THREE.Material,
  coverMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.14, 8), oakMat);
  base.position.y = 0.07;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.95, 10), oakMat);
  stem.position.y = 0.58;
  stem.castShadow = true;
  g.add(stem);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 16), brassMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.96;
  g.add(collar);

  const deskPivot = new THREE.Group();
  deskPivot.position.set(0, 1.08, 0);
  deskPivot.rotation.x = 0.42;

  const board = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.06, 0.52), oakMat);
  board.castShadow = true;
  deskPivot.add(board);

  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.08, 0.04), brassMat);
  lip.position.set(0, 0.04, 0.24);
  deskPivot.add(lip);

  // Open illuminated folio on desk
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.025, 0.42), coverMat);
  cover.position.set(0, 0.042, -0.01);
  deskPivot.add(cover);

  const leftPage = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.03, 0.38), pageMat);
  leftPage.position.set(-0.145, 0.06, -0.01);
  leftPage.rotation.z = 0.08;
  deskPivot.add(leftPage);

  const rightPage = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.03, 0.38), pageMat);
  rightPage.position.set(0.145, 0.06, -0.01);
  rightPage.rotation.z = -0.08;
  deskPivot.add(rightPage);

  g.add(deskPivot);
  return g;
}

/**
 * Builds the complete Grand Victorian Glasshouse Library & Botanical Conservatory arena.
 */
export function buildLivingLibraryArena(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer
): LibraryArena {
  const rand = createSeededRandom(481516);
  const disposables: Array<{ dispose(): void }> = [];

  // 1. Conservatory atmosphere (sky dome, PMREM environment, sun & soft fog)
  const atmosphere = applyAtmosphere(scene, renderer, 'conservatory', {
    skyRadius: 190,
    shadowExtent: 26,
    shadowMapSize: 2048,
    fogDensityMultiplier: 0.38,
    enableShadows: true,
    sunDistance: 44,
  });

  // Warm candlelit golden-hour balance inside the sunlit Victorian conservatory
  atmosphere.sunLight.color.set('#ffe4b4');
  atmosphere.sunLight.intensity = 2.15;
  atmosphere.hemiLight.color.set('#e6f0e6');
  atmosphere.hemiLight.groundColor.set('#473527');
  atmosphere.hemiLight.intensity = 0.92;
  atmosphere.rimLight.color.set('#c4ebd9');
  atmosphere.rimLight.intensity = 0.58;

  // Soft warm ambient pool near center medallion so character & books always glow warmly
  const centerFill = new THREE.PointLight(0xffd28c, 3.2, 24, 1.4);
  centerFill.position.set(0, 6.2, 0.5);
  scene.add(centerFill);

  // 2. Shared PBR & bespoke architectural materials
  const oakMat = createPBRMaterial('woodPlanks', {
    repeatX: 2,
    repeatY: 3,
    tint: '#4a2e1c',
    seed: 12,
  });
  oakMat.roughness = 0.62;
  oakMat.metalness = 0.06;

  const darkOakMat = createPBRMaterial('woodPlanks', {
    repeatX: 1,
    repeatY: 2,
    tint: '#2f1c11',
    seed: 19,
  });
  darkOakMat.roughness = 0.58;

  const brassMat = createPBRMaterial('brushedBrass', {
    repeatX: 2,
    repeatY: 2,
    tint: '#e2bd6c',
    seed: 7,
  });
  brassMat.roughness = 0.28;
  brassMat.metalness = 0.88;

  const sandstoneMat = createPBRMaterial('sandstone', {
    repeatX: 3,
    repeatY: 1,
    tint: '#d9cbb3',
    seed: 23,
  });
  sandstoneMat.roughness = 0.78;

  const soilMat = createPBRMaterial('grassSoil', {
    repeatX: 2,
    repeatY: 2,
    tint: '#4d4132',
    seed: 31,
  });
  soilMat.roughness = 0.92;

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x1e2c2a,
    roughness: 0.42,
    metalness: 0.82,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff2ea,
    roughness: 0.14,
    metalness: 0.05,
    transmission: 0.35,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const carpetMat = new THREE.MeshStandardMaterial({
    color: 0x6b202d,
    roughness: 0.88,
    metalness: 0.04,
  });

  const carpetTrimMat = new THREE.MeshStandardMaterial({
    color: 0xd6ae5b,
    roughness: 0.42,
    metalness: 0.62,
  });

  const waxMat = new THREE.MeshStandardMaterial({
    color: 0xf7ecd3,
    roughness: 0.65,
    emissive: 0x3b240b,
    emissiveIntensity: 0.35,
  });

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffd578,
  });

  const pageMat = new THREE.MeshStandardMaterial({
    color: 0xf3e7cc,
    roughness: 0.82,
  });

  const coverMat = new THREE.MeshStandardMaterial({
    color: 0x6e1f2d,
    roughness: 0.55,
  });

  // 3. Veined Checkerboard Marble Floor + Exterior Botanical Lawn Surround
  const floorGroup = new THREE.Group();
  floorGroup.name = 'LibraryFloorGroup';
  scene.add(floorGroup);

  const checker = createCheckerboardMarbleTexture();
  const marbleFloorMat = new THREE.MeshStandardMaterial({
    map: checker.map,
    roughnessMap: checker.roughnessMap,
    roughness: 0.42,
    metalness: 0.08,
    envMapIntensity: 0.95,
  });

  const floorDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(HALL_RADIUS + 0.6, HALL_RADIUS + 1.0, 0.6, 48),
    marbleFloorMat
  );
  floorDisc.position.y = -0.3;
  floorDisc.receiveShadow = true;
  floorGroup.add(floorDisc);

  // Exterior conservatory ground plane beyond the glass walls
  const exteriorSoilMat = createPBRMaterial('grassSoil', {
    repeatX: 20,
    repeatY: 20,
    tint: '#4a6644',
    seed: 55,
  });
  const exteriorGround = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), exteriorSoilMat);
  exteriorGround.rotation.x = -Math.PI / 2;
  exteriorGround.position.y = -0.36;
  exteriorGround.receiveShadow = true;
  floorGroup.add(exteriorGround);

  // Outer stone floor border trim ring + brass inlay ring
  const outerBorder = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_PLAYABLE_RADIUS + 0.1, HALL_RADIUS + 0.2, 48),
    sandstoneMat
  );
  outerBorder.rotation.x = -Math.PI / 2;
  outerBorder.position.y = 0.008;
  outerBorder.receiveShadow = true;
  floorGroup.add(outerBorder);

  const brassArenaRing = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_PLAYABLE_RADIUS - 0.14, ARENA_PLAYABLE_RADIUS + 0.12, 64),
    brassMat
  );
  brassArenaRing.rotation.x = -Math.PI / 2;
  brassArenaRing.position.y = 0.012;
  floorGroup.add(brassArenaRing);

  // Subtle velvet-crimson carpet runners radiating N/S/E/W from the compass medallion
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const runnerGroup = new THREE.Group();
    runnerGroup.rotation.y = angle;

    const runnerLen = 11.4;
    const runner = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.018, runnerLen), carpetMat);
    runner.position.set(0, 0.009, -(5.2 + runnerLen * 0.5));
    runner.receiveShadow = true;
    runnerGroup.add(runner);

    for (const side of [-1.14, 1.14]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, runnerLen), carpetTrimMat);
      trim.position.set(side, 0.01, -(5.2 + runnerLen * 0.5));
      runnerGroup.add(trim);
    }
    floorGroup.add(runnerGroup);
  }

  // Central Inlaid Brass Compass-Rose Medallion + Pulsing Arcane Rune Ring
  const medallionTex = createCompassMedallionTexture();
  const medallionMat = new THREE.MeshStandardMaterial({
    map: medallionTex,
    transparent: true,
    roughness: 0.34,
    metalness: 0.58,
    envMapIntensity: 1.15,
  });
  const medallionMesh = new THREE.Mesh(new THREE.CircleGeometry(5.1, 48), medallionMat);
  medallionMesh.rotation.x = -Math.PI / 2;
  medallionMesh.position.y = 0.018;
  medallionMesh.receiveShadow = true;
  floorGroup.add(medallionMesh);

  const runeRingMat = new THREE.MeshBasicMaterial({
    color: 0x62f2c8,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const runeRing = new THREE.Mesh(new THREE.RingGeometry(4.82, 5.04, 64), runeRingMat);
  runeRing.rotation.x = -Math.PI / 2;
  runeRing.position.y = 0.024;
  floorGroup.add(runeRing);

  // 4. Perimeter Grand Victorian Library Bays (12-sided hall)
  // South bays (angles near +PI/2, i.e. sin(theta) > 0.55) stay LOW (stone/oak balustrade)
  // so the overhead-angled camera NEVER has sightline occlusion!
  const archGroup = new THREE.Group();
  archGroup.name = 'LibraryArchitecture';
  scene.add(archGroup);

  const bayChord = 2 * HALL_RADIUS * Math.sin(Math.PI / BAY_COUNT);
  const bayDist = HALL_RADIUS * Math.cos(Math.PI / BAY_COUNT);

  // Collect all 3D book transforms across all tall bookshelf bays into ONE InstancedMesh!
  interface BookTransform {
    matrix: THREE.Matrix4;
    color: THREE.Color;
  }
  const bookTransforms: BookTransform[] = [];
  const bookPalette = [
    new THREE.Color('#7a222c'), // Oxblood crimson
    new THREE.Color('#234c3d'), // Botanical emerald
    new THREE.Color('#1f3154'), // Midnight oxford navy
    new THREE.Color('#8f5c2a'), // Ochre saddle leather
    new THREE.Color('#5a2d50'), // Imperial plum
    new THREE.Color('#3b2820'), // Espresso folio
    new THREE.Color('#a67c37'), // Antique gilt parchment
    new THREE.Color('#2d5659'), // Deep teal
  ];

  const dummy = new THREE.Object3D();
  const pilasterGeo = new THREE.BoxGeometry(0.68, 8.6, 0.9);
  const lowPostGeo = new THREE.BoxGeometry(0.55, 1.15, 0.55);
  const balusterGeo = new THREE.CylinderGeometry(0.032, 0.032, 1.05, 6);

  for (let i = 0; i < BAY_COUNT; i++) {
    const theta = ((i + 0.5) / BAY_COUNT) * Math.PI * 2;
    const cx = Math.cos(theta) * bayDist;
    const cz = Math.sin(theta) * bayDist;
    // Is this bay on the southern camera side? (+Z is sin(theta) > 0)
    const isSouthOpenBay = Math.sin(theta) > 0.52; // 4 southern bays (45°, 75°, 105°, 135°)

    const bay = new THREE.Group();
    bay.position.set(cx, 0, cz);
    // Face inward toward (0,0,0): local +Z points inward toward origin
    bay.lookAt(0, 0, 0);
    archGroup.add(bay);

    if (isSouthOpenBay) {
      // Low carved sandstone & oak terrace balustrade — zero camera occlusion!
      const dwarfWall = new THREE.Mesh(new THREE.BoxGeometry(bayChord + 0.25, 0.72, 0.58), sandstoneMat);
      dwarfWall.position.set(0, 0.36, -0.2);
      dwarfWall.castShadow = true;
      dwarfWall.receiveShadow = true;
      bay.add(dwarfWall);

      const capRail = new THREE.Mesh(new THREE.BoxGeometry(bayChord + 0.36, 0.14, 0.72), oakMat);
      capRail.position.set(0, 0.78, -0.2);
      capRail.receiveShadow = true;
      bay.add(capRail);

      // Decorative low brass handrail bar
      const brassBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, bayChord + 0.1, 8),
        brassMat
      );
      brassBar.rotation.z = Math.PI / 2;
      brassBar.position.set(0, 1.08, -0.2);
      bay.add(brassBar);

      // Corner sandstone pedestals with brass finial spheres
      const post = new THREE.Mesh(lowPostGeo, sandstoneMat);
      post.position.set(bayChord * 0.5, 0.58, -0.2);
      post.castShadow = true;
      bay.add(post);

      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), brassMat);
      finial.position.set(bayChord * 0.5, 1.28, -0.2);
      bay.add(finial);
      continue;
    }

    // === DOUBLE-HEIGHT CARVED DARK OAK BOOKSHELF BAY ===
    const bayInnerW = bayChord - 0.85;

    // Back paneling
    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(bayChord + 0.2, 8.4, 0.3), darkOakMat);
    backPanel.position.set(0, 4.2, -0.78);
    backPanel.receiveShadow = true;
    bay.add(backPanel);

    // Lower baseboard plinth & waist molding
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(bayChord + 0.2, 0.48, 0.96), oakMat);
    plinth.position.set(0, 0.24, -0.36);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    bay.add(plinth);

    // Corner fluted dark oak pilasters
    for (const side of [-1, 1]) {
      const pilaster = new THREE.Mesh(pilasterGeo, oakMat);
      pilaster.position.set(side * (bayChord * 0.5), 4.3, -0.3);
      pilaster.castShadow = true;
      pilaster.receiveShadow = true;
      bay.add(pilaster);

      // Brass pilaster capitals
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.26, 1.04), brassMat);
      cap.position.set(side * (bayChord * 0.5), 8.55, -0.3);
      bay.add(cap);
    }

    // Center divider mullion
    const midDivider = new THREE.Mesh(new THREE.BoxGeometry(0.24, 8.2, 0.72), oakMat);
    midDivider.position.set(0, 4.1, -0.38);
    bay.add(midDivider);

    // 7 Horizontal Bookshelf Planks (4 lower tier + 3 upper mezzanine tier)
    const shelfHeights = [0.55, 1.48, 2.42, 3.36, 4.78, 5.82, 6.86];
    const shelfGeo = new THREE.BoxGeometry(bayInnerW + 0.1, 0.11, 0.72);
    for (const sy of shelfHeights) {
      const shelf = new THREE.Mesh(shelfGeo, oakMat);
      shelf.position.set(0, sy, -0.38);
      shelf.receiveShadow = true;
      bay.add(shelf);
    }

    // Upper cornice beam
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(bayChord + 0.35, 0.42, 1.18), oakMat);
    cornice.position.set(0, 8.2, -0.2);
    cornice.castShadow = true;
    bay.add(cornice);

    // Upper Mezzanine Balcony Deck + Wrought-Iron Gallery Railing at y = 4.28
    const balconyDeck = new THREE.Mesh(new THREE.BoxGeometry(bayChord + 0.1, 0.24, 1.55), oakMat);
    balconyDeck.position.set(0, 4.28, 0.38);
    balconyDeck.castShadow = true;
    balconyDeck.receiveShadow = true;
    bay.add(balconyDeck);

    // Brass top gallery handrail
    const railTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, bayChord, 8),
      brassMat
    );
    railTop.rotation.z = Math.PI / 2;
    railTop.position.set(0, 5.42, 1.08);
    bay.add(railTop);

    const railMid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, bayChord, 8),
      ironMat
    );
    railMid.rotation.z = Math.PI / 2;
    railMid.position.set(0, 4.52, 1.08);
    bay.add(railMid);

    // Wrought-iron vertical balusters
    const balCount = 12;
    for (let b = 0; b <= balCount; b++) {
      const bx = -bayChord * 0.46 + (b / balCount) * (bayChord * 0.92);
      const bal = new THREE.Mesh(balusterGeo, ironMat);
      bal.position.set(bx, 4.92, 1.08);
      bay.add(bal);
    }

    // Rolling Brass Library Ladder on alternating book bays
    if (i % 2 === 0) {
      const ladder = new THREE.Group();
      const lx = (i % 4 === 0 ? -1 : 1) * (bayInnerW * 0.22);
      ladder.position.set(lx, 0, 0.36);
      ladder.rotation.x = -0.15;

      for (const sx of [-0.26, 0.26]) {
        const stile = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 4.25, 8), brassMat);
        stile.position.set(sx, 2.12, 0);
        ladder.add(stile);
      }
      for (let r = 0; r < 9; r++) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.52, 6), brassMat);
        rung.rotation.z = Math.PI / 2;
        rung.position.set(0, 0.42 + r * 0.42, 0);
        ladder.add(rung);
      }
      bay.add(ladder);
    }

    // Soaring Victorian Arched Iron-and-Glass Clerestory Conservatory Frame ABOVE the cornice!
    // Curves gently upward along the outer perimeter (y = 8.4 -> 12.2), never crossing center!
    const archSpan = bayChord * 0.46;
    const archCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-archSpan, 8.4, -0.35),
      new THREE.Vector3(-archSpan * 0.86, 10.6, -0.05),
      new THREE.Vector3(0, 11.95, 0.55),
      new THREE.Vector3(archSpan * 0.86, 10.6, -0.05),
      new THREE.Vector3(archSpan, 8.4, -0.35),
    ]);
    const archRib = new THREE.Mesh(new THREE.TubeGeometry(archCurve, 20, 0.11, 8, false), ironMat);
    bay.add(archRib);

    // Translucent leaded conservatory glass clerestory transom
    const transomGlass = new THREE.Mesh(new THREE.PlaneGeometry(bayInnerW, 3.1), glassMat);
    transomGlass.position.set(0, 10.0, -0.2);
    bay.add(transomGlass);

    // Slender iron transom mullions
    for (const mx of [-bayInnerW * 0.25, 0, bayInnerW * 0.25]) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.2, 0.08), ironMat);
      mullion.position.set(mx, 10.0, -0.18);
      bay.add(mullion);
    }

    // Upward soaring conservatory vault rib stub curving up-and-in modestly (only 2.6u in, y=14.6)
    const vaultCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bayChord * 0.5, 8.5, -0.3),
      new THREE.Vector3(bayChord * 0.49, 11.6, 0.55),
      new THREE.Vector3(bayChord * 0.44, 14.1, 2.2),
    ]);
    const vaultRib = new THREE.Mesh(new THREE.TubeGeometry(vaultCurve, 14, 0.14, 8, false), ironMat);
    bay.add(vaultRib);

    // Populate shelf rows with hundreds of multi-colored 3D books!
    bay.updateMatrixWorld(true);
    const bayWorldMat = bay.matrixWorld;
    const shelfBookRows = [0.62, 1.55, 2.49, 4.85, 5.89, 6.93];

    for (const sy of shelfBookRows) {
      for (const halfSide of [-1, 1]) {
        const startX = halfSide < 0 ? -bayInnerW * 0.47 : 0.22;
        const endX = halfSide < 0 ? -0.22 : bayInnerW * 0.47;
        let cursor = startX;
        while (cursor < endX - 0.22) {
          // Occasional small sculptural gap on shelf
          if (rand() < 0.08) {
            cursor += 0.24 + rand() * 0.25;
            continue;
          }
          const bThick = 0.11 + rand() * 0.14;
          const bHeight = 0.46 + rand() * 0.34;
          const bDepth = 0.42 + rand() * 0.16;
          const lean = rand() < 0.12 ? (rand() - 0.5) * 0.22 : 0;

          dummy.position.set(cursor + bThick * 0.5, sy + bHeight * 0.5, -0.34 + (rand() - 0.5) * 0.08);
          dummy.rotation.set(0, (rand() - 0.5) * 0.06, lean);
          dummy.scale.set(bThick, bHeight, bDepth);
          dummy.updateMatrix();

          const worldM = new THREE.Matrix4().multiplyMatrices(bayWorldMat, dummy.matrix);
          const baseCol = bookPalette[Math.floor(rand() * bookPalette.length)].clone();
          baseCol.offsetHSL((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.08);
          bookTransforms.push({ matrix: worldM, color: baseCol });

          cursor += bThick + 0.015;
        }
      }
    }

    // Antique reading lecterns nestled beside 3 northern bays (outside playable radius)
    if (i === 7 || i === 9 || i === 11) {
      const lectern = buildReadingLectern(oakMat, brassMat, pageMat, coverMat);
      lectern.position.set(0, 0, 1.35);
      bay.add(lectern);
    }
  }

  // Create single InstancedMesh for ALL 3D book spines (~750+ leather-bound books in 1 draw call!)
  const spineTex = createBookSpineTexture();
  const bookGeo = new THREE.BoxGeometry(1, 1, 1);
  const bookMat = new THREE.MeshStandardMaterial({
    map: spineTex,
    roughness: 0.52,
    metalness: 0.12,
  });
  const booksInstanced = new THREE.InstancedMesh(bookGeo, bookMat, bookTransforms.length);
  booksInstanced.castShadow = false;
  booksInstanced.receiveShadow = true;
  for (let i = 0; i < bookTransforms.length; i++) {
    booksInstanced.setMatrixAt(i, bookTransforms[i].matrix);
    booksInstanced.setColorAt(i, bookTransforms[i].color);
  }
  booksInstanced.instanceMatrix.needsUpdate = true;
  if (booksInstanced.instanceColor) booksInstanced.instanceColor.needsUpdate = true;
  archGroup.add(booksInstanced);

  // 5. Lush Botanical Conservatory Flora — 4 Stone-Rimmed Indoor Garden Beds!
  const floraGroup = new THREE.Group();
  floraGroup.name = 'ConservatoryFlora';
  scene.add(floraGroup);

  const trees: DetailedTree[] = [];
  const grassFields: GrassField[] = [];
  const wildflowerPatches: WildflowerPatch[] = [];
  const lanternLights: Array<{ light: THREE.PointLight; baseIntensity: number; phase: number }> = [];

  const bedConfigs: Array<{
    bed: ArenaObstacle;
    style: 'oak' | 'olive' | 'bonsai';
    bonsaiVariant?: 'emerald' | 'maple';
    height: number;
    seed: number;
    pedestal: boolean;
  }> = [
    { bed: GARDEN_BEDS[0], style: 'oak', height: 6.1, seed: 8101, pedestal: false },
    { bed: GARDEN_BEDS[1], style: 'olive', height: 5.7, seed: 8202, pedestal: false },
    { bed: GARDEN_BEDS[2], style: 'bonsai', bonsaiVariant: 'emerald', height: 2.8, seed: 8303, pedestal: true },
    { bed: GARDEN_BEDS[3], style: 'bonsai', bonsaiVariant: 'maple', height: 2.8, seed: 8404, pedestal: true },
  ];

  for (let idx = 0; idx < bedConfigs.length; idx++) {
    const cfg = bedConfigs[idx];
    const { x, z, radius } = cfg.bed;
    const bedGroup = new THREE.Group();
    bedGroup.position.set(x, 0, z);
    floraGroup.add(bedGroup);

    // Molded circular stone curb rim
    const curbOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius + 0.14, 0.56, 28),
      sandstoneMat
    );
    curbOuter.position.y = 0.28;
    curbOuter.castShadow = true;
    curbOuter.receiveShadow = true;
    bedGroup.add(curbOuter);

    // Top stone lip molding
    const curbLip = new THREE.Mesh(
      new THREE.TorusGeometry(radius - 0.06, 0.12, 10, 32),
      sandstoneMat
    );
    curbLip.rotation.x = Math.PI / 2;
    curbLip.position.y = 0.56;
    curbLip.receiveShadow = true;
    bedGroup.add(curbLip);

    // Brass accent ring around base of planter
    const brassCollar = new THREE.Mesh(
      new THREE.TorusGeometry(radius + 0.09, 0.035, 8, 32),
      brassMat
    );
    brassCollar.rotation.x = Math.PI / 2;
    brassCollar.position.y = 0.1;
    bedGroup.add(brassCollar);

    // Rich dark soil mound inside stone planter
    const soilMound = new THREE.Mesh(
      new THREE.CylinderGeometry(radius - 0.16, radius - 0.12, 0.52, 24),
      soilMat
    );
    soilMound.position.y = 0.29;
    soilMound.receiveShadow = true;
    bedGroup.add(soilMound);

    // Hero conservatory tree specimen
    let treeY = 0.52;
    if (cfg.pedestal) {
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.45, 12), sandstoneMat);
      plinth.position.y = 0.72;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      bedGroup.add(plinth);
      treeY = 0.94;
    }

    const tree = createDetailedTree({
      style: cfg.style,
      height: cfg.height,
      seed: cfg.seed,
      canopyDensity: cfg.style === 'bonsai' ? 1.15 : 1.05,
      includePot: cfg.style === 'bonsai',
      bonsaiVariant: cfg.bonsaiVariant,
      castShadow: true,
      receiveShadow: true,
    });
    tree.group.position.set(0, treeY, 0);
    tree.group.rotation.y = idx * 1.45;
    bedGroup.add(tree.group);
    trees.push(tree);

    // Arching lush fern clusters bursting around the bed perimeter
    const fernCount = 5;
    for (let f = 0; f < fernCount; f++) {
      const fa = (f / fernCount) * Math.PI * 2 + idx * 0.4;
      const fr = radius * 0.62;
      const fern = createFernCluster({
        frondCount: 11,
        radius: 0.95 + (f % 2) * 0.25,
        height: 0.72 + (f % 2) * 0.18,
        color: f % 2 === 0 ? '#3a7a48' : '#4f8f54',
        seed: cfg.seed + f * 37,
        castShadow: true,
      });
      fern.position.set(Math.cos(fa) * fr, 0.52, Math.sin(fa) * fr);
      fern.rotation.y = fa;
      bedGroup.add(fern);
    }

    // Mossy conservatory fountain boulders tucked inside each planter
    const boulderAngle = idx * Math.PI * 0.5 + 0.8;
    const boulder = createMossyBoulder({
      radius: 0.62,
      mossAmount: 0.72,
      stoneTint: '#8e8a7f',
      mossColor: '#487d44',
      includeAccentStones: true,
      seed: cfg.seed + 501,
      castShadow: true,
    });
    boulder.position.set(
      Math.cos(boulderAngle) * (radius * 0.52),
      0.55,
      Math.sin(boulderAngle) * (radius * 0.52)
    );
    bedGroup.add(boulder);

    // Interactive mossy grass tufts inside each bed
    const bedGrass = createGrassField({
      center: [x, z],
      radius: radius - 0.28,
      count: 680,
      heightAt: () => 0.53,
      bladeHeightRange: [0.22, 0.44],
      bladeWidth: 0.055,
      baseColor: '#264d2b',
      tipColor: '#6da85b',
      dryColor: '#8d9b58',
      windStrength: 0.35,
      pushRadius: 1.5,
      pushStrength: 0.75,
      seed: cfg.seed + 700,
    });
    floraGroup.add(bedGrass.mesh);
    grassFields.push(bedGrass);

    // Jewel-toned conservatory wildflowers in each bed
    const flowers = createWildflowerPatch({
      center: [x, z],
      radius: radius - 0.34,
      count: 65,
      heightAt: () => 0.54,
      palette: ['#f6e3a1', '#e88da3', '#7bd3be', '#f7f3e3', '#e5a95d'],
      scaleRange: [0.75, 1.25],
      seed: cfg.seed + 900,
    });
    floraGroup.add(flowers.group);
    wildflowerPatches.push(flowers);

    // Ornate standing Victorian brass library lamp right beside the inward corner of each garden bed
    const dirToCenter = new THREE.Vector2(-x, -z).normalize();
    const lamp = createLantern('brass_lamp', {
      scale: 1.08,
      withLight: true,
      lightIntensity: 4.8,
      lightDistance: 14.5,
      lightColor: 0xffb85a,
      castShadow: false,
    });
    lamp.position.set(
      dirToCenter.x * (radius - 0.38),
      0.54,
      dirToCenter.y * (radius - 0.38)
    );
    bedGroup.add(lamp);
    const lgt = lamp.userData.light as THREE.PointLight | undefined;
    if (lgt) {
      lanternLights.push({ light: lgt, baseIntensity: 4.8, phase: idx * 1.7 });
    }
  }

  // Lush mossy grass & fern border accents tucked along the northern & side library plinths
  const perimeterGrass = createGrassField({
    center: [0, 0],
    radius: HALL_RADIUS - 0.8,
    count: 1400,
    mask: (gx, gz) => {
      const r = Math.hypot(gx, gz);
      return r > ARENA_PLAYABLE_RADIUS + 0.18 && r < HALL_RADIUS - 0.9 && gz < 12;
    },
    heightAt: () => 0.02,
    bladeHeightRange: [0.18, 0.36],
    bladeWidth: 0.05,
    baseColor: '#254c2e',
    tipColor: '#67a662',
    dryColor: '#7b995e',
    windStrength: 0.25,
    pushRadius: 1.6,
    pushStrength: 0.8,
    seed: 8811,
  });
  floraGroup.add(perimeterGrass.mesh);
  grassFields.push(perimeterGrass);

  const perimeterFlowers = createWildflowerPatch({
    center: [0, 0],
    radius: HALL_RADIUS - 0.9,
    count: 120,
    mask: (gx, gz) => {
      const r = Math.hypot(gx, gz);
      return r > ARENA_PLAYABLE_RADIUS + 0.25 && r < HALL_RADIUS - 1.0 && gz < 12;
    },
    heightAt: () => 0.03,
    palette: ['#f4df9b', '#82dbc2', '#e88d9c', '#fff7e2'],
    scaleRange: [0.7, 1.15],
    seed: 8822,
  });
  floraGroup.add(perimeterFlowers.group);
  wildflowerPatches.push(perimeterFlowers);

  // Exterior conservatory botanical backdrop grove outside the north/west/east leaded-glass windows
  const exteriorTreeSpots: Array<{ x: number; z: number; style: 'oak' | 'olive' | 'maple_autumn'; h: number }> = [
    { x: -12, z: -24.5, style: 'oak', h: 11.5 },
    { x: 0, z: -26.0, style: 'olive', h: 10.8 },
    { x: 12, z: -24.5, style: 'maple_autumn', h: 11.2 },
    { x: -24.5, z: -10.5, style: 'olive', h: 10.2 },
    { x: 24.5, z: -10.5, style: 'oak', h: 10.6 },
  ];
  for (let i = 0; i < exteriorTreeSpots.length; i++) {
    const spot = exteriorTreeSpots[i];
    const extTree = createDetailedTree({
      style: spot.style,
      height: spot.h,
      seed: 9100 + i * 73,
      canopyDensity: 0.9,
      castShadow: false,
      receiveShadow: false,
    });
    extTree.group.position.set(spot.x, -0.35, spot.z);
    floraGroup.add(extTree.group);
    trees.push(extTree);
  }

  // 6. 4 Ornate Suspended Wrought-Iron Candle Chandeliers (positioned along northern/side bays — ZERO center occlusion!)
  const chandelierSpots: Array<[number, number, number]> = [
    [-6.2, 5.8, -13.6],
    [6.2, 5.8, -13.6],
    [-14.6, 5.8, -2.6],
    [14.6, 5.8, -2.6],
  ];
  const chandelierFlames: Array<{ mesh: THREE.Mesh; baseY: number; phase: number }> = [];

  for (let i = 0; i < chandelierSpots.length; i++) {
    const [cx, cy, cz] = chandelierSpots[i];
    const chand = buildCandleChandelier(ironMat, brassMat, waxMat, flameMat, true);
    chand.group.position.set(cx, cy, cz);
    archGroup.add(chand.group);

    for (let f = 0; f < chand.flames.length; f++) {
      chandelierFlames.push({
        mesh: chand.flames[f],
        baseY: chand.flames[f].position.y,
        phase: i * 2.1 + f * 0.9,
      });
    }
    if (chand.light) {
      lanternLights.push({ light: chand.light, baseIntensity: 7.5, phase: i * 2.3 + 0.5 });
    }
  }

  // 7. Ambient Sunlit Dust Motes, Conservatory Fireflies, Combat Sparks & Victory Confetti
  const dustParticles = createParticleSystem({
    type: 'dust',
    count: 260,
    bounds: { width: 38, height: 9, depth: 36 },
    center: new THREE.Vector3(0, 4.2, -1),
    size: 0.11,
    colors: ['#fff2cc', '#f3d997', '#d8f2e6'],
    ambient: true,
    burstCapacity: 0,
  });
  scene.add(dustParticles.group);

  const fireflies = createParticleSystem({
    type: 'fireflies',
    count: 68,
    bounds: { width: 34, height: 4.5, depth: 32 },
    center: new THREE.Vector3(0, 2.2, -1),
    size: 0.24,
    colors: ['#ffd97d', '#7af2cb', '#ffbe66'],
    ambient: true,
    burstCapacity: 48,
  });
  scene.add(fireflies.group);

  const sparks = createParticleSystem({
    type: 'sparks',
    count: 0,
    bounds: { width: 42, height: 10, depth: 42 },
    center: new THREE.Vector3(0, 1.2, 0),
    size: 0.22,
    colors: ['#ffd970', '#6fffe9', '#ff6e7f', '#ffffff'],
    ambient: false,
    burstCapacity: 240,
  });
  scene.add(sparks.group);

  const confetti = createParticleSystem({
    type: 'confetti',
    count: 0,
    bounds: { width: 40, height: 14, depth: 40 },
    center: new THREE.Vector3(0, 2, 0),
    size: 0.16,
    colors: ['#f2c96b', '#5fe0b5', '#c84b60', '#f7eed9', '#67b8ff'],
    ambient: false,
    burstCapacity: 180,
  });
  scene.add(confetti.group);

  disposables.push(
    checker.map,
    checker.roughnessMap,
    spineTex,
    medallionTex,
    dustParticles,
    fireflies,
    sparks,
    confetti,
    atmosphere
  );

  let runeTargetIntensity = 0.32;
  let runeCurrentIntensity = 0.32;

  return {
    playableRadius: ARENA_PLAYABLE_RADIUS,
    obstacles: GARDEN_BEDS,
    atmosphere,
    sparks,
    confetti,
    setRuneIntensity(intensity: number) {
      runeTargetIntensity = intensity;
    },
    update(dt: number, elapsed: number, playerPos: THREE.Vector3, cameraPos: THREE.Vector3) {
      updateFoliageWind(elapsed, 0.55);
      atmosphere.update(elapsed, cameraPos);

      for (const t of trees) t.update(elapsed);
      for (const g of grassFields) g.update(elapsed, playerPos);
      for (const w of wildflowerPatches) w.update(elapsed);

      // Warm organic candlelight flicker
      for (const ll of lanternLights) {
        const flick =
          Math.sin(elapsed * 6.5 + ll.phase) * 0.08 +
          Math.sin(elapsed * 13.7 + ll.phase * 1.7) * 0.05;
        ll.light.intensity = ll.baseIntensity * (1 + flick);
      }
      for (const fl of chandelierFlames) {
        const s = 0.9 + Math.sin(elapsed * 11 + fl.phase) * 0.16;
        fl.mesh.scale.set(0.92 + (s - 0.9) * 0.4, s, 0.92 + (s - 0.9) * 0.4);
      }

      // Subtle arcane pulse on center brass compass rune ring
      runeCurrentIntensity += (runeTargetIntensity - runeCurrentIntensity) * (1 - Math.exp(-5 * dt));
      runeRingMat.opacity = runeCurrentIntensity * (0.85 + Math.sin(elapsed * 2.4) * 0.15);
      runeRing.rotation.z = elapsed * 0.12;

      dustParticles.update(dt);
      fireflies.update(dt);
      sparks.update(dt);
      confetti.update(dt);
    },
    dispose() {
      for (const t of trees) t.dispose();
      for (const g of grassFields) g.dispose();
      for (const w of wildflowerPatches) w.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

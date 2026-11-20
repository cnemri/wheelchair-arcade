import * as THREE from 'three';
import {
  createBambooCluster,
  createFernCluster,
  createForest,
  createGrassField,
  createLantern,
  createMossyBoulder,
  createPBRMaterial,
  createWaterSurface,
  createWildflowerPatch,
  updateFoliageWind,
  type AtmosphereRig,
  type BambooCluster,
  type ForestBatch,
  type GrassField,
  type WaterSurface,
  type WildflowerPatch,
} from '../../art';
import type { MountainTrack } from './track';

export interface SceneryController {
  readonly group: THREE.Group;
  update(time: number, dt: number, playerPos: THREE.Vector3, activeApexId: number, activeCheckpointIdx: number): void;
  flashCheckpointGate(checkpointIdx: number): void;
  dispose(): void;
}

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

function createShrinePlaqueTexture(kanji: string, subText: string): THREE.CanvasTexture {
  const w = 256;
  const h = 384;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Lacquered deep ebony wood backing
  ctx.fillStyle = '#1d1614';
  ctx.fillRect(0, 0, w, h);

  // Inner dark crimson panel
  ctx.fillStyle = '#2c1715';
  ctx.fillRect(16, 16, w - 32, h - 32);

  // Ornate brushed gold border frame & corner motifs
  ctx.strokeStyle = '#dfb04b';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, w - 48, h - 48);

  // Vertical gilded kanji calligraphy
  ctx.fillStyle = '#f5d178';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 68px serif';
  const chars = Array.from(kanji);
  const startY = h * 0.5 - ((chars.length - 1) * 76) * 0.5 - 12;
  chars.forEach((ch, idx) => {
    ctx.fillText(ch, w * 0.5, startY + idx * 76);
  });

  // Subtle bottom Latin subtitle
  ctx.fillStyle = '#d4a656';
  ctx.font = '600 18px sans-serif';
  ctx.fillText(subText, w * 0.5, h - 42);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createBoostChevronTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#241812';
  ctx.fillRect(0, 0, size, size);

  // Warm inlaid brass rails on sides
  ctx.fillStyle = '#c8923a';
  ctx.fillRect(8, 0, 14, size);
  ctx.fillRect(size - 22, 0, 14, size);

  // Two bold glowing golden-vermilion chevrons pointing toward -V (forward)
  for (let row = 0; row < 2; row++) {
    const cy = row * 128 + 64;
    const grad = ctx.createLinearGradient(0, cy - 42, 0, cy + 42);
    grad.addColorStop(0, '#fff2ad');
    grad.addColorStop(0.5, '#ff9d2e');
    grad.addColorStop(1, '#d43d1a');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, cy - 42);
    ctx.lineTo(size - 38, cy + 12);
    ctx.lineTo(size - 38, cy + 40);
    ctx.lineTo(size * 0.5, cy - 12);
    ctx.lineTo(38, cy + 40);
    ctx.lineTo(38, cy + 12);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function createApexStripTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, w, h);
  // Subtle translucent golden-vermilion apex racing line dashes
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(255, 165, 58, 0.0)');
  grad.addColorStop(0.25, 'rgba(255, 178, 72, 0.85)');
  grad.addColorStop(0.5, 'rgba(255, 224, 130, 0.95)');
  grad.addColorStop(0.75, 'rgba(232, 92, 42, 0.85)');
  grad.addColorStop(1, 'rgba(232, 92, 42, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 26, w, 172);

  // Subtle chevron notch in middle
  ctx.fillStyle = 'rgba(255, 245, 210, 0.75)';
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 52);
  ctx.lineTo(w * 0.82, 118);
  ctx.lineTo(w * 0.68, 118);
  ctx.lineTo(w * 0.5, 82);
  ctx.lineTo(w * 0.32, 118);
  ctx.lineTo(w * 0.18, 118);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

interface ToriiGateRef {
  group: THREE.Group;
  shimmerMat: THREE.MeshBasicMaterial;
  flashTimer: number;
}

/**
 * Builds an ornate multi-part Myōjin-style vermilion Kyoto Torii Gate spanning the road.
 */
function buildToriiGate(
  spanWidth: number,
  height: number,
  kanji: string,
  subText: string,
  isGrandStart: boolean,
): ToriiGateRef {
  const group = new THREE.Group();
  group.name = `ToriiGate_${subText}`;

  const vermilionMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c93420'),
    roughness: 0.42,
    metalness: 0.08,
  });
  const blackLacquerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1f1c1c'),
    roughness: 0.34,
    metalness: 0.22,
  });
  const graniteMat = createPBRMaterial('rock', {
    repeatX: 1,
    repeatY: 1,
    color: '#787772',
    roughness: 0.92,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#e3b34c'),
    roughness: 0.3,
    metalness: 0.82,
  });
  const ropeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c8a768'),
    roughness: 0.92,
  });
  const paperMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f7f1e3'),
    roughness: 0.78,
    side: THREE.DoubleSide,
  });

  const halfSpan = spanWidth * 0.5;
  const pillarRBot = isGrandStart ? 0.54 : 0.44;
  const pillarRTop = isGrandStart ? 0.42 : 0.34;
  const pillarGeo = new THREE.CylinderGeometry(pillarRTop, pillarRBot, height, 16);
  const plinthGeo = new THREE.CylinderGeometry(pillarRBot * 1.18, pillarRBot * 1.52, 1.35, 12);
  const collarGeo = new THREE.TorusGeometry(pillarRTop * 1.16, 0.09, 10, 18);

  for (const side of [-1, 1]) {
    // Deep granite kamebara base plinth
    const plinth = new THREE.Mesh(plinthGeo, graniteMat);
    plinth.position.set(side * (halfSpan + 0.14), 0.35, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    // Subtle inward lean (korobi) characteristic of authentic Myōjin Torii
    const pillar = new THREE.Mesh(pillarGeo, vermilionMat);
    pillar.position.set(side * halfSpan, height * 0.5, 0);
    pillar.rotation.z = side * 0.032;
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);

    // Black collar ring (daiwa) at pillar top
    const collar = new THREE.Mesh(collarGeo, blackLacquerMat);
    collar.position.set(side * (halfSpan - 0.14), height - 0.48, 0);
    collar.rotation.x = Math.PI * 0.5;
    group.add(collar);
  }

  // Lower horizontal tie beam (nuki) extending cleanly past pillars + black kusabi wedges
  const nukiLen = spanWidth + 3.4;
  const nukiY = height - 1.75;
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(nukiLen, 0.56, 0.48), vermilionMat);
  nuki.position.set(0, nukiY, 0);
  nuki.castShadow = true;
  nuki.receiveShadow = true;
  group.add(nuki);

  for (const side of [-1, 1]) {
    const endCap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.54), blackLacquerMat);
    endCap.position.set(side * (nukiLen * 0.5), nukiY, 0);
    group.add(endCap);

    const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.24, 0.68), blackLacquerMat);
    wedge.position.set(side * (halfSpan - 0.08), nukiY + 0.22, 0);
    group.add(wedge);
  }

  // Sculpted upturned sweeping top lintel (kasagi + shimaki) built from curved segments
  const kasagiSpan = spanWidth + 5.2;
  const lintelSegs = 22;
  const buildCurvedBeam = (
    yBase: number,
    thickness: number,
    depth: number,
    curveRise: number,
    mat: THREE.Material,
  ) => {
    const beamGroup = new THREE.Group();
    const segW = kasagiSpan / lintelSegs;
    for (let i = 0; i < lintelSegs; i++) {
      const u0 = (i / lintelSegs) * 2 - 1;
      const u1 = ((i + 1) / lintelSegs) * 2 - 1;
      const uMid = (u0 + u1) * 0.5;
      const x = uMid * (kasagiSpan * 0.5);
      const y0 = yBase + Math.pow(Math.abs(u0), 2.35) * curveRise;
      const y1 = yBase + Math.pow(Math.abs(u1), 2.35) * curveRise;
      const yMid = (y0 + y1) * 0.5;
      const angle = Math.atan2(y1 - y0, segW);

      const segMesh = new THREE.Mesh(
        new THREE.BoxGeometry(segW * 1.07, thickness, depth),
        mat,
      );
      segMesh.position.set(x, yMid, 0);
      segMesh.rotation.z = angle;
      segMesh.castShadow = true;
      segMesh.receiveShadow = true;
      beamGroup.add(segMesh);
    }
    return beamGroup;
  };

  // Vermilion lower lintel (shimaki) + dark lacquered upturned cap roof (kasagi)
  group.add(buildCurvedBeam(height - 0.1, 0.48, 0.78, 0.92, vermilionMat));
  group.add(buildCurvedBeam(height + 0.34, 0.42, 1.08, 1.15, blackLacquerMat));

  // Central strut (gakuzuka) + gilded calligraphic Shrine Plaque (hen-gaku)
  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.75, 0.42), vermilionMat);
  strut.position.set(0, height - 0.9, 0);
  strut.castShadow = true;
  group.add(strut);

  const plaqueTex = createShrinePlaqueTexture(kanji, subText);
  const plaqueFaceMat = new THREE.MeshStandardMaterial({
    map: plaqueTex,
    roughness: 0.46,
    metalness: 0.14,
  });
  const plaqueW = isGrandStart ? 1.52 : 1.24;
  const plaqueH = isGrandStart ? 2.15 : 1.78;
  const plaqueFrame = new THREE.Mesh(
    new THREE.BoxGeometry(plaqueW + 0.16, plaqueH + 0.16, 0.2),
    goldMat,
  );
  plaqueFrame.position.set(0, height - 0.95, 0);
  plaqueFrame.castShadow = true;
  group.add(plaqueFrame);

  for (const faceZ of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(plaqueW, plaqueH), plaqueFaceMat);
    face.position.set(0, height - 0.95, faceZ * 0.11);
    if (faceZ < 0) face.rotation.y = Math.PI;
    group.add(face);
  }

  // Hanging braided Shimenawa sacred rope + folded paper Shide streamers
  const ropePts: THREE.Vector3[] = [];
  const ropeSpan = spanWidth - 1.1;
  for (let i = 0; i <= 16; i++) {
    const u = (i / 16) * 2 - 1;
    const rx = u * (ropeSpan * 0.5);
    const sag = (1 - u * u) * 0.85;
    ropePts.push(new THREE.Vector3(rx, nukiY - 0.32 - sag, 0.24));
  }
  const ropeCurve = new THREE.CatmullRomCurve3(ropePts);
  const ropeMesh = new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 24, 0.13, 8, false), ropeMat);
  ropeMesh.castShadow = true;
  group.add(ropeMesh);

  // White folded zig-zag paper shide streamers hanging from rope
  const shidePositions = [-0.62, -0.32, 0, 0.32, 0.62];
  for (const sp of shidePositions) {
    const sx = sp * (ropeSpan * 0.5);
    const sy = nukiY - 0.42 - (1 - sp * sp) * 0.85;
    const shideGroup = new THREE.Group();
    shideGroup.position.set(sx, sy, 0.24);
    for (let k = 0; k < 3; k++) {
      const tab = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.26), paperMat);
      tab.position.set((k % 2 === 0 ? -1 : 1) * 0.05, -0.15 - k * 0.22, 0);
      tab.rotation.z = (k % 2 === 0 ? 1 : -1) * 0.34;
      shideGroup.add(tab);
    }
    group.add(shideGroup);
  }

  // Subtle glowing golden checkpoint arch ribbon (flashes brightly when player passes through!)
  const shimmerGeo = new THREE.PlaneGeometry(spanWidth - 1.2, height - 1.9);
  const shimmerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffbe55'),
    transparent: true,
    opacity: 0.04,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shimmer = new THREE.Mesh(shimmerGeo, shimmerMat);
  shimmer.position.set(0, (height - 1.9) * 0.5, 0);
  group.add(shimmer);

  return { group, shimmerMat, flashTimer: 0 };
}

/**
 * Builds an atmospheric Kyoto Mountain Shrine Teahouse & Wooden Overlook Deck
 * perched dramatically beside the Valley Overlook Hairpin.
 */
function buildKyotoTeahouse(): THREE.Group {
  const house = new THREE.Group();
  house.name = 'KyotoOverlookTeahouse';

  const woodMat = createPBRMaterial('woodPlanks', {
    repeatX: 2,
    repeatY: 2,
    color: '#6e4930',
    roughness: 0.78,
  });
  const darkTimberMat = new THREE.MeshStandardMaterial({
    color: '#342319',
    roughness: 0.72,
  });
  const roofMat = createPBRMaterial('roofTiles', {
    repeatX: 4,
    repeatY: 3,
    color: '#4c5258',
    roughness: 0.7,
  });
  const shojiMat = new THREE.MeshStandardMaterial({
    color: '#fff3d6',
    emissive: '#ffae42',
    emissiveIntensity: 1.45,
    roughness: 0.65,
  });
  const umbrellaMat = new THREE.MeshStandardMaterial({
    color: '#c92e24',
    roughness: 0.58,
    side: THREE.DoubleSide,
  });
  const creamMat = new THREE.MeshStandardMaterial({
    color: '#ece2cf',
    roughness: 0.88,
  });

  // Elevated timber veranda deck + deep stilt supports anchoring into cliff slope
  const deckW = 11.5;
  const deckD = 7.4;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.36, deckD), woodMat);
  deck.position.set(0, 0.2, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  house.add(deck);

  for (const sx of [-4.8, -1.6, 1.6, 4.8]) {
    for (const sz of [-3.0, 3.0]) {
      const stilt = new THREE.Mesh(new THREE.BoxGeometry(0.32, 8.0, 0.32), darkTimberMat);
      stilt.position.set(sx, -3.8, sz);
      stilt.castShadow = true;
      house.add(stilt);
    }
  }

  // Timber veranda railing along the valley overlook edge
  const railPostGeo = new THREE.BoxGeometry(0.14, 1.0, 0.14);
  for (let i = 0; i <= 6; i++) {
    const rx = -5.2 + (i / 6) * 10.4;
    const p = new THREE.Mesh(railPostGeo, darkTimberMat);
    p.position.set(rx, 0.88, 3.45);
    p.castShadow = true;
    house.add(p);
  }
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.1, 0.16), darkTimberMat);
  topRail.position.set(0, 1.32, 3.45);
  house.add(topRail);

  // Main pavilion room with glowing shoji paper screens & timber lattice
  const bodyW = 7.6;
  const bodyH = 3.2;
  const bodyD = 4.6;
  const wallBase = new THREE.Mesh(new THREE.BoxGeometry(bodyW, 0.72, bodyD), creamMat);
  wallBase.position.set(-0.9, 0.74, -0.6);
  wallBase.castShadow = true;
  wallBase.receiveShadow = true;
  house.add(wallBase);

  const shojiCore = new THREE.Mesh(new THREE.BoxGeometry(bodyW - 0.16, 2.35, bodyD - 0.16), shojiMat);
  shojiCore.position.set(-0.9, 2.25, -0.6);
  house.add(shojiCore);

  // Dark timber corner columns & shoji mullions
  for (const cx of [-4.7, -2.2, 0.4, 2.9]) {
    for (const cz of [-2.9, 1.7]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.22, bodyH + 0.3, 0.22), darkTimberMat);
      col.position.set(cx, 1.9, cz);
      col.castShadow = true;
      house.add(col);
    }
  }

  // Two-tier sweeping Japanese tiled irimoya roof
  const lowerRoof = new THREE.Mesh(new THREE.ConeGeometry(6.8, 1.75, 4), roofMat);
  lowerRoof.position.set(-0.9, 4.3, -0.6);
  lowerRoof.rotation.y = Math.PI * 0.25;
  lowerRoof.scale.set(1.22, 1.0, 0.88);
  lowerRoof.castShadow = true;
  lowerRoof.receiveShadow = true;
  house.add(lowerRoof);

  const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.28, 0.34), darkTimberMat);
  ridgeBeam.position.set(-0.9, 5.2, -0.6);
  house.add(ridgeBeam);

  // Traditional Vermilion Tea Umbrella (Wagasa) & wooden bench on the open terrace corner
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.75, 8), darkTimberMat);
  pole.position.set(3.85, 1.75, 1.05);
  pole.castShadow = true;
  house.add(pole);

  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.56, 16, 1, true), umbrellaMat);
  canopy.position.set(3.85, 3.05, 1.05);
  canopy.castShadow = true;
  house.add(canopy);

  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.44, 0.65), woodMat);
  bench.position.set(3.85, 0.6, 1.05);
  bench.castShadow = true;
  house.add(bench);

  return house;
}

export function buildKyotoScenery(
  track: MountainTrack,
  atmosphere: AtmosphereRig,
): SceneryController {
  const group = new THREE.Group();
  group.name = 'KyotoAutumnScenery';

  const rng = mulberry32(202601);
  const forestBatches: ForestBatch[] = [];
  const bambooClusters: BambooCluster[] = [];
  const grassFields: GrassField[] = [];
  const wildflowerPatches: WildflowerPatch[] = [];
  let valleyWater: WaterSurface | null = null;

  // -------------------------------------------------------------------------
  // 1. 3 Ornate Multi-Part Vermilion Torii Gates at Start/Finish & Checkpoints
  // -------------------------------------------------------------------------
  const toriiSpecs = [
    { cpIdx: 0, kanji: '紅葉峠', sub: 'MOMIJI TOUGE', grand: true },
    { cpIdx: 1, kanji: '竹林坂', sub: 'BAMBOO PASS', grand: false },
    { cpIdx: 2, kanji: '渓谷見', sub: 'VALLEY GATE', grand: false },
  ];
  const toriiRefs: ToriiGateRef[] = [];

  for (const spec of toriiSpecs) {
    const cp = track.checkpoints[spec.cpIdx];
    const f = track.sampleAtArc(cp.arcDist);
    const gateSpan = track.curbOuterWidth * 2 + 1.4;
    const gateH = spec.grand ? 8.2 : 7.1;
    const ref = buildToriiGate(gateSpan, gateH, spec.kanji, spec.sub, spec.grand);

    ref.group.position.copy(f.position);
    // Align Torii gate perpendicular to road tangent with front shimenawa rope facing oncoming racers (-tangent)
    const yaw = Math.atan2(-f.tangent.x, -f.tangent.z);
    ref.group.rotation.y = yaw;
    group.add(ref.group);
    toriiRefs.push(ref);

    // Pair of grand stone Tōrō lanterns flanking every Torii Gate!
    for (const side of [-1, 1]) {
      const lat = side * (track.curbOuterWidth + 2.2);
      const lx = f.position.x + f.right.x * lat - f.tangent.x * 2.1;
      const lz = f.position.z + f.right.z * lat - f.tangent.z * 2.1;
      const ly = Math.max(f.position.y - 0.15, track.terrainHeightAt(lx, lz));
      const lantern = createLantern('stone_toro', {
        scale: spec.grand ? 1.38 : 1.18,
        withLight: spec.grand,
        lightIntensity: 3.2,
        lightDistance: 14,
      });
      lantern.position.set(lx, ly, lz);
      group.add(lantern);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Glowing Apex Drift Zones (Painted Apex Ribbons + Shrine Flags + Beacons)
  // -------------------------------------------------------------------------
  const apexTex = createApexStripTexture();
  const apexStripMats: THREE.MeshBasicMaterial[] = [];
  const apexBeaconMats: THREE.MeshStandardMaterial[] = [];
  const bannerMeshes: { mesh: THREE.Mesh; phase: number; baseRotY: number }[] = [];

  const poleMat = new THREE.MeshStandardMaterial({ color: '#5c462e', roughness: 0.82 });
  const flagGeo = new THREE.PlaneGeometry(0.68, 1.85, 1, 6);
  const flagMat = new THREE.MeshStandardMaterial({
    color: '#d93d26',
    emissive: '#6e190b',
    emissiveIntensity: 0.35,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });

  for (const zone of track.apexZones) {
    const zoneLen = track.arcDelta(zone.startArc, zone.endArc);
    const segs = 28;
    const stripW = 2.05;
    const innerEdgeLat = zone.direction * (track.roadHalfWidth - 1.55);

    const pos: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];

    for (let i = 0; i <= segs; i++) {
      const frac = i / segs;
      const s = zone.startArc + frac * zoneLen;
      const f = track.sampleAtArc(s);
      for (const side of [-1, 1]) {
        const lat = innerEdgeLat + side * (stripW * 0.5);
        pos.push(
          f.position.x + f.right.x * lat + f.up.x * 0.065,
          f.position.y + f.right.y * lat + f.up.y * 0.065,
          f.position.z + f.right.z * lat + f.up.z * 0.065,
        );
        uvs.push(side === -1 ? 0 : 1, frac * 7.0);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }

    const stripGeo = new THREE.BufferGeometry();
    stripGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    stripGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    stripGeo.setIndex(idx);

    const stripMat = new THREE.MeshBasicMaterial({
      map: apexTex,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    apexStripMats.push(stripMat);

    const stripMesh = new THREE.Mesh(stripGeo, stripMat);
    group.add(stripMesh);

    // Outer hairpin fluttering crimson nobori shrine flags + glowing lantern orb beacons
    const beaconMat = new THREE.MeshStandardMaterial({
      color: '#ffe5a3',
      emissive: '#ff9626',
      emissiveIntensity: 1.6,
      roughness: 0.25,
    });
    apexBeaconMats.push(beaconMat);

    const outerSide = -zone.direction;
    const flagCount = 5;
    for (let k = 0; k < flagCount; k++) {
      const frac = (k + 0.5) / flagCount;
      const s = zone.startArc + frac * zoneLen;
      const f = track.sampleAtArc(s);
      const lat = outerSide * (track.curbOuterWidth + 1.05);
      const bx = f.position.x + f.right.x * lat;
      const bz = f.position.z + f.right.z * lat;
      const by = f.position.y + f.right.y * lat - 0.08;

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 3.6, 6), poleMat);
      pole.position.set(bx, by + 1.8, bz);
      pole.castShadow = true;
      group.add(pole);

      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.05, 0.05), poleMat);
      crossbar.position.set(bx, by + 3.45, bz);
      const yaw = Math.atan2(f.tangent.x, f.tangent.z);
      crossbar.rotation.y = yaw;
      group.add(crossbar);

      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(bx, by + 2.48, bz);
      flag.rotation.y = yaw;
      group.add(flag);
      bannerMeshes.push({ mesh: flag, phase: zone.id * 1.9 + k * 0.85, baseRotY: yaw });

      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), beaconMat);
      orb.position.set(bx, by + 3.66, bz);
      group.add(orb);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Animated Turbo Boost Pads on Straights & Hairpin Exits
  // -------------------------------------------------------------------------
  const boostPadTex = createBoostChevronTexture();
  const boostPadMat = new THREE.MeshStandardMaterial({
    map: boostPadTex,
    emissive: new THREE.Color('#ff8c24'),
    emissiveMap: boostPadTex,
    emissiveIntensity: 1.45,
    roughness: 0.3,
    metalness: 0.35,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });

  for (const pad of track.boostPads) {
    const padGeo = new THREE.PlaneGeometry(pad.width, pad.length);
    padGeo.rotateX(-Math.PI * 0.5);
    const padMesh = new THREE.Mesh(padGeo, boostPadMat);
    padMesh.position.copy(pad.worldPos);

    // Orient pad flush with track tangent, right, and surface up
    const basis = new THREE.Matrix4().makeBasis(
      pad.right,
      pad.up,
      pad.tangent.clone().negate(),
    );
    padMesh.quaternion.setFromRotationMatrix(basis);
    padMesh.receiveShadow = true;
    group.add(padMesh);
  }

  // -------------------------------------------------------------------------
  // 4. Kyoto Shrine Teahouse & Valley Overlook Deck beside Turn 7
  // -------------------------------------------------------------------------
  {
    const overlookFrame = track.sampleAtArc(track.totalLength * 0.58);
    const teahouse = buildKyotoTeahouse();
    const outLat = -(track.curbOuterWidth + 9.2); // outer valley edge
    const tx = overlookFrame.position.x + overlookFrame.right.x * outLat;
    const tz = overlookFrame.position.z + overlookFrame.right.z * outLat;
    teahouse.position.set(tx, overlookFrame.position.y - 0.18, tz);
    // Point the timber veranda deck (+Z) directly outward over the sunlit misty valley!
    teahouse.rotation.y = Math.atan2(-overlookFrame.right.x, -overlookFrame.right.z);
    group.add(teahouse);
  }

  // -------------------------------------------------------------------------
  // 5. Lush Multi-Branch Autumn Maple Forest (88 trees) + Evergreen Backdrop (34 trees)
  // -------------------------------------------------------------------------
  const maplePlacements: { x: number; y: number; z: number; scale: number; rotationY: number }[] = [];
  const pinePlacements: { x: number; y: number; z: number; scale: number; rotationY: number }[] = [];

  // Ring A: Hero Roadside Autumn Maples framing BOTH sides of the entire circuit!
  const roadsideStep = 13.5;
  const roadsideCount = Math.floor(track.totalLength / roadsideStep);
  for (let i = 0; i < roadsideCount; i++) {
    const s = (i + 0.35) * roadsideStep;
    const f = track.sampleAtArc(s);

    // Place on alternating or both sides, leaving crisp sightlines at the Teahouse & Torii gates
    for (const side of [-1, 1]) {
      if (rng() < 0.28) continue;
      const distOut = track.curbOuterWidth + 3.4 + rng() * 6.5;
      const mx = f.position.x + f.right.x * side * distOut + (rng() - 0.5) * 2.2;
      const mz = f.position.z + f.right.z * side * distOut + (rng() - 0.5) * 2.2;

      // Ensure tree never encroaches on any other curve of the road
      const check = track.distanceToRoadXZ(mx, mz);
      if (check.dist < track.curbOuterWidth + 3.0) continue;

      const my = track.terrainHeightAt(mx, mz);
      if (my < track.waterLevel + 1.5) continue;

      // Don't block the teahouse deck
      if (Math.hypot(mx - 84, mz - 64) < 12) continue;

      maplePlacements.push({
        x: mx,
        y: my - 0.22,
        z: mz,
        scale: 0.95 + rng() * 0.65,
        rotationY: rng() * Math.PI * 2,
      });
    }
  }

  // Ring B: Deep Hillside Autumn Maple Clusters blanketing the inner mountain peak & ridges
  for (let attempt = 0; attempt < 240 && maplePlacements.length < 94; attempt++) {
    const x = THREE.MathUtils.lerp(track.bounds.minX + 12, track.bounds.maxX - 18, rng());
    const z = THREE.MathUtils.lerp(track.bounds.minZ + 12, track.bounds.maxZ - 18, rng());
    const info = track.distanceToRoadXZ(x, z);
    if (info.dist < track.curbOuterWidth + 6.5 || info.dist > 56) continue;
    const y = track.terrainHeightAt(x, z);
    if (y < track.waterLevel + 2.5) continue;
    maplePlacements.push({
      x,
      y: y - 0.25,
      z,
      scale: 1.05 + rng() * 0.72,
      rotationY: rng() * Math.PI * 2,
    });
  }

  // Ring C: Tall Japanese Mountain Pines & Cypresses along high northern/western ridge & peak
  for (let attempt = 0; attempt < 220 && pinePlacements.length < 36; attempt++) {
    const x = THREE.MathUtils.lerp(track.bounds.minX - 10, track.bounds.maxX - 10, rng());
    const z = THREE.MathUtils.lerp(track.bounds.minZ - 14, track.bounds.maxZ - 10, rng());
    const info = track.distanceToRoadXZ(x, z);
    if (info.dist < track.curbOuterWidth + 11.5) continue;
    const y = track.terrainHeightAt(x, z);
    if (y < 6.0) continue; // evergreens crown the higher slopes & ridges
    pinePlacements.push({
      x,
      y: y - 0.3,
      z,
      scale: 1.15 + rng() * 0.85,
      rotationY: rng() * Math.PI * 2,
    });
  }

  const mapleForest = createForest(maplePlacements, {
    style: 'maple_autumn',
    baseHeight: 7.4,
    archetypes: 4,
    canopyDensity: 0.95,
    seed: 108,
    castShadow: true,
    receiveShadow: true,
  });
  group.add(mapleForest.group);
  forestBatches.push(mapleForest);

  const pineForest = createForest(pinePlacements, {
    style: 'pine',
    baseHeight: 9.2,
    archetypes: 3,
    canopyDensity: 0.85,
    seed: 314,
    castShadow: false,
    receiveShadow: true,
  });
  group.add(pineForest.group);
  forestBatches.push(pineForest);

  // -------------------------------------------------------------------------
  // 6. Bamboo Groves along Inner Shaded Bends & Bamboo Switchback
  // -------------------------------------------------------------------------
  const bambooTargets = [
    { t: 0.05, side: -1, dist: 4.0 },
    { t: 0.22, side: 1, dist: 4.2 },
    { t: 0.34, side: 1, dist: 3.8 },
    { t: 0.38, side: -1, dist: 3.8 },
    { t: 0.42, side: -1, dist: 4.0 },
    { t: 0.45, side: 1, dist: 4.2 },
    { t: 0.48, side: -1, dist: 4.4 },
    { t: 0.51, side: 1, dist: 4.0 },
    { t: 0.68, side: 1, dist: 4.2 },
    { t: 0.77, side: 1, dist: 4.4 },
    { t: 0.84, side: -1, dist: 4.0 },
    { t: 0.91, side: -1, dist: 4.2 },
    { t: 0.95, side: 1, dist: 4.4 },
    { t: 0.99, side: -1, dist: 4.0 },
  ];

  bambooTargets.forEach((bt, idx) => {
    const f = track.sampleAtArc(bt.t * track.totalLength);
    const lat = bt.side * (track.curbOuterWidth + bt.dist);
    const bx = f.position.x + f.right.x * lat;
    const bz = f.position.z + f.right.z * lat;
    if (track.distanceToRoadXZ(bx, bz).dist < track.curbOuterWidth + 2.4) return;
    const by = track.terrainHeightAt(bx, bz);
    if (by < track.waterLevel + 1.0) return;

    const cluster = createBambooCluster({
      culmCount: 11 + (idx % 5),
      heightRange: [5.2, 8.8],
      spread: 2.3,
      seed: 400 + idx * 31,
      castShadow: idx % 2 === 0,
    });
    cluster.group.position.set(bx, by - 0.15, bz);
    group.add(cluster.group);
    bambooClusters.push(cluster);
  });

  // -------------------------------------------------------------------------
  // 7. Mossy Granite Cliff Boulders, Fern Clusters & Roadside Stone Tōrō Lanterns
  // -------------------------------------------------------------------------
  for (let i = 0; i < 24; i++) {
    const t = ((i + 0.5) / 24 + 0.02) % 1;
    const f = track.sampleAtArc(t * track.totalLength);
    const side = i % 2 === 0 ? 1 : -1;
    const lat = side * (track.curbOuterWidth + 2.8 + rng() * 5.2);
    const rx = f.position.x + f.right.x * lat;
    const rz = f.position.z + f.right.z * lat;
    if (track.distanceToRoadXZ(rx, rz).dist < track.curbOuterWidth + 2.1) continue;
    const ry = track.terrainHeightAt(rx, rz);
    if (ry < track.waterLevel + 0.5) continue;

    const boulder = createMossyBoulder({
      radius: 1.35 + rng() * 1.65,
      mossAmount: 0.55 + rng() * 0.35,
      stoneTint: '#7a7770',
      mossColor: '#5c7a38',
      includeAccentStones: true,
      seed: 800 + i * 19,
      castShadow: i % 3 === 0,
    });
    boulder.position.set(rx, ry - 0.32, rz);
    boulder.rotation.y = rng() * Math.PI * 2;
    group.add(boulder);

    // Pair lush woodland fern cluster right beside each boulder!
    if (i < 20) {
      const fern = createFernCluster({
        frondCount: 10,
        radius: 1.05 + rng() * 0.45,
        height: 0.72 + rng() * 0.25,
        color: '#628537',
        seed: 1200 + i * 23,
        castShadow: false,
      });
      fern.position.set(rx + (rng() - 0.5) * 2.1, ry - 0.06, rz + (rng() - 0.5) * 2.1);
      if (track.distanceToRoadXZ(fern.position.x, fern.position.z).dist > track.curbOuterWidth + 1.2) {
        group.add(fern);
      }
    }
  }

  // Roadside Stone Tōrō Lanterns illuminating key bends & hairpins
  const lanternTList = [
    0.015, 0.075, 0.16, 0.21, 0.26, 0.32, 0.42, 0.47, 0.54, 0.60, 0.65, 0.76, 0.82, 0.89, 0.94, 0.985,
  ];
  lanternTList.forEach((t, idx) => {
    const f = track.sampleAtArc(t * track.totalLength);
    const side = idx % 2 === 0 ? 1 : -1;
    const lat = side * (track.curbOuterWidth + 1.65);
    const lx = f.position.x + f.right.x * lat;
    const lz = f.position.z + f.right.z * lat;
    if (track.distanceToRoadXZ(lx, lz).dist < track.curbOuterWidth + 1.1) return;
    const ly = Math.max(f.position.y - 0.18, track.terrainHeightAt(lx, lz));

    const lantern = createLantern('stone_toro', {
      scale: 1.08,
      withLight: idx === 2 || idx === 6 || idx === 9 || idx === 12,
      lightIntensity: 2.6,
      lightDistance: 12,
    });
    lantern.position.set(lx, ly, lz);
    group.add(lantern);
  });

  // -------------------------------------------------------------------------
  // 8. 7,500+ Interactive Wind-Swaying Roadside Grass Tufts & Autumn Wildflowers
  // -------------------------------------------------------------------------
  const roadsideMask = (x: number, z: number): boolean => {
    const info = track.distanceToRoadXZ(x, z);
    if (info.dist < track.curbOuterWidth + 1.15) return false;
    if (info.dist > 34) return false;
    const y = track.terrainHeightAt(x, z);
    return y > track.waterLevel + 1.2;
  };

  const grassField = createGrassField({
    area: {
      minX: track.bounds.minX + 35,
      maxX: track.bounds.maxX - 35,
      minZ: track.bounds.minZ + 35,
      maxZ: track.bounds.maxZ - 35,
    },
    count: 7600,
    heightAt: track.terrainHeightAt,
    mask: roadsideMask,
    bladeHeightRange: [0.32, 0.78],
    bladeWidth: 0.068,
    baseColor: '#2d451e',
    tipColor: '#98a63c',
    dryColor: '#c97b36',
    windStrength: 1.15,
    pushRadius: 2.1,
    pushStrength: 0.95,
    seed: 901,
  });
  group.add(grassField.mesh);
  grassFields.push(grassField);

  const wildflowers = createWildflowerPatch({
    area: {
      minX: track.bounds.minX + 40,
      maxX: track.bounds.maxX - 40,
      minZ: track.bounds.minZ + 40,
      maxZ: track.bounds.maxZ - 40,
    },
    count: 950,
    heightAt: track.terrainHeightAt,
    mask: (x, z) => {
      const info = track.distanceToRoadXZ(x, z);
      return info.dist > track.curbOuterWidth + 1.5 && info.dist < 18 && track.terrainHeightAt(x, z) > track.waterLevel + 1.8;
    },
    palette: ['#f4b942', '#e0532c', '#f5ebd6', '#e88b3a', '#d9483b'],
    scaleRange: [0.85, 1.45],
    seed: 902,
  });
  group.add(wildflowers.group);
  wildflowerPatches.push(wildflowers);

  // -------------------------------------------------------------------------
  // 9. Sunlit Misty Valley River / Mirror Lake below the Overlook
  // -------------------------------------------------------------------------
  valleyWater = createWaterSurface({
    width: 340,
    depth: 340,
    shape: 'plane',
    segments: 48,
    deepColor: '#284a54',
    shallowColor: '#5d847c',
    skyColor: '#f0c694',
    foamColor: '#fae5c8',
    sunDirection: atmosphere.sunDirection,
    sunColor: atmosphere.sunColor,
    waveSpeed: 0.72,
    waveScale: 0.55,
    waveHeight: 0.14,
    edgeFoamWidth: 0.02,
    opacity: 0.92,
    fogColor: atmosphere.fogColor,
    fogDensity: atmosphere.fogDensity,
  });
  valleyWater.mesh.position.set(95, track.waterLevel, 88);
  group.add(valleyWater.mesh);

  const flashCheckpointGate = (checkpointIdx: number) => {
    const ref = toriiRefs[checkpointIdx];
    if (ref) {
      ref.flashTimer = 1.0;
    }
  };

  const update = (
    time: number,
    dt: number,
    playerPos: THREE.Vector3,
    activeApexId: number,
    activeCheckpointIdx: number,
  ) => {
    updateFoliageWind(time, 1.15);

    for (let i = 0; i < grassFields.length; i++) {
      grassFields[i].update(time, playerPos);
    }

    // Scroll boost pad glowing chevrons forward smoothly
    boostPadTex.offset.y = -(time * 2.15) % 1;

    // Animate apex drift strip glow & banners fluttering in mountain wind
    apexTex.offset.y = -(time * 1.45) % 1;
    for (let i = 0; i < apexStripMats.length; i++) {
      const isActive = i === activeApexId;
      const targetOp = isActive ? 0.92 : 0.42 + Math.sin(time * 2.4 + i) * 0.08;
      apexStripMats[i].opacity += (targetOp - apexStripMats[i].opacity) * Math.min(1, dt * 8);
      apexBeaconMats[i].emissiveIntensity = isActive
        ? 3.2 + Math.sin(time * 10) * 0.6
        : 1.35 + Math.sin(time * 2.6 + i) * 0.25;
    }

    for (let i = 0; i < bannerMeshes.length; i++) {
      const b = bannerMeshes[i];
      b.mesh.rotation.y = b.baseRotY + Math.sin(time * 3.1 + b.phase) * 0.22;
      b.mesh.rotation.z = Math.cos(time * 2.4 + b.phase) * 0.08;
    }

    // Pulse active next checkpoint Torii shimmer + handle clear flash
    for (let i = 0; i < toriiRefs.length; i++) {
      const ref = toriiRefs[i];
      if (ref.flashTimer > 0) {
        ref.flashTimer = Math.max(0, ref.flashTimer - dt * 1.4);
        ref.shimmerMat.opacity = 0.08 + ref.flashTimer * 0.52;
        ref.shimmerMat.color.setHex(0xffe082);
      } else {
        const isNext = i === activeCheckpointIdx;
        ref.shimmerMat.opacity = isNext ? 0.09 + Math.sin(time * 3.8) * 0.04 : 0.025;
        ref.shimmerMat.color.setHex(isNext ? 0xffb347 : 0xe06a3b);
      }
    }

    if (valleyWater) {
      valleyWater.update(time);
    }
  };

  const dispose = () => {
    for (const f of forestBatches) f.dispose();
    for (const b of bambooClusters) b.dispose();
    for (const g of grassFields) g.dispose();
    for (const w of wildflowerPatches) w.dispose();
    valleyWater?.dispose();
    boostPadTex.dispose();
    apexTex.dispose();
  };

  return {
    group,
    update,
    flashCheckpointGate,
    dispose,
  };
}

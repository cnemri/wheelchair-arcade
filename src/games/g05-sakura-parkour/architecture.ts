import * as THREE from 'three';
import { createPBRMaterial } from '../../art';
import { evaluateSurfaceLocal } from './courseData';
import type {
  AnimatedCheckpoint,
  AnimatedSpringPad,
  CheckpointDef,
  SpringPadDef,
  WalkableSurface,
} from './types';

export interface ArchitecturePalette {
  roofTileMat: THREE.MeshStandardMaterial;
  eaveTileMat: THREE.MeshStandardMaterial;
  pathStoneMat: THREE.MeshStandardMaterial;
  woodDeckMat: THREE.MeshStandardMaterial;
  darkTimberMat: THREE.MeshStandardMaterial;
  plasterMat: THREE.MeshStandardMaterial;
  shojiGlowMat: THREE.MeshStandardMaterial;
  crimsonLacquerMat: THREE.MeshStandardMaterial;
  darkBronzeMat: THREE.MeshStandardMaterial;
  goldMat: THREE.MeshStandardMaterial;
  stoneBaseMat: THREE.MeshStandardMaterial;
  rampSurfaceMat: THREE.MeshStandardMaterial;
  chevronMat: THREE.MeshStandardMaterial;
  springTurquoiseMat: THREE.MeshStandardMaterial;
  springRingMat: THREE.MeshStandardMaterial;
  paperLanternGlowMat: THREE.MeshStandardMaterial;
  sakuraBlossomTrimMat: THREE.MeshStandardMaterial;
  shidePaperMat: THREE.MeshStandardMaterial;
}

export interface ArchitectureBuildResult {
  group: THREE.Group;
  palette: ArchitecturePalette;
  springPads: AnimatedSpringPad[];
  checkpoints: AnimatedCheckpoint[];
  swayingLanterns: Array<{ pivot: THREE.Object3D; phase: number; speed: number }>;
  wavingBanners: Array<{ mesh: THREE.Mesh; phase: number }>;
  chevronMaterials: THREE.MeshStandardMaterial[];
  summitMedallion: {
    ringOuter: THREE.Mesh;
    ringInner: THREE.Mesh;
    pillarBeam: THREE.Mesh;
    light: THREE.PointLight;
  };
  templeBell: THREE.Object3D | null;
}

export function createArchitecturePalette(): ArchitecturePalette {
  const roofTileMat = createPBRMaterial('roofTiles', {
    repeatX: 4,
    repeatY: 4,
    tint: '#4a4358',
    mossAmount: 0.08,
  });
  roofTileMat.roughness = 0.72;
  roofTileMat.bumpScale = 0.045;

  const eaveTileMat = createPBRMaterial('roofTiles', {
    repeatX: 3,
    repeatY: 1,
    tint: '#322b40',
  });
  eaveTileMat.roughness = 0.62;
  eaveTileMat.bumpScale = 0.04;

  const pathStoneMat = createPBRMaterial('sandstone', {
    repeatX: 2,
    repeatY: 6,
    tint: '#e8d7cc',
  });
  pathStoneMat.roughness = 0.76;

  const woodDeckMat = createPBRMaterial('woodPlanks', {
    repeatX: 2,
    repeatY: 5,
    tint: '#9c6848',
  });
  woodDeckMat.roughness = 0.68;

  const darkTimberMat = createPBRMaterial('woodPlanks', {
    repeatX: 1,
    repeatY: 3,
    tint: '#3c2420',
  });
  darkTimberMat.roughness = 0.62;

  const plasterMat = createPBRMaterial('sandstone', {
    repeatX: 3,
    repeatY: 2,
    tint: '#f3e9e1',
  });
  plasterMat.roughness = 0.86;

  const shojiGlowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fff2d4'),
    emissive: new THREE.Color('#ffaa58'),
    emissiveIntensity: 1.45,
    roughness: 0.55,
  });

  const crimsonLacquerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#b82834'),
    roughness: 0.28,
    metalness: 0.08,
  });

  const darkBronzeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#27222a'),
    roughness: 0.42,
    metalness: 0.72,
  });

  const goldMat = createPBRMaterial('brushedBrass', {
    repeatX: 1,
    repeatY: 1,
    tint: '#ffd275',
  });
  goldMat.roughness = 0.34;
  goldMat.metalness = 0.86;

  const stoneBaseMat = createPBRMaterial('rock', {
    repeatX: 3,
    repeatY: 2,
    tint: '#9c8f9c',
    mossAmount: 0.34,
  });
  stoneBaseMat.roughness = 0.88;
  stoneBaseMat.emissive = new THREE.Color('#c48494');
  stoneBaseMat.emissiveIntensity = 0.18;

  const rampSurfaceMat = createPBRMaterial('woodPlanks', {
    repeatX: 2,
    repeatY: 3,
    tint: '#b8323e',
  });
  rampSurfaceMat.roughness = 0.34;
  rampSurfaceMat.metalness = 0.1;

  const chevronMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fff0b5'),
    emissive: new THREE.Color('#ffaa42'),
    emissiveIntensity: 2.1,
    roughness: 0.25,
  });

  const springTurquoiseMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#4af2df'),
    emissive: new THREE.Color('#1fd8c6'),
    emissiveIntensity: 2.0,
    roughness: 0.22,
    metalness: 0.15,
  });

  const springRingMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffe596'),
    emissive: new THREE.Color('#ffba42'),
    emissiveIntensity: 1.6,
    roughness: 0.26,
    metalness: 0.75,
  });

  const paperLanternGlowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffe6ed'),
    emissive: new THREE.Color('#ff8aa8'),
    emissiveIntensity: 1.95,
    roughness: 0.65,
  });

  const sakuraBlossomTrimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f7a9c2'),
    emissive: new THREE.Color('#6b2a42'),
    emissiveIntensity: 0.18,
    roughness: 0.78,
  });

  const shidePaperMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fff9f4'),
    emissive: new THREE.Color('#ffd8e2'),
    emissiveIntensity: 0.22,
    roughness: 0.75,
    side: THREE.DoubleSide,
  });

  return {
    roofTileMat,
    eaveTileMat,
    pathStoneMat,
    woodDeckMat,
    darkTimberMat,
    plasterMat,
    shojiGlowMat,
    crimsonLacquerMat,
    darkBronzeMat,
    goldMat,
    stoneBaseMat,
    rampSurfaceMat,
    chevronMat,
    springTurquoiseMat,
    springRingMat,
    paperLanternGlowMat,
    sakuraBlossomTrimMat,
    shidePaperMat,
  };
}

/**
 * Builds a complete sculpted Japanese rooftop island:
 * tiled terrace, inlaid sandstone walkway, overhanging upturned Kawara eaves,
 * timber rafters, plaster & glowing shoji walls, floating mossy stone keel, and crimson guardrails.
 */
export function buildRooftopIsland(
  surface: WalkableSurface,
  pal: ArchitecturePalette,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `surface_${surface.id}`;
  group.position.set(surface.x, surface.baseY, surface.z);
  group.rotation.y = surface.yaw;

  const w = surface.halfW * 2;
  const l = surface.halfL * 2;
  const isSmall = surface.kind === 'step' || surface.kind === 'balcony';
  const deckH = 0.42;

  // 1. Main Kawara tiled rooftop deck (top flush at y = 0)
  const deckGeo = new THREE.BoxGeometry(w, deckH, l);
  const deckMesh = new THREE.Mesh(deckGeo, pal.roofTileMat);
  deckMesh.position.y = -deckH * 0.5;
  deckMesh.castShadow = true;
  deckMesh.receiveShadow = true;
  group.add(deckMesh);

  // Subtle decorative sandstone courtyard walkway down the center for visual flow readability
  if (!isSmall) {
    const pathW = Math.min(w * 0.46, 5.8);
    const pathGeo = new THREE.BoxGeometry(pathW, 0.025, l - 0.6);
    const pathMesh = new THREE.Mesh(pathGeo, pal.pathStoneMat);
    pathMesh.position.y = 0.004;
    pathMesh.receiveShadow = true;
    group.add(pathMesh);

    // Timber border strips framing the stone runner
    const trimGeo = new THREE.BoxGeometry(0.16, 0.032, l - 0.5);
    for (const side of [-1, 1]) {
      const trim = new THREE.Mesh(trimGeo, pal.darkTimberMat);
      trim.position.set(side * (pathW * 0.5 + 0.08), 0.006, 0);
      trim.receiveShadow = true;
      group.add(trim);
    }
  } else {
    // Small balcony / stepping roof gets a warm cedar inset deck with crimson perimeter trim
    const insetGeo = new THREE.BoxGeometry(w - 0.8, 0.024, l - 0.8);
    const inset = new THREE.Mesh(insetGeo, pal.woodDeckMat);
    inset.position.y = 0.005;
    inset.receiveShadow = true;
    group.add(inset);
  }

  // 2. Curved overhanging Kawara eave skirts along all 4 sides + upturned golden corner finials
  const eaveOut = isSmall ? 0.72 : 1.15;
  const eaveDrop = isSmall ? 0.34 : 0.46;
  const eaveThick = 0.14;

  // North & South eaves
  const nsEaveGeo = new THREE.BoxGeometry(w + eaveOut * 1.7, eaveThick, eaveOut);
  for (const s of [-1, 1]) {
    const eave = new THREE.Mesh(nsEaveGeo, pal.eaveTileMat);
    eave.position.set(0, -deckH * 0.55 - eaveDrop * 0.35, s * (surface.halfL + eaveOut * 0.44));
    eave.rotation.x = s * 0.32;
    eave.castShadow = true;
    eave.receiveShadow = true;
    group.add(eave);

    // Gilded eave fascia strip
    const goldStrip = new THREE.Mesh(
      new THREE.BoxGeometry(w + eaveOut * 1.72, 0.055, 0.08),
      pal.goldMat,
    );
    goldStrip.position.set(0, -deckH * 0.55 - eaveDrop * 0.62, s * (surface.halfL + eaveOut * 0.88));
    group.add(goldStrip);
  }

  // East & West eaves
  const ewEaveGeo = new THREE.BoxGeometry(eaveOut, eaveThick, l + eaveOut * 1.7);
  for (const s of [-1, 1]) {
    const eave = new THREE.Mesh(ewEaveGeo, pal.eaveTileMat);
    eave.position.set(s * (surface.halfW + eaveOut * 0.44), -deckH * 0.55 - eaveDrop * 0.35, 0);
    eave.rotation.z = -s * 0.32;
    eave.castShadow = true;
    eave.receiveShadow = true;
    group.add(eave);

    const goldStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.055, l + eaveOut * 1.72),
      pal.goldMat,
    );
    goldStrip.position.set(s * (surface.halfW + eaveOut * 0.88), -deckH * 0.55 - eaveDrop * 0.62, 0);
    group.add(goldStrip);
  }

  // Sweeping upturned roof corner horn finials (onigawara accents)
  const hornGeo = new THREE.ConeGeometry(0.13, 0.48, 5);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const horn = new THREE.Mesh(hornGeo, pal.goldMat);
      horn.position.set(
        sx * (surface.halfW + eaveOut * 0.85),
        -deckH * 0.38,
        sz * (surface.halfL + eaveOut * 0.85),
      );
      horn.rotation.z = -sx * 0.62;
      horn.rotation.x = sz * 0.62;
      group.add(horn);
    }
  }

  // 3. Traditional Japanese plaster & timber-framed story beneath the roof eaves
  const storyH = isSmall ? 1.8 : 2.9;
  const wallW = w - 0.7;
  const wallL = l - 0.7;
  const wallCenterY = -deckH - storyH * 0.5;

  const plasterBody = new THREE.Mesh(new THREE.BoxGeometry(wallW, storyH, wallL), pal.plasterMat);
  plasterBody.position.y = wallCenterY;
  plasterBody.castShadow = true;
  plasterBody.receiveShadow = true;
  group.add(plasterBody);

  // Dark cedar corner pillars & mid-story horizontal timber beam
  const cornerPostGeo = new THREE.BoxGeometry(0.28, storyH + 0.12, 0.28);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(cornerPostGeo, pal.darkTimberMat);
      post.position.set(sx * (wallW * 0.5), wallCenterY, sz * (wallL * 0.5));
      group.add(post);
    }
  }

  const beltGeo = new THREE.BoxGeometry(wallW + 0.22, 0.22, wallL + 0.22);
  const topBelt = new THREE.Mesh(beltGeo, pal.darkTimberMat);
  topBelt.position.y = -deckH - 0.25;
  group.add(topBelt);

  const botBelt = new THREE.Mesh(beltGeo, pal.darkTimberMat);
  botBelt.position.y = -deckH - storyH + 0.12;
  group.add(botBelt);

  // Warm glowing Shoji paper windows inlaid along the front/back/side walls
  const winH = storyH * 0.44;
  const winY = wallCenterY + 0.12;
  const sideWinCount = Math.max(1, Math.floor(wallL / 4.2));
  for (const sx of [-1, 1]) {
    for (let i = 0; i < sideWinCount; i++) {
      const frac = sideWinCount === 1 ? 0 : (i / (sideWinCount - 1) - 0.5) * 0.64;
      const wz = frac * wallL;
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.08, winH, 1.45), pal.shojiGlowMat);
      pane.position.set(sx * (wallW * 0.5 + 0.02), winY, wz);
      group.add(pane);

      // Timber frame mullion cross
      const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.12, winH + 0.1, 0.09), pal.darkTimberMat);
      mullionV.position.set(sx * (wallW * 0.5 + 0.03), winY, wz);
      const mullionH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 1.55), pal.darkTimberMat);
      mullionH.position.set(sx * (wallW * 0.5 + 0.03), winY, wz);
      group.add(mullionV, mullionH);
    }
  }

  const frontWinCount = Math.max(1, Math.floor(wallW / 4.5));
  for (const sz of [-1, 1]) {
    for (let i = 0; i < frontWinCount; i++) {
      const frac = frontWinCount === 1 ? 0 : (i / (frontWinCount - 1) - 0.5) * 0.56;
      const wx = frac * wallW;
      const pane = new THREE.Mesh(new THREE.BoxGeometry(1.5, winH, 0.08), pal.shojiGlowMat);
      pane.position.set(wx, winY, sz * (wallL * 0.5 + 0.02));
      group.add(pane);
    }
  }

  // 4. Sculpted sunlit mossy stone floating terrace foundation (soft rounded terraced underside)
  const keelH = isSmall ? 1.55 : 2.35;
  const keelGeo = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
  keelGeo.scale(wallW * 0.56, keelH, wallL * 0.56);
  // Subtle terraced organic rock undulation
  const kPos = keelGeo.attributes.position;
  for (let i = 0; i < kPos.count; i++) {
    const vy = kPos.getY(i);
    const vx = kPos.getX(i);
    const vz = kPos.getZ(i);
    const bump = 1 + Math.sin(vx * 0.55 + vz * 0.45) * 0.08;
    kPos.setX(i, vx * bump);
    kPos.setZ(i, vz * bump);
    kPos.setY(i, vy * (1 + Math.cos(vx * 0.4 - vz * 0.5) * 0.06));
  }
  keelGeo.computeVertexNormals();
  const keelMesh = new THREE.Mesh(keelGeo, pal.stoneBaseMat);
  keelMesh.position.y = -deckH - storyH + 0.08;
  keelMesh.castShadow = false;
  keelMesh.receiveShadow = true;
  group.add(keelMesh);

  // 5. Crimson Lacquer Guardrails with dark bronze giboshi onion finials
  if (surface.rails) {
    const railH = 0.86;
    const inset = 0.26;
    const buildRailRun = (x1: number, z1: number, x2: number, z2: number) => {
      const dx = x2 - x1;
      const dz = z2 - z1;
      const runLen = Math.hypot(dx, dz);
      if (runLen < 0.6) return;
      const runGroup = new THREE.Group();
      runGroup.position.set((x1 + x2) * 0.5, 0, (z1 + z2) * 0.5);
      runGroup.rotation.y = Math.atan2(dx, dz);

      const topRail = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.11, runLen),
        pal.crimsonLacquerMat,
      );
      topRail.position.y = railH;
      topRail.castShadow = true;
      runGroup.add(topRail);

      const midRail = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.08, runLen),
        pal.crimsonLacquerMat,
      );
      midRail.position.y = railH * 0.5;
      runGroup.add(midRail);

      const posts = Math.max(2, Math.round(runLen / 2.8) + 1);
      const postGeo = new THREE.BoxGeometry(0.15, railH + 0.12, 0.15);
      const capGeo = new THREE.SphereGeometry(0.105, 8, 6);
      for (let i = 0; i < posts; i++) {
        const pz = -runLen * 0.5 + (i / (posts - 1)) * runLen;
        const post = new THREE.Mesh(postGeo, pal.crimsonLacquerMat);
        post.position.set(0, (railH + 0.12) * 0.5, pz);
        post.castShadow = true;
        runGroup.add(post);

        const cap = new THREE.Mesh(capGeo, i === 0 || i === posts - 1 ? pal.goldMat : pal.darkBronzeMat);
        cap.position.set(0, railH + 0.16, pz);
        cap.scale.set(1, 1.25, 1);
        runGroup.add(cap);
      }

      group.add(runGroup);
    };

    const rx = surface.halfW - inset;
    const rz = surface.halfL - inset;
    if (surface.rails.left) buildRailRun(-rx, rz, -rx, -rz);
    if (surface.rails.right) buildRailRun(rx, rz, rx, -rz);
    if (surface.rails.back) buildRailRun(-rx, rz, rx, rz);
    if (surface.rails.front) buildRailRun(-rx, -rz, rx, -rz);
  }

  return group;
}

/**
 * Builds a sweeping curved red-lacquer launch ramp matching `evaluateSurfaceLocal`
 * with glowing animated golden chevrons pointing toward the launch lip.
 */
export function buildCurvedLaunchRamp(
  surface: WalkableSurface,
  pal: ArchitecturePalette,
  chevronMaterials: THREE.MeshStandardMaterial[],
): THREE.Group {
  const group = new THREE.Group();
  group.name = `ramp_${surface.id}`;
  group.position.set(surface.x, surface.baseY, surface.z);
  group.rotation.y = surface.yaw;

  const segs = 16;
  const w = surface.halfW * 2;
  const l = surface.halfL * 2;
  const thick = 0.24;

  // Build custom curved ramp deck mesh
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const lz = surface.halfL - t * l;
    const { y } = evaluateSurfaceLocal(surface, 0, lz);
    const localY = y - surface.baseY;

    // Top-left (0), Top-right (1), Bot-left (2), Bot-right (3)
    const botY = Math.max(0, localY - thick) - 0.08;
    positions.push(-surface.halfW, localY, lz);
    uvs.push(0, t * 2);

    positions.push(surface.halfW, localY, lz);
    uvs.push(1, t * 2);

    positions.push(-surface.halfW, botY, lz);
    uvs.push(0, t * 2);

    positions.push(surface.halfW, botY, lz);
    uvs.push(1, t * 2);
  }

  for (let i = 0; i < segs; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // Top face (winding so normal points +Y)
    indices.push(a + 0, a + 1, b + 1, a + 0, b + 1, b + 0);
    // Left side wall
    indices.push(a + 2, a + 0, b + 0, a + 2, b + 0, b + 2);
    // Right side wall
    indices.push(a + 1, a + 3, b + 3, a + 1, b + 3, b + 1);
    // Underside
    indices.push(a + 3, a + 2, b + 2, a + 3, b + 2, b + 3);
  }
  // High exit end cap
  const last = segs * 4;
  indices.push(last + 0, last + 1, last + 3, last + 0, last + 3, last + 2);

  const rampGeo = new THREE.BufferGeometry();
  rampGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  rampGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  rampGeo.setIndex(indices);
  rampGeo.computeVertexNormals();

  const rampMesh = new THREE.Mesh(rampGeo, pal.rampSurfaceMat);
  rampMesh.castShadow = true;
  rampMesh.receiveShadow = true;
  group.add(rampMesh);

  // Dark cedar support trusses beneath the high exit lip
  const exitY = evaluateSurfaceLocal(surface, 0, -surface.halfL).y - surface.baseY;
  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, Math.max(0.3, exitY), 0.24),
      pal.darkTimberMat,
    );
    pillar.position.set(sx * (surface.halfW - 0.24), exitY * 0.5 - 0.05, -surface.halfL + 0.26);
    pillar.castShadow = true;
    group.add(pillar);
  }

  // Curved gilded side guide curbs + glowing forward chevron inlays along the ramp
  const chevronCount = 4;
  for (let c = 0; c < chevronCount; c++) {
    const t = 0.2 + (c / (chevronCount - 1)) * 0.68;
    const lz = surface.halfL - t * l;
    const ev = evaluateSurfaceLocal(surface, 0, lz);
    const localY = ev.y - surface.baseY + 0.025;
    const pitch = Math.atan(-ev.slopeZ);

    const chevMat = pal.chevronMat.clone();
    chevMat.userData.chevronPhase = c * 0.85;
    chevronMaterials.push(chevMat);

    const chevGroup = new THREE.Group();
    chevGroup.position.set(0, localY, lz);
    chevGroup.rotation.x = pitch;

    const armLen = Math.min(1.15, w * 0.24);
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.03, 0.22), chevMat);
    leftArm.position.set(-armLen * 0.36, 0, 0.15);
    leftArm.rotation.y = 0.56;

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.03, 0.22), chevMat);
    rightArm.position.set(armLen * 0.36, 0, 0.15);
    rightArm.rotation.y = -0.56;

    chevGroup.add(leftArm, rightArm);
    group.add(chevGroup);
  }

  // Golden side curb rails following the curve
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const lz = surface.halfL - t * l;
      const localY = evaluateSurfaceLocal(surface, 0, lz).y - surface.baseY + 0.16;
      pts.push(new THREE.Vector3(side * (surface.halfW - 0.06), localY, lz));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 14, 0.075, 6, false);
    const rail = new THREE.Mesh(tubeGeo, pal.goldMat);
    rail.castShadow = true;
    group.add(rail);
  }

  return group;
}

/**
 * Builds an arched wooden Japanese Pergola Bridge (taikobashi) with crimson curved railings,
 * overhead timber pergola beams, cherry blossom trims, and gently swaying paper lanterns.
 */
export function buildPergolaBridge(
  surface: WalkableSurface,
  pal: ArchitecturePalette,
  swayingLanterns: Array<{ pivot: THREE.Object3D; phase: number; speed: number }>,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `bridge_${surface.id}`;
  group.position.set(surface.x, surface.baseY, surface.z);
  group.rotation.y = surface.yaw;

  const segs = 20;
  const l = surface.halfL * 2;
  const deckThick = 0.32;

  // 1. Arched wooden bridge deck matching exact physics evaluation
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const lz = surface.halfL - t * l;
    const localY = evaluateSurfaceLocal(surface, 0, lz).y - surface.baseY;

    positions.push(-surface.halfW, localY, lz);
    uvs.push(0, t * 4);
    positions.push(surface.halfW, localY, lz);
    uvs.push(1, t * 4);
    positions.push(-surface.halfW, localY - deckThick, lz);
    uvs.push(0, t * 4);
    positions.push(surface.halfW, localY - deckThick, lz);
    uvs.push(1, t * 4);
  }

  for (let i = 0; i < segs; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    indices.push(a + 0, a + 1, b + 1, a + 0, b + 1, b + 0);
    indices.push(a + 2, a + 0, b + 0, a + 2, b + 0, b + 2);
    indices.push(a + 1, a + 3, b + 3, a + 1, b + 3, b + 1);
    indices.push(a + 3, a + 2, b + 2, a + 3, b + 2, b + 3);
  }

  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  deckGeo.setIndex(indices);
  deckGeo.computeVertexNormals();

  const deckMesh = new THREE.Mesh(deckGeo, pal.woodDeckMat);
  deckMesh.castShadow = true;
  deckMesh.receiveShadow = true;
  group.add(deckMesh);

  // 2. Curved crimson handrails + dark timber under-arch ribs
  for (const side of [-1, 1]) {
    const topPts: THREE.Vector3[] = [];
    const midPts: THREE.Vector3[] = [];
    const ribPts: THREE.Vector3[] = [];

    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const lz = surface.halfL - t * l;
      const localY = evaluateSurfaceLocal(surface, 0, lz).y - surface.baseY;
      topPts.push(new THREE.Vector3(side * (surface.halfW - 0.14), localY + 0.92, lz));
      midPts.push(new THREE.Vector3(side * (surface.halfW - 0.14), localY + 0.46, lz));
      ribPts.push(new THREE.Vector3(side * (surface.halfW - 0.24), localY - deckThick - 0.14, lz));
    }

    const topRail = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(topPts), 18, 0.075, 6, false),
      pal.crimsonLacquerMat,
    );
    topRail.castShadow = true;
    const midRail = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(midPts), 18, 0.05, 6, false),
      pal.crimsonLacquerMat,
    );
    const rib = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribPts), 18, 0.13, 6, false),
      pal.darkTimberMat,
    );
    group.add(topRail, midRail, rib);
  }

  // 3. Overhead Wooden Pergola Arches + hanging glowing chōchin lanterns!
  const archCount = 4;
  for (let i = 0; i < archCount; i++) {
    const t = 0.14 + (i / (archCount - 1)) * 0.72;
    const lz = surface.halfL - t * l;
    const localY = evaluateSurfaceLocal(surface, 0, lz).y - surface.baseY;
    const colH = 3.9;

    for (const side of [-1, 1]) {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, colH, 0.18),
        pal.crimsonLacquerMat,
      );
      col.position.set(side * (surface.halfW - 0.14), localY + colH * 0.5, lz);
      col.castShadow = true;
      group.add(col);

      // Decorative gilded post finial on handrail
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), pal.goldMat);
      finial.position.set(side * (surface.halfW - 0.14), localY + 1.04, lz);
      group.add(finial);
    }

    // Overhead curved pergola crossbeam
    const beamW = surface.halfW * 2 + 1.1;
    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(beamW, 0.18, 0.22), pal.darkTimberMat);
    crossBeam.position.set(0, localY + colH, lz);
    crossBeam.castShadow = true;
    group.add(crossBeam);

    // Subtle sakura blossom cluster draped over the pergola beam ends
    for (const side of [-1, 1]) {
      const tuft = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), pal.sakuraBlossomTrimMat);
      tuft.scale.set(1.2, 0.65, 0.9);
      tuft.position.set(side * (surface.halfW - 0.2), localY + colH + 0.18, lz);
      group.add(tuft);
    }

    // Hanging glowing paper lantern suspended from each pergola beam side
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (surface.halfW - 0.58), localY + colH - 0.08, lz);
      const lantern = buildMiniHangingLantern(pal);
      pivot.add(lantern);
      group.add(pivot);
      swayingLanterns.push({
        pivot,
        phase: i * 1.3 + (side > 0 ? 0.7 : 0),
        speed: 1.55 + (i % 2) * 0.25,
      });
    }
  }

  // Longitudinal pergola rafters connecting the arches overhead
  for (const side of [-1, 1]) {
    const rafterPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = 0.12 + (i / 10) * 0.76;
      const lz = surface.halfL - t * l;
      const localY = evaluateSurfaceLocal(surface, 0, lz).y - surface.baseY;
      rafterPts.push(new THREE.Vector3(side * (surface.halfW - 0.35), localY + 4.02, lz));
    }
    const rafter = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rafterPts), 14, 0.07, 6, false),
      pal.darkTimberMat,
    );
    group.add(rafter);
  }

  return group;
}

/**
 * Compact glowing paper chōchin lantern hanging from a cord (origin at top hook).
 */
export function buildMiniHangingLantern(pal: ArchitecturePalette): THREE.Group {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 5), pal.darkBronzeMat);
  cord.position.y = -0.17;
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.05, 10), pal.darkBronzeMat);
  capTop.position.y = -0.35;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), pal.paperLanternGlowMat);
  body.scale.set(0.92, 1.28, 0.92);
  body.position.y = -0.58;
  const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.05, 10), pal.darkBronzeMat);
  capBot.position.y = -0.82;
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 6), pal.crimsonLacquerMat);
  tassel.position.y = -0.94;
  tassel.rotation.x = Math.PI;
  g.add(cord, capTop, body, capBot, tassel);
  return g;
}

/**
 * Builds an ornate glowing turquoise-and-gold Spring Jump Pad.
 */
export function buildSpringPad(
  def: SpringPadDef,
  pal: ArchitecturePalette,
): AnimatedSpringPad {
  const group = new THREE.Group();
  group.name = `spring_${def.id}`;
  group.position.set(def.x, def.y, def.z);

  const r = def.radius;

  // Octagonal dark bronze outer housing flush on roof
  const baseMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.98, r * 1.08, 0.16, 8),
    pal.darkBronzeMat,
  );
  baseMesh.position.y = 0.08;
  baseMesh.receiveShadow = true;
  baseMesh.castShadow = true;
  group.add(baseMesh);

  // Gilded rim bezel
  const rimMesh = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.9, 0.09, 8, 24),
    pal.goldMat,
  );
  rimMesh.rotation.x = Math.PI * 0.5;
  rimMesh.position.y = 0.17;
  group.add(rimMesh);

  // Glowing turquoise lotus spring core
  const coreMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.78, r * 0.82, 0.12, 16),
    pal.springTurquoiseMat,
  );
  coreMesh.position.y = 0.16;
  group.add(coreMesh);

  // Floating golden energy halo ring hovering above the pad
  const ringMesh = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.62, 0.055, 8, 24),
    pal.springRingMat,
  );
  ringMesh.rotation.x = Math.PI * 0.5;
  ringMesh.position.y = 0.52;
  group.add(ringMesh);

  // Inner directional upward chevron ring
  const innerDisc = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.34, 0.045, 6, 16),
    pal.goldMat,
  );
  innerDisc.rotation.x = Math.PI * 0.5;
  innerDisc.position.y = 0.24;
  group.add(innerDisc);

  return {
    def,
    group,
    ringMesh,
    coreMesh,
    recoil: 0,
    cooldown: 0,
  };
}

/**
 * Builds an authentic Vermilion Shinto Checkpoint Torii Arch with upturned kasagi roof beam,
 * gilded central plaque, sacred shide streamers, and optional warm beacon PointLight.
 */
export function buildCheckpointTorii(
  def: CheckpointDef,
  pal: ArchitecturePalette,
  withBeaconLight: boolean,
): AnimatedCheckpoint {
  const group = new THREE.Group();
  group.name = `checkpoint_${def.index}`;
  group.position.set(def.x, def.y, def.z);
  group.rotation.y = def.yaw;

  const span = 6.2;
  const halfSpan = span * 0.5;
  const pillarH = 5.4;

  // Two tapered vermilion pillars (hashira) with dark granite bases (kamebara)
  for (const side of [-1, 1]) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.42, 0.62, 10),
      pal.darkBronzeMat,
    );
    base.position.set(side * halfSpan, 0.31, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.27, pillarH, 12),
      pal.crimsonLacquerMat,
    );
    pillar.position.set(side * halfSpan, pillarH * 0.5 + 0.25, 0);
    pillar.rotation.z = side * 0.035; // authentic slight inward lean (korobi)
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);

    // Pillar top collar (daiwa)
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.27, 0.16, 12),
      pal.darkBronzeMat,
    );
    collar.position.set(side * (halfSpan - 0.1), pillarH + 0.18, 0);
    group.add(collar);
  }

  // Lower horizontal tie-beam (nuki) protruding slightly past pillars
  const nuki = new THREE.Mesh(
    new THREE.BoxGeometry(span + 1.85, 0.28, 0.22),
    pal.crimsonLacquerMat,
  );
  nuki.position.set(0, pillarH - 0.62, 0);
  nuki.castShadow = true;
  group.add(nuki);

  // Upper curving lintel (shimaki + kasagi)
  const shimaki = new THREE.Mesh(
    new THREE.BoxGeometry(span + 2.45, 0.3, 0.38),
    pal.crimsonLacquerMat,
  );
  shimaki.position.set(0, pillarH + 0.34, 0);
  shimaki.castShadow = true;
  group.add(shimaki);

  const kasagi = new THREE.Mesh(
    new THREE.BoxGeometry(span + 2.75, 0.24, 0.52),
    pal.darkBronzeMat,
  );
  kasagi.position.set(0, pillarH + 0.58, 0);
  kasagi.castShadow = true;
  group.add(kasagi);

  // Upturned winged kasagi eaves at left & right tips
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.26, 0.54), pal.darkBronzeMat);
    wing.position.set(side * (halfSpan + 1.58), pillarH + 0.72, 0);
    wing.rotation.z = side * 0.28;
    group.add(wing);

    const goldTip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.56), pal.goldMat);
    goldTip.position.set(side * (halfSpan + 2.02), pillarH + 0.85, 0);
    goldTip.rotation.z = side * 0.28;
    group.add(goldTip);
  }

  // Central nameplate plaque (gakuzuka) — glows warm gold once checkpoint is activated!
  const plaqueMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3b2824'),
    emissive: new THREE.Color('#ffaa38'),
    emissiveIntensity: def.index === 0 ? 1.8 : 0.18,
    roughness: 0.35,
    metalness: 0.5,
  });
  const plaqueFrame = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.05, 0.26), pal.goldMat);
  plaqueFrame.position.set(0, pillarH - 0.12, 0);
  const plaqueFace = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.86, 0.3), plaqueMat);
  plaqueFace.position.set(0, pillarH - 0.12, 0);
  group.add(plaqueFrame, plaqueFace);

  // Sacred white zigzag shide paper streamers hanging beneath the nuki beam
  const streamers: THREE.Mesh[] = [];
  const streamerGeo = new THREE.PlaneGeometry(0.22, 0.55);
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const m = new THREE.Mesh(streamerGeo, pal.shidePaperMat);
    m.position.set(i * 1.05, pillarH - 1.04, 0);
    group.add(m);
    streamers.push(m);
  }

  let beaconLight: THREE.PointLight | null = null;
  if (withBeaconLight) {
    beaconLight = new THREE.PointLight(
      0xffb668,
      def.index === 0 ? 2.4 : 0.6,
      14,
      1.6,
    );
    beaconLight.position.set(0, pillarH - 0.6, 0);
    group.add(beaconLight);
  }

  return {
    def,
    group,
    activated: def.index === 0,
    plaqueMat,
    beaconLight,
    streamers,
    pulseTimer: 0,
  };
}

/**
 * Builds a traditional Japanese festival flag / wooden nobori checkpoint banner.
 */
export function buildFestivalBanner(
  color: string,
  pal: ArchitecturePalette,
): { group: THREE.Group; clothMesh: THREE.Mesh } {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 3.4, 8), pal.darkTimberMat);
  pole.position.y = 1.7;
  pole.castShadow = true;
  group.add(pole);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6), pal.darkTimberMat);
  arm.rotation.z = Math.PI * 0.5;
  arm.position.set(0.42, 3.25, 0);
  group.add(arm);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), pal.goldMat);
  finial.position.y = 3.45;
  group.add(finial);

  const clothMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.14,
    roughness: 0.72,
    side: THREE.DoubleSide,
  });
  const clothGeo = new THREE.PlaneGeometry(0.76, 1.95, 3, 6);
  const clothMesh = new THREE.Mesh(clothGeo, clothMat);
  clothMesh.position.set(0.42, 2.24, 0);
  clothMesh.castShadow = true;
  group.add(clothMesh);

  return { group, clothMesh };
}

/**
 * Builds a Temple Bell Pavilion (Bonshō) accent for Island 7.
 */
export function buildBellPavilion(pal: ArchitecturePalette): {
  group: THREE.Group;
  bell: THREE.Object3D;
} {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.34, 3.2), pal.stoneBaseMat);
  base.position.y = 0.17;
  base.receiveShadow = true;
  base.castShadow = true;
  group.add(base);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.1, 10), pal.crimsonLacquerMat);
      col.position.set(sx * 1.15, 1.85, sz * 1.15);
      col.castShadow = true;
      group.add(col);
    }
  }

  // Sweeping four-sided tiled roof
  const roofLower = new THREE.Mesh(new THREE.ConeGeometry(2.75, 1.25, 4), pal.eaveTileMat);
  roofLower.position.y = 3.92;
  roofLower.rotation.y = Math.PI * 0.25;
  roofLower.castShadow = true;
  group.add(roofLower);

  const ridge = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.28), pal.goldMat);
  ridge.position.y = 4.58;
  group.add(ridge);

  // Hanging patinated bronze bell
  const bellPivot = new THREE.Group();
  bellPivot.position.set(0, 3.2, 0);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.65, 6), pal.darkBronzeMat);
  chain.position.y = -0.32;
  const bellMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3b5a52'),
    roughness: 0.44,
    metalness: 0.78,
  });
  const bellBody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.58, 1.15, 14), bellMat);
  bellBody.position.y = -1.1;
  bellBody.castShadow = true;
  const bellLip = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.06, 6, 16), pal.goldMat);
  bellLip.rotation.x = Math.PI * 0.5;
  bellLip.position.y = -1.66;
  bellPivot.add(chain, bellBody, bellLip);
  group.add(bellPivot);

  return { group, bell: bellPivot };
}

/**
 * Builds the monumental 3-Tier Golden Sky Pagoda crowning Island 10!
 */
export function buildGoldenSkyPagoda(pal: ArchitecturePalette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'GoldenSkyPagoda';

  // Carved stone tiered plinth
  const plinth1 = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.62, 11.4), pal.stoneBaseMat);
  plinth1.position.y = 0.31;
  plinth1.receiveShadow = true;
  plinth1.castShadow = true;
  group.add(plinth1);

  const plinth2 = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.55, 9.8), pal.pathStoneMat);
  plinth2.position.y = 0.88;
  plinth2.receiveShadow = true;
  plinth2.castShadow = true;
  group.add(plinth2);

  // Ceremonial front stone steps leading up from the courtyard
  for (let s = 0; s < 4; s++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.28, 0.65),
      pal.pathStoneMat,
    );
    step.position.set(0, 0.14 + s * 0.26, 6.2 - s * 0.52);
    step.receiveShadow = true;
    group.add(step);
  }

  // Three progressively tapered pagoda tiers
  const tiers = [
    { y: 1.15, bodyW: 7.4, bodyH: 3.6, roofW: 11.8, roofH: 1.75 },
    { y: 5.75, bodyW: 5.7, bodyH: 3.1, roofW: 9.4, roofH: 1.55 },
    { y: 9.75, bodyW: 4.2, bodyH: 2.6, roofW: 7.2, roofH: 1.5 },
  ];

  for (let idx = 0; idx < tiers.length; idx++) {
    const t = tiers[idx];
    const tierGroup = new THREE.Group();
    tierGroup.position.y = t.y;

    // Warm plaster core + radiant shoji sanctuary interior
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(t.bodyW, t.bodyH, t.bodyW),
      pal.plasterMat,
    );
    core.position.y = t.bodyH * 0.5;
    core.castShadow = true;
    core.receiveShadow = true;
    tierGroup.add(core);

    // Radiant golden shoji panels on all 4 facades
    const shojiW = t.bodyW * 0.58;
    const shojiH = t.bodyH * 0.62;
    const shojiNS = new THREE.Mesh(
      new THREE.BoxGeometry(shojiW, shojiH, t.bodyW + 0.08),
      pal.shojiGlowMat,
    );
    shojiNS.position.y = t.bodyH * 0.48;
    const shojiEW = new THREE.Mesh(
      new THREE.BoxGeometry(t.bodyW + 0.08, shojiH, shojiW),
      pal.shojiGlowMat,
    );
    shojiEW.position.y = t.bodyH * 0.48;
    tierGroup.add(shojiNS, shojiEW);

    // Vermilion corner & facade columns
    const colPositions = [-0.5, -0.18, 0.18, 0.5];
    for (const fx of colPositions) {
      for (const fz of [-0.5, 0.5]) {
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.15, t.bodyH + 0.15, 10),
          pal.crimsonLacquerMat,
        );
        col.position.set(fx * t.bodyW, t.bodyH * 0.5, fz * (t.bodyW + 0.14));
        col.castShadow = true;
        tierGroup.add(col);
      }
    }
    for (const fz of [-0.18, 0.18]) {
      for (const fx of [-0.5, 0.5]) {
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.15, t.bodyH + 0.15, 10),
          pal.crimsonLacquerMat,
        );
        col.position.set(fx * (t.bodyW + 0.14), t.bodyH * 0.5, fz * t.bodyW);
        col.castShadow = true;
        tierGroup.add(col);
      }
    }

    // Gilded upper gallery railing wrap
    if (idx > 0) {
      const bal = new THREE.Mesh(
        new THREE.BoxGeometry(t.bodyW + 1.15, 0.42, t.bodyW + 1.15),
        pal.crimsonLacquerMat,
      );
      bal.position.y = 0.24;
      tierGroup.add(bal);
    }

    // Sweeping flared Pagoda roof (two stacked 4-sided pyramids for graceful curve + gilded rim!)
    const lowerFlange = new THREE.Mesh(
      new THREE.CylinderGeometry(t.bodyW * 0.82, t.roofW * 0.72, t.roofH * 0.58, 4),
      pal.eaveTileMat,
    );
    lowerFlange.rotation.y = Math.PI * 0.25;
    lowerFlange.position.y = t.bodyH + t.roofH * 0.22;
    lowerFlange.castShadow = true;
    lowerFlange.receiveShadow = true;
    tierGroup.add(lowerFlange);

    const upperSlope = new THREE.Mesh(
      new THREE.CylinderGeometry(
        idx === 2 ? 0.45 : t.bodyW * 0.56,
        t.bodyW * 0.84,
        t.roofH * 0.65,
        4,
      ),
      pal.eaveTileMat,
    );
    upperSlope.rotation.y = Math.PI * 0.25;
    upperSlope.position.y = t.bodyH + t.roofH * 0.72;
    upperSlope.castShadow = true;
    tierGroup.add(upperSlope);

    // Gilded eave trim ring & 4 hanging golden wind-bells (fūrin) at the upturned corners
    const cornerOff = t.roofW * 0.495;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.62, 5), pal.goldMat);
        horn.position.set(sx * cornerOff, t.bodyH + 0.22, sz * cornerOff);
        horn.rotation.z = -sx * 0.55;
        horn.rotation.x = sz * 0.55;
        tierGroup.add(horn);

        const bell = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 8), pal.goldMat);
        bell.position.set(sx * (cornerOff - 0.14), t.bodyH - 0.22, sz * (cornerOff - 0.14));
        tierGroup.add(bell);
      }
    }

    group.add(tierGroup);
  }

  // Towering Golden Sōrin Spire Finial crowning the 3rd roof!
  const spireBaseY = 9.75 + 2.6 + 1.5;
  const spireBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 1.15), pal.goldMat);
  spireBase.position.y = spireBaseY;
  group.add(spireBase);

  const spireShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.19, 4.2, 10), pal.goldMat);
  spireShaft.position.y = spireBaseY + 2.15;
  group.add(spireShaft);

  // 7 sacred golden rings (kurin) ascending the spire
  for (let r = 0; r < 7; r++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.36 - r * 0.025, 0.045, 6, 14),
      pal.goldMat,
    );
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = spireBaseY + 0.72 + r * 0.36;
    group.add(ring);
  }

  // Glowing sacred jewel finial (hōju) at the apex
  const jewel = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.36, 1),
    pal.chevronMat,
  );
  jewel.position.y = spireBaseY + 4.45;
  group.add(jewel);

  return group;
}

/**
 * Builds the ceremonial Golden Summit Shrine Medallion pad in front of the Sky Pagoda.
 */
export function buildSummitMedallion(
  x: number,
  y: number,
  z: number,
  radius: number,
  pal: ArchitecturePalette,
): {
  group: THREE.Group;
  ringOuter: THREE.Mesh;
  ringInner: THREE.Mesh;
  pillarBeam: THREE.Mesh;
  light: THREE.PointLight;
} {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.94, radius * 1.06, 0.16, 24),
    pal.goldMat,
  );
  dais.position.y = 0.08;
  dais.receiveShadow = true;
  group.add(dais);

  const centerLotus = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, 0.18, 24),
    pal.paperLanternGlowMat,
  );
  centerLotus.position.y = 0.09;
  group.add(centerLotus);

  const ringOuter = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.84, 0.08, 10, 32),
    pal.chevronMat,
  );
  ringOuter.rotation.x = Math.PI * 0.5;
  ringOuter.position.y = 0.55;
  group.add(ringOuter);

  const ringInner = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.54, 0.06, 8, 24),
    pal.springTurquoiseMat,
  );
  ringInner.rotation.x = Math.PI * 0.5;
  ringInner.position.y = 1.05;
  group.add(ringInner);

  const beamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffdca8'),
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const pillarBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.52, radius * 0.76, 12.0, 20, 1, true),
    beamMat,
  );
  pillarBeam.position.y = 6.0;
  group.add(pillarBeam);

  const light = new THREE.PointLight(0xffcf82, 3.6, 18, 1.5);
  light.position.set(0, 2.2, 0);
  group.add(light);

  return { group, ringOuter, ringInner, pillarBeam, light };
}

/**
 * Builds a festoon garland of swaying paper lanterns strung across an island courtyard.
 */
export function buildLanternGarland(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  height: number,
  count: number,
  pal: ArchitecturePalette,
  swayingLanterns: Array<{ pivot: THREE.Object3D; phase: number; speed: number }>,
): THREE.Group {
  const group = new THREE.Group();

  // Left & right lacquered timber poles
  for (const [px, pz] of [
    [fromX, fromZ],
    [toX, toZ],
  ]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, height + 0.5, 8), pal.darkTimberMat);
    pole.position.set(px, (height + 0.5) * 0.5, pz);
    pole.castShadow = true;
    group.add(pole);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), pal.goldMat);
    cap.position.set(px, height + 0.52, pz);
    group.add(cap);
  }

  // Draped catenary wire
  const pts: THREE.Vector3[] = [];
  const sag = 0.85;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = fromX + (toX - fromX) * t;
    const z = fromZ + (toZ - fromZ) * t;
    const y = height - 4 * sag * t * (1 - t);
    pts.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.022, 5, false), pal.darkBronzeMat);
  group.add(rope);

  // Hanging lanterns spaced evenly along the catenary
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1);
    const p = curve.getPoint(t);
    const pivot = new THREE.Group();
    pivot.position.copy(p);
    const lantern = buildMiniHangingLantern(pal);
    lantern.scale.setScalar(0.86);
    pivot.add(lantern);
    group.add(pivot);
    swayingLanterns.push({
      pivot,
      phase: i * 0.9 + fromZ * 0.15,
      speed: 1.6 + (i % 3) * 0.22,
    });
  }

  return group;
}

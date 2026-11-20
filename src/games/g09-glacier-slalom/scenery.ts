import * as THREE from 'three';
import {
  createForest,
  createGrassField,
  createLantern,
  createMossyBoulder,
  createParticleSystem,
  createPBRMaterial,
  updateFoliageWind,
  type ForestBatch,
  type ForestPlacement,
  type GrassField,
  type ParticleSystem,
} from '../../art';
import {
  CHALET_POS,
  getIceSurfaceHeight,
  getSignedDistOutsideIce,
  getSnowTerrainHeight,
  getTrackCenterX,
  LANE_HALF_WIDTH,
  RINK_CENTER_Z,
  RINK_RADIUS,
} from './course';

export interface NordicScenery {
  group: THREE.Group;
  update: (dt: number, time: number, playerPos: THREE.Vector3) => void;
  dispose: () => void;
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

/**
 * Handcrafted Timber & Stone Nordic Alpine Chalet overlooking the frozen curling rink,
 * complete with warm amber glowing lattice windows, pitched snow-blanketed roof, icicles,
 * timber porch, crossed vintage skis, and stone chimney top coordinate for rising smoke.
 */
function buildNordicChalet(
  ownedGeos: THREE.BufferGeometry[],
  ownedMats: THREE.Material[],
): { group: THREE.Group; chimneyTopWorld: THREE.Vector3; hearthLight: THREE.PointLight } {
  const chalet = new THREE.Group();
  chalet.name = 'NordicTimberChalet';
  chalet.position.copy(CHALET_POS);
  // Face warmly southwest toward the Olympic Curling House & downhill finish!
  chalet.rotation.y = -Math.PI * 0.44;

  const stoneMat = createPBRMaterial('cobblestone', { repeatX: 3, repeatY: 1.2, seed: 920, tint: '#8b96a4' });
  const timberMat = createPBRMaterial('woodPlanks', { repeatX: 3, repeatY: 2, seed: 921, tint: '#8f5a38' });
  const darkLogMat = createPBRMaterial('bark', { repeatX: 1, repeatY: 2, seed: 922, tint: '#462c1c' });
  const roofMat = createPBRMaterial('roofTiles', { repeatX: 4, repeatY: 3, seed: 923, tint: '#543b30' });
  const snowMat = createPBRMaterial('snow', { repeatX: 3, repeatY: 2, seed: 924 });
  const windowGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffd588,
    emissive: 0xffa63d,
    emissiveIntensity: 2.35,
    roughness: 0.18,
    metalness: 0.05,
  });
  const icicleMat = new THREE.MeshStandardMaterial({
    color: 0xdcf2ff,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.82,
    envMapIntensity: 1.5,
  });
  const redSkiMat = new THREE.MeshStandardMaterial({ color: 0xc92c3e, roughness: 0.32, metalness: 0.2 });
  const blueSkiMat = new THREE.MeshStandardMaterial({ color: 0x2068b8, roughness: 0.32, metalness: 0.2 });

  ownedMats.push(stoneMat, timberMat, darkLogMat, roofMat, snowMat, windowGlowMat, icicleMat, redSkiMat, blueSkiMat);

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    ownedGeos.push(g);
    return g;
  };

  // 1. Stone foundation plinth
  const baseMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.6, 1.8, 9.2)), stoneMat);
  baseMesh.position.set(0, 0.7, 0);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  chalet.add(baseMesh);

  // 2. Main warm notched timber cabin body
  const cabinMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(10.6, 4.6, 8.2)), timberMat);
  cabinMesh.position.set(0, 3.85, 0);
  cabinMesh.castShadow = true;
  cabinMesh.receiveShadow = true;
  chalet.add(cabinMesh);

  // Corner dark timber structural log posts
  const cornerPostGeo = trackGeo(new THREE.CylinderGeometry(0.26, 0.28, 4.85, 8));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(cornerPostGeo, darkLogMat);
      post.position.set(sx * 5.28, 3.9, sz * 4.08);
      post.castShadow = true;
      chalet.add(post);
    }
  }

  // Horizontal decorative timber belt beams
  const beltFrontGeo = trackGeo(new THREE.BoxGeometry(11.1, 0.3, 0.32));
  for (const sz of [-1, 1]) {
    const belt = new THREE.Mesh(beltFrontGeo, darkLogMat);
    belt.position.set(0, 6.08, sz * 4.12);
    chalet.add(belt);
  }

  // 3. Triangular timber gable ends
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-5.3, 0);
  gableShape.lineTo(5.3, 0);
  gableShape.lineTo(0, 4.2);
  gableShape.closePath();
  const gableGeo = trackGeo(new THREE.ExtrudeGeometry(gableShape, { depth: 8.2, bevelEnabled: false }));
  gableGeo.translate(0, 6.15, -4.1);
  const gableMesh = new THREE.Mesh(gableGeo, timberMat);
  gableMesh.castShadow = true;
  gableMesh.receiveShadow = true;
  chalet.add(gableMesh);

  // 4. Steep pitched alpine timber roof + thick overhanging Snow Blanket Cap
  const slopeLen = Math.hypot(6.6, 4.85);
  const roofAngle = Math.atan2(4.85, 6.6);
  const roofSlabGeo = trackGeo(new THREE.BoxGeometry(slopeLen, 0.34, 10.8));
  const snowCapGeo = trackGeo(new THREE.BoxGeometry(slopeLen + 0.16, 0.44, 11.0));

  for (const side of [-1, 1]) {
    const roofSlope = new THREE.Mesh(roofSlabGeo, roofMat);
    roofSlope.position.set(side * 3.15, 8.15, 0.45);
    roofSlope.rotation.z = -side * roofAngle;
    roofSlope.castShadow = true;
    roofSlope.receiveShadow = true;
    chalet.add(roofSlope);

    const snowBlanket = new THREE.Mesh(snowCapGeo, snowMat);
    snowBlanket.position.set(side * 3.15, 8.5, 0.45);
    snowBlanket.rotation.z = -side * roofAngle;
    snowBlanket.castShadow = true;
    snowBlanket.receiveShadow = true;
    chalet.add(snowBlanket);
  }

  // Sculpted snow ridge crest along roof peak
  const ridgeCap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.42, 0.48, 11.0, 10)), snowMat);
  ridgeCap.rotation.x = Math.PI / 2;
  ridgeCap.position.set(0, 10.65, 0.45);
  chalet.add(ridgeCap);

  // Glistening icicles along the front & side roof eaves
  const icicleGeo = trackGeo(new THREE.ConeGeometry(0.08, 0.65, 5));
  icicleGeo.rotateX(Math.PI);
  for (let i = 0; i < 12; i++) {
    const zPos = -4.5 + i * 0.9;
    const lenScale = 0.65 + ((i * 7) % 5) * 0.16;
    for (const side of [-1, 1]) {
      const icicle = new THREE.Mesh(icicleGeo, icicleMat);
      icicle.position.set(side * 6.18, 5.72 - lenScale * 0.18, zPos);
      icicle.scale.set(1, lenScale, 1);
      chalet.add(icicle);
    }
  }

  // 5. Warm Amber Glowing Lattice Windows (front facade, gable loft, and side walls)
  const addLatticeWindow = (x: number, y: number, z: number, rotY: number, w = 1.65, h = 1.75) => {
    const win = new THREE.Group();
    win.position.set(x, y, z);
    win.rotation.y = rotY;

    const frame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.26, h + 0.26, 0.16)), darkLogMat);
    const pane = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(w, h)), windowGlowMat);
    pane.position.z = 0.095;

    // Lattice mullions (vertical & horizontal crossbars)
    const vBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, h + 0.04, 0.08)), darkLogMat);
    vBar.position.z = 0.11;
    const hBar1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.04, 0.08, 0.08)), darkLogMat);
    hBar1.position.set(0, h * 0.16, 0.11);
    const hBar2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.04, 0.08, 0.08)), darkLogMat);
    hBar2.position.set(0, -h * 0.2, 0.11);

    // Snow-dusted sill
    const sill = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.42, 0.18, 0.34)), snowMat);
    sill.position.set(0, -h * 0.5 - 0.14, 0.12);

    win.add(frame, pane, vBar, hBar1, hBar2, sill);
    chalet.add(win);
  };

  // Front face windows (+Z faces the curling arena!)
  addLatticeWindow(-3.1, 4.0, 4.14, 0, 1.7, 1.8);
  addLatticeWindow(3.1, 4.0, 4.14, 0, 1.7, 1.8);
  // Cozy gable attic loft window
  addLatticeWindow(0.0, 7.65, 4.14, 0, 1.85, 1.45);
  // Left & Right side windows
  addLatticeWindow(-5.34, 4.0, 1.4, -Math.PI / 2, 1.65, 1.7);
  addLatticeWindow(-5.34, 4.0, -1.8, -Math.PI / 2, 1.65, 1.7);
  addLatticeWindow(5.34, 4.0, 0.0, Math.PI / 2, 1.75, 1.7);

  // 6. Front Veranda Deck, Carved Door, Porch Railings & Crossed Skis
  const porchDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(10.8, 0.42, 3.0)), darkLogMat);
  porchDeck.position.set(0, 1.48, 5.5);
  porchDeck.castShadow = true;
  porchDeck.receiveShadow = true;
  chalet.add(porchDeck);

  // Porch railing posts & top snow rail
  const railPostGeo = trackGeo(new THREE.BoxGeometry(0.18, 1.15, 0.18));
  for (const px of [-5.1, -3.2, -1.6, 1.6, 3.2, 5.1]) {
    const p = new THREE.Mesh(railPostGeo, darkLogMat);
    p.position.set(px, 2.25, 6.85);
    chalet.add(p);
  }
  const railBarGeo = trackGeo(new THREE.BoxGeometry(3.7, 0.14, 0.2));
  for (const rx of [-3.35, 3.35]) {
    const rail = new THREE.Mesh(railBarGeo, darkLogMat);
    rail.position.set(rx, 2.75, 6.85);
    const railSnow = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.7, 0.12, 0.24)), snowMat);
    railSnow.position.set(rx, 2.86, 6.85);
    chalet.add(rail, railSnow);
  }

  // Wide wooden entry steps descending onto the snow terrace
  for (let st = 0; st < 3; st++) {
    const stepMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.0, 0.34, 0.6)), timberMat);
    stepMesh.position.set(0, 1.15 - st * 0.36, 7.2 + st * 0.52);
    stepMesh.receiveShadow = true;
    chalet.add(stepMesh);
  }

  // Carved Nordic front door with warm glowing transom window
  const doorFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.0, 3.2, 0.22)), darkLogMat);
  doorFrame.position.set(0, 3.25, 4.12);
  const doorPanel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.64, 2.92, 0.18)), timberMat);
  doorPanel.position.set(0, 3.18, 4.18);
  const doorWindow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.76, 0.72)), windowGlowMat);
  doorWindow.position.set(0, 3.85, 4.29);
  chalet.add(doorFrame, doorPanel, doorWindow);

  // Decorative crossed vintage Nordic wooden skis propped by the porch
  const skiGeo = trackGeo(new THREE.BoxGeometry(0.18, 2.55, 0.06));
  const skiA = new THREE.Mesh(skiGeo, redSkiMat);
  skiA.position.set(1.65, 3.0, 4.32);
  skiA.rotation.z = 0.24;
  const skiB = new THREE.Mesh(skiGeo, blueSkiMat);
  skiB.position.set(1.65, 3.0, 4.38);
  skiB.rotation.z = -0.24;
  chalet.add(skiA, skiB);

  // Cozy warm amber hearth PointLight spilling golden light onto the porch & curling terrace
  const hearthLight = new THREE.PointLight(0xffb45c, 26, 36, 1.45);
  hearthLight.position.set(0, 4.5, 6.4);
  chalet.add(hearthLight);

  // 7. Tall Fieldstone Chimney rising above the snow roof
  const chimneyBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.75, 11.4, 1.75)), stoneMat);
  chimneyBase.position.set(2.9, 6.2, -1.6);
  chimneyBase.castShadow = true;
  chimneyBase.receiveShadow = true;
  chalet.add(chimneyBase);

  const chimneyRim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.05, 0.36, 2.05)), snowMat);
  chimneyRim.position.set(2.9, 11.92, -1.6);
  chalet.add(chimneyRim);

  // Compute exact world position of chimney mouth for live rising smoke particles
  chalet.updateMatrixWorld(true);
  const chimneyTopWorld = new THREE.Vector3(2.9, 12.18, -1.6);
  chalet.localToWorld(chimneyTopWorld);

  return { group: chalet, chimneyTopWorld, hearthLight };
}

/**
 * Twin sculpted Nordic Start Gate Pylons at the Summit (NO low overhead bar so chase cam
 * sightline is 100% unobstructed from frame 1!).
 */
function buildSummitStartPylons(
  ownedGeos: THREE.BufferGeometry[],
  ownedMats: THREE.Material[],
): { group: THREE.Group; flags: THREE.Mesh[] } {
  const startGroup = new THREE.Group();
  startGroup.name = 'SummitStartPylons';
  const flags: THREE.Mesh[] = [];

  const timberMat = createPBRMaterial('woodPlanks', { repeatX: 1, repeatY: 3, seed: 930, tint: '#70472c' });
  const stoneMat = createPBRMaterial('cobblestone', { repeatX: 2, repeatY: 1, seed: 931, tint: '#7f8b9a' });
  const brassMat = createPBRMaterial('brushedBrass', { repeatX: 1, repeatY: 1, seed: 932 });
  const snowMat = createPBRMaterial('snow', { repeatX: 1, repeatY: 1, seed: 933 });
  const redBannerMat = new THREE.MeshStandardMaterial({
    color: 0xd63342,
    emissive: 0x4a0b12,
    emissiveIntensity: 0.25,
    roughness: 0.45,
    side: THREE.DoubleSide,
  });
  const blueBannerMat = new THREE.MeshStandardMaterial({
    color: 0x1e70cc,
    emissive: 0x0a2248,
    emissiveIntensity: 0.25,
    roughness: 0.45,
    side: THREE.DoubleSide,
  });
  ownedMats.push(timberMat, stoneMat, brassMat, snowMat, redBannerMat, blueBannerMat);

  const plinthGeo = new THREE.BoxGeometry(1.65, 1.2, 1.65);
  const postGeo = new THREE.CylinderGeometry(0.32, 0.38, 5.2, 10);
  const capGeo = new THREE.ConeGeometry(0.65, 0.85, 4);
  const crossArmGeo = new THREE.BoxGeometry(2.1, 0.16, 0.16);
  const bannerGeo = new THREE.PlaneGeometry(1.5, 2.2, 4, 4);
  const lanternCrownGeo = new THREE.SphereGeometry(0.24, 12, 10);
  ownedGeos.push(plinthGeo, postGeo, capGeo, crossArmGeo, bannerGeo, lanternCrownGeo);

  const y0 = getIceSurfaceHeight(0.5);

  for (const side of [-1, 1]) {
    const pylon = new THREE.Group();
    pylon.position.set(side * 8.2, y0, 0.5);

    const plinth = new THREE.Mesh(plinthGeo, stoneMat);
    plinth.position.y = 0.55;
    plinth.castShadow = true;
    plinth.receiveShadow = true;

    const post = new THREE.Mesh(postGeo, timberMat);
    post.position.y = 3.5;
    post.castShadow = true;

    const cap = new THREE.Mesh(capGeo, snowMat);
    cap.position.y = 6.45;
    cap.rotation.y = Math.PI / 4;

    const finial = new THREE.Mesh(lanternCrownGeo, brassMat);
    finial.position.y = 6.95;

    // Banner hangs on the OUTSIDE of the pylon so center sightline is crystal clear!
    const arm = new THREE.Mesh(crossArmGeo, brassMat);
    arm.position.set(side * 1.0, 5.15, 0);

    const banner = new THREE.Mesh(bannerGeo, side < 0 ? redBannerMat : blueBannerMat);
    banner.position.set(side * 1.25, 3.95, 0);
    banner.castShadow = true;
    flags.push(banner);

    pylon.add(plinth, post, cap, finial, arm, banner);
    startGroup.add(pylon);
  }

  // Painted snow-ice START timing line between pylons
  const startStripGeo = new THREE.PlaneGeometry(14.6, 0.8);
  startStripGeo.rotateX(-Math.PI / 2);
  ownedGeos.push(startStripGeo);
  const startStripMat = new THREE.MeshBasicMaterial({
    color: 0xe84052,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  ownedMats.push(startStripMat);
  const strip = new THREE.Mesh(startStripGeo, startStripMat);
  strip.position.set(0, y0 + 0.032, 0.5);
  startGroup.add(strip);

  return { group: startGroup, flags };
}

/**
 * Dramatic faceted Nordic alpine granite peaks with snow-capped ridges rising
 * solidly from deep below the frozen valley floor (`y = -26`) so no undersides
 * ever float above the terrain or mist.
 */
function buildDistantAlpinePeaks(
  ownedGeos: THREE.BufferGeometry[],
  ownedMats: THREE.Material[],
): THREE.Group {
  const peaksGroup = new THREE.Group();
  peaksGroup.name = 'DistantNordicPeaks';

  const rockMat = createPBRMaterial('rock', { repeatX: 3, repeatY: 3, seed: 940, tint: '#6f8094' });
  const snowCapMat = createPBRMaterial('snow', { repeatX: 2, repeatY: 2, seed: 941 });
  ownedMats.push(rockMat, snowCapMat);

  // [x, z, baseRadius, totalHeightFromBase, rotY]
  // All bases anchored at y = -26 (deep below lake y=0 and snow valley)
  const PEAK_BASE_Y = -26;
  const peakSpecs: [number, number, number, number, number][] = [
    // Far lake fjord backdrop peaks (majestic panorama straight ahead!)
    [-82, -284, 66, 104, 0.4],
    [-30, -306, 74, 122, 1.1],
    [28, -304, 72, 118, 2.0],
    [84, -282, 68, 106, 0.8],
    [114, -242, 62, 94, 1.7],
    [-114, -240, 62, 96, 2.4],
    // Valley flanking crags (rising solidly out of the snowy foothills)
    [-92, -162, 58, 96, 0.5],
    [94, -154, 58, 94, 1.9],
    [-88, -76, 60, 106, 2.8],
    [90, -70, 60, 104, 0.2],
  ];

  const addPeakSpire = (
    parent: THREE.Group,
    ox: number,
    oz: number,
    r: number,
    h: number,
    rot: number,
  ) => {
    const spire = new THREE.Group();
    spire.position.set(ox, 0, oz);
    spire.rotation.y = rot;

    // Open-ended cones rooted deep underground — zero flat undersides possible
    const rockGeo = new THREE.ConeGeometry(r, h, 7, 1, true);
    rockGeo.translate(0, h * 0.5, 0);

    const capFrac = 0.44;
    const capH = h * capFrac;
    const capR = r * (capFrac + 0.015);
    const capGeo = new THREE.ConeGeometry(capR, capH, 7, 1, true);
    capGeo.translate(0, h + 0.12 - capH * 0.5, 0);

    ownedGeos.push(rockGeo, capGeo);

    const rockMesh = new THREE.Mesh(rockGeo, rockMat);
    const capMesh = new THREE.Mesh(capGeo, snowCapMat);
    spire.add(rockMesh, capMesh);
    parent.add(spire);
  };

  for (const [x, z, r, h, rot] of peakSpecs) {
    const peak = new THREE.Group();
    peak.position.set(x, PEAK_BASE_Y, z);

    // Offset ridge shoulder slightly outward from the fjord center so it never encroaches on the lake/trees
    const outX = x;
    const outZ = z - -140;
    const outLen = Math.hypot(outX, outZ) || 1;
    const shX = (outX / outLen) * r * 0.28 + Math.sin(rot) * r * 0.16;
    const shZ = (outZ / outLen) * r * 0.28 + Math.cos(rot) * r * 0.16;

    // Main alpine spire + natural offset ridge shoulder for authentic mountain massing
    addPeakSpire(peak, 0, 0, r, h, rot);
    addPeakSpire(peak, shX, shZ, r * 0.72, h * 0.78, rot + 0.65);

    peaksGroup.add(peak);
  }

  return peaksGroup;
}

// ---------------------------------------------------------------------------
// Main Nordic Scenery Assembly
// ---------------------------------------------------------------------------

export function buildNordicScenery(): NordicScenery {
  const group = new THREE.Group();
  group.name = 'NordicWinterScenery';

  const ownedGeos: THREE.BufferGeometry[] = [];
  const ownedMats: THREE.Material[] = [];
  const grassFields: GrassField[] = [];
  const rng = mulberry32(202609);

  // 1. Handcrafted Timber & Stone Nordic Chalet + Chimney Smoke Particle System
  const chalet = buildNordicChalet(ownedGeos, ownedMats);
  group.add(chalet.group);

  const chimneySmoke: ParticleSystem = createParticleSystem({
    type: 'smoke',
    count: 0,
    burstCapacity: 72,
    size: 1.15,
    colors: [0xe6eef6, 0xd4dfe8, 0xf2f6fa],
    wind: new THREE.Vector3(-0.7, 0.25, -0.35),
    ambient: false,
  });
  group.add(chimneySmoke.group);

  // 2. Summit Start Pylons & Flags
  const startPylons = buildSummitStartPylons(ownedGeos, ownedMats);
  group.add(startPylons.group);

  // 3. Snow-Laden Nordic Spruce Forest (70 multi-branch snow_pine trees!)
  const treePlacements: ForestPlacement[] = [];

  // 3a. Flanking downhill glacier fjord spruce groves (left & right snowbanks)
  for (let i = 0; i < 42; i++) {
    const z = 8.0 - (i / 41) * 176.0 + (rng() - 0.5) * 3.5;
    const cx = getTrackCenterX(z);
    const side = i % 2 === 0 ? -1 : 1;
    // Keep crisp camera sightline corridor near summit spawn clear
    const minOffset = z > -8 ? LANE_HALF_WIDTH + 6.5 : LANE_HALF_WIDTH + 5.2;
    const offset = minOffset + rng() * 19.5;
    const x = cx + side * offset;

    // Ensure clear of ice & chalet terrace
    if (getSignedDistOutsideIce(x, z) < 4.5) continue;
    if (Math.hypot(x - CHALET_POS.x, z - CHALET_POS.z) < 16.0) continue;

    const y = getSnowTerrainHeight(x, z) - 0.22;
    treePlacements.push({
      x,
      y,
      z,
      scale: 0.78 + rng() * 0.65,
      rotationY: rng() * Math.PI * 2,
    });
  }

  // 3b. Snow-pine amphitheater framing the frozen curling lake & chalet backdrop (30 trees)
  for (let i = 0; i < 32; i++) {
    const theta = (i / 32) * Math.PI * 2 + (rng() - 0.5) * 0.14;
    const r = RINK_RADIUS + 6.5 + rng() * 20.0;
    const x = Math.cos(theta) * r;
    const z = RINK_CENTER_Z + Math.sin(theta) * r;

    // Leave fjord entrance open & chalet front lawn open so chalet glows unobstructed!
    if (z > -173 && Math.abs(x) < 18.5) continue;
    if (Math.hypot(x - CHALET_POS.x, z - CHALET_POS.z) < 15.5) continue;
    if (getSignedDistOutsideIce(x, z) < 4.8) continue;

    const y = getSnowTerrainHeight(x, z) - 0.22;
    treePlacements.push({
      x,
      y,
      z,
      scale: 0.82 + rng() * 0.68,
      rotationY: rng() * Math.PI * 2,
    });
  }

  const snowForest: ForestBatch = createForest(treePlacements, {
    style: 'snow_pine',
    baseHeight: 8.6,
    archetypes: 4,
    canopyDensity: 1.05,
    seed: 909,
    castShadow: true,
    receiveShadow: true,
  });
  group.add(snowForest.group);

  // 4. Frosted Snow-Topped Alpine Boulders grounding snowbanks & lake headlands
  const boulderGroup = new THREE.Group();
  boulderGroup.name = 'AlpineFrostedBoulders';
  group.add(boulderGroup);

  const placeBoulder = (x: number, z: number, radius: number, seed: number) => {
    const b = createMossyBoulder({
      radius,
      mossAmount: 0.74,
      stoneTint: '#5e6d7e',
      mossColor: '#e8f4ff',
      includeAccentStones: true,
      seed,
      castShadow: true,
    });
    const y = getSnowTerrainHeight(x, z) - radius * 0.22;
    b.position.set(x, y, z);
    b.rotation.y = rng() * Math.PI * 2;
    boulderGroup.add(b);
  };

  // Downhill bank boulders
  for (let i = 0; i < 16; i++) {
    const z = -6 - i * 10.2 + (rng() - 0.5) * 3.0;
    const side = i % 2 === 0 ? 1 : -1;
    const cx = getTrackCenterX(z);
    const x = cx + side * (LANE_HALF_WIDTH + 3.2 + rng() * 7.5);
    if (getSignedDistOutsideIce(x, z) < 2.5) continue;
    placeBoulder(x, z, 1.2 + rng() * 1.35, 950 + i);
  }
  // Curling shoreline granite outcrops
  const shoreAngles = [0.65, 1.15, 2.05, 2.55, 3.15, 3.72, 4.35, 4.95, 5.45, 5.95];
  shoreAngles.forEach((a, idx) => {
    const r = RINK_RADIUS + 2.8 + (idx % 3) * 2.2;
    const x = Math.cos(a) * r;
    const z = RINK_CENTER_Z + Math.sin(a) * r;
    if (Math.hypot(x - CHALET_POS.x, z - CHALET_POS.z) < 12.0) return;
    placeBoulder(x, z, 1.35 + (idx % 3) * 0.55, 980 + idx);
  });

  // 5. Winter Frosted Sedge / Tundra Grass Tufts poking through snowdrifts
  const slopeGrass = createGrassField({
    area: { minX: -38, maxX: 38, minZ: -176, maxZ: 10 },
    count: 3400,
    heightAt: (x, z) => getSnowTerrainHeight(x, z),
    mask: (x, z) => {
      const sd = getSignedDistOutsideIce(x, z);
      return sd >= 1.35 && sd <= 11.5;
    },
    bladeHeightRange: [0.24, 0.58],
    bladeWidth: 0.055,
    baseColor: '#52635b',
    tipColor: '#dbeaf6',
    dryColor: '#b5a88d',
    windStrength: 0.55,
    pushRadius: 1.5,
    pushStrength: 0.7,
    seed: 911,
    castShadow: false,
  });
  group.add(slopeGrass.mesh);
  grassFields.push(slopeGrass);

  const lakeGrass = createGrassField({
    center: [0, RINK_CENTER_Z],
    radius: RINK_RADIUS + 14,
    count: 2600,
    heightAt: (x, z) => getSnowTerrainHeight(x, z),
    mask: (x, z) => {
      const sd = getSignedDistOutsideIce(x, z);
      if (sd < 1.3 || sd > 12.5) return false;
      if (Math.hypot(x - CHALET_POS.x, z - CHALET_POS.z) < 12.5) return false;
      return true;
    },
    bladeHeightRange: [0.24, 0.56],
    bladeWidth: 0.055,
    baseColor: '#50605a',
    tipColor: '#dcebf7',
    dryColor: '#b2a48a',
    windStrength: 0.5,
    pushRadius: 1.5,
    pushStrength: 0.7,
    seed: 912,
    castShadow: false,
  });
  group.add(lakeGrass.mesh);
  grassFields.push(lakeGrass);

  // 6. Glowing Brass Alpine Rink Lamps (4 key curling rink PointLights + 1 summit glow + emissive accents)
  const lampsGroup = new THREE.Group();
  lampsGroup.name = 'NordicBrassLamps';
  group.add(lampsGroup);

  // 8 ornate brass lamps ringing the frozen curling arena snowbank shoulder
  const rinkLampAngles = [0.22, 0.92, 2.22, 2.86, 3.55, 4.25, 4.95, 5.65];
  rinkLampAngles.forEach((theta, idx) => {
    const r = RINK_RADIUS + 1.1;
    const lx = Math.cos(theta) * r;
    const lz = RINK_CENTER_Z + Math.sin(theta) * r;
    const ly = Math.max(0.0, getSnowTerrainHeight(lx, lz) - 0.06);
    const isHeroLight = idx % 2 === 0; // 4 live PointLights evenly illuminating the curling house!
    const lamp = createLantern('brass_lamp', {
      scale: 1.32,
      withLight: isHeroLight,
      lightIntensity: 18,
      lightDistance: 34,
      lightColor: 0xffd089,
      castShadow: false,
    });
    lamp.position.set(lx, ly, lz);
    lampsGroup.add(lamp);
  });

  // Twin finished timber-and-brass entrance gateposts framing the Curling Rink mouth
  const gateTimberMat = createPBRMaterial('woodPlanks', { repeatX: 1, repeatY: 2, seed: 945, tint: '#6f482d' });
  const gateBrassMat = createPBRMaterial('brushedBrass', { repeatX: 1, repeatY: 1, seed: 946 });
  ownedMats.push(gateTimberMat, gateBrassMat);
  const entryPostGeo = new THREE.CylinderGeometry(0.28, 0.34, 2.35, 10);
  const entryCapGeo = new THREE.SphereGeometry(0.32, 12, 10);
  ownedGeos.push(entryPostGeo, entryCapGeo);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(entryPostGeo, gateTimberMat);
    post.position.set(side * 15.8, 1.15, -175.4);
    post.castShadow = true;
    const cap = new THREE.Mesh(entryCapGeo, gateBrassMat);
    cap.position.set(side * 15.8, 2.42, -175.4);
    lampsGroup.add(post, cap);
  }

  // 2 summit brass lamps framing the start gate (1 warm PointLight + 1 emissive match)
  const summitLampY = getIceSurfaceHeight(2.2);
  for (const [idx, side] of [-1, 1].entries()) {
    const lamp = createLantern('brass_lamp', {
      scale: 1.25,
      withLight: idx === 0,
      lightIntensity: 14,
      lightDistance: 24,
      lightColor: 0xffd394,
      castShadow: false,
    });
    lamp.position.set(side * 9.8, summitLampY, 2.2);
    lampsGroup.add(lamp);
  }

  // Porch brass lamp welcoming visitors beside the Nordic Chalet front steps
  const chaletPorchLamp = createLantern('brass_lamp', {
    scale: 1.15,
    withLight: false,
    castShadow: false,
  });
  const porchLampX = CHALET_POS.x - 8.2;
  const porchLampZ = CHALET_POS.z + 3.2;
  chaletPorchLamp.position.set(porchLampX, getSnowTerrainHeight(porchLampX, porchLampZ) - 0.04, porchLampZ);
  lampsGroup.add(chaletPorchLamp);

  // 7. Distant Jagged Snow-Capped Nordic Peaks
  group.add(buildDistantAlpinePeaks(ownedGeos, ownedMats));

  let smokeCooldown = 0;

  const update = (dt: number, time: number, playerPos: THREE.Vector3) => {
    updateFoliageWind(time, 0.72);
    snowForest.update(time);
    for (const gf of grassFields) {
      gf.update(time, playerPos);
    }

    // Subtle hearth warmth flicker on the Chalet PointLight
    chalet.hearthLight.intensity = 25 + Math.sin(time * 6.3) * 1.8 + Math.sin(time * 13.7) * 0.9;

    // Gentle breeze flutter on Summit Start banners
    startPylons.flags.forEach((flag, idx) => {
      flag.rotation.y = Math.sin(time * 3.8 + idx * 1.5) * 0.14;
      flag.rotation.x = Math.cos(time * 2.6 + idx) * 0.06;
    });

    // Emit gentle cozy smoke puffs rising from the Chalet stone chimney!
    smokeCooldown -= dt;
    if (smokeCooldown <= 0) {
      smokeCooldown = 0.24;
      chimneySmoke.emitBurst(chalet.chimneyTopWorld, 2, {
        speed: 1.0,
        upwardBias: 1.9,
        spread: 0.42,
        lifeRange: [3.2, 4.8],
        sizeScale: 1.45,
      });
    }
    chimneySmoke.update(dt);
  };

  const dispose = () => {
    snowForest.dispose();
    for (const gf of grassFields) gf.dispose();
    chimneySmoke.dispose();
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMats) m.dispose();
    ownedGeos.length = 0;
    ownedMats.length = 0;
  };

  return { group, update, dispose };
}

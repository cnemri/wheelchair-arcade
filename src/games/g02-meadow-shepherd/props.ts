import * as THREE from 'three';
import {
  createDetailedTree,
  createFernCluster,
  createForest,
  createGrassField,
  createLantern,
  createMossyBoulder,
  createPBRMaterial,
  createWaterSurface,
  createWildflowerPatch,
  updateFoliageWind,
  type DetailedTree,
  type ForestBatch,
  type ForestPlacement,
  type GrassField,
  type WaterSurface,
  type WildflowerPatch,
} from '../../art';
import {
  BARN_CENTER,
  BRIDGE_ANGLE,
  BRIDGE_HALF_LEN,
  BRIDGE_HALF_WIDTH,
  BRIDGE_Z,
  CLOVER_PATCHES,
  FORD_CENTER_X,
  FORD_Z,
  PADDOCK_GATE_Z_MAX,
  PADDOCK_GATE_Z_MIN,
  PADDOCK_MAX_X,
  PADDOCK_MAX_Z,
  PADDOCK_MIN_X,
  PADDOCK_MIN_Z,
  WATER_LEVEL,
  WINDMILL_POS,
  bridgeDeckHeightAt,
  bridgeLocalToWorld,
  meadowGrassMask,
  streamCenterX,
  streamHalfWidthAt,
  terrainHeightAt,
  wallRadiusAtAngle,
  type ObstacleBox,
  type ObstacleCircle,
} from './terrain';

export interface PastoralWorldHandle {
  group: THREE.Group;
  grass: GrassField;
  water: WaterSurface;
  obstaclesCircles: ObstacleCircle[];
  obstaclesBoxes: ObstacleBox[];
  update(dt: number, elapsed: number, playerPos: THREE.Vector3, scene: THREE.Scene): void;
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

// ---------------------------------------------------------------------------
// 1. Handcrafted Red-Roof Timber Barn (with weathervane, pulley, loft & porch)
// ---------------------------------------------------------------------------

function createPastoralBarn(): {
  group: THREE.Group;
  weathervane: THREE.Object3D;
} {
  const group = new THREE.Group();
  group.name = 'pastoral_barn';

  const bx = BARN_CENTER.x;
  const bz = BARN_CENTER.y;
  const baseY = terrainHeightAt(bx, bz);
  group.position.set(bx, baseY, bz);

  const stoneMat = createPBRMaterial('sandstone', {
    repeatX: 4,
    repeatY: 1,
    color: '#c4b8a0',
    roughness: 0.92,
  });
  const redBarnWood = createPBRMaterial('woodPlanks', {
    repeatX: 3,
    repeatY: 2,
    color: '#a83c2d',
    roughness: 0.85,
  });
  const darkTimberMat = createPBRMaterial('woodPlanks', {
    repeatX: 2,
    repeatY: 1,
    color: '#5a3d28',
    roughness: 0.88,
  });
  const creamTrimMat = new THREE.MeshStandardMaterial({
    color: '#f2ead8',
    roughness: 0.78,
  });
  const roofMat = createPBRMaterial('roofTiles', {
    repeatX: 5,
    repeatY: 3,
    color: '#a4432e',
    roughness: 0.82,
  });
  const brassMat = createPBRMaterial('brushedBrass', {
    color: '#e0b85c',
    roughness: 0.35,
    metalness: 0.85,
  });
  const warmGlassMat = new THREE.MeshStandardMaterial({
    color: '#ffe299',
    emissive: '#ffb84d',
    emissiveIntensity: 0.45,
    roughness: 0.25,
  });
  const darkInteriorMat = new THREE.MeshStandardMaterial({
    color: '#2a1d14',
    roughness: 0.95,
  });

  // Grounded stone plinth (sinks -0.45 into ground so never floats)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(9.2, 1.05, 7.6), stoneMat);
  plinth.position.set(0, 0.12, 0);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // Main timber walls
  const body = new THREE.Mesh(new THREE.BoxGeometry(8.8, 4.3, 7.2), redBarnWood);
  body.position.set(0, 2.75, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Triangular gable ends (east & west walls)
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-3.6, 0);
  gableShape.lineTo(3.6, 0);
  gableShape.lineTo(0, 2.65);
  gableShape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, {
    depth: 8.8,
    bevelEnabled: false,
  });
  gableGeo.rotateY(Math.PI * 0.5);
  gableGeo.translate(-4.4, 4.9, 0);
  const gableMesh = new THREE.Mesh(gableGeo, redBarnWood);
  gableMesh.castShadow = true;
  gableMesh.receiveShadow = true;
  group.add(gableMesh);

  // Overhanging pitched terracotta roof slopes (2 layered planes with fascia depth)
  const roofSlopeLen = Math.hypot(3.6 + 0.72, 2.65 + 0.52);
  const roofPitch = Math.atan2(2.65, 3.6);
  const roofGeo = new THREE.BoxGeometry(9.8, 0.22, roofSlopeLen);
  for (const side of [-1, 1]) {
    const slope = new THREE.Mesh(roofGeo, roofMat);
    slope.position.set(0, 6.12, side * 1.96);
    slope.rotation.x = side * roofPitch;
    slope.castShadow = true;
    slope.receiveShadow = true;
    group.add(slope);
  }

  // Ridge beam cap
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(9.95, 0.28, 0.34), darkTimberMat);
  ridge.position.set(0, 7.56, 0);
  ridge.castShadow = true;
  group.add(ridge);

  // Cream corner timber pilasters & horizontal eaves trim
  const postGeo = new THREE.BoxGeometry(0.26, 4.4, 0.26);
  for (const sx of [-4.38, 4.38]) {
    for (const sz of [-3.58, 3.58]) {
      const post = new THREE.Mesh(postGeo, creamTrimMat);
      post.position.set(sx, 2.78, sz);
      post.castShadow = true;
      group.add(post);
    }
  }

  // Recessed barn opening + double X-braced open doors on East facade (+X facing paddock!)
  const doorway = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.3, 3.1), darkInteriorMat);
  doorway.position.set(4.36, 2.3, 0);
  group.add(doorway);

  const doorFrameTop = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 3.55), creamTrimMat);
  doorFrameTop.position.set(4.45, 4.02, 0);
  group.add(doorFrameTop);

  // Swung-open barn doors with diagonal X cross-braces
  const buildBarnDoor = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(4.44, 0.65, side * 1.56);
    pivot.rotation.y = side * -0.95; // Welcomingly propped open!

    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.25, 1.5), redBarnWood);
    leaf.position.set(0, 1.62, -side * 0.75);
    leaf.castShadow = true;
    pivot.add(leaf);

    // Cream outer border & X-brace
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 1.52), creamTrimMat);
    topRail.position.set(0, 3.18, -side * 0.75);
    const botRail = topRail.clone();
    botRail.position.y = 0.08;
    const midRail = topRail.clone();
    midRail.position.y = 1.62;
    pivot.add(topRail, botRail, midRail);

    const braceGeo = new THREE.BoxGeometry(0.17, 1.78, 0.14);
    const b1 = new THREE.Mesh(braceGeo, creamTrimMat);
    b1.position.set(0, 0.85, -side * 0.75);
    b1.rotation.x = 0.7;
    const b2 = new THREE.Mesh(braceGeo, creamTrimMat);
    b2.position.set(0, 2.4, -side * 0.75);
    b2.rotation.x = -0.7;
    pivot.add(b1, b2);

    return pivot;
  };
  group.add(buildBarnDoor(-1), buildBarnDoor(1));

  // Hayloft window + protruding hoist beam & brass pulley wheel
  const loftFrame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.35, 1.28), creamTrimMat);
  loftFrame.position.set(4.42, 5.45, 0);
  group.add(loftFrame);
  const loftPane = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.08, 1.02), warmGlassMat);
  loftPane.position.set(4.44, 5.45, 0);
  group.add(loftPane);

  const hoistBeam = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.2, 0.2), darkTimberMat);
  hoistBeam.position.set(4.95, 6.72, 0);
  hoistBeam.castShadow = true;
  group.add(hoistBeam);

  const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 14), brassMat);
  pulley.position.set(5.48, 6.46, 0);
  group.add(pulley);

  // Side windows on North & South walls
  for (const side of [-1, 1]) {
    for (const wx of [-2.2, 1.6]) {
      const wFrame = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.15, 0.22), creamTrimMat);
      wFrame.position.set(wx, 3.05, side * 3.62);
      const wPane = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.88, 0.25), warmGlassMat);
      wPane.position.set(wx, 3.05, side * 3.63);
      group.add(wFrame, wPane);
    }
  }

  // Charming Roof Cupola + Brass Weathervane
  const cupolaBase = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.15, 1.35), creamTrimMat);
  cupolaBase.position.set(0.2, 7.9, 0);
  cupolaBase.castShadow = true;
  group.add(cupolaBase);

  const cupolaRoof = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.95, 4), roofMat);
  cupolaRoof.position.set(0.2, 8.92, 0);
  cupolaRoof.rotation.y = Math.PI * 0.25;
  cupolaRoof.castShadow = true;
  group.add(cupolaRoof);

  const vanePole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.15, 8), brassMat);
  vanePole.position.set(0.2, 9.65, 0);
  group.add(vanePole);

  const weathervane = new THREE.Group();
  weathervane.position.set(0.2, 10.12, 0);
  const arrowShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.25, 8), brassMat);
  arrowShaft.rotation.z = Math.PI * 0.5;
  const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 6), brassMat);
  arrowHead.rotation.z = -Math.PI * 0.5;
  arrowHead.position.x = 0.65;
  const arrowTail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.03), brassMat);
  arrowTail.position.x = -0.56;
  weathervane.add(arrowShaft, arrowHead, arrowTail);
  group.add(weathervane);

  // Warm brass lantern by the barn doorway
  const porchLantern = createLantern('brass_lamp', {
    scale: 0.72,
    withLight: true,
    lightIntensity: 1.6,
    lightDistance: 12,
    lightColor: '#ffd996',
  });
  porchLantern.position.set(4.85, 0.55, 2.35);
  group.add(porchLantern);

  return { group, weathervane };
}

// ---------------------------------------------------------------------------
// 2. Sunlit Wooden & Dry-Stone Paddock with Wide Golden Beacon Gate
// ---------------------------------------------------------------------------

function createPaddock(): {
  group: THREE.Group;
  beaconRing: THREE.Mesh;
  beaconHalo: THREE.Mesh;
  beaconLight: THREE.PointLight;
} {
  const group = new THREE.Group();
  group.name = 'meadow_paddock';

  const baseY = terrainHeightAt(-13.0, 2.0);
  const stoneMat = createPBRMaterial('cobblestone', {
    repeatX: 4,
    repeatY: 1,
    color: '#b8ae9c',
    roughness: 0.92,
  });
  const oakMat = createPBRMaterial('woodPlanks', {
    repeatX: 2,
    repeatY: 1,
    color: '#8f6942',
    roughness: 0.86,
  });
  const darkOakMat = createPBRMaterial('bark', {
    repeatX: 1,
    repeatY: 2,
    color: '#6b4c2f',
    roughness: 0.9,
  });
  const hayMat = new THREE.MeshStandardMaterial({
    color: '#deb853',
    roughness: 0.94,
  });
  const twineMat = new THREE.MeshStandardMaterial({
    color: '#7a5730',
    roughness: 0.92,
  });

  // Helper to build a dry-stone + split-rail fence run between (x1,z1) and (x2,z2)
  const addFenceRun = (x1: number, z1: number, x2: number, z2: number) => {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const midX = (x1 + x2) * 0.5;
    const midZ = (z1 + z2) * 0.5;
    const yaw = Math.atan2(-dz, dx);
    const y = terrainHeightAt(midX, midZ);

    const run = new THREE.Group();
    run.position.set(midX, y, midZ);
    run.rotation.y = yaw;

    // Low dry-stone curb wall
    const curb = new THREE.Mesh(new THREE.BoxGeometry(len, 0.72, 0.56), stoneMat);
    curb.position.y = 0.22;
    curb.castShadow = true;
    curb.receiveShadow = true;
    run.add(curb);

    // Split oak fence posts every ~2.4m
    const segments = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= segments; i++) {
      const lx = -len * 0.5 + (i / segments) * len;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.55, 7), darkOakMat);
      post.position.set(lx, 0.65, 0);
      post.castShadow = true;
      run.add(post);
    }

    // Two horizontal split rails
    for (const ry of [0.85, 1.24]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.1), oakMat);
      rail.position.y = ry;
      rail.castShadow = true;
      run.add(rail);
    }
    group.add(run);
  };

  // North, South, West walls + East wings flanking wide open gate
  addFenceRun(PADDOCK_MIN_X, PADDOCK_MIN_Z, PADDOCK_MAX_X, PADDOCK_MIN_Z);
  addFenceRun(PADDOCK_MIN_X, PADDOCK_MAX_Z, PADDOCK_MAX_X, PADDOCK_MAX_Z);
  addFenceRun(PADDOCK_MIN_X, PADDOCK_MIN_Z, PADDOCK_MIN_X, PADDOCK_MAX_Z);
  addFenceRun(PADDOCK_MAX_X, PADDOCK_MIN_Z, PADDOCK_MAX_X, PADDOCK_GATE_Z_MIN);
  addFenceRun(PADDOCK_MAX_X, PADDOCK_GATE_Z_MAX, PADDOCK_MAX_X, PADDOCK_MAX_Z);

  // Welcoming Overhead Timber Paddock Gate Archway at x = PADDOCK_MAX_X, z = 2.0
  const gateGroup = new THREE.Group();
  gateGroup.position.set(PADDOCK_MAX_X, baseY, (PADDOCK_GATE_Z_MIN + PADDOCK_GATE_Z_MAX) * 0.5);
  const gateHalfSpan = (PADDOCK_GATE_Z_MAX - PADDOCK_GATE_Z_MIN) * 0.5; // 3.2m

  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.1, 10), darkOakMat);
    pillar.position.set(0, 1.9, side * gateHalfSpan);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    gateGroup.add(pillar);

    // Stone collar at base of gate pillar
    const baseStone = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.55, 8), stoneMat);
    baseStone.position.set(0, 0.18, side * gateHalfSpan);
    gateGroup.add(baseStone);

    // Propped-open wooden paddock gate wing angled outward welcomingly
    const gateWing = new THREE.Group();
    gateWing.position.set(0.1, 0.1, side * (gateHalfSpan - 0.15));
    gateWing.rotation.y = side * 0.72; // flared outward to funnel sheep!
    for (const ry of [0.42, 0.86, 1.24]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.11, 0.08), oakMat);
      bar.position.set(0.85, ry, 0);
      bar.castShadow = true;
      gateWing.add(bar);
    }
    const diag = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.09, 0.07), oakMat);
    diag.position.set(0.85, 0.82, 0);
    diag.rotation.z = 0.45;
    gateWing.add(diag);
    gateGroup.add(gateWing);

    // Hanging brass gate lantern
    const gLantern = createLantern('brass_lamp', {
      scale: 0.62,
      withLight: false,
    });
    gLantern.position.set(0.35, 3.05, side * (gateHalfSpan - 0.18));
    gateGroup.add(gLantern);
  }

  // Timber header crossbeam + warm sign board
  const crossbeam = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, gateHalfSpan * 2 + 1.1), darkOakMat);
  crossbeam.position.set(0, 3.88, 0);
  crossbeam.castShadow = true;
  gateGroup.add(crossbeam);

  const roofCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.16, gateHalfSpan * 2 + 1.4),
    createPBRMaterial('roofTiles', { repeatX: 2, repeatY: 1, color: '#a4432e' }),
  );
  roofCap.position.set(0, 4.14, 0);
  roofCap.castShadow = true;
  gateGroup.add(roofCap);

  // Hanging golden wooden sheep medallion under archway
  const brassMat = createPBRMaterial('brushedBrass', { color: '#f2c85b', metalness: 0.85, roughness: 0.28 });
  const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16), brassMat);
  crest.rotation.z = Math.PI * 0.5;
  crest.position.set(0.08, 3.42, 0);
  gateGroup.add(crest);

  group.add(gateGroup);

  // Animated Warm Golden Ground Beacon Ring right at the Paddock Entrance!
  const gateFloorY = terrainHeightAt(PADDOCK_MAX_X + 0.6, 2.0);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: '#ffe066',
    transparent: true,
    opacity: 0.68,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beaconRing = new THREE.Mesh(new THREE.RingGeometry(2.15, 2.65, 42), beaconMat);
  beaconRing.rotation.x = -Math.PI * 0.5;
  beaconRing.position.set(PADDOCK_MAX_X + 0.6, gateFloorY + 0.08, 2.0);
  group.add(beaconRing);

  const haloMat = new THREE.MeshBasicMaterial({
    color: '#fff1a8',
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beaconHalo = new THREE.Mesh(new THREE.RingGeometry(1.1, 2.25, 36), haloMat);
  beaconHalo.rotation.x = -Math.PI * 0.5;
  beaconHalo.position.set(PADDOCK_MAX_X + 0.6, gateFloorY + 0.07, 2.0);
  group.add(beaconHalo);

  const beaconLight = new THREE.PointLight('#ffd870', 2.4, 15, 1.5);
  beaconLight.position.set(PADDOCK_MAX_X + 0.4, baseY + 3.2, 2.0);
  group.add(beaconLight);

  // Cozy Paddock Interior: Wooden Water Trough + Hay Bales
  const trough = new THREE.Group();
  trough.position.set(-16.2, baseY, -1.6);
  const tBox = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.62, 0.92), oakMat);
  tBox.position.y = 0.31;
  tBox.castShadow = true;
  tBox.receiveShadow = true;
  const tWater = new THREE.Mesh(
    new THREE.PlaneGeometry(1.94, 0.68),
    new THREE.MeshStandardMaterial({ color: '#45a8b8', roughness: 0.14, metalness: 0.15 }),
  );
  tWater.rotation.x = -Math.PI * 0.5;
  tWater.position.y = 0.58;
  trough.add(tBox, tWater);
  group.add(trough);

  // Stacked rectangular hay bales in the cozy corner of the paddock
  const hayPositions: [number, number, number, number][] = [
    [-16.4, 5.4, 0.42, 0.12],
    [-14.9, 5.8, 0.42, -0.2],
    [-15.8, 5.6, 1.18, 0.35],
  ];
  const rectBaleGeo = new THREE.BoxGeometry(1.35, 0.78, 0.85);
  const twineGeo = new THREE.BoxGeometry(0.06, 0.81, 0.88);
  for (const [hx, hz, hy, rot] of hayPositions) {
    const bGroup = new THREE.Group();
    bGroup.position.set(hx, baseY + hy, hz);
    bGroup.rotation.y = rot;
    const bale = new THREE.Mesh(rectBaleGeo, hayMat);
    bale.castShadow = true;
    bale.receiveShadow = true;
    const t1 = new THREE.Mesh(twineGeo, twineMat);
    t1.position.x = -0.34;
    const t2 = new THREE.Mesh(twineGeo, twineMat);
    t2.position.x = 0.34;
    bGroup.add(bale, t1, t2);
    group.add(bGroup);
  }

  return { group, beaconRing, beaconHalo, beaconLight };
}

// ---------------------------------------------------------------------------
// 3. Hilltop Stone-and-Timber Windmill with Slowly Turning Cloth Sails
// ---------------------------------------------------------------------------

function createHilltopWindmill(): {
  group: THREE.Group;
  sailsHub: THREE.Group;
} {
  const group = new THREE.Group();
  group.name = 'hilltop_windmill';

  const wx = WINDMILL_POS.x;
  const wz = WINDMILL_POS.y;
  const baseY = terrainHeightAt(wx, wz);
  group.position.set(wx, baseY, wz);
  // Orient sails to face southeast directly toward the sunlit valley & player spawn!
  group.rotation.y = 0.48;

  const stoneMat = createPBRMaterial('sandstone', {
    repeatX: 4,
    repeatY: 3,
    color: '#d4c9b2',
    roughness: 0.9,
  });
  const timberMat = createPBRMaterial('woodPlanks', {
    repeatX: 2,
    repeatY: 1,
    color: '#6b482c',
    roughness: 0.85,
  });
  const roofMat = createPBRMaterial('roofTiles', {
    repeatX: 3,
    repeatY: 2,
    color: '#8e4532',
    roughness: 0.8,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: '#f8f2e1',
    roughness: 0.86,
    side: THREE.DoubleSide,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: '#ffd98a',
    emissive: '#f5a942',
    emissiveIntensity: 0.35,
    roughness: 0.3,
  });

  // Grounded stone plinth skirt
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(3.45, 3.85, 1.4, 12), stoneMat);
  skirt.position.y = 0.25;
  skirt.castShadow = true;
  skirt.receiveShadow = true;
  group.add(skirt);

  // Tapered stone windmill tower
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 3.25, 9.2, 12), stoneMat);
  tower.position.y = 5.1;
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  // Timber gallery balcony ring mid-tower
  const balcony = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 2.95, 0.24, 12), timberMat);
  balcony.position.y = 4.55;
  balcony.castShadow = true;
  group.add(balcony);

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), timberMat);
    p.position.set(Math.cos(a) * 2.9, 5.05, Math.sin(a) * 2.9);
    group.add(p);
  }
  const balRail = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.06, 6, 24), timberMat);
  balRail.rotation.x = Math.PI * 0.5;
  balRail.position.y = 5.48;
  group.add(balRail);

  // Arched wooden door at base + warm upper windows
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.15, 0.45), timberMat);
  door.position.set(0, 1.55, 3.15);
  group.add(door);

  for (const ang of [0, 1.6, -1.6]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.28), windowMat);
    win.position.set(Math.sin(ang) * 2.48, 6.9, Math.cos(ang) * 2.48);
    win.rotation.y = ang;
    group.add(win);
  }

  // Conical tiled turret cap
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.58, 2.65, 12), roofMat);
  cap.position.y = 10.85;
  cap.castShadow = true;
  group.add(cap);

  // Rotating 4-Blade Timber Lattice + Cloth Sail Hub
  const sailsHub = new THREE.Group();
  sailsHub.position.set(0, 9.25, 2.38);

  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.85, 10), timberMat);
  hubCap.rotation.x = Math.PI * 0.5;
  sailsHub.add(hubCap);

  const sailLen = 5.75;
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Group();
    blade.rotation.z = (i * Math.PI) * 0.5;

    // Main timber spar
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.16, sailLen, 0.14), timberMat);
    spar.position.set(0, sailLen * 0.5, 0.14);
    spar.castShadow = true;
    blade.add(spar);

    // Lattice rungs
    for (let r = 0; r < 6; r++) {
      const ry = 1.35 + r * 0.78;
      const rung = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.07, 0.06), timberMat);
      rung.position.set(0.54, ry, 0.14);
      blade.add(rung);
    }

    // Billowed cream linen cloth sail panel slightly pitched to catch the breeze
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.12, sailLen - 1.25), clothMat);
    cloth.position.set(0.58, 1.15 + (sailLen - 1.25) * 0.5, 0.2);
    cloth.rotation.y = 0.16;
    cloth.castShadow = true;
    cloth.receiveShadow = true;
    blade.add(cloth);

    sailsHub.add(blade);
  }
  group.add(sailsHub);

  return { group, sailsHub };
}

// ---------------------------------------------------------------------------
// 4. Handcrafted Multi-Plank Arched Wooden Footbridge & Stepping-Stone Ford
// ---------------------------------------------------------------------------

function createArchedFootbridge(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'arched_footbridge';

  const plankMat = createPBRMaterial('woodPlanks', {
    repeatX: 1,
    repeatY: 1,
    color: '#9c7348',
    roughness: 0.84,
  });
  const beamMat = createPBRMaterial('bark', {
    repeatX: 2,
    repeatY: 1,
    color: '#63462c',
    roughness: 0.9,
  });
  const stoneMat = createPBRMaterial('rock', {
    repeatX: 2,
    repeatY: 1,
    color: '#918d84',
    roughness: 0.92,
  });

  // Helper returning exact world Y for bridge local X so planks match bridgeDeckHeightAt!
  const deckY = (lx: number): number => {
    const w = bridgeLocalToWorld(lx, 0);
    return bridgeDeckHeightAt(w.x, w.z) ?? terrainHeightAt(w.x, w.z) + 0.1;
  };

  // Stone bank abutments anchoring both bridge ends solidly into the banks
  for (const endSign of [-1, 1]) {
    const lx = endSign * (BRIDGE_HALF_LEN - 0.15);
    const w = bridgeLocalToWorld(lx, 0);
    const y = deckY(lx);
    const abut = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.4, BRIDGE_HALF_WIDTH * 2 + 0.65), stoneMat);
    abut.position.set(w.x, y - 0.78, w.z);
    abut.rotation.y = BRIDGE_ANGLE;
    abut.castShadow = true;
    abut.receiveShadow = true;
    group.add(abut);
  }

  // 20 individual bevelled wooden deck planks stepping cleanly along the arch
  const plankCount = 20;
  const plankSpacing = (BRIDGE_HALF_LEN * 2) / plankCount;
  const plankGeo = new THREE.BoxGeometry(plankSpacing * 0.88, 0.15, BRIDGE_HALF_WIDTH * 2);

  for (let i = 0; i < plankCount; i++) {
    const lx = -BRIDGE_HALF_LEN + (i + 0.5) * plankSpacing;
    const yC = deckY(lx);
    const yN = deckY(Math.min(BRIDGE_HALF_LEN, lx + 0.3));
    const yP = deckY(Math.max(-BRIDGE_HALF_LEN, lx - 0.3));
    const pitch = Math.atan2(yN - yP, 0.6);

    const w = bridgeLocalToWorld(lx, 0);
    const plank = new THREE.Mesh(plankGeo, plankMat);
    plank.position.set(w.x, yC - 0.075, w.z);
    plank.rotation.order = 'YXZ';
    plank.rotation.y = BRIDGE_ANGLE;
    plank.rotation.z = pitch;
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }

  // Twin arched timber stringer beams beneath left & right edges + curved handrails
  for (const side of [-1, 1]) {
    const lz = side * (BRIDGE_HALF_WIDTH - 0.12);
    const beamPts: THREE.Vector3[] = [];
    const topRailPts: THREE.Vector3[] = [];
    const midRailPts: THREE.Vector3[] = [];

    for (let i = 0; i <= 14; i++) {
      const lx = -BRIDGE_HALF_LEN + (i / 14) * BRIDGE_HALF_LEN * 2;
      const w = bridgeLocalToWorld(lx, lz);
      const y = deckY(lx);
      beamPts.push(new THREE.Vector3(w.x, y - 0.24, w.z));
      topRailPts.push(new THREE.Vector3(w.x, y + 0.96, w.z));
      midRailPts.push(new THREE.Vector3(w.x, y + 0.48, w.z));
    }

    const beamGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beamPts), 20, 0.14, 7, false);
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.castShadow = true;
    group.add(beamMesh);

    const topRailGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(topRailPts), 20, 0.068, 7, false);
    const topRail = new THREE.Mesh(topRailGeo, beamMat);
    topRail.castShadow = true;
    group.add(topRail);

    const midRailGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(midRailPts), 20, 0.045, 6, false);
    const midRail = new THREE.Mesh(midRailGeo, plankMat);
    group.add(midRail);

    // Vertical handrail posts along both sides
    for (let p = 0; p <= 6; p++) {
      const lx = -BRIDGE_HALF_LEN + (p / 6) * BRIDGE_HALF_LEN * 2;
      const w = bridgeLocalToWorld(lx, lz);
      const y = deckY(lx);
      const isEnd = p === 0 || p === 6;
      const postH = isEnd ? 1.32 : 1.05;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(isEnd ? 0.11 : 0.07, isEnd ? 0.13 : 0.08, postH, 7),
        beamMat,
      );
      post.position.set(w.x, y + postH * 0.5 - 0.1, w.z);
      post.castShadow = true;
      group.add(post);

      // Decorative warm brass post-cap lantern at bridge ends
      if (isEnd && side === -1) {
        const capLantern = createLantern('brass_lamp', { scale: 0.46, withLight: false });
        capLantern.position.set(w.x, y + 1.18, w.z);
        group.add(capLantern);
      }
    }
  }

  // Timber support pilings standing in the shallow brook bed
  for (const lx of [-2.4, 2.4]) {
    for (const side of [-1, 1]) {
      const w = bridgeLocalToWorld(lx, side * (BRIDGE_HALF_WIDTH - 0.2));
      const yTop = deckY(lx) - 0.18;
      const yBed = terrainHeightAt(w.x, w.z) - 0.4;
      const h = Math.max(0.5, yTop - yBed);
      const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, h, 8), beamMat);
      piling.position.set(w.x, yBed + h * 0.5, w.z);
      piling.castShadow = true;
      group.add(piling);
    }
  }

  return group;
}

function createSteppingStoneFord(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stepping_stone_ford';

  const stoneMat = createPBRMaterial('rock', {
    repeatX: 1,
    repeatY: 1,
    color: '#a39e93',
    roughness: 0.85,
  });

  const rng = mulberry32(404);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = FORD_CENTER_X - 3.0 + t * 6.0;
    const z = FORD_Z + Math.sin(i * 1.4) * 0.65;
    const r = 0.48 + rng() * 0.24;
    const geo = new THREE.CylinderGeometry(r * 0.92, r * 1.08, 0.28, 9);
    const stone = new THREE.Mesh(geo, stoneMat);
    stone.position.set(x, WATER_LEVEL - 0.04 + (rng() - 0.5) * 0.04, z);
    stone.scale.set(1.25, 1.0, 0.88 + rng() * 0.25);
    stone.rotation.y = rng() * Math.PI;
    stone.receiveShadow = true;
    stone.castShadow = true;
    group.add(stone);
  }
  return group;
}

// ---------------------------------------------------------------------------
// 5. Cotswold Dry-Stone Perimeter Walls + Rustic Split-Rail Accents
// ---------------------------------------------------------------------------

function createPerimeterWalls(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'dry_stone_perimeter_walls';

  const stoneMat = createPBRMaterial('cobblestone', {
    repeatX: 2,
    repeatY: 1,
    color: '#aba496',
    roughness: 0.94,
  });
  const copingMat = createPBRMaterial('sandstone', {
    repeatX: 2,
    repeatY: 1,
    color: '#bdb5a4',
    roughness: 0.9,
  });

  const segments = 68;
  const rng = mulberry32(711);

  const wallMatrices: THREE.Matrix4[] = [];
  const capMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const r0 = wallRadiusAtAngle(a0);
    const r1 = wallRadiusAtAngle(a1);
    const x0 = Math.cos(a0) * r0;
    const z0 = Math.sin(a0) * r0;
    const x1 = Math.cos(a1) * r1;
    const z1 = Math.sin(a1) * r1;

    const mx = (x0 + x1) * 0.5;
    const mz = (z0 + z1) * 0.5;

    // Leave natural stone arch gap right where the babbling brook flows in/out!
    const distBrook = Math.abs(mx - streamCenterX(mz));
    if (distBrook < streamHalfWidthAt(mz) + 1.1) continue;

    const segLen = Math.hypot(x1 - x0, z1 - z0) + 0.18;
    const yaw = Math.atan2(-(z1 - z0), x1 - x0);
    const y0 = terrainHeightAt(x0, z0);
    const y1 = terrainHeightAt(x1, z1);
    const my = (y0 + y1) * 0.5;
    const pitch = Math.atan2(y1 - y0, segLen);
    const wallH = 1.18 + (rng() - 0.5) * 0.16;

    dummy.position.set(mx, my + wallH * 0.32, mz);
    dummy.rotation.set(0, yaw, pitch);
    dummy.scale.set(segLen, wallH, 0.85);
    dummy.updateMatrix();
    wallMatrices.push(dummy.matrix.clone());

    dummy.position.set(mx, my + wallH * 0.82, mz);
    dummy.scale.set(segLen * 1.01, 0.22, 0.94);
    dummy.updateMatrix();
    capMatrices.push(dummy.matrix.clone());
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const wallInst = new THREE.InstancedMesh(unitBox, stoneMat, wallMatrices.length);
  const capInst = new THREE.InstancedMesh(unitBox, copingMat, capMatrices.length);
  wallInst.castShadow = true;
  wallInst.receiveShadow = true;
  capInst.castShadow = true;
  capInst.receiveShadow = true;

  for (let i = 0; i < wallMatrices.length; i++) {
    wallInst.setMatrixAt(i, wallMatrices[i]);
    capInst.setMatrixAt(i, capMatrices[i]);
  }
  wallInst.instanceMatrix.needsUpdate = true;
  capInst.instanceMatrix.needsUpdate = true;

  group.add(wallInst, capInst);
  return group;
}

// ---------------------------------------------------------------------------
// 6. Rolled Hay Bales, Clover Groves & Rustic Wooden Fingerpost
// ---------------------------------------------------------------------------

function createMeadowDetails(obstaclesCircles: ObstacleCircle[]): {
  group: THREE.Group;
  cloverRings: THREE.Mesh[];
} {
  const group = new THREE.Group();
  group.name = 'meadow_details';

  const hayMat = new THREE.MeshStandardMaterial({ color: '#dfb84f', roughness: 0.94 });
  const hayEndMat = new THREE.MeshStandardMaterial({ color: '#cda340', roughness: 0.96 });
  const twineMat = new THREE.MeshStandardMaterial({ color: '#78552f', roughness: 0.92 });
  const woodMat = createPBRMaterial('woodPlanks', { color: '#865f3b', roughness: 0.86 });

  // Rolled round golden hay bales dotting the sunny pasture edges
  const roundBaleSpots: [number, number, number][] = [
    [-22.5, 11.5, 0.4],
    [-20.4, 13.2, 1.2],
    [25.5, 11.2, 0.7],
    [27.8, 9.5, 2.1],
    [-21.0, -19.5, 0.2],
    [13.5, -24.5, 1.5],
  ];

  const cylGeo = new THREE.CylinderGeometry(0.86, 0.86, 1.45, 16);
  cylGeo.rotateZ(Math.PI * 0.5);
  const bandGeo = new THREE.TorusGeometry(0.87, 0.025, 6, 18);
  bandGeo.rotateY(Math.PI * 0.5);

  for (const [bx, bz, rot] of roundBaleSpots) {
    const by = terrainHeightAt(bx, bz);
    const bale = new THREE.Group();
    bale.position.set(bx, by + 0.78, bz);
    bale.rotation.y = rot;

    const body = new THREE.Mesh(cylGeo, [hayMat, hayEndMat, hayEndMat]);
    body.castShadow = true;
    body.receiveShadow = true;
    const bandL = new THREE.Mesh(bandGeo, twineMat);
    bandL.position.x = -0.38;
    const bandR = new THREE.Mesh(bandGeo, twineMat);
    bandR.position.x = 0.38;
    bale.add(body, bandL, bandR);
    group.add(bale);
    obstaclesCircles.push({ x: bx, z: bz, radius: 1.05 });
  }

  // Rustic Wooden Fingerpost Sign at path fork (-3.6, 6.2)
  const signX = -3.4;
  const signZ = 6.2;
  const signY = terrainHeightAt(signX, signZ);
  const signpost = new THREE.Group();
  signpost.position.set(signX, signY, signZ);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.35, 7), woodMat);
  post.position.y = 1.1;
  post.castShadow = true;
  signpost.add(post);

  const plankA = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.24, 0.08), woodMat);
  plankA.position.set(-0.42, 1.98, 0);
  plankA.rotation.y = 0.28;
  plankA.castShadow = true;
  const plankB = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.08), woodMat);
  plankB.position.set(0.38, 1.66, 0);
  plankB.rotation.y = -0.35;
  plankB.castShadow = true;
  signpost.add(plankA, plankB);
  group.add(signpost);
  obstaclesCircles.push({ x: signX, z: signZ, radius: 0.35 });

  // Two Tempting Clover Groves (lush blossoms + gentle pulsing golden-emerald ring!)
  const cloverRings: THREE.Mesh[] = [];
  const cloverLeafMat = new THREE.MeshStandardMaterial({ color: '#399e42', roughness: 0.8 });
  const cloverBloomMat = new THREE.MeshStandardMaterial({ color: '#f4a8d2', roughness: 0.65 });
  const cloverWhiteMat = new THREE.MeshStandardMaterial({ color: '#fff8ec', roughness: 0.65 });
  const rng = mulberry32(909);

  for (const cp of CLOVER_PATCHES) {
    const cy = terrainHeightAt(cp.x, cp.z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(cp.radius * 0.85, cp.radius * 0.96, 32),
      new THREE.MeshBasicMaterial({
        color: '#a8f078',
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI * 0.5;
    ring.position.set(cp.x, cy + 0.09, cp.z);
    group.add(ring);
    cloverRings.push(ring);

    // Dense charming 3D clover rosettes & fluffy pink/white clover pom-poms
    const tuftGeo = new THREE.SphereGeometry(0.18, 6, 5);
    tuftGeo.scale(1.25, 0.42, 1.25);
    const pomGeo = new THREE.SphereGeometry(0.085, 6, 5);
    for (let k = 0; k < 28; k++) {
      const ang = rng() * Math.PI * 2;
      const dist = Math.sqrt(rng()) * (cp.radius - 0.35);
      const tx = cp.x + Math.cos(ang) * dist;
      const tz = cp.z + Math.sin(ang) * dist;
      const ty = terrainHeightAt(tx, tz);
      const tuft = new THREE.Mesh(tuftGeo, cloverLeafMat);
      tuft.position.set(tx, ty + 0.05, tz);
      tuft.scale.setScalar(0.8 + rng() * 0.6);
      tuft.receiveShadow = true;
      group.add(tuft);

      if (k % 2 === 0) {
        const pom = new THREE.Mesh(pomGeo, k % 4 === 0 ? cloverBloomMat : cloverWhiteMat);
        pom.position.set(tx, ty + 0.2 + rng() * 0.08, tz);
        group.add(pom);
      }
    }
  }

  return { group, cloverRings };
}

// ---------------------------------------------------------------------------
// 7. Complete Pastoral World Assembly (Trees, 11,500+ Grass, Water, Props)
// ---------------------------------------------------------------------------

export function buildPastoralWorld(sunDirection: THREE.Vector3): PastoralWorldHandle {
  const group = new THREE.Group();
  group.name = 'meadow_pastoral_world';

  const obstaclesCircles: ObstacleCircle[] = [];
  const obstaclesBoxes: ObstacleBox[] = [];

  // Register static structural collision boxes
  obstaclesBoxes.push(
    // Barn footprint
    { minX: -28.2, maxX: -18.4, minZ: -2.2, maxZ: 6.2 },
    // Paddock North / South / West walls + East gate wings (leaving wide open gate z ∈ [-1.2, +5.2]!)
    { minX: PADDOCK_MIN_X - 0.4, maxX: PADDOCK_MAX_X + 0.4, minZ: PADDOCK_MIN_Z - 0.4, maxZ: PADDOCK_MIN_Z + 0.4 },
    { minX: PADDOCK_MIN_X - 0.4, maxX: PADDOCK_MAX_X + 0.4, minZ: PADDOCK_MAX_Z - 0.4, maxZ: PADDOCK_MAX_Z + 0.4 },
    { minX: PADDOCK_MIN_X - 0.4, maxX: PADDOCK_MIN_X + 0.4, minZ: PADDOCK_MIN_Z - 0.4, maxZ: PADDOCK_MAX_Z + 0.4 },
    { minX: PADDOCK_MAX_X - 0.4, maxX: PADDOCK_MAX_X + 0.4, minZ: PADDOCK_MIN_Z - 0.4, maxZ: PADDOCK_GATE_Z_MIN + 0.1 },
    { minX: PADDOCK_MAX_X - 0.4, maxX: PADDOCK_MAX_X + 0.4, minZ: PADDOCK_GATE_Z_MAX - 0.1, maxZ: PADDOCK_MAX_Z + 0.4 },
  );

  // Windmill circular base + paddock gate pillars
  obstaclesCircles.push(
    { x: WINDMILL_POS.x, z: WINDMILL_POS.y, radius: 3.75 },
    { x: PADDOCK_MAX_X, z: PADDOCK_GATE_Z_MIN, radius: 0.45 },
    { x: PADDOCK_MAX_X, z: PADDOCK_GATE_Z_MAX, radius: 0.45 },
  );

  // 1. Landmarks
  const barn = createPastoralBarn();
  const paddock = createPaddock();
  const windmill = createHilltopWindmill();
  const footbridge = createArchedFootbridge();
  const ford = createSteppingStoneFord();
  const perimeterWalls = createPerimeterWalls();
  const details = createMeadowDetails(obstaclesCircles);

  group.add(
    barn.group,
    paddock.group,
    windmill.group,
    footbridge,
    ford,
    perimeterWalls,
    details.group,
  );

  // 2. Babbling Sunlit Turquoise Brook
  const water = createWaterSurface({
    width: 22,
    depth: 132,
    shape: 'plane',
    segments: 64,
    deepColor: '#1d7588',
    shallowColor: '#52c4c0',
    skyColor: '#b8e0f7',
    foamColor: '#f4fbff',
    sunDirection,
    sunColor: '#fff5da',
    waveSpeed: 1.55,
    waveScale: 1.85,
    waveHeight: 0.024,
    edgeFoamWidth: 0.0,
    opacity: 0.86,
  });
  water.mesh.position.set(4.8, WATER_LEVEL, 0);
  group.add(water.mesh);

  // 3. Uncompromising Interactive Grass Field (11,500 curved wind-swaying 3-blade tufts!)
  const grass = createGrassField({
    area: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    count: 11500,
    heightAt: terrainHeightAt,
    mask: meadowGrassMask,
    bladeHeightRange: [0.16, 0.42],
    bladeWidth: 0.052,
    baseColor: '#3d742b',
    tipColor: '#9ed455',
    dryColor: '#d9c86a',
    windStrength: 1.15,
    pushRadius: 1.55,
    pushStrength: 0.96,
    seed: 2026,
    castShadow: false,
  });
  group.add(grass.mesh);

  // 4. Lush 3D Wildflower Patches (Daisies, Buttercups, Lavender, Poppies)
  const wildflowers: WildflowerPatch[] = [
    createWildflowerPatch({
      area: { minX: -34, maxX: 35, minZ: -33, maxZ: 34 },
      count: 580,
      heightAt: terrainHeightAt,
      mask: meadowGrassMask,
      palette: ['#fff9e6', '#ffd43b', '#b197fc', '#ffe066', '#ff8787', '#ffffff'],
      scaleRange: [0.78, 1.38],
      seed: 301,
    }),
    createWildflowerPatch({
      center: [16.5, 4.5],
      radius: 14,
      count: 240,
      heightAt: terrainHeightAt,
      mask: meadowGrassMask,
      palette: ['#ffd43b', '#ffffff', '#d0bfff', '#ffa94d'],
      scaleRange: [0.85, 1.45],
      seed: 302,
    }),
    createWildflowerPatch({
      center: [-10.0, 17.0],
      radius: 12,
      count: 180,
      heightAt: terrainHeightAt,
      mask: meadowGrassMask,
      palette: ['#fff5f5', '#ffd43b', '#b197fc', '#74c0fc'],
      scaleRange: [0.8, 1.32],
      seed: 303,
    }),
  ];
  for (const wf of wildflowers) {
    group.add(wf.group);
  }

  // 5. Ancient Gnarled Hero Oaks & Olive Trees inside & framing the sunlit valley
  const heroTrees: DetailedTree[] = [];
  const heroSpecs: {
    x: number;
    z: number;
    style: 'oak' | 'olive';
    height: number;
    seed: number;
    trunkR: number;
  }[] = [
    // Monumental hero oak shading the barn corner
    { x: -24.5, z: -7.5, style: 'oak', height: 10.6, seed: 101, trunkR: 0.95 },
    // Iconic ancient oak overlooking the eastern footbridge bank
    { x: 11.8, z: -5.8, style: 'oak', height: 9.8, seed: 102, trunkR: 0.88 },
    // Sunlit eastern pasture landmark oak
    { x: 27.5, z: 2.5, style: 'oak', height: 10.8, seed: 103, trunkR: 0.95 },
    // Southern sunlit meadow oak framing foreground-left vista
    { x: -16.5, z: 24.5, style: 'oak', height: 9.4, seed: 104, trunkR: 0.85 },
    // Northern grove oak behind the ford
    { x: 10.5, z: -28.5, style: 'oak', height: 10.2, seed: 105, trunkR: 0.92 },
    // Sculptural olive trees adding Mediterranean storybook softness
    { x: -24.5, z: -20.5, style: 'olive', height: 6.4, seed: 201, trunkR: 0.65 },
    { x: 24.5, z: 22.0, style: 'olive', height: 6.8, seed: 202, trunkR: 0.68 },
    { x: 12.2, z: 25.5, style: 'olive', height: 6.2, seed: 203, trunkR: 0.65 },
  ];

  for (const spec of heroSpecs) {
    const t = createDetailedTree({
      style: spec.style,
      height: spec.height,
      seed: spec.seed,
      canopyDensity: 1.15,
      castShadow: true,
      receiveShadow: true,
    });
    const ty = terrainHeightAt(spec.x, spec.z);
    t.group.position.set(spec.x, ty - 0.14, spec.z);
    group.add(t.group);
    heroTrees.push(t);
    obstaclesCircles.push({ x: spec.x, z: spec.z, radius: spec.trunkR });
  }

  // 6. Encircling Pastoral Valley Forests (Oak, Olive, & Cypress hillside silhouettes!)
  const rng = mulberry32(555);
  const oakPlacements: ForestPlacement[] = [];
  const olivePlacements: ForestPlacement[] = [];
  const cypressPlacements: ForestPlacement[] = [];

  for (let i = 0; i < 110; i++) {
    const theta = (i / 110) * Math.PI * 2 + (rng() - 0.5) * 0.08;
    const baseR = wallRadiusAtAngle(theta);
    const r = baseR + 4.5 + rng() * 28.0;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    // Don't drop trees directly inside the brook channel
    if (Math.abs(x - streamCenterX(z)) < streamHalfWidthAt(z) + 2.5) continue;

    const y = terrainHeightAt(x, z) - 0.25;
    const placement: ForestPlacement = {
      x,
      y,
      z,
      scale: 0.78 + rng() * 0.52,
      rotationY: rng() * Math.PI * 2,
    };

    const pick = rng();
    if (pick < 0.5) {
      oakPlacements.push(placement);
    } else if (pick < 0.8) {
      olivePlacements.push(placement);
    } else {
      cypressPlacements.push(placement);
    }
  }

  const forests: ForestBatch[] = [
    createForest(oakPlacements, {
      style: 'oak',
      baseHeight: 8.8,
      archetypes: 3,
      canopyDensity: 0.95,
      seed: 601,
      castShadow: true,
    }),
    createForest(olivePlacements, {
      style: 'olive',
      baseHeight: 6.2,
      archetypes: 3,
      canopyDensity: 0.95,
      seed: 602,
      castShadow: true,
    }),
    createForest(cypressPlacements, {
      style: 'cypress',
      baseHeight: 10.2,
      archetypes: 2,
      canopyDensity: 0.9,
      seed: 603,
      castShadow: true,
    }),
  ];
  for (const f of forests) {
    group.add(f.group);
  }

  // 7. Mossy Boulder Outcrops & Lush Fern Clusters along brook banks, oak roots & hillsides
  const boulderSpots: { x: number; z: number; r: number; seed: number }[] = [
    { x: 0.5, z: -5.2, r: 0.95, seed: 801 },
    { x: 10.6, z: 10.8, r: 1.15, seed: 802 },
    { x: 12.2, z: 20.5, r: 0.9, seed: 803 },
    { x: -4.2, z: -21.5, r: 1.25, seed: 804 },
    { x: 24.5, z: -18.5, r: 1.35, seed: 805 },
    { x: 28.8, z: -6.5, r: 1.15, seed: 806 },
    { x: -29.0, z: 16.5, r: 1.3, seed: 807 },
    { x: -11.5, z: 28.5, r: 1.1, seed: 808 },
    { x: 4.5, z: -25.0, r: 1.05, seed: 809 },
    { x: -21.0, z: -12.0, r: 0.95, seed: 810 },
    { x: 1.5, z: 29.5, r: 1.15, seed: 811 },
    { x: 26.5, z: 16.8, r: 1.1, seed: 812 },
  ];

  for (const b of boulderSpots) {
    const boulder = createMossyBoulder({
      radius: b.r,
      mossAmount: 0.78,
      stoneTint: '#9c988d',
      mossColor: '#4e8034',
      includeAccentStones: true,
      seed: b.seed,
      castShadow: true,
    });
    const by = terrainHeightAt(b.x, b.z);
    boulder.position.set(b.x, by - 0.08, b.z);
    group.add(boulder);
    obstaclesCircles.push({ x: b.x, z: b.z, radius: b.r * 1.02 });
  }

  // Lush fern clusters nestled beside brook bends, bridge ends, boulders & ancient oaks
  const fernSpots: [number, number, number][] = [
    [0.8, 5.2, 0.85],
    [1.4, -1.2, 0.9],
    [8.8, -2.5, 0.95],
    [9.4, 5.6, 0.85],
    [11.2, 13.0, 0.9],
    [5.8, 17.5, 0.88],
    [4.4, -13.0, 0.85],
    [-2.8, -14.2, 0.92],
    [-2.4, -18.5, 0.82],
    [11.2, -5.0, 1.05],
    [-23.2, -6.5, 1.0],
    [26.2, 3.2, 1.02],
    [-15.6, 23.8, 0.95],
    [10.0, -27.2, 0.98],
    [0.2, -4.4, 0.78],
    [-27.8, 15.6, 0.92],
    [23.6, -17.5, 0.95],
    [-5.0, -20.5, 0.85],
  ];

  for (let i = 0; i < fernSpots.length; i++) {
    const [fx, fz, rad] = fernSpots[i];
    const fern = createFernCluster({
      frondCount: 11,
      radius: rad,
      height: rad * 0.62,
      color: '#d4f0ae',
      seed: 900 + i * 17,
      castShadow: true,
    });
    fern.position.set(fx, terrainHeightAt(fx, fz) - 0.03, fz);
    group.add(fern);
  }

  // Smooth river pebbles dotted organically along the babbling brook banks
  const pebbleMat = createPBRMaterial('rock', { color: '#9c968b', roughness: 0.85 });
  const pebbleGeo = new THREE.DodecahedronGeometry(0.24, 1);
  const pebblePositions: THREE.Matrix4[] = [];
  const pDummy = new THREE.Object3D();
  for (let z = -38; z <= 38; z += 1.9) {
    if (Math.abs(z - BRIDGE_Z) < 2.8) continue;
    const cx = streamCenterX(z);
    const hw = streamHalfWidthAt(z);
    for (const side of [-1, 1]) {
      const px = cx + side * (hw + 0.1 + rng() * 0.55);
      const pz = z + (rng() - 0.5) * 1.1;
      const py = terrainHeightAt(px, pz);
      pDummy.position.set(px, py + 0.04, pz);
      pDummy.rotation.set(rng() * 0.5, rng() * Math.PI * 2, rng() * 0.5);
      const sx = 0.7 + rng() * 1.3;
      const sy = 0.4 + rng() * 0.45;
      const sz = 0.7 + rng() * 1.2;
      pDummy.scale.set(sx, sy, sz);
      pDummy.updateMatrix();
      pebblePositions.push(pDummy.matrix.clone());
    }
  }
  const pebbleInst = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebblePositions.length);
  pebbleInst.receiveShadow = true;
  for (let i = 0; i < pebblePositions.length; i++) {
    pebbleInst.setMatrixAt(i, pebblePositions[i]);
  }
  pebbleInst.instanceMatrix.needsUpdate = true;
  group.add(pebbleInst);

  return {
    group,
    grass,
    water,
    obstaclesCircles,
    obstaclesBoxes,
    update(dt: number, elapsed: number, playerPos: THREE.Vector3, scene: THREE.Scene) {
      // Wind animation for all trees, ferns, wildflowers & interactive parting grass
      updateFoliageWind(elapsed, 1.05);
      grass.update(elapsed, playerPos);
      water.update(elapsed, scene);

      // Slowly turning hilltop windmill cloth sails & swaying barn weathervane
      windmill.sailsHub.rotation.z -= dt * 0.52;
      barn.weathervane.rotation.y = Math.sin(elapsed * 0.55) * 0.48 + Math.sin(elapsed * 1.3) * 0.14;

      // Gentle welcoming golden beacon pulse at the Paddock Gate
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.6);
      const ringScale = 0.94 + pulse * 0.11;
      paddock.beaconRing.scale.set(ringScale, ringScale, 1);
      (paddock.beaconRing.material as THREE.MeshBasicMaterial).opacity = 0.42 + pulse * 0.34;
      const haloScale = 0.9 + (1 - pulse) * 0.18;
      paddock.beaconHalo.scale.set(haloScale, haloScale, 1);
      (paddock.beaconHalo.material as THREE.MeshBasicMaterial).opacity = 0.14 + pulse * 0.18;
      paddock.beaconLight.intensity = 2.0 + pulse * 0.9;

      // Subtle shimmer on clover groves
      for (let i = 0; i < details.cloverRings.length; i++) {
        const cr = details.cloverRings[i];
        const cp = 0.5 + 0.5 * Math.sin(elapsed * 1.8 + i * 1.9);
        (cr.material as THREE.MeshBasicMaterial).opacity = 0.18 + cp * 0.16;
      }
    },
    dispose() {
      grass.dispose();
      water.dispose();
      for (const wf of wildflowers) wf.dispose();
      for (const t of heroTrees) t.dispose();
      for (const f of forests) f.dispose();
    },
  };
}

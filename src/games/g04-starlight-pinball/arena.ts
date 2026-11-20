import * as THREE from 'three';
import {
  createDetailedTree,
  createFernCluster,
  createLantern,
  createPBRMaterial,
  type DetailedTree,
} from '../../art';
import {
  APRON_WALLS,
  ASTROLABE_CENTER,
  BUMPERS,
  CABINET_RAIL_HEIGHT,
  CABINET_RAIL_THICKNESS,
  DROP_TARGETS,
  FLIPPERS,
  LANE_DIVIDERS,
  PLAYFIELD_ARCH_CENTER_Z,
  PLAYFIELD_ARCH_RADIUS,
  PLAYFIELD_HALF_W,
  PLAYFIELD_MAX_Z,
  PLAYFIELD_MIN_Z,
  SLINGSHOTS,
  VORTICES,
  ZODIAC_LANES,
} from './constants';
import { worldToPlayfieldUV, type StarlightTextures } from './textures';

export interface BumperVisual {
  id: number;
  group: THREE.Group;
  skirt: THREE.Mesh;
  capGroup: THREE.Group;
  domeMat: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshStandardMaterial;
  recoil: number;
  flash: number;
  triggerHit: (strength?: number) => void;
}

export interface DropTargetVisual {
  id: number;
  group: THREE.Group;
  plate: THREE.Group;
  glowMat: THREE.MeshStandardMaterial;
  backboxGemMat: THREE.MeshStandardMaterial;
  currentY: number;
  setDown: (down: boolean) => void;
}

export interface ZodiacLaneVisual {
  id: number;
  padMat: THREE.MeshStandardMaterial;
  haloMesh: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
  backboxGemMat: THREE.MeshStandardMaterial;
  lit: boolean;
  setLit: (lit: boolean) => void;
}

export interface SlingshotVisual {
  id: number;
  bandMesh: THREE.Mesh;
  bandMat: THREE.MeshStandardMaterial;
  flash: number;
  triggerHit: () => void;
}

export interface VortexVisual {
  id: number;
  group: THREE.Group;
  outerRing: THREE.Mesh;
  innerRing: THREE.Mesh;
  coreMesh: THREE.Mesh;
  matOuter: THREE.MeshBasicMaterial;
  matInner: THREE.MeshBasicMaterial;
  matCore: THREE.MeshBasicMaterial;
  setActive: (active: boolean, intensity?: number) => void;
}

export interface PinballArena {
  root: THREE.Group;
  bumpers: BumperVisual[];
  dropTargets: DropTargetVisual[];
  zodiacLanes: ZodiacLaneVisual[];
  slingshots: SlingshotVisual[];
  vortices: VortexVisual[];
  flipperGroups: [THREE.Group, THREE.Group];
  astrolabeRing: THREE.Group;
  plungerHead: THREE.Mesh;
  trees: DetailedTree[];
  update: (dt: number, elapsed: number, frenzyActive: boolean, plungerPull: number) => void;
  dispose: () => void;
}

interface GearRecord {
  mesh: THREE.Mesh;
  speed: number;
}

function createGearGeometry(
  outerRadius: number,
  innerRadius: number,
  teeth: number,
  toothDepth: number,
  thickness: number,
  spokes = 5,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const rootR = outerRadius - toothDepth;
  const step = (Math.PI * 2) / teeth;

  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.22;
    const a2 = a0 + step * 0.34;
    const a3 = a0 + step * 0.66;
    const a4 = a0 + step * 0.78;

    const p0x = Math.cos(a0) * rootR;
    const p0y = Math.sin(a0) * rootR;
    if (i === 0) shape.moveTo(p0x, p0y);
    else shape.lineTo(p0x, p0y);

    shape.lineTo(Math.cos(a1) * rootR, Math.sin(a1) * rootR);
    shape.lineTo(Math.cos(a2) * outerRadius, Math.sin(a2) * outerRadius);
    shape.lineTo(Math.cos(a3) * outerRadius, Math.sin(a3) * outerRadius);
    shape.lineTo(Math.cos(a4) * rootR, Math.sin(a4) * rootR);
  }
  shape.closePath();

  // Central axle bore
  const bore = new THREE.Path();
  bore.absarc(0, 0, Math.max(0.18, innerRadius * 0.32), 0, Math.PI * 2, true);
  shape.holes.push(bore);

  // Ornamental spoked sector cutouts for larger gears
  if (outerRadius > 1.2 && spokes >= 4) {
    const holeInner = innerRadius * 0.56;
    const holeOuter = rootR * 0.82;
    if (holeOuter - holeInner > 0.28) {
      const sectorStep = (Math.PI * 2) / spokes;
      const pad = 0.16;
      for (let s = 0; s < spokes; s++) {
        const sa = s * sectorStep + pad;
        const ea = (s + 1) * sectorStep - pad;
        if (ea <= sa + 0.05) continue;
        const hole = new THREE.Path();
        hole.moveTo(Math.cos(sa) * holeInner, Math.sin(sa) * holeInner);
        hole.absarc(0, 0, holeOuter, sa, ea, false);
        hole.absarc(0, 0, holeInner, ea, sa, true);
        hole.closePath();
        shape.holes.push(hole);
      }
    }
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function createFlipperGeometry(length: number, baseR: number, tipR: number, height: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  // Tapered capsule profile along +X from (0,0) to (length, 0)
  shape.absarc(0, 0, baseR, Math.PI * 0.5, Math.PI * 1.5, false);
  shape.absarc(length, 0, tipR, -Math.PI * 0.5, Math.PI * 0.5, false);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
    curveSegments: 16,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function createPinballArena(textures: StarlightTextures): PinballArena {
  const root = new THREE.Group();
  root.name = 'StarlightPinballArena';

  const gears: GearRecord[] = [];
  const trees: DetailedTree[] = [];

  // Shared museum materials
  const mahoganyMat = createPBRMaterial('woodPlanks', {
    repeatX: 2.5,
    repeatY: 1.5,
    tint: '#5d321c',
  });
  mahoganyMat.roughness = 0.42;
  mahoganyMat.metalness = 0.08;

  const darkMahoganyMat = createPBRMaterial('woodPlanks', {
    repeatX: 3,
    repeatY: 3,
    tint: '#361b0e',
  });
  darkMahoganyMat.roughness = 0.52;
  darkMahoganyMat.metalness = 0.06;

  const brassMat = createPBRMaterial('brushedBrass', {
    repeatX: 2,
    repeatY: 2,
    tint: '#e6be6c',
  });
  brassMat.roughness = 0.28;
  brassMat.metalness = 0.88;

  const antiqueBrassMat = createPBRMaterial('brushedBrass', {
    repeatX: 1.5,
    repeatY: 1.5,
    tint: '#b88a42',
  });
  antiqueBrassMat.roughness = 0.36;
  antiqueBrassMat.metalness = 0.84;

  const copperMat = createPBRMaterial('brushedBrass', {
    repeatX: 1.5,
    repeatY: 1.5,
    tint: '#cc7b4e',
  });
  copperMat.roughness = 0.32;
  copperMat.metalness = 0.86;

  const rubyEnamelMat = new THREE.MeshStandardMaterial({
    color: 0x8e1f2d,
    emissive: 0x38080f,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.25,
  });

  const crystalGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x9ec8f2,
    roughness: 0.08,
    metalness: 0.05,
    transparent: true,
    opacity: 0.2,
    reflectivity: 0.9,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    depthWrite: false,
  });

  // -------------------------------------------------------------------------
  // 1. Inlaid Star-Chart Playfield Deck with Real Clockwork Glass Apertures
  // -------------------------------------------------------------------------
  const deckShape = new THREE.Shape();
  // Map world (x, z) -> shape (x, -z) before rotateX(-PI/2)
  deckShape.moveTo(-PLAYFIELD_HALF_W, -PLAYFIELD_MAX_Z);
  deckShape.lineTo(PLAYFIELD_HALF_W, -PLAYFIELD_MAX_Z);
  deckShape.lineTo(PLAYFIELD_HALF_W, -PLAYFIELD_ARCH_CENTER_Z);
  deckShape.absarc(
    0,
    -PLAYFIELD_ARCH_CENTER_Z,
    PLAYFIELD_ARCH_RADIUS,
    0,
    Math.PI,
    false,
  );
  deckShape.lineTo(-PLAYFIELD_HALF_W, -PLAYFIELD_MAX_Z);
  deckShape.closePath();

  const apertures = [
    { x: ASTROLABE_CENTER.x, z: ASTROLABE_CENTER.z, r: 2.58 },
    { x: 0, z: -4.45, r: 1.48 },
    { x: -4.45, z: 3.15, r: 1.12 },
    { x: 4.45, z: 3.15, r: 1.12 },
  ];

  for (const ap of apertures) {
    const hole = new THREE.Path();
    hole.absarc(ap.x, -ap.z, ap.r, 0, Math.PI * 2, true);
    deckShape.holes.push(hole);
  }

  const deckGeo = new THREE.ShapeGeometry(deckShape, 48);
  deckGeo.rotateX(-Math.PI / 2);

  // Project exact world (x, z) UVs to align star-chart painting with bumpers & lanes
  const posAttr = deckGeo.attributes.position;
  const uvArr = new Float32Array(posAttr.count * 2);
  for (let i = 0; i < posAttr.count; i++) {
    const wx = posAttr.getX(i);
    const wz = posAttr.getZ(i);
    const [u, v] = worldToPlayfieldUV(wx, wz);
    uvArr[i * 2] = u;
    uvArr[i * 2 + 1] = 1 - v;
  }
  deckGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

  const playfieldMat = new THREE.MeshStandardMaterial({
    map: textures.playfieldMap,
    roughnessMap: textures.playfieldRoughness,
    roughness: 0.34,
    metalness: 0.22,
    envMapIntensity: 1.15,
  });

  const deckMesh = new THREE.Mesh(deckGeo, playfieldMat);
  deckMesh.position.y = 0;
  deckMesh.receiveShadow = true;
  root.add(deckMesh);

  // Crystal glass panes & beveled brass rims over every clockwork aperture
  for (const ap of apertures) {
    const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(ap.r + 0.04, 40), crystalGlassMat);
    glassDisc.rotation.x = -Math.PI / 2;
    glassDisc.position.set(ap.x, -0.015, ap.z);
    glassDisc.renderOrder = 2;
    root.add(glassDisc);

    const bezel = new THREE.Mesh(new THREE.TorusGeometry(ap.r + 0.04, 0.085, 10, 48), brassMat);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.set(ap.x, 0.02, ap.z);
    bezel.receiveShadow = true;
    root.add(bezel);
  }

  // -------------------------------------------------------------------------
  // 2. Under-Glass Clockwork Gear Vault (7 Meshed Rotating 3D Brass Gears)
  // -------------------------------------------------------------------------
  const cavityFloorMat = new THREE.MeshStandardMaterial({
    color: 0x0a0d1c,
    roughness: 0.72,
    metalness: 0.35,
  });
  const cavityFloor = new THREE.Mesh(new THREE.PlaneGeometry(19.2, 27.2), cavityFloorMat);
  cavityFloor.rotation.x = -Math.PI / 2;
  cavityFloor.position.set(0, -1.28, -0.4);
  root.add(cavityFloor);

  // Warm interior clockwork under-deck lamps so turning gears glow brilliantly through glass
  const underLightMain = new THREE.PointLight(0xffb85c, 4.6, 12.5, 1.5);
  underLightMain.position.set(0, -0.35, 0.35);
  root.add(underLightMain);

  const underLightUpper = new THREE.PointLight(0x88b8ff, 3.2, 9.0, 1.6);
  underLightUpper.position.set(0, -0.4, -4.45);
  root.add(underLightUpper);

  const gearSpecs = [
    { x: 0, y: -0.58, z: 0.35, r: 2.25, teeth: 24, depth: 0.24, speed: 0.42, mat: brassMat },
    { x: 2.38, y: -0.62, z: -1.65, r: 1.48, teeth: 16, depth: 0.22, speed: -0.63, mat: copperMat },
    { x: -2.38, y: -0.62, z: -1.65, r: 1.48, teeth: 16, depth: 0.22, speed: -0.63, mat: antiqueBrassMat },
    { x: 0, y: -0.52, z: -4.45, r: 1.72, teeth: 20, depth: 0.22, speed: 0.54, mat: brassMat },
    { x: -4.45, y: -0.55, z: 3.15, r: 1.38, teeth: 15, depth: 0.2, speed: -0.78, mat: copperMat },
    { x: 4.45, y: -0.55, z: 3.15, r: 1.38, teeth: 15, depth: 0.2, speed: 0.78, mat: copperMat },
    { x: 0, y: -0.88, z: 2.45, r: 1.65, teeth: 18, depth: 0.2, speed: -0.56, mat: antiqueBrassMat },
  ];

  const axleGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.05, 12);
  for (const gs of gearSpecs) {
    const geo = createGearGeometry(gs.r, gs.r * 0.45, gs.teeth, 0.22, gs.depth, 5);
    const mesh = new THREE.Mesh(geo, gs.mat);
    mesh.position.set(gs.x, gs.y, gs.z);
    root.add(mesh);

    const axle = new THREE.Mesh(axleGeo, antiqueBrassMat);
    axle.position.set(gs.x, -0.78, gs.z);
    root.add(axle);

    gears.push({ mesh, speed: gs.speed });
  }

  // -------------------------------------------------------------------------
  // 3. Spinning Central Astrolabe Turntable Ring (Flush above main window)
  // -------------------------------------------------------------------------
  const astrolabeRing = new THREE.Group();
  astrolabeRing.position.set(ASTROLABE_CENTER.x, 0.035, ASTROLABE_CENTER.z);

  const outerAstRing = new THREE.Mesh(
    new THREE.TorusGeometry(ASTROLABE_CENTER.radius - 0.16, 0.055, 8, 48),
    brassMat,
  );
  outerAstRing.rotation.x = Math.PI / 2;
  astrolabeRing.add(outerAstRing);

  const innerAstRing = new THREE.Mesh(
    new THREE.TorusGeometry(ASTROLABE_CENTER.radius * 0.58, 0.038, 8, 36),
    antiqueBrassMat,
  );
  innerAstRing.rotation.x = Math.PI / 2;
  astrolabeRing.add(innerAstRing);

  // 4 cardinal gilded astrolabe pointers & 8 jewel studs
  const needleGeo = new THREE.ConeGeometry(0.11, 0.72, 4);
  needleGeo.rotateX(Math.PI / 2);
  const studMat = new THREE.MeshStandardMaterial({
    color: 0xffefc2,
    emissive: 0xffb94a,
    emissiveIntensity: 1.35,
    roughness: 0.2,
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.035, ASTROLABE_CENTER.radius * 1.92),
      brassMat,
    );
    arm.rotation.y = a;
    astrolabeRing.add(arm);

    const tip = new THREE.Mesh(needleGeo, brassMat);
    tip.position.set(Math.sin(a) * 2.08, 0.02, Math.cos(a) * 2.08);
    tip.rotation.y = a;
    astrolabeRing.add(tip);

    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), studMat);
    stud.position.set(Math.sin(a + Math.PI / 4) * 2.52, 0.04, Math.cos(a + Math.PI / 4) * 2.52);
    astrolabeRing.add(stud);
  }
  const centerJewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), studMat);
  centerJewel.scale.set(1, 0.35, 1);
  centerJewel.position.y = 0.04;
  astrolabeRing.add(centerJewel);
  root.add(astrolabeRing);

  // -------------------------------------------------------------------------
  // 4. Opulent Mahogany & Brushed Brass Pinball Cabinet + Sweeping Upper Arch
  // -------------------------------------------------------------------------
  const railW = CABINET_RAIL_THICKNESS;
  const railH = CABINET_RAIL_HEIGHT;
  const cabinetBaseDepth = 2.15;

  // Solid mahogany lower cabinet body supporting the playfield
  const bodyShape = new THREE.Shape();
  const outerW = PLAYFIELD_HALF_W + railW;
  const outerR = PLAYFIELD_ARCH_RADIUS + railW;
  bodyShape.moveTo(-outerW, -(PLAYFIELD_MAX_Z + railW));
  bodyShape.lineTo(outerW, -(PLAYFIELD_MAX_Z + railW));
  bodyShape.lineTo(outerW, -PLAYFIELD_ARCH_CENTER_Z);
  bodyShape.absarc(0, -PLAYFIELD_ARCH_CENTER_Z, outerR, 0, Math.PI, false);
  bodyShape.lineTo(-outerW, -(PLAYFIELD_MAX_Z + railW));
  bodyShape.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: cabinetBaseDepth,
    bevelEnabled: true,
    bevelThickness: 0.14,
    bevelSize: 0.12,
    bevelSegments: 2,
    curveSegments: 40,
  });
  bodyGeo.rotateX(-Math.PI / 2);
  const bodyMesh = new THREE.Mesh(bodyGeo, darkMahoganyMat);
  bodyMesh.position.y = -cabinetBaseDepth - 1.44;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  root.add(bodyMesh);

  // Raised perimeter cabinet rail wall (hollow interior matching exact playfield arch!)
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-outerW, -(PLAYFIELD_MAX_Z + railW));
  wallShape.lineTo(outerW, -(PLAYFIELD_MAX_Z + railW));
  wallShape.lineTo(outerW, -PLAYFIELD_ARCH_CENTER_Z);
  wallShape.absarc(0, -PLAYFIELD_ARCH_CENTER_Z, outerR, 0, Math.PI, false);
  wallShape.lineTo(-outerW, -(PLAYFIELD_MAX_Z + railW));
  wallShape.closePath();

  const wallHole = new THREE.Path();
  wallHole.moveTo(-PLAYFIELD_HALF_W, -PLAYFIELD_MAX_Z);
  wallHole.lineTo(PLAYFIELD_HALF_W, -PLAYFIELD_MAX_Z);
  wallHole.lineTo(PLAYFIELD_HALF_W, -PLAYFIELD_ARCH_CENTER_Z);
  wallHole.absarc(0, -PLAYFIELD_ARCH_CENTER_Z, PLAYFIELD_ARCH_RADIUS, 0, Math.PI, false);
  wallHole.lineTo(-PLAYFIELD_HALF_W, -PLAYFIELD_MAX_Z);
  wallHole.closePath();
  wallShape.holes.push(wallHole);

  const wallGeo = new THREE.ExtrudeGeometry(wallShape, {
    depth: railH + 1.35,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.08,
    bevelSegments: 3,
    curveSegments: 44,
  });
  wallGeo.rotateX(-Math.PI / 2);
  const wallMesh = new THREE.Mesh(wallGeo, mahoganyMat);
  wallMesh.position.y = -1.35;
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  root.add(wallMesh);

  // Gleaming brushed brass top trim rail crowning the mahogany walls
  const trimShape = new THREE.Shape();
  const trimOutW = outerW - 0.14;
  const trimInW = PLAYFIELD_HALF_W + 0.14;
  trimShape.moveTo(-trimOutW, -(PLAYFIELD_MAX_Z + railW - 0.14));
  trimShape.lineTo(trimOutW, -(PLAYFIELD_MAX_Z + railW - 0.14));
  trimShape.lineTo(trimOutW, -PLAYFIELD_ARCH_CENTER_Z);
  trimShape.absarc(0, -PLAYFIELD_ARCH_CENTER_Z, outerR - 0.14, 0, Math.PI, false);
  trimShape.lineTo(-trimOutW, -(PLAYFIELD_MAX_Z + railW - 0.14));
  trimShape.closePath();

  const trimHole = new THREE.Path();
  trimHole.moveTo(-trimInW, -(PLAYFIELD_MAX_Z + 0.14));
  trimHole.lineTo(trimInW, -(PLAYFIELD_MAX_Z + 0.14));
  trimHole.lineTo(trimInW, -PLAYFIELD_ARCH_CENTER_Z);
  trimHole.absarc(0, -PLAYFIELD_ARCH_CENTER_Z, PLAYFIELD_ARCH_RADIUS + 0.14, 0, Math.PI, false);
  trimHole.lineTo(-trimInW, -(PLAYFIELD_MAX_Z + 0.14));
  trimHole.closePath();
  trimShape.holes.push(trimHole);

  const trimGeo = new THREE.ExtrudeGeometry(trimShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
    curveSegments: 44,
  });
  trimGeo.rotateX(-Math.PI / 2);
  const trimMesh = new THREE.Mesh(trimGeo, brassMat);
  trimMesh.position.y = railH + 0.04;
  trimMesh.castShadow = true;
  trimMesh.receiveShadow = true;
  root.add(trimMesh);

  // Turned brass finials & riveted corner plaques on lower cabinet corners & arch shoulders
  const finialCoords: [number, number][] = [
    [-outerW + 0.45, PLAYFIELD_MAX_Z + 0.52],
    [outerW - 0.45, PLAYFIELD_MAX_Z + 0.52],
    [-outerW + 0.45, PLAYFIELD_ARCH_CENTER_Z],
    [outerW - 0.45, PLAYFIELD_ARCH_CENTER_Z],
    [-outerW + 0.45, 4.1],
    [outerW - 0.45, 4.1],
  ];
  for (const [fx, fz] of finialCoords) {
    const fin = new THREE.Group();
    fin.position.set(fx, railH + 0.16, fz);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.18, 12), antiqueBrassMat);
    base.position.y = 0.09;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.055, 8, 16), brassMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.22;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), brassMat);
    orb.position.y = 0.42;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 10), brassMat);
    spire.position.y = 0.76;
    fin.add(base, collar, orb, spire);
    fin.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    root.add(fin);
  }

  // Ornate carved cabinet legs extending down to the observatory hall floor
  const legCoords: [number, number][] = [
    [-8.6, 11.4],
    [8.6, 11.4],
    [-8.6, -5.2],
    [8.6, -5.2],
    [0, -13.2],
  ];
  for (const [lx, lz] of legCoords) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.72, 3.6, 12), darkMahoganyMat);
    leg.position.set(lx, -3.5, lz);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.82, 0.45, 12), antiqueBrassMat);
    cuff.position.set(lx, -4.9, lz);
    root.add(leg, cuff);
  }

  // -------------------------------------------------------------------------
  // 5. Grand Observatory Backbox Arch, Constellation Lamps & Armillary Crest
  // -------------------------------------------------------------------------
  const backbox = new THREE.Group();
  backbox.position.set(0, 0, PLAYFIELD_MIN_Z - 1.55);

  const bbFrame = new THREE.Mesh(new THREE.BoxGeometry(15.2, 7.6, 1.35), mahoganyMat);
  bbFrame.position.set(0, 4.1, 0);
  bbFrame.castShadow = true;
  bbFrame.receiveShadow = true;
  backbox.add(bbFrame);

  // Brass cornice moldings top and bottom
  const bbTopTrim = new THREE.Mesh(new THREE.BoxGeometry(15.8, 0.42, 1.65), brassMat);
  bbTopTrim.position.set(0, 8.0, 0.08);
  const bbBotTrim = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.34, 1.55), brassMat);
  bbBotTrim.position.set(0, 0.45, 0.08);
  backbox.add(bbTopTrim, bbBotTrim);

  // Glowing Starlight Odyssey Backglass Panel
  const backglassMat = new THREE.MeshStandardMaterial({
    map: textures.backglassMap,
    emissiveMap: textures.backglassMap,
    emissive: new THREE.Color(0xffdfa6),
    emissiveIntensity: 0.78,
    roughness: 0.18,
    metalness: 0.15,
  });
  const backglass = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 6.2), backglassMat);
  backglass.position.set(0, 4.25, 0.72);
  backbox.add(backglass);

  // Twin side brass columns flanking the backglass + grounded rear piers
  for (const side of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 7.5, 14), brassMat);
    col.position.set(side * 7.2, 4.15, 0.56);
    backbox.add(col);

    const rearPier = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5.4, 1.3), darkMahoganyMat);
    rearPier.position.set(side * 5.8, -2.35, 0);
    rearPier.castShadow = true;
    backbox.add(rearPier);

    // Antique brass observatory telescope mounted on each backbox shoulder!
    const scopeGroup = new THREE.Group();
    scopeGroup.position.set(side * 6.35, 8.75, 0.15);
    scopeGroup.rotation.set(0.36, side * -0.28, side * 0.12);
    const tubeMain = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 2.75, 14), brassMat);
    tubeMain.rotation.x = Math.PI / 2;
    const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.05, 8, 16), antiqueBrassMat);
    lensRing.position.z = 1.38;
    const lensGlass = new THREE.Mesh(
      new THREE.CircleGeometry(0.26, 16),
      new THREE.MeshStandardMaterial({
        color: 0x6ab4ff,
        emissive: 0x3266a8,
        emissiveIntensity: 0.8,
        roughness: 0.1,
      }),
    );
    lensGlass.position.z = 1.4;
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.85, 10), antiqueBrassMat);
    mount.position.y = -0.42;
    scopeGroup.add(tubeMain, lensRing, lensGlass, mount);
    backbox.add(scopeGroup);
  }

  // Spinning 3D Brass Armillary Orrery crowning the top center of the backbox!
  const orrery = new THREE.Group();
  orrery.position.set(0, 9.75, 0.15);
  const orreryBase = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, 0.65, 14), antiqueBrassMat);
  orreryBase.position.y = -1.35;
  const orreryRing1 = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.08, 10, 36), brassMat);
  const orreryRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.065, 10, 32), copperMat);
  orreryRing2.rotation.y = Math.PI / 3;
  orreryRing2.rotation.x = Math.PI / 5;
  const orrerySun = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 16, 14),
    new THREE.MeshStandardMaterial({
      color: 0xfff0b8,
      emissive: 0xffb845,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    }),
  );
  orrery.add(orreryBase, orreryRing1, orreryRing2, orrerySun);
  backbox.add(orrery);

  // Backbox Constellation & Zodiac Status Jewels
  const backboxDropGemMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < DROP_TARGETS.length; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a3554,
      emissive: new THREE.Color(DROP_TARGETS[i].accentHex),
      emissiveIntensity: 0.15,
      roughness: 0.2,
      metalness: 0.3,
    });
    backboxDropGemMats.push(mat);
    const gx = (i - 1) * 2.25;
    const housing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.08, 8, 20), brassMat);
    housing.position.set(gx, 1.48, 0.78);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 1), mat);
    gem.scale.set(1, 1, 0.45);
    gem.position.set(gx, 1.48, 0.8);
    backbox.add(housing, gem);
  }

  const backboxZodiacGemMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < ZODIAC_LANES.length; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2c2944,
      emissive: new THREE.Color(0xffca62),
      emissiveIntensity: 0.15,
      roughness: 0.2,
    });
    backboxZodiacGemMats.push(mat);
    const gx = (i - 1.5) * 2.15;
    const housing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 8, 16), antiqueBrassMat);
    housing.position.set(gx, 7.12, 0.78);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), mat);
    gem.scale.set(1, 1, 0.45);
    gem.position.set(gx, 7.12, 0.8);
    backbox.add(housing, gem);
  }

  root.add(backbox);

  // -------------------------------------------------------------------------
  // 6. 5 Gleaming Brass & Amber-Glass Pop Bumpers
  // -------------------------------------------------------------------------
  const bumpers: BumperVisual[] = [];
  for (const def of BUMPERS) {
    const g = new THREE.Group();
    g.position.set(def.x, 0, def.z);

    // Lower knurled brass plinth ring
    const basePlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(def.radius * 0.92, def.radius * 1.04, 0.22, 24),
      antiqueBrassMat,
    );
    basePlinth.position.y = 0.11;
    basePlinth.castShadow = true;
    basePlinth.receiveShadow = true;
    g.add(basePlinth);

    // Recoil kick-skirt ring (moves radially/vertically when hit!)
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf4c86d,
      emissive: new THREE.Color(def.accentHex),
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.82,
    });
    const skirt = new THREE.Mesh(
      new THREE.TorusGeometry(def.radius * 0.96, 0.13, 12, 28),
      ringMat,
    );
    skirt.rotation.x = Math.PI / 2;
    skirt.position.y = 0.44;
    skirt.castShadow = true;
    g.add(skirt);

    // Glowing Amber-Glass Filament Cylinder / Dome
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0xffdc96,
      emissive: new THREE.Color(def.accentHex),
      emissiveIntensity: 1.45,
      roughness: 0.18,
      metalness: 0.1,
    });
    const glassBody = new THREE.Mesh(
      new THREE.CylinderGeometry(def.radius * 0.72, def.radius * 0.84, 0.68, 22),
      domeMat,
    );
    glassBody.position.y = 0.56;
    g.add(glassBody);

    // 4 vertical brass cage ribs around the glowing amber core
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.74, 8), brassMat);
      rib.position.set(Math.cos(a) * def.radius * 0.82, 0.58, Math.sin(a) * def.radius * 0.82);
      g.add(rib);
    }

    // Ornate engraved top cap + brass finial
    const capGroup = new THREE.Group();
    capGroup.position.y = 0.96;

    const capRim = new THREE.Mesh(
      new THREE.CylinderGeometry(def.radius * 1.02, def.radius * 0.94, 0.18, 24),
      brassMat,
    );
    capRim.castShadow = true;
    capGroup.add(capRim);

    const capFace = new THREE.Mesh(
      new THREE.CircleGeometry(def.radius * 0.94, 24),
      new THREE.MeshStandardMaterial({
        map: textures.bumperCapMap,
        roughness: 0.3,
        metalness: 0.65,
      }),
    );
    capFace.rotation.x = -Math.PI / 2;
    capFace.position.y = 0.095;
    capGroup.add(capFace);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), brassMat);
    finial.position.y = 0.18;
    capGroup.add(finial);
    g.add(capGroup);

    root.add(g);

    const visual: BumperVisual = {
      id: def.id,
      group: g,
      skirt,
      capGroup,
      domeMat,
      ringMat,
      recoil: 0,
      flash: 0,
      triggerHit(strength = 1) {
        this.recoil = Math.min(1.3, Math.max(this.recoil, 0.95 * strength));
        this.flash = Math.min(1.4, Math.max(this.flash, 1.15 * strength));
      },
    };
    bumpers.push(visual);
  }

  // -------------------------------------------------------------------------
  // 7. 4 Glowing Zodiac Rollover Lanes & Turned Brass Lane Dividers
  // -------------------------------------------------------------------------
  const zodiacLanes: ZodiacLaneVisual[] = [];
  for (let i = 0; i < ZODIAC_LANES.length; i++) {
    const def = ZODIAC_LANES[i];
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x3b385a,
      emissive: 0xffc65c,
      emissiveIntensity: 0.18,
      roughness: 0.25,
      metalness: 0.2,
    });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, 0.06, 18), padMat);
    pad.position.set(def.x, 0.03, def.z);
    root.add(pad);

    const padRing = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.055, 8, 22), brassMat);
    padRing.rotation.x = Math.PI / 2;
    padRing.position.set(def.x, 0.04, def.z);
    root.add(padRing);

    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffd778,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const haloMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.58, 1.35, 16, 1, true), haloMat);
    haloMesh.position.set(def.x, 0.72, def.z);
    root.add(haloMesh);

    const backGemMat = backboxZodiacGemMats[i];
    zodiacLanes.push({
      id: def.id,
      padMat,
      haloMesh,
      haloMat,
      backboxGemMat: backGemMat,
      lit: false,
      setLit(lit: boolean) {
        this.lit = lit;
        padMat.emissiveIntensity = lit ? 2.6 : 0.18;
        padMat.color.setHex(lit ? 0xfff0b8 : 0x3b385a);
        backGemMat.emissiveIntensity = lit ? 2.5 : 0.15;
        backGemMat.color.setHex(lit ? 0xfff0b8 : 0x2c2944);
      },
    });
  }

  for (const div of LANE_DIVIDERS) {
    const len = div.zEnd - div.zStart;
    const midZ = (div.zStart + div.zEnd) * 0.5;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(div.radius * 1.55, 0.62, len), brassMat);
    wall.position.set(div.x, 0.31, midZ);
    wall.castShadow = true;
    root.add(wall);

    for (const endZ of [div.zStart, div.zEnd]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(div.radius * 1.1, div.radius * 1.25, 0.76, 12), antiqueBrassMat);
      post.position.set(div.x, 0.38, endZ);
      post.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(div.radius * 0.95, 10, 8), rubyEnamelMat);
      cap.position.set(div.x, 0.82, endZ);
      root.add(post, cap);
    }
  }

  // -------------------------------------------------------------------------
  // 8. 3 Celestial Drop-Targets (Cygnus, Lyra, Cassiopeia)
  // -------------------------------------------------------------------------
  const dropTargets: DropTargetVisual[] = [];
  for (let i = 0; i < DROP_TARGETS.length; i++) {
    const def = DROP_TARGETS[i];
    const g = new THREE.Group();
    g.position.set(def.x, 0, def.z);
    // Align local +Z with target normal (nx, nz)
    g.rotation.y = Math.atan2(def.nx, def.nz);

    // Recessed brass slot bezel flush on playfield
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(def.halfWidth * 2.15, 0.12, 0.44),
      antiqueBrassMat,
    );
    slot.position.y = 0.05;
    g.add(slot);

    // Rising/dropping constellation rune tablet
    const plate = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(def.halfWidth * 1.94, 1.12, 0.24),
      brassMat,
    );
    frame.position.y = 0.62;
    frame.castShadow = true;
    plate.add(frame);

    const glowMat = new THREE.MeshStandardMaterial({
      map: textures.runeMaps[i],
      emissiveMap: textures.runeMaps[i],
      emissive: new THREE.Color(def.accentHex),
      emissiveIntensity: 1.45,
      roughness: 0.2,
      metalness: 0.18,
    });
    const faceFront = new THREE.Mesh(new THREE.PlaneGeometry(def.halfWidth * 1.78, 0.96), glowMat);
    faceFront.position.set(0, 0.62, 0.13);
    const faceBack = new THREE.Mesh(new THREE.PlaneGeometry(def.halfWidth * 1.78, 0.96), glowMat);
    faceBack.position.set(0, 0.62, -0.13);
    faceBack.rotation.y = Math.PI;
    plate.add(faceFront, faceBack);

    g.add(plate);
    root.add(g);

    const gemMat = backboxDropGemMats[i];
    let targetDown = false;
    dropTargets.push({
      id: def.id,
      group: g,
      plate,
      glowMat,
      backboxGemMat: gemMat,
      currentY: 0,
      setDown(down: boolean) {
        targetDown = down;
        glowMat.emissiveIntensity = down ? 0.3 : 1.45;
        gemMat.emissiveIntensity = down ? 2.8 : 0.15;
        gemMat.color.setHex(down ? 0xffffff : 0x2a3554);
        plate.userData.targetY = targetDown ? -1.04 : 0;
      },
    });
    plate.userData.targetY = 0;
  }

  // -------------------------------------------------------------------------
  // 9. 2 Slingshot Kickers (Triangular Brass Posts + Elastic Amber Bands)
  // -------------------------------------------------------------------------
  const slingshots: SlingshotVisual[] = [];
  for (const def of SLINGSHOTS) {
    const pts: [number, number][] = [
      [def.ax, def.az],
      [def.bx, def.bz],
      [def.cx, def.cz],
    ];

    // Raised triangular brass & mahogany top cover plate
    const sShape = new THREE.Shape();
    sShape.moveTo(def.ax, -def.az);
    sShape.lineTo(def.bx, -def.bz);
    sShape.lineTo(def.cx, -def.cz);
    sShape.closePath();
    const plateGeo = new THREE.ExtrudeGeometry(sShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.04,
      bevelSegments: 2,
    });
    plateGeo.rotateX(-Math.PI / 2);
    const topPlate = new THREE.Mesh(plateGeo, mahoganyMat);
    topPlate.position.y = 0.72;
    topPlate.castShadow = true;
    root.add(topPlate);

    for (const [px, pz] of pts) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.86, 12), brassMat);
      post.position.set(px, 0.43, pz);
      post.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), rubyEnamelMat);
      cap.position.set(px, 0.92, pz);
      root.add(post, cap);
    }

    // Active glowing elastic kicker band between A and B
    const dx = def.bx - def.ax;
    const dz = def.bz - def.az;
    const len = Math.hypot(dx, dz);
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0xffd275,
      emissive: 0xff9d36,
      emissiveIntensity: 0.75,
      roughness: 0.3,
    });
    const bandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, len), bandMat);
    bandMesh.position.set((def.ax + def.bx) * 0.5, 0.4, (def.az + def.bz) * 0.5);
    bandMesh.rotation.y = Math.atan2(dx, dz);
    root.add(bandMesh);

    // Back side structural rails A-C and B-C
    for (const [p1, p2] of [
      [[def.ax, def.az], [def.cx, def.cz]],
      [[def.bx, def.bz], [def.cx, def.cz]],
    ]) {
      const rdx = p2[0] - p1[0];
      const rdz = p2[1] - p1[1];
      const rLen = Math.hypot(rdx, rdz);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, rLen), antiqueBrassMat);
      rail.position.set((p1[0] + p2[0]) * 0.5, 0.34, (p1[1] + p2[1]) * 0.5);
      rail.rotation.y = Math.atan2(rdx, rdz);
      root.add(rail);
    }

    slingshots.push({
      id: def.id,
      bandMesh,
      bandMat,
      flash: 0,
      triggerHit() {
        this.flash = 1.0;
      },
    });
  }

  // -------------------------------------------------------------------------
  // 10. Lower Apron Funnel Guide Walls, Mechanical Brass Flippers & Auto-Plunger
  // -------------------------------------------------------------------------
  for (const w of APRON_WALLS) {
    const dx = w.bx - w.ax;
    const dz = w.bz - w.az;
    const len = Math.hypot(dx, dz);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w.thickness * 1.4, 0.66, len), mahoganyMat);
    rail.position.set((w.ax + w.bx) * 0.5, 0.33, (w.az + w.bz) * 0.5);
    rail.rotation.y = Math.atan2(dx, dz);
    rail.castShadow = true;
    root.add(rail);

    const brassCap = new THREE.Mesh(new THREE.BoxGeometry(w.thickness * 1.65, 0.1, len + 0.1), brassMat);
    brassCap.position.set((w.ax + w.bx) * 0.5, 0.7, (w.az + w.bz) * 0.5);
    brassCap.rotation.y = Math.atan2(dx, dz);
    root.add(brassCap);
  }

  // Mechanical Brass Flippers (pivoted at exact FLIPPERS[i].pivotX/pivotZ)
  const flipperGroups: THREE.Group[] = [];
  for (const f of FLIPPERS) {
    const fg = new THREE.Group();
    fg.position.set(f.pivotX, 0.08, f.pivotZ);
    fg.rotation.y = -f.restAngle;

    const paddleGeo = createFlipperGeometry(f.length, f.baseRadius, f.tipRadius, 0.56);
    const paddle = new THREE.Mesh(paddleGeo, brassMat);
    paddle.castShadow = true;
    paddle.receiveShadow = true;
    fg.add(paddle);

    // Crimson velvet/ruby center inlay strip along top of flipper
    const inlay = new THREE.Mesh(
      new THREE.BoxGeometry(f.length * 0.78, 0.08, 0.24),
      rubyEnamelMat,
    );
    inlay.position.set(f.length * 0.45, 0.6, 0);
    fg.add(inlay);

    // Pivot cap jewel
    const pivotCap = new THREE.Mesh(
      new THREE.CylinderGeometry(f.baseRadius * 0.72, f.baseRadius * 0.8, 0.18, 16),
      antiqueBrassMat,
    );
    pivotCap.position.set(0, 0.64, 0);
    const pivotGem = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0xffe4a0,
        emissive: 0xffb242,
        emissiveIntensity: 1.5,
        roughness: 0.2,
      }),
    );
    pivotGem.position.set(0, 0.76, 0);
    fg.add(pivotCap, pivotGem);

    root.add(fg);
    flipperGroups.push(fg);
  }

  // Brass Auto-Plunger & Celestial Return Gate at lower apron trough
  const plungerHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 1.4, 12), antiqueBrassMat);
  plungerHousing.rotation.x = Math.PI / 2;
  plungerHousing.position.set(0, 0.42, PLAYFIELD_MAX_Z + 0.55);
  root.add(plungerHousing);

  const plungerHead = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 16), brassMat);
  plungerHead.rotation.x = Math.PI / 2;
  plungerHead.position.set(0, 0.42, PLAYFIELD_MAX_Z - 0.15);
  root.add(plungerHead);

  // -------------------------------------------------------------------------
  // 11. Curved Elevated Brass Wire-Form Guide Rails (Classic Collector Craft!)
  // -------------------------------------------------------------------------
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 8.65, 0.85, 6.2),
      new THREE.Vector3(side * 8.75, 1.08, 1.2),
      new THREE.Vector3(side * 8.55, 1.22, -4.4),
      new THREE.Vector3(side * 6.9, 1.25, -9.8),
      new THREE.Vector3(side * 3.8, 1.15, -12.6),
    ]);
    const upperRail = new THREE.Mesh(new THREE.TubeGeometry(curve, 44, 0.065, 8, false), brassMat);
    upperRail.castShadow = true;
    root.add(upperRail);

    const lowerCurve = new THREE.CatmullRomCurve3(
      curve.getPoints(12).map((p) => new THREE.Vector3(p.x, p.y - 0.28, p.z)),
    );
    const lowerRail = new THREE.Mesh(new THREE.TubeGeometry(lowerCurve, 40, 0.052, 8, false), copperMat);
    root.add(lowerRail);

    // Turned stanchion support posts along the wireform
    const postTs = [0.04, 0.32, 0.58, 0.82, 0.98];
    for (const t of postTs) {
      const pt = curve.getPoint(t);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.09, pt.y, 8),
        antiqueBrassMat,
      );
      post.position.set(pt.x, pt.y * 0.5, pt.z);
      root.add(post);
    }
  }

  // -------------------------------------------------------------------------
  // 12. 2 Magnetic Nebula Vortices (Dynamic Risk-Reward Energy Wells)
  // -------------------------------------------------------------------------
  const vortices: VortexVisual[] = [];
  for (const vDef of VORTICES) {
    const vg = new THREE.Group();
    vg.position.set(vDef.x, 0.07, vDef.z);

    const matOuter = new THREE.MeshBasicMaterial({
      color: 0x9b6dff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(vDef.coreRadius * 1.15, vDef.pullRadius * 0.65, 32), matOuter);
    outerRing.rotation.x = -Math.PI / 2;

    const matInner = new THREE.MeshBasicMaterial({
      color: 0xd4a5ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(vDef.coreRadius * 0.9, 0.08, 10, 28), matInner);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.2;

    const matCore = new THREE.MeshBasicMaterial({
      color: 0x6234d8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), matCore);
    coreMesh.scale.set(1, 0.35, 1);
    coreMesh.position.y = 0.16;

    vg.add(outerRing, innerRing, coreMesh);
    vg.visible = false;
    root.add(vg);

    vortices.push({
      id: vDef.id,
      group: vg,
      outerRing,
      innerRing,
      coreMesh,
      matOuter,
      matInner,
      matCore,
      setActive(active: boolean, intensity = 1) {
        vg.visible = active && intensity > 0.02;
        matOuter.opacity = active ? 0.24 * intensity : 0;
        matInner.opacity = active ? 0.78 * intensity : 0;
        matCore.opacity = active ? 0.62 * intensity : 0;
      },
    });
  }

  // -------------------------------------------------------------------------
  // 13. Living Observatory Architecture: Marble Floor, Brass Dome Ribs,
  //     4 Bonsai & Fern Balcony Alcoves, and 6 Brass Lamp Sconces!
  // -------------------------------------------------------------------------
  const marbleFloorMat = createPBRMaterial('marbleTiles', {
    repeatX: 10,
    repeatY: 10,
    tint: '#3c3648',
  });
  marbleFloorMat.roughness = 0.42;
  const obsFloor = new THREE.Mesh(new THREE.CircleGeometry(42, 48), marbleFloorMat);
  obsFloor.rotation.x = -Math.PI / 2;
  obsFloor.position.set(0, -4.95, -1.5);
  obsFloor.receiveShadow = true;
  root.add(obsFloor);

  // Brass observatory floor compass rings
  const obsRing = new THREE.Mesh(new THREE.TorusGeometry(22.5, 0.16, 8, 64), antiqueBrassMat);
  obsRing.rotation.x = Math.PI / 2;
  obsRing.position.set(0, -4.85, -1.5);
  root.add(obsRing);

  // Grand Vaulted Brass Observatory Dome Ribs arching overhead against the starry sky!
  const domeGroup = new THREE.Group();
  domeGroup.position.set(0, -4.5, -1.5);
  const domeRadius = 35;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI;
    const ribGeo = new THREE.TorusGeometry(domeRadius, 0.28, 8, 56, Math.PI);
    const rib = new THREE.Mesh(ribGeo, antiqueBrassMat);
    rib.rotation.y = angle;
    domeGroup.add(rib);
  }
  // Horizontal observatory gallery ring & zenith oculus brass ring
  for (const [ry, rr] of [
    [6.5, domeRadius * 0.96],
    [18.5, domeRadius * 0.82],
    [29.8, domeRadius * 0.51],
  ]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.22, 8, 64), antiqueBrassMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = ry;
    domeGroup.add(ring);
  }
  root.add(domeGroup);

  // 4 Ornate Cantilevered Brass Balcony Alcoves hosting Bonsai Trees & Fern Planters
  const alcoveSpecs: {
    x: number;
    z: number;
    anchorX: number;
    anchorZ: number;
    variant: 'emerald' | 'maple' | 'sakura';
    seed: number;
    rotY: number;
  }[] = [
    { x: -11.55, z: -8.0, anchorX: -8.6, anchorZ: -6.9, variant: 'maple', seed: 104, rotY: 0.45 },
    { x: 11.55, z: -8.0, anchorX: 8.6, anchorZ: -6.9, variant: 'sakura', seed: 209, rotY: -0.55 },
    { x: -12.35, z: 5.2, anchorX: -9.8, anchorZ: 5.2, variant: 'emerald', seed: 317, rotY: 0.8 },
    { x: 12.35, z: 5.2, anchorX: 9.8, anchorZ: 5.2, variant: 'emerald', seed: 423, rotY: -0.75 },
  ];

  for (const alc of alcoveSpecs) {
    const alcGroup = new THREE.Group();
    alcGroup.position.set(alc.x, -0.35, alc.z);

    // Turned brass balcony plinth & balustrade ring
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.05, 0.48, 16), mahoganyMat);
    deck.position.y = 0.24;
    deck.castShadow = true;
    deck.receiveShadow = true;
    alcGroup.add(deck);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.32, 0.09, 8, 28), brassMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.52;
    alcGroup.add(rim);

    // Cantilevered support strut & vertical observatory pedestal grounding the balcony
    const toAnchorX = alc.anchorX - alc.x;
    const toAnchorZ = alc.anchorZ - alc.z;
    const strutLen = Math.hypot(toAnchorX, toAnchorZ);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, strutLen), antiqueBrassMat);
    strut.position.set(toAnchorX * 0.5, -0.08, toAnchorZ * 0.5);
    strut.rotation.y = Math.atan2(toAnchorX, toAnchorZ);
    alcGroup.add(strut);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.58, 4.65, 12), darkMahoganyMat);
    pedestal.position.y = -2.32;
    alcGroup.add(pedestal);

    // Balustrade rail posts around the outer arc
    const railRing = new THREE.Mesh(new THREE.TorusGeometry(2.22, 0.055, 8, 28), brassMat);
    railRing.rotation.x = Math.PI / 2;
    railRing.position.y = 1.24;
    alcGroup.add(railRing);

    for (let p = 0; p < 8; p++) {
      const a = (p / 8) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.76, 8), antiqueBrassMat);
      post.position.set(Math.cos(a) * 2.22, 0.88, Math.sin(a) * 2.22);
      alcGroup.add(post);
    }

    // Lush Potted Bonsai Tree centered on the balcony alcove!
    const bonsai = createDetailedTree({
      style: 'bonsai',
      height: 2.9,
      includePot: true,
      bonsaiVariant: alc.variant,
      seed: alc.seed,
      castShadow: true,
      receiveShadow: true,
    });
    bonsai.group.position.set(0, 0.48, 0);
    bonsai.group.rotation.y = alc.rotY;
    alcGroup.add(bonsai.group);
    trees.push(bonsai);

    // Flanking fern clusters nestled right beside the bonsai pot
    for (const side of [-1, 1]) {
      const fern = createFernCluster({
        frondCount: 9,
        radius: 0.72,
        height: 0.58,
        seed: alc.seed + side * 19,
        castShadow: false,
      });
      fern.position.set(side * 1.08, 0.5, side * 0.75);
      alcGroup.add(fern);
    }

    root.add(alcGroup);
  }

  // 6 Warm Brass Lamp Sconces seated precisely atop the mahogany & brass cabinet rails
  const archLampR = PLAYFIELD_ARCH_RADIUS + railW * 0.5;
  const archLampAngle = 0.74; // ~42.4 deg along curved upper arch
  const archLampX = Math.cos(archLampAngle) * archLampR;
  const archLampZ = PLAYFIELD_ARCH_CENTER_Z - Math.sin(archLampAngle) * archLampR;
  const sideRailX = PLAYFIELD_HALF_W + railW * 0.5;

  const lanternCoords: { x: number; y: number; z: number; withLight: boolean; intensity: number }[] = [
    { x: -archLampX, y: 1.6, z: archLampZ, withLight: true, intensity: 3.4 },
    { x: archLampX, y: 1.6, z: archLampZ, withLight: true, intensity: 3.4 },
    { x: -sideRailX, y: 1.6, z: -0.6, withLight: true, intensity: 3.0 },
    { x: sideRailX, y: 1.6, z: -0.6, withLight: true, intensity: 3.0 },
    { x: -sideRailX, y: 1.6, z: 9.6, withLight: true, intensity: 3.2 },
    { x: sideRailX, y: 1.6, z: 9.6, withLight: true, intensity: 3.2 },
  ];
  for (const lc of lanternCoords) {
    const lamp = createLantern('brass_lamp', {
      scale: 1.18,
      withLight: lc.withLight,
      lightIntensity: lc.intensity,
      lightDistance: 17.5,
      lightColor: 0xffcf7e,
      castShadow: false,
    });
    lamp.position.set(lc.x, lc.y, lc.z);
    root.add(lamp);
  }

  // -------------------------------------------------------------------------
  // Animation Update Loop for Arena Mechanics
  // -------------------------------------------------------------------------
  const update = (dt: number, elapsed: number, frenzyActive: boolean, plungerPull: number): void => {
    const speedMult = frenzyActive ? 2.45 : 1.0;

    // 1. Rotate meshed brass clockwork gears underneath glass
    for (const g of gears) {
      g.mesh.rotation.y += g.speed * speedMult * dt;
    }

    // 2. Rotate central astrolabe turntable ring & backbox armillary orrery
    astrolabeRing.rotation.y += (frenzyActive ? 1.55 : 0.42) * dt;
    orreryRing1.rotation.y = elapsed * (frenzyActive ? 1.6 : 0.48);
    orreryRing1.rotation.z = Math.sin(elapsed * 0.5) * 0.35;
    orreryRing2.rotation.x = elapsed * (frenzyActive ? -2.1 : -0.65);
    orrerySun.scale.setScalar(1 + Math.sin(elapsed * (frenzyActive ? 8 : 2.6)) * 0.08);

    // 3. Animate pop bumpers (recoil spring + amber filament flash)
    for (const b of bumpers) {
      if (b.recoil > 0) {
        b.recoil = Math.max(0, b.recoil - dt * 5.8);
      }
      if (b.flash > 0) {
        b.flash = Math.max(0, b.flash - dt * 3.6);
      }
      const pulse = Math.sin(b.recoil * Math.PI);
      const skirtScale = 1 + pulse * 0.24;
      b.skirt.scale.set(skirtScale, skirtScale, 1 + pulse * 0.32);
      b.skirt.position.y = 0.44 - pulse * 0.14;
      b.capGroup.position.y = 0.96 + pulse * 0.14;

      const baseGlow = frenzyActive ? 2.0 + Math.sin(elapsed * 9 + b.id) * 0.5 : 1.35;
      b.domeMat.emissiveIntensity = baseGlow + b.flash * 3.4;
      b.ringMat.emissiveIntensity = 0.45 + b.flash * 2.6;
    }

    // 4. Smoothly drop/raise Celestial Drop-Targets
    const dropAlpha = 1 - Math.exp(-16 * dt);
    for (const t of dropTargets) {
      const destY = (t.plate.userData.targetY as number) ?? 0;
      t.currentY += (destY - t.currentY) * dropAlpha;
      t.plate.position.y = t.currentY;
    }

    // 5. Animate lit Zodiac Lane light pillars
    for (const lane of zodiacLanes) {
      const targetOpacity = lane.lit ? 0.34 + Math.sin(elapsed * 6 + lane.id) * 0.1 : 0;
      lane.haloMat.opacity += (targetOpacity - lane.haloMat.opacity) * (1 - Math.exp(-10 * dt));
      lane.haloMesh.visible = lane.haloMat.opacity > 0.01;
      lane.haloMesh.rotation.y = elapsed * 1.4 + lane.id;
    }

    // 6. Animate slingshot elastic bands
    for (const s of slingshots) {
      if (s.flash > 0) {
        s.flash = Math.max(0, s.flash - dt * 5.2);
      }
      s.bandMat.emissiveIntensity = 0.75 + s.flash * 3.2;
      const vibrate = Math.sin(elapsed * 48) * s.flash * 0.12;
      s.bandMesh.scale.set(1 + vibrate, 1, 1);
    }

    // 7. Animate swirling Magnetic Nebula Vortices
    for (const v of vortices) {
      if (!v.group.visible) continue;
      v.outerRing.rotation.z = elapsed * (v.id === 0 ? 1.8 : -1.8);
      v.innerRing.rotation.z = elapsed * (v.id === 0 ? -3.2 : 3.2);
      v.innerRing.position.y = 0.22 + Math.sin(elapsed * 4.5 + v.id) * 0.08;
      v.coreMesh.scale.setScalar(0.95 + Math.sin(elapsed * 6.2) * 0.14);
      v.coreMesh.scale.y = 0.38;
    }

    // 8. Plunger spring head animation
    plungerHead.position.z = PLAYFIELD_MAX_Z - 0.15 + plungerPull * 0.65;

    // 9. Update potted bonsai foliage sway
    for (const tree of trees) {
      tree.update(elapsed);
    }
  };

  const dispose = () => {
    for (const tree of trees) tree.dispose();
  };

  return {
    root,
    bumpers,
    dropTargets,
    zodiacLanes,
    slingshots,
    vortices,
    flipperGroups: [flipperGroups[0], flipperGroups[1]],
    astrolabeRing,
    plungerHead,
    trees,
    update,
    dispose,
  };
}

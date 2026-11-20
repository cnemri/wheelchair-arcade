import * as THREE from 'three';
import {
  createDetailedTree,
  createFernCluster,
  createGrassField,
  createLantern,
  createMossyBoulder,
  createPBRMaterial,
  createWaterSurface,
  createWildflowerPatch,
  type DetailedTree,
  type GrassField,
  type WaterSurface,
  type WildflowerPatch,
} from '../../art';
import {
  CUBE_HALF,
  dirToVector,
  getGravityBasis,
  type ChamberSimState,
} from './physics';
import type { ChamberDef, GravityDir, RampDef } from './types';

interface GravityPadVisual {
  id: string;
  group: THREE.Group;
  ringMat: THREE.MeshStandardMaterial;
  arrowMesh: THREE.Mesh;
  activeBeam: THREE.Mesh;
  activeBeamMat: THREE.MeshBasicMaterial;
}

interface CubeVisual {
  id: string;
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshStandardMaterial;
  clampMeshes: THREE.Mesh[];
  clampMat: THREE.MeshStandardMaterial;
}

interface ConduitVisual {
  id: string;
  ringMat: THREE.MeshStandardMaterial;
  wireMats: THREE.MeshStandardMaterial[];
}

interface MirrorVisual {
  id: string;
  turntable: THREE.Group;
  crystalMat: THREE.MeshStandardMaterial;
  beaconRingMat: THREE.MeshBasicMaterial;
}

interface ReceiverVisual {
  id: string;
  petals: THREE.Group[];
  coreMat: THREE.MeshStandardMaterial;
  wireMats: THREE.MeshStandardMaterial[];
  haloLight: THREE.PointLight;
}

interface StarSeedVisual {
  id: string;
  group: THREE.Group;
  basePos: THREE.Vector3;
}

interface LaserBeamPoolItem {
  coreMesh: THREE.Mesh;
  haloMesh: THREE.Mesh;
  hitFlare: THREE.Mesh;
  beadMesh: THREE.Mesh;
}

export interface ChamberVisuals {
  root: THREE.Group;
  update: (
    dt: number,
    elapsed: number,
    sim: ChamberSimState,
    activePadId: string | null,
    nearMirrorId: string | null,
    playerWorldCenter: THREE.Vector3,
  ) => void;
  dispose: () => void;
}

function surfaceQuaternion(surface: GravityDir): THREE.Quaternion {
  const basis = getGravityBasis(surface);
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), basis.roll);
}

function buildRampGeometry(r: RampDef): THREE.BufferGeometry {
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const h0 = r.yAtMaxZ;
  const h1 = r.yAtMinZ;
  const base = Math.min(h0, h1) - 0.12;

  // Build triangular prism in local coordinates (origin at minX, 0, minZ)
  const shape = new THREE.Shape();
  // Shape in Z-Y plane then extruded along X
  shape.moveTo(0, base);
  shape.lineTo(d, base);
  shape.lineTo(d, h0);
  shape.lineTo(0, h1);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: w,
    bevelEnabled: false,
    steps: 1,
  });
  // ExtrudeGeometry puts shape in XY and extrudes along +Z.
  // Rotate so shape X (0..d) -> +Z, shape Y -> +Y, extrusion Z (0..w) -> +X!
  geo.rotateY(-Math.PI / 2);
  // After rotateY(-PI/2): old +X -> +Z, old +Y -> +Y, old +Z -> -X
  // Translate so X spans [minX, maxX], Z spans [minZ, maxZ]
  geo.translate(r.maxX, 0, r.minZ);
  geo.computeVertexNormals();
  return geo;
}

function createWireStrip(
  points: [number, number, number][],
  mat: THREE.MeshStandardMaterial,
  geos: THREE.BufferGeometry[],
): THREE.Group {
  const g = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < points.length - 1; i++) {
    const a = new THREE.Vector3(...points[i]);
    const b = new THREE.Vector3(...points[i + 1]);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 0.01) continue;
    const segGeo = new THREE.CylinderGeometry(0.055, 0.055, len, 6);
    geos.push(segGeo);
    const seg = new THREE.Mesh(segGeo, mat);
    seg.position.copy(a).add(b).multiplyScalar(0.5);
    seg.quaternion.setFromUnitVectors(up, dir.normalize());
    g.add(seg);
  }
  return g;
}

export function buildChamberVisuals(chamber: ChamberDef): ChamberVisuals {
  const root = new THREE.Group();
  root.name = `Chamber_${chamber.index}_${chamber.name}`;

  const ownedGeos: THREE.BufferGeometry[] = [];
  const ownedMats: THREE.Material[] = [];
  const trees: DetailedTree[] = [];
  const grasses: GrassField[] = [];
  const flowers: WildflowerPatch[] = [];
  const waters: WaterSurface[] = [];

  // Shared chamber PBR materials
  const marbleMat = createPBRMaterial('marbleTiles', {
    repeatX: 6,
    repeatY: 5,
    tint: '#edf3ef',
    seed: 10 + chamber.index,
  });
  marbleMat.roughness = 0.42;
  marbleMat.metalness = 0.06;

  const teakMat = createPBRMaterial('woodPlanks', {
    repeatX: 4,
    repeatY: 3,
    tint: '#cca070',
    seed: 20 + chamber.index,
  });
  teakMat.roughness = 0.56;

  const brassMat = createPBRMaterial('brushedBrass', {
    repeatX: 2,
    repeatY: 2,
    tint: '#e7c580',
    seed: 30 + chamber.index,
  });
  brassMat.metalness = 0.82;
  brassMat.roughness = 0.25;

  const wallPanelMat = createPBRMaterial('marbleTiles', {
    repeatX: 5,
    repeatY: 4,
    tint: '#e2ece9',
    seed: 40 + chamber.index,
  });
  wallPanelMat.roughness = 0.36;
  wallPanelMat.metalness = 0.12;

  const planterBoxMat = createPBRMaterial('sandstone', {
    repeatX: 3,
    repeatY: 2,
    tint: '#d9d3c3',
    seed: 50 + chamber.index,
  });
  planterBoxMat.roughness = 0.68;

  const glassCurbMat = new THREE.MeshPhysicalMaterial({
    color: 0x8ef2e0,
    transparent: true,
    opacity: 0.32,
    roughness: 0.12,
    metalness: 0.08,
    emissive: new THREE.Color('#1a7068'),
    emissiveIntensity: 0.25,
  });

  ownedMats.push(marbleMat, teakMat, brassMat, wallPanelMat, planterBoxMat, glassCurbMat);

  // =========================================================================
  // 1. ARCHITECTURAL BLOCKS & RAMPS
  // =========================================================================
  for (const b of chamber.blocks) {
    const sx = b.maxX - b.minX;
    const sy = b.maxY - b.minY;
    const sz = b.maxZ - b.minZ;
    const cx = (b.minX + b.maxX) * 0.5;
    const cy = (b.minY + b.maxY) * 0.5;
    const cz = (b.minZ + b.maxZ) * 0.5;

    const geo = new THREE.BoxGeometry(sx, sy, sz);
    ownedGeos.push(geo);

    const mat =
      b.style === 'teak'
        ? teakMat
        : b.style === 'brass'
          ? brassMat
          : b.style === 'glass_curb'
            ? glassCurbMat
            : b.style === 'wall_panel'
              ? wallPanelMat
              : b.style === 'planter_box'
                ? planterBoxMat
                : marbleMat;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = b.style !== 'glass_curb';
    mesh.receiveShadow = true;
    root.add(mesh);

    // Sleek Solarpunk brushed-brass architectural trim accent strips
    if (b.brassTrim) {
      if (b.style === 'wall_panel') {
        // Vertical glowing gravity guide rails along walkable walls!
        const innerX = cx > 0 ? b.minX - 0.025 : b.maxX + 0.025;
        const railGeo = new THREE.BoxGeometry(0.05, sy - 0.4, 0.14);
        ownedGeos.push(railGeo);
        for (const rz of [-4.8, -1.6, 1.6, 4.8]) {
          if (rz < b.minZ + 0.5 || rz > b.maxZ - 0.5) continue;
          const rail = new THREE.Mesh(railGeo, brassMat);
          rail.position.set(innerX, cy, rz);
          root.add(rail);
        }
        // Subtle cyan magnetic wall strip
        const glowStripGeo = new THREE.BoxGeometry(0.03, 0.08, sz - 0.6);
        const glowStripMat = new THREE.MeshStandardMaterial({
          color: 0x62f5e6,
          emissive: 0x35d6cc,
          emissiveIntensity: 0.75,
          roughness: 0.2,
        });
        ownedGeos.push(glowStripGeo);
        ownedMats.push(glowStripMat);
        for (const gy of [2.5, 6.2]) {
          if (gy > b.maxY - 0.5) continue;
          const strip = new THREE.Mesh(glowStripGeo, glowStripMat);
          strip.position.set(innerX, gy, cz);
          root.add(strip);
        }
      } else {
        // Horizontal brass cornice trim around top rim of floors/terraces/planters
        const trimH = 0.09;
        const topY = b.maxY - trimH * 0.4;
        const edgeXGeo = new THREE.BoxGeometry(sx + 0.06, trimH, 0.09);
        const edgeZGeo = new THREE.BoxGeometry(0.09, trimH, sz + 0.06);
        ownedGeos.push(edgeXGeo, edgeZGeo);

        const frontEdge = new THREE.Mesh(edgeXGeo, brassMat);
        frontEdge.position.set(cx, topY, b.maxZ);
        const backEdge = new THREE.Mesh(edgeXGeo, brassMat);
        backEdge.position.set(cx, topY, b.minZ);
        const leftEdge = new THREE.Mesh(edgeZGeo, brassMat);
        leftEdge.position.set(b.minX, topY, cz);
        const rightEdge = new THREE.Mesh(edgeZGeo, brassMat);
        rightEdge.position.set(b.maxX, topY, cz);
        root.add(frontEdge, backEdge, leftEdge, rightEdge);
      }
    }
  }

  // Build smooth Teak & Brass Ramps with subtle illuminated guide chevrons
  for (const r of chamber.ramps) {
    const rampGeo = buildRampGeometry(r);
    ownedGeos.push(rampGeo);
    const rampMesh = new THREE.Mesh(rampGeo, teakMat);
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    root.add(rampMesh);

    // Side brass curb rails along ramp slope
    const dz = r.maxZ - r.minZ;
    const dy = r.yAtMinZ - r.yAtMaxZ;
    const slopeLen = Math.hypot(dz, dy);
    const slopeAngle = Math.atan2(dy, dz);
    const railGeo = new THREE.BoxGeometry(0.14, 0.16, slopeLen);
    ownedGeos.push(railGeo);
    for (const rx of [r.minX + 0.07, r.maxX - 0.07]) {
      const rail = new THREE.Mesh(railGeo, brassMat);
      rail.position.set(rx, (r.yAtMaxZ + r.yAtMinZ) * 0.5 + 0.06, (r.minZ + r.maxZ) * 0.5);
      rail.rotation.x = slopeAngle;
      rail.castShadow = true;
      root.add(rail);
    }

    // Illuminated emerald-cyan directional strips up the center of the ramp
    const chevMat = new THREE.MeshStandardMaterial({
      color: 0x6efce2,
      emissive: 0x3ce8c6,
      emissiveIntensity: 0.9,
      roughness: 0.25,
    });
    ownedMats.push(chevMat);
    const chevGeo = new THREE.BoxGeometry(1.5, 0.03, 0.14);
    ownedGeos.push(chevGeo);
    for (let i = 0; i < 3; i++) {
      const t = (i + 0.5) / 3;
      const z = THREE.MathUtils.lerp(r.maxZ, r.minZ, t);
      const y = THREE.MathUtils.lerp(r.yAtMaxZ, r.yAtMinZ, t) + 0.03;
      const chev = new THREE.Mesh(chevGeo, chevMat);
      chev.position.set((r.minX + r.maxX) * 0.5, y, z);
      chev.rotation.x = slopeAngle;
      root.add(chev);
    }
  }

  // =========================================================================
  // 2. MAGNETIC GRAVITY-FLIP PADS (Cyan-Violet Chevron Tiles + 3D Target Arrow)
  // =========================================================================
  const padVisuals: GravityPadVisual[] = [];
  for (const pad of chamber.gravityPads) {
    const g = new THREE.Group();
    g.position.set(...pad.pos);
    g.quaternion.copy(surfaceQuaternion(pad.surface));

    const rad = pad.radius ?? 1.35;
    const baseGeo = new THREE.CylinderGeometry(rad, rad * 1.06, 0.1, 8);
    ownedGeos.push(baseGeo);
    const baseMesh = new THREE.Mesh(baseGeo, brassMat);
    baseMesh.position.y = 0.04;
    baseMesh.receiveShadow = true;
    g.add(baseMesh);

    const ringGeo = new THREE.TorusGeometry(rad * 0.78, 0.08, 10, 24);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x62f5ff,
      emissive: 0x38d8f5,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });
    ownedGeos.push(ringGeo);
    ownedMats.push(ringMat);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.1;
    g.add(ring);

    const discGeo = new THREE.CircleGeometry(rad * 0.74, 8);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x1a2846,
      emissive: 0x4b2ea8,
      emissiveIntensity: 0.75,
      roughness: 0.3,
      metalness: 0.4,
    });
    ownedGeos.push(discGeo);
    ownedMats.push(discMat);
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = 0.095;
    g.add(disc);

    // Floating holographic 3D target-gravity directional arrow!
    const arrowGeo = new THREE.ConeGeometry(0.28, 0.62, 6);
    const arrowMat = new THREE.MeshStandardMaterial({
      color: 0x8afcff,
      emissive: 0x45e8ff,
      emissiveIntensity: 1.65,
      transparent: true,
      opacity: 0.88,
      roughness: 0.15,
    });
    ownedGeos.push(arrowGeo);
    ownedMats.push(arrowMat);
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.position.y = 0.65;

    // Orient arrow in world space along targetGravity down vector, converted to pad local frame
    const targetDown = getGravityBasis(pad.targetGravity).down.clone();
    const invPadQuat = g.quaternion.clone().invert();
    const localTargetDir = targetDown.applyQuaternion(invPadQuat).normalize();
    arrowMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), localTargetDir);
    g.add(arrowMesh);

    // Translucent magnetic activation light cylinder
    const beamGeo = new THREE.CylinderGeometry(rad * 0.75, rad * 0.82, 1.8, 16, 1, true);
    const activeBeamMat = new THREE.MeshBasicMaterial({
      color: 0x62f7ff,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    ownedGeos.push(beamGeo);
    ownedMats.push(activeBeamMat);
    const activeBeam = new THREE.Mesh(beamGeo, activeBeamMat);
    activeBeam.position.y = 0.95;
    g.add(activeBeam);

    root.add(g);
    padVisuals.push({
      id: pad.id,
      group: g,
      ringMat,
      arrowMesh,
      activeBeam,
      activeBeamMat,
    });
  }

  // =========================================================================
  // 3. SOLAR ENERGY CUBES (Chamfered Brass Frame + Rotating Emerald Crystal)
  // =========================================================================
  const cubeVisuals: CubeVisual[] = [];
  const cubeSize = CUBE_HALF * 2;
  const cubeBodyGeo = new THREE.BoxGeometry(cubeSize * 0.88, cubeSize * 0.88, cubeSize * 0.88);
  const cubeEdgeGeo = new THREE.BoxGeometry(cubeSize * 1.02, 0.12, 0.12);
  const cubeCoreGeo = new THREE.OctahedronGeometry(0.36, 0);
  const clampGeo = new THREE.BoxGeometry(0.16, 0.34, 0.32);
  ownedGeos.push(cubeBodyGeo, cubeEdgeGeo, cubeCoreGeo, clampGeo);

  const cubeGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x164a42,
    transparent: true,
    opacity: 0.62,
    roughness: 0.16,
    metalness: 0.2,
    clearcoat: 0.8,
  });
  ownedMats.push(cubeGlassMat);

  for (const cDef of chamber.cubes) {
    const g = new THREE.Group();
    g.position.set(...cDef.startPos);

    const glassBody = new THREE.Mesh(cubeBodyGeo, cubeGlassMat);
    glassBody.castShadow = true;
    glassBody.receiveShadow = true;
    g.add(glassBody);

    // 12 gleaming brushed-brass architectural frame edges
    const h = cubeSize * 0.46;
    const edgeOffsets: [number, number, number, [number, number, number]][] = [
      [0, h, h, [0, 0, 0]],
      [0, h, -h, [0, 0, 0]],
      [0, -h, h, [0, 0, 0]],
      [0, -h, -h, [0, 0, 0]],
      [h, h, 0, [0, Math.PI / 2, 0]],
      [-h, h, 0, [0, Math.PI / 2, 0]],
      [h, -h, 0, [0, Math.PI / 2, 0]],
      [-h, -h, 0, [0, Math.PI / 2, 0]],
      [h, 0, h, [0, 0, Math.PI / 2]],
      [-h, 0, h, [0, 0, Math.PI / 2]],
      [h, 0, -h, [0, 0, Math.PI / 2]],
      [-h, 0, -h, [0, 0, Math.PI / 2]],
    ];
    for (const [ex, ey, ez, rot] of edgeOffsets) {
      const strut = new THREE.Mesh(cubeEdgeGeo, brassMat);
      strut.position.set(ex, ey, ez);
      strut.rotation.set(rot[0], rot[1], rot[2]);
      strut.castShadow = true;
      g.add(strut);
    }

    // Inner glowing faceted emerald-gold energy crystal
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x7effcf,
      emissive: 0x2de89c,
      emissiveIntensity: 1.35,
      roughness: 0.15,
      metalness: 0.1,
    });
    ownedMats.push(coreMat);
    const coreMesh = new THREE.Mesh(cubeCoreGeo, coreMat);
    g.add(coreMesh);

    // 4 animated magnetic lock clamps (expand & glow emerald when seated in a conduit!)
    const clampMat = new THREE.MeshStandardMaterial({
      color: 0x76ffcf,
      emissive: 0x32f0a8,
      emissiveIntensity: 0.0,
      roughness: 0.25,
      metalness: 0.7,
    });
    ownedMats.push(clampMat);
    const clampMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const cm = new THREE.Mesh(clampGeo, clampMat);
      cm.position.set(Math.cos(a) * 0.72, -0.42, Math.sin(a) * 0.72);
      cm.rotation.y = -a;
      cm.scale.setScalar(0.01);
      g.add(cm);
      clampMeshes.push(cm);
    }

    root.add(g);
    cubeVisuals.push({ id: cDef.id, group: g, coreMesh, coreMat, clampMeshes, clampMat });
  }

  // =========================================================================
  // 4. PRESSURE CONDUITS & INLAID ENERGY WIRES
  // =========================================================================
  const conduitVisuals: ConduitVisual[] = [];
  for (const cnd of chamber.conduits) {
    const g = new THREE.Group();
    g.position.set(...cnd.pos);
    g.quaternion.copy(surfaceQuaternion(cnd.surface));

    const frameGeo = new THREE.BoxGeometry(1.68, 0.12, 1.68);
    ownedGeos.push(frameGeo);
    const frame = new THREE.Mesh(frameGeo, brassMat);
    frame.position.y = 0.04;
    frame.receiveShadow = true;
    g.add(frame);

    const ringGeo = new THREE.RingGeometry(0.42, 0.7, 8);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xffc86b,
      emissive: 0xff9f38,
      emissiveIntensity: 1.25,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });
    ownedGeos.push(ringGeo);
    ownedMats.push(ringMat);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.11;
    g.add(ring);
    root.add(g);

    // Inlaid energy conduit wire path to Airlock
    const wireMat = new THREE.MeshStandardMaterial({
      color: 0xd9a85b,
      emissive: 0x9e6322,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      metalness: 0.65,
    });
    ownedMats.push(wireMat);
    if (cnd.wirePath.length >= 2) {
      root.add(createWireStrip(cnd.wirePath, wireMat, ownedGeos));
    }

    conduitVisuals.push({ id: cnd.id, ringMat, wireMats: [wireMat] });
  }

  // =========================================================================
  // 5. SOLAR EMITTERS, ROTATABLE PRISM MIRRORS, FIXED ELBOWS & RECEIVERS
  // =========================================================================
  // Solar Emitters
  const emitPedGeo = new THREE.CylinderGeometry(0.32, 0.44, 1.12, 8);
  const emitHeadGeo = new THREE.CylinderGeometry(0.24, 0.3, 0.52, 12);
  emitHeadGeo.rotateX(Math.PI / 2);
  const emitLensGeo = new THREE.SphereGeometry(0.18, 12, 10);
  const emitLensMat = new THREE.MeshStandardMaterial({
    color: 0xfff3b0,
    emissive: 0xffc83d,
    emissiveIntensity: 2.6,
    roughness: 0.1,
  });
  ownedGeos.push(emitPedGeo, emitHeadGeo, emitLensGeo);
  ownedMats.push(emitLensMat);

  for (const em of chamber.emitters) {
    const g = new THREE.Group();
    g.position.set(...em.mountPos);
    const ped = new THREE.Mesh(emitPedGeo, brassMat);
    ped.position.y = 0.56;
    ped.castShadow = true;
    g.add(ped);

    const head = new THREE.Group();
    head.position.set(em.origin[0] - em.mountPos[0], em.origin[1] - em.mountPos[1], em.origin[2] - em.mountPos[2]);
    const dirV = dirToVector(em.dir);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirV);
    const barrel = new THREE.Mesh(emitHeadGeo, brassMat);
    const lens = new THREE.Mesh(emitLensGeo, emitLensMat);
    lens.position.z = 0.24;
    head.add(barrel, lens);
    g.add(head);

    root.add(g);
  }

  // Rotatable Prism Mirrors
  const mirrorVisuals: MirrorVisual[] = [];
  const mirBaseGeo = new THREE.CylinderGeometry(0.46, 0.54, 0.26, 8);
  const mirStemGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.72, 8);
  const mirRingGeo = new THREE.TorusGeometry(0.44, 0.06, 8, 24);
  const mirCrystalGeo = new THREE.OctahedronGeometry(0.32, 0);
  const mirArrowGeo = new THREE.ConeGeometry(0.18, 0.48, 6);
  mirArrowGeo.rotateX(-Math.PI / 2); // Points along -Z local!
  const mirBeaconGeo = new THREE.RingGeometry(0.62, 0.76, 24);
  mirBeaconGeo.rotateX(-Math.PI / 2);
  ownedGeos.push(mirBaseGeo, mirStemGeo, mirRingGeo, mirCrystalGeo, mirArrowGeo, mirBeaconGeo);

  for (const mir of chamber.mirrors) {
    const g = new THREE.Group();
    g.position.set(...mir.basePos);
    g.quaternion.copy(surfaceQuaternion(mir.surface));

    const base = new THREE.Mesh(mirBaseGeo, brassMat);
    base.position.y = 0.13;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    const stem = new THREE.Mesh(mirStemGeo, brassMat);
    stem.position.y = 0.62;
    stem.castShadow = true;
    g.add(stem);

    // Interactive highlight ring on the floor/wall around the pedestal
    const beaconRingMat = new THREE.MeshBasicMaterial({
      color: 0xffe07d,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    });
    ownedMats.push(beaconRingMat);
    const beaconRing = new THREE.Mesh(mirBeaconGeo, beaconRingMat);
    beaconRing.position.y = 0.04;
    g.add(beaconRing);

    // Turntable group rotating around local +Y (surface normal), aiming along local -Z!
    const turntable = new THREE.Group();
    turntable.position.y = 1.15;

    const frameRing = new THREE.Mesh(mirRingGeo, brassMat);
    turntable.add(frameRing);

    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0xdcf7ff,
      emissive: 0xffe073,
      emissiveIntensity: 0.45,
      roughness: 0.08,
      metalness: 0.22,
    });
    ownedMats.push(crystalMat);
    const crystal = new THREE.Mesh(mirCrystalGeo, crystalMat);
    turntable.add(crystal);

    // Prominent golden aiming nozzle cone pointing along -Z so players immediately see aim direction!
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0xffe488,
      emissive: 0xffb830,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.6,
    });
    ownedMats.push(nozzleMat);
    const arrow = new THREE.Mesh(mirArrowGeo, nozzleMat);
    arrow.position.set(0, 0, -0.56);
    turntable.add(arrow);

    g.add(turntable);
    root.add(g);
    mirrorVisuals.push({ id: mir.id, turntable, crystalMat, beaconRingMat });
  }

  // Fixed Brass Sky-Elbows
  const elbowCoreGeo = new THREE.OctahedronGeometry(0.36, 0);
  const elbowFrameGeo = new THREE.TorusGeometry(0.46, 0.075, 10, 20);
  const elbowStrutGeo = new THREE.CylinderGeometry(0.09, 0.12, 1.2, 8);
  const elbowMat = new THREE.MeshStandardMaterial({
    color: 0xfff0b3,
    emissive: 0xffbe3b,
    emissiveIntensity: 1.15,
    roughness: 0.12,
    metalness: 0.25,
  });
  ownedGeos.push(elbowCoreGeo, elbowFrameGeo, elbowStrutGeo);
  ownedMats.push(elbowMat);

  for (const el of chamber.elbows) {
    const g = new THREE.Group();
    g.position.set(...el.pos);

    const core = new THREE.Mesh(elbowCoreGeo, elbowMat);
    const ringA = new THREE.Mesh(elbowFrameGeo, brassMat);
    const ringB = new THREE.Mesh(elbowFrameGeo, brassMat);
    ringB.rotation.y = Math.PI / 2;
    g.add(core, ringA, ringB);

    if (el.wallAttachDir) {
      const attachDir = dirToVector(el.wallAttachDir);
      const strut = new THREE.Mesh(elbowStrutGeo, brassMat);
      strut.position.copy(attachDir).multiplyScalar(0.58);
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), attachDir);
      g.add(strut);
    }
    root.add(g);
  }

  // Photosynthesis Receivers (Animated Blooming Glass Lotus!)
  const receiverVisuals: ReceiverVisual[] = [];
  const recvBaseGeo = new THREE.CylinderGeometry(0.44, 0.58, 0.85, 8);
  const recvCoreGeo = new THREE.SphereGeometry(0.32, 16, 12);
  const petalGeo = new THREE.ConeGeometry(0.24, 0.72, 5);
  petalGeo.translate(0, 0.36, 0);
  ownedGeos.push(recvBaseGeo, recvCoreGeo, petalGeo);

  for (const recv of chamber.receivers) {
    const g = new THREE.Group();
    g.position.set(...recv.basePos);
    g.quaternion.copy(surfaceQuaternion(recv.surface));

    const ped = new THREE.Mesh(recvBaseGeo, brassMat);
    ped.position.y = 0.425;
    ped.castShadow = true;
    g.add(ped);

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xa6ffdb,
      emissive: 0x38e89e,
      emissiveIntensity: 0.35,
      roughness: 0.14,
      metalness: 0.15,
    });
    ownedMats.push(coreMat);
    const core = new THREE.Mesh(recvCoreGeo, coreMat);
    core.position.y = 1.15;
    g.add(core);

    // 6 hinged lotus glass petals blooming outward as bloomBlend -> 1
    const petalMat = new THREE.MeshPhysicalMaterial({
      color: 0x9ef7d4,
      emissive: 0x1ea36e,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.82,
      roughness: 0.18,
      metalness: 0.1,
    });
    ownedMats.push(petalMat);

    const petals: THREE.Group[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * 0.24, 0.88, Math.sin(a) * 0.24);
      pivot.rotation.y = -a;
      const pMesh = new THREE.Mesh(petalGeo, petalMat);
      pMesh.rotation.z = -0.22;
      pivot.add(pMesh);
      g.add(pivot);
      petals.push(pivot);
    }

    const haloLight = new THREE.PointLight(0x52ffbe, 0.35, 9, 1.5);
    haloLight.position.y = 1.35;
    g.add(haloLight);

    root.add(g);

    const wireMat = new THREE.MeshStandardMaterial({
      color: 0xd9a85b,
      emissive: 0x9e6322,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      metalness: 0.65,
    });
    ownedMats.push(wireMat);
    if (recv.wirePath.length >= 2) {
      root.add(createWireStrip(recv.wirePath, wireMat, ownedGeos));
    }

    receiverVisuals.push({ id: recv.id, petals, coreMat, wireMats: [wireMat], haloLight });
  }

  // =========================================================================
  // 6. POOLED LIVE SOLAR LASER BEAM SEGMENTS (Core + Halo + Hit Flare + Photon Bead)
  // =========================================================================
  const laserPool: LaserBeamPoolItem[] = [];
  const laserCoreGeo = new THREE.CylinderGeometry(0.055, 0.055, 1, 8);
  const laserHaloGeo = new THREE.CylinderGeometry(0.16, 0.16, 1, 8);
  const laserFlareGeo = new THREE.SphereGeometry(0.24, 10, 8);
  const laserBeadGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const laserCoreMat = new THREE.MeshBasicMaterial({ color: 0xfffce0 });
  const laserHaloMat = new THREE.MeshBasicMaterial({
    color: 0xffd24c,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const laserFlareMat = new THREE.MeshBasicMaterial({
    color: 0xffe885,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  ownedGeos.push(laserCoreGeo, laserHaloGeo, laserFlareGeo, laserBeadGeo);
  ownedMats.push(laserCoreMat, laserHaloMat, laserFlareMat);

  for (let i = 0; i < 10; i++) {
    const coreMesh = new THREE.Mesh(laserCoreGeo, laserCoreMat);
    const haloMesh = new THREE.Mesh(laserHaloGeo, laserHaloMat);
    const hitFlare = new THREE.Mesh(laserFlareGeo, laserFlareMat);
    const beadMesh = new THREE.Mesh(laserBeadGeo, laserCoreMat);
    coreMesh.visible = false;
    haloMesh.visible = false;
    hitFlare.visible = false;
    beadMesh.visible = false;
    root.add(coreMesh, haloMesh, hitFlare, beadMesh);
    laserPool.push({ coreMesh, haloMesh, hitFlare, beadMesh });
  }

  // =========================================================================
  // 7. ORBITAL AIRLOCK EXIT PORTAL (Retracting 6-Blade Brass Iris + Status Gems)
  // =========================================================================
  const airlockGroup = new THREE.Group();
  airlockGroup.position.set(...chamber.airlockPos);
  root.add(airlockGroup);

  const portalRadius = 1.85;
  const portalCenterY = 1.9;
  const archOuterGeo = new THREE.TorusGeometry(portalRadius, 0.24, 12, 36);
  const archInnerGeo = new THREE.TorusGeometry(portalRadius - 0.28, 0.08, 8, 36);
  const portalBaseGeo = new THREE.BoxGeometry(4.2, 0.18, 1.1);
  ownedGeos.push(archOuterGeo, archInnerGeo, portalBaseGeo);

  const archOuter = new THREE.Mesh(archOuterGeo, brassMat);
  archOuter.position.y = portalCenterY;
  archOuter.castShadow = true;
  airlockGroup.add(archOuter);

  const archGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffc96b,
    emissive: 0xd98a2b,
    emissiveIntensity: 1.0,
    roughness: 0.2,
  });
  ownedMats.push(archGlowMat);
  const archInner = new THREE.Mesh(archInnerGeo, archGlowMat);
  archInner.position.y = portalCenterY;
  airlockGroup.add(archInner);

  const portalThreshold = new THREE.Mesh(portalBaseGeo, brassMat);
  portalThreshold.position.y = 0.06;
  portalThreshold.receiveShadow = true;
  airlockGroup.add(portalThreshold);

  // 6 retractable brass iris blades
  const irisBlades: THREE.Mesh[] = [];
  const bladeGeo = new THREE.CircleGeometry(0.96, 5);
  const bladeMat = createPBRMaterial('brushedBrass', { repeatX: 1, repeatY: 1, tint: '#caa867' });
  bladeMat.metalness = 0.78;
  bladeMat.roughness = 0.32;
  bladeMat.side = THREE.DoubleSide;
  ownedGeos.push(bladeGeo);
  ownedMats.push(bladeMat);

  const irisCenter = new THREE.Group();
  irisCenter.position.set(0, portalCenterY, 0.02);
  airlockGroup.add(irisCenter);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(Math.cos(a) * 0.66, Math.sin(a) * 0.66, i * 0.006);
    blade.rotation.z = a;
    irisCenter.add(blade);
    irisBlades.push(blade);
  }

  // Swirling emerald-cyan warp portal membrane (visible when unsealed!)
  const warpDiscGeo = new THREE.CircleGeometry(portalRadius - 0.24, 32);
  const warpDiscMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpen: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpen;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float ang = atan(p.y, p.x);
        float swirl = sin(r * 10.0 - uTime * 3.8 + ang * 3.0) * 0.5 + 0.5;
        float ring = smoothstep(0.98, 0.72, r);
        vec3 col = mix(vec3(0.14, 0.85, 0.68), vec3(0.68, 1.0, 0.88), swirl * 0.7 + (1.0 - r) * 0.45);
        float alpha = ring * uOpen * (0.55 + 0.35 * swirl);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  ownedGeos.push(warpDiscGeo);
  ownedMats.push(warpDiscMat);
  const warpDisc = new THREE.Mesh(warpDiscGeo, warpDiscMat);
  warpDisc.position.set(0, portalCenterY, -0.04);
  airlockGroup.add(warpDisc);

  // Airlock Status Pips (1 per conduit + receiver)
  const totalTargets = chamber.conduits.length + chamber.receivers.length;
  const pipMats: THREE.MeshStandardMaterial[] = [];
  const pipGeo = new THREE.SphereGeometry(0.16, 12, 10);
  ownedGeos.push(pipGeo);
  for (let i = 0; i < totalTargets; i++) {
    const frac = totalTargets === 1 ? 0.5 : i / (totalTargets - 1);
    const ang = THREE.MathUtils.lerp(Math.PI * 0.72, Math.PI * 0.28, frac);
    const pm = new THREE.MeshStandardMaterial({
      color: 0xffbb55,
      emissive: 0xe68422,
      emissiveIntensity: 1.0,
      roughness: 0.2,
    });
    ownedMats.push(pm);
    const pip = new THREE.Mesh(pipGeo, pm);
    pip.position.set(Math.cos(ang) * (portalRadius + 0.34), portalCenterY + Math.sin(ang) * (portalRadius + 0.34), 0.14);
    airlockGroup.add(pip);
    pipMats.push(pm);
  }

  const airlockLight = new THREE.PointLight(0x4effc2, 0.4, 12, 1.4);
  airlockLight.position.set(0, portalCenterY, 1.2);
  airlockGroup.add(airlockLight);

  // =========================================================================
  // 8. CHAMBER 5 GRAND CENTERPIECE: THE ORBITAL WORLD-TREE!
  // =========================================================================
  let worldTreeGroup: THREE.Group | null = null;
  let worldTreeRingA: THREE.Mesh | null = null;
  let worldTreeRingB: THREE.Mesh | null = null;
  let worldTreeGlowMat: THREE.MeshStandardMaterial | null = null;
  let worldTreeLight: THREE.PointLight | null = null;

  if (chamber.hasWorldTree) {
    worldTreeGroup = new THREE.Group();
    worldTreeGroup.position.set(0, 6.0, -0.6);
    root.add(worldTreeGroup);

    const crownSakura = createDetailedTree({
      style: 'sakura',
      height: 5.0,
      seed: 555,
      canopyDensity: 1.15,
      castShadow: true,
      receiveShadow: true,
    });
    crownSakura.group.position.set(0, -0.1, -0.25);
    worldTreeGroup.add(crownSakura.group);
    trees.push(crownSakura);

    const crownOlive = createDetailedTree({
      style: 'olive',
      height: 4.1,
      seed: 777,
      canopyDensity: 1.0,
      castShadow: true,
      receiveShadow: true,
    });
    crownOlive.group.position.set(0.15, -0.1, 0.2);
    crownOlive.group.rotation.y = 1.4;
    worldTreeGroup.add(crownOlive.group);
    trees.push(crownOlive);

    // Sculpted orbiting brass astrolabe rings encircling the World-Tree crown!
    const wtRingGeoA = new THREE.TorusGeometry(3.2, 0.08, 10, 48);
    const wtRingGeoB = new THREE.TorusGeometry(3.7, 0.06, 10, 48);
    worldTreeGlowMat = new THREE.MeshStandardMaterial({
      color: 0xffdf80,
      emissive: 0x35e09e,
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.22,
    });
    ownedGeos.push(wtRingGeoA, wtRingGeoB);
    ownedMats.push(worldTreeGlowMat);

    worldTreeRingA = new THREE.Mesh(wtRingGeoA, worldTreeGlowMat);
    worldTreeRingA.position.y = 2.6;
    worldTreeRingA.rotation.x = 1.1;
    worldTreeGroup.add(worldTreeRingA);

    worldTreeRingB = new THREE.Mesh(wtRingGeoB, brassMat);
    worldTreeRingB.position.y = 2.6;
    worldTreeRingB.rotation.x = 0.7;
    worldTreeRingB.rotation.y = 0.8;
    worldTreeGroup.add(worldTreeRingB);

    worldTreeLight = new THREE.PointLight(0x6effc8, 0.8, 18, 1.3);
    worldTreeLight.position.set(0, 2.8, 0);
    worldTreeGroup.add(worldTreeLight);
  }

  // =========================================================================
  // 9. LUSH SOLARPUNK HYDROPONIC WATER CHANNELS, GRASS, WILDFLOWERS & TREES
  // =========================================================================
  for (let i = 0; i < chamber.hydroBeds.length; i++) {
    const bed = chamber.hydroBeds[i];
    const bw = bed.maxX - bed.minX;
    const bd = bed.maxZ - bed.minZ;
    const cx = (bed.minX + bed.maxX) * 0.5;
    const cz = (bed.minZ + bed.maxZ) * 0.5;

    if (bed.hasWater) {
      const water = createWaterSurface({
        width: bw,
        depth: bd,
        shape: 'plane',
        segments: 16,
        deepColor: '#0f5c6b',
        shallowColor: '#56ebd0',
        skyColor: '#8cd8ff',
        foamColor: '#d9fff6',
        waveSpeed: 0.85,
        waveScale: 2.2,
        waveHeight: 0.014,
        edgeFoamWidth: 0.16,
        opacity: 0.84,
      });
      water.mesh.position.set(cx, bed.y, cz);
      root.add(water.mesh);
      waters.push(water);

      // Subtle brass channel frame around hydroponic water bed
      const rimXGeo = new THREE.BoxGeometry(bw + 0.12, 0.06, 0.08);
      const rimZGeo = new THREE.BoxGeometry(0.08, 0.06, bd + 0.12);
      ownedGeos.push(rimXGeo, rimZGeo);
      const r1 = new THREE.Mesh(rimXGeo, brassMat);
      r1.position.set(cx, bed.y + 0.01, bed.minZ);
      const r2 = new THREE.Mesh(rimXGeo, brassMat);
      r2.position.set(cx, bed.y + 0.01, bed.maxZ);
      const r3 = new THREE.Mesh(rimZGeo, brassMat);
      r3.position.set(bed.minX, bed.y + 0.01, cz);
      const r4 = new THREE.Mesh(rimZGeo, brassMat);
      r4.position.set(bed.maxX, bed.y + 0.01, cz);
      root.add(r1, r2, r3, r4);
    }

    if (bed.hasGrass) {
      const areaSize = bw * bd;
      const tuftCount = Math.min(1800, Math.max(260, Math.round(areaSize * 65)));
      const grass = createGrassField({
        area: { minX: bed.minX, maxX: bed.maxX, minZ: bed.minZ, maxZ: bed.maxZ },
        count: tuftCount,
        heightAt: () => bed.y,
        bladeHeightRange: [0.18, 0.42],
        bladeWidth: 0.055,
        baseColor: '#1f5c3a',
        tipColor: '#7be088',
        dryColor: '#c9d67c',
        windStrength: 0.42,
        pushRadius: 1.0,
        pushStrength: 0.55,
        seed: 700 + chamber.index * 50 + i,
      });
      root.add(grass.mesh);
      grasses.push(grass);
    }

    if (bed.hasFlowers) {
      const wf = createWildflowerPatch({
        area: { minX: bed.minX + 0.15, maxX: bed.maxX - 0.15, minZ: bed.minZ + 0.15, maxZ: bed.maxZ - 0.15 },
        count: Math.min(95, Math.max(24, Math.round(bw * bd * 4.5))),
        heightAt: () => bed.y,
        palette: ['#ffe27a', '#fff6dc', '#ff9db8', '#73f5dc'],
        scaleRange: [0.65, 1.15],
        seed: 900 + chamber.index * 50 + i,
      });
      root.add(wf.group);
      flowers.push(wf);
    }
  }

  for (const bot of chamber.botanicals) {
    const scale = bot.scale ?? 1.0;
    const seed = bot.seed ?? 42;
    if (bot.kind === 'bonsai' || bot.kind === 'sakura' || bot.kind === 'olive') {
      const tree = createDetailedTree({
        style: bot.kind,
        height: bot.kind === 'bonsai' ? 2.15 * scale : 3.7 * scale,
        seed,
        canopyDensity: 0.95,
        includePot: bot.kind === 'bonsai',
        bonsaiVariant: bot.bonsaiVariant ?? 'emerald',
        castShadow: true,
        receiveShadow: true,
      });
      tree.group.position.set(...bot.pos);
      if (bot.rotY) tree.group.rotation.y = bot.rotY;
      root.add(tree.group);
      trees.push(tree);
    } else if (bot.kind === 'fern') {
      const fern = createFernCluster({
        frondCount: 10,
        radius: 0.72 * scale,
        height: 0.56 * scale,
        color: '#349956',
        seed,
        castShadow: true,
      });
      fern.position.set(...bot.pos);
      root.add(fern);
    } else if (bot.kind === 'boulder') {
      const boulder = createMossyBoulder({
        radius: 0.72 * scale,
        mossAmount: 0.62,
        stoneTint: '#8a9496',
        mossColor: '#489e5a',
        includeAccentStones: true,
        seed,
        castShadow: true,
      });
      boulder.position.set(...bot.pos);
      root.add(boulder);
    } else if (bot.kind === 'lantern') {
      const lamp = createLantern('brass_lamp', {
        scale,
        withLight: false,
        castShadow: true,
      });
      lamp.position.set(...bot.pos);
      root.add(lamp);
    }
  }

  // =========================================================================
  // 10. OPTIONAL FLOATING STAR-SEED COLLECTIBLES & TRACTOR-TOW BEAM
  // =========================================================================
  const starSeedVisuals: StarSeedVisual[] = [];
  const seedCoreGeo = new THREE.OctahedronGeometry(0.28, 0);
  const seedRingGeo = new THREE.TorusGeometry(0.42, 0.032, 8, 24);
  const seedCoreMat = new THREE.MeshStandardMaterial({
    color: 0xfff0a8,
    emissive: 0xffcc44,
    emissiveIntensity: 1.8,
    roughness: 0.12,
    metalness: 0.35,
  });
  const seedRingMat = new THREE.MeshStandardMaterial({
    color: 0x73fff0,
    emissive: 0x3ef0db,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  ownedGeos.push(seedCoreGeo, seedRingGeo);
  ownedMats.push(seedCoreMat, seedRingMat);

  for (const sDef of chamber.starSeeds) {
    const sg = new THREE.Group();
    sg.position.set(...sDef.pos);
    const core = new THREE.Mesh(seedCoreGeo, seedCoreMat);
    const halo = new THREE.Mesh(seedRingGeo, seedRingMat);
    sg.add(core, halo);
    root.add(sg);
    starSeedVisuals.push({ id: sDef.id, group: sg, basePos: new THREE.Vector3(...sDef.pos) });
  }

  // Magnetic Tractor-Tow Beam connecting Wheelchair to towed Solar Cube
  const tractorGeo = new THREE.CylinderGeometry(0.08, 0.14, 1, 10, 1, true);
  const tractorMat = new THREE.MeshBasicMaterial({
    color: 0x52ffcf,
    transparent: true,
    opacity: 0.68,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  ownedGeos.push(tractorGeo);
  ownedMats.push(tractorMat);
  const tractorMesh = new THREE.Mesh(tractorGeo, tractorMat);
  tractorMesh.visible = false;
  root.add(tractorMesh);

  // Reusable scratch vectors for zero GC
  const tmpUp = new THREE.Vector3(0, 1, 0);
  const tmpDir = new THREE.Vector3();
  const tmpMid = new THREE.Vector3();
  const amberColor = new THREE.Color('#ffaa40');
  const emeraldColor = new THREE.Color('#34f5aa');
  const amberEmissive = new THREE.Color('#a85b18');
  const emeraldEmissive = new THREE.Color('#22e098');

  const update = (
    dt: number,
    elapsed: number,
    sim: ChamberSimState,
    activePadId: string | null,
    nearMirrorId: string | null,
    playerWorldCenter: THREE.Vector3,
  ) => {
    void dt;

    // 1. Update Gravity Pads
    for (const pv of padVisuals) {
      const isActive = pv.id === activePadId;
      pv.ringMat.emissiveIntensity = isActive ? 2.8 + Math.sin(elapsed * 8) * 0.4 : 1.3 + Math.sin(elapsed * 3) * 0.25;
      pv.arrowMesh.position.y = 0.65 + Math.sin(elapsed * 3.4) * 0.11;
      pv.activeBeamMat.opacity = isActive ? 0.26 + Math.sin(elapsed * 6) * 0.06 : 0.05;
    }

    // 2. Update Solar Energy Cubes & Magnetic Lock Clamps
    for (let i = 0; i < cubeVisuals.length; i++) {
      const cv = cubeVisuals[i];
      const runtime = sim.cubes[i];
      if (!runtime) continue;
      cv.group.position.copy(runtime.pos);
      cv.coreMesh.rotation.y = elapsed * (runtime.lockedConduitId ? 2.4 : 0.95) + i;
      cv.coreMesh.rotation.x = Math.sin(elapsed * 1.4 + i) * 0.35;
      cv.coreMat.emissiveIntensity = runtime.glowIntensity + Math.sin(elapsed * 4.0) * 0.18;

      const lb = runtime.lockBlend;
      cv.clampMat.emissiveIntensity = lb * 1.8;
      for (let k = 0; k < cv.clampMeshes.length; k++) {
        const cm = cv.clampMeshes[k];
        cm.visible = lb > 0.03;
        cm.scale.setScalar(0.15 + lb * 0.85);
      }
    }

    // 3. Update Conduits & Inlaid Energy Wires
    for (let i = 0; i < conduitVisuals.length; i++) {
      const cv = conduitVisuals[i];
      const runtime = sim.conduits[i];
      if (!runtime) continue;
      const b = runtime.powerBlend;
      cv.ringMat.color.lerpColors(amberColor, emeraldColor, b);
      cv.ringMat.emissive.lerpColors(amberEmissive, emeraldEmissive, b);
      cv.ringMat.emissiveIntensity = 1.0 + b * 1.4 + Math.sin(elapsed * 4.5) * 0.15;
      for (const wm of cv.wireMats) {
        wm.color.lerpColors(amberColor, emeraldColor, b);
        wm.emissive.lerpColors(amberEmissive, emeraldEmissive, b);
        wm.emissiveIntensity = 0.45 + b * 1.65;
      }
    }

    // 4. Update Prism Mirrors
    for (let i = 0; i < mirrorVisuals.length; i++) {
      const mv = mirrorVisuals[i];
      const runtime = sim.mirrors[i];
      if (!runtime) continue;
      mv.turntable.rotation.y = runtime.currentAngle;
      mv.crystalMat.emissiveIntensity = runtime.energized ? 2.3 + Math.sin(elapsed * 7) * 0.3 : 0.45;
      const isNear = mv.id === nearMirrorId;
      mv.beaconRingMat.opacity = isNear ? 0.82 : runtime.energized ? 0.45 : 0.2;
      mv.beaconRingMat.color.setHex(isNear ? 0x73ffda : 0xffe07d);
    }

    // 5. Update Photosynthesis Receivers (Blooming Glass Lotus!)
    for (let i = 0; i < receiverVisuals.length; i++) {
      const rv = receiverVisuals[i];
      const runtime = sim.receivers[i];
      if (!runtime) continue;
      const b = runtime.bloomBlend;
      rv.coreMat.emissiveIntensity = 0.35 + b * 2.45 + Math.sin(elapsed * 5.0) * 0.15 * b;
      rv.haloLight.intensity = 0.35 + b * 2.6;
      for (let p = 0; p < rv.petals.length; p++) {
        const pivot = rv.petals[p];
        const openAngle = THREE.MathUtils.lerp(0.18, 1.08, b) + Math.sin(elapsed * 2.2 + p) * 0.04 * b;
        pivot.children[0].rotation.z = -openAngle;
      }
      for (const wm of rv.wireMats) {
        wm.color.lerpColors(amberColor, emeraldColor, b);
        wm.emissive.lerpColors(amberEmissive, emeraldEmissive, b);
        wm.emissiveIntensity = 0.45 + b * 1.65;
      }
    }

    // 6. Update Live Pooled Solar Laser Beams
    for (let i = 0; i < laserPool.length; i++) {
      const item = laserPool[i];
      const seg = sim.lasers[i];
      if (!seg) {
        item.coreMesh.visible = false;
        item.haloMesh.visible = false;
        item.hitFlare.visible = false;
        item.beadMesh.visible = false;
        continue;
      }
      tmpDir.copy(seg.end).sub(seg.start);
      const len = tmpDir.length();
      if (len < 0.02) {
        item.coreMesh.visible = false;
        item.haloMesh.visible = false;
        item.hitFlare.visible = false;
        item.beadMesh.visible = false;
        continue;
      }
      tmpMid.copy(seg.start).add(seg.end).multiplyScalar(0.5);
      tmpDir.divideScalar(len);

      item.coreMesh.visible = true;
      item.coreMesh.position.copy(tmpMid);
      item.coreMesh.scale.set(1, len, 1);
      item.coreMesh.quaternion.setFromUnitVectors(tmpUp, tmpDir);

      item.haloMesh.visible = true;
      item.haloMesh.position.copy(tmpMid);
      const pulse = 0.92 + Math.sin(elapsed * 12 + i) * 0.14;
      item.haloMesh.scale.set(pulse, len, pulse);
      item.haloMesh.quaternion.copy(item.coreMesh.quaternion);

      item.hitFlare.visible = seg.hitKind !== 'void';
      item.hitFlare.position.copy(seg.end);
      item.hitFlare.scale.setScalar(0.85 + Math.sin(elapsed * 14 + i) * 0.2);

      // Animated traveling solar photon bead along beam
      const beadT = (elapsed * 1.35 + i * 0.31) % 1;
      item.beadMesh.visible = true;
      item.beadMesh.position.lerpVectors(seg.start, seg.end, beadT);
    }

    // 7. Update Orbital Airlock Iris & Status Pips
    const open = sim.airlockOpenBlend;
    archGlowMat.color.lerpColors(amberColor, emeraldColor, open);
    archGlowMat.emissive.lerpColors(amberEmissive, emeraldEmissive, open);
    archGlowMat.emissiveIntensity = 1.0 + open * 1.6;
    airlockLight.intensity = 0.4 + open * 3.0;
    warpDiscMat.uniforms.uTime.value = elapsed;
    warpDiscMat.uniforms.uOpen.value = open;
    warpDisc.visible = open > 0.04;

    irisCenter.rotation.z = open * 0.95;
    for (let i = 0; i < irisBlades.length; i++) {
      const a = (i / 6) * Math.PI * 2;
      const dist = 0.66 + open * 1.08;
      irisBlades[i].position.set(Math.cos(a) * dist, Math.sin(a) * dist, i * 0.006);
      irisBlades[i].scale.setScalar(Math.max(0.01, 1 - open * 0.72));
    }

    // Status pips reflect each conduit + receiver
    let pipIdx = 0;
    for (const c of sim.conduits) {
      if (pipIdx < pipMats.length) {
        const m = pipMats[pipIdx++];
        m.color.lerpColors(amberColor, emeraldColor, c.powerBlend);
        m.emissive.lerpColors(amberEmissive, emeraldEmissive, c.powerBlend);
        m.emissiveIntensity = 0.9 + c.powerBlend * 1.8;
      }
    }
    for (const r of sim.receivers) {
      if (pipIdx < pipMats.length) {
        const m = pipMats[pipIdx++];
        m.color.lerpColors(amberColor, emeraldColor, r.bloomBlend);
        m.emissive.lerpColors(amberEmissive, emeraldEmissive, r.bloomBlend);
        m.emissiveIntensity = 0.9 + r.bloomBlend * 1.8;
      }
    }

    // 8. Update Chamber 5 Grand World-Tree Aura
    if (worldTreeGroup && worldTreeRingA && worldTreeRingB && worldTreeGlowMat && worldTreeLight) {
      let poweredFrac = 0;
      const total = Math.max(1, sim.conduits.length + sim.receivers.length);
      for (const c of sim.conduits) poweredFrac += c.powerBlend / total;
      for (const r of sim.receivers) poweredFrac += r.bloomBlend / total;

      worldTreeRingA.rotation.z = elapsed * (0.35 + poweredFrac * 0.85);
      worldTreeRingB.rotation.z = -elapsed * (0.28 + poweredFrac * 0.65);
      worldTreeGlowMat.emissiveIntensity = 0.45 + poweredFrac * 2.2 + Math.sin(elapsed * 3.5) * 0.2;
      worldTreeLight.intensity = 0.8 + poweredFrac * 3.8;
    }

    // 9. Update Floating Star-Seeds
    for (let i = 0; i < starSeedVisuals.length; i++) {
      const sv = starSeedVisuals[i];
      const runtime = sim.starSeeds[i];
      if (!runtime || runtime.collected) {
        sv.group.visible = false;
        continue;
      }
      sv.group.visible = true;
      sv.group.position.set(
        sv.basePos.x,
        sv.basePos.y + Math.sin(elapsed * 2.6 + i * 1.7) * 0.16,
        sv.basePos.z,
      );
      sv.group.rotation.y = elapsed * 1.6 + i;
      sv.group.children[1].rotation.x = elapsed * 2.1;
    }

    // 10. Update Tractor-Tow Beam Visual
    if (sim.player.towingCubeId) {
      const towed = sim.cubes.find((c) => c.def.id === sim.player.towingCubeId);
      if (towed) {
        tmpDir.copy(towed.pos).sub(playerWorldCenter);
        const dist = tmpDir.length();
        if (dist > 0.1) {
          tractorMesh.visible = true;
          tractorMesh.position.copy(playerWorldCenter).add(towed.pos).multiplyScalar(0.5);
          tractorMesh.scale.set(1 + Math.sin(elapsed * 18) * 0.15, dist, 1 + Math.sin(elapsed * 18) * 0.15);
          tractorMesh.quaternion.setFromUnitVectors(tmpUp, tmpDir.divideScalar(dist));
        } else {
          tractorMesh.visible = false;
        }
      } else {
        tractorMesh.visible = false;
      }
    } else {
      tractorMesh.visible = false;
    }

    // 11. Advance Living Foliage & Hydroponic Water Shaders
    for (const w of waters) w.update(elapsed);
    for (const g of grasses) g.update(elapsed, playerWorldCenter);
    for (const f of flowers) f.update(elapsed);
    for (const t of trees) t.update(elapsed);
  };

  const dispose = () => {
    for (const t of trees) t.dispose();
    for (const g of grasses) g.dispose();
    for (const f of flowers) f.dispose();
    for (const w of waters) w.dispose();
    for (const geo of ownedGeos) geo.dispose();
    for (const mat of ownedMats) mat.dispose();
  };

  return { root, update, dispose };
}

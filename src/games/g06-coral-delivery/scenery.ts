import * as THREE from 'three';
import {
  createForest,
  createGrassField,
  createLantern,
  createMossyBoulder,
  createPBRMaterial,
  createWaterSurface,
  createWildflowerPatch,
  updateFoliageWind,
  type AtmosphereRig,
  type ForestBatch,
  type GrassField,
  type WaterSurface,
  type WildflowerPatch,
} from '../../art';
import type { CanyonTrail, CheckpointDef } from './trail';

export interface CanyonScenery {
  readonly group: THREE.Group;
  update(time: number, dt: number, playerPos: THREE.Vector3): void;
  setCheckpointState(nextCheckpointIdx: number, completedCount: number): void;
  dispose(): void;
}

// Deterministic PRNG for repeatable lush placement
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

interface CheckpointVisual {
  ringMat: THREE.MeshBasicMaterial;
  beaconGroup: THREE.Group;
  beaconMat: THREE.MeshStandardMaterial;
  baseBeaconY: number;
}

interface BobbingBoat {
  group: THREE.Group;
  baseY: number;
  phase: number;
  baseYaw: number;
}

export function buildCanyonScenery(
  trail: CanyonTrail,
  atmosphere: AtmosphereRig,
): CanyonScenery {
  const group = new THREE.Group();
  group.name = 'CoralCanyonScenery';

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

  const rand = mulberry32(60606);

  // --- Shared Architectural Materials ---
  const stuccoMat = trackMat(
    new THREE.MeshStandardMaterial({ color: '#f6efe2', roughness: 0.85, metalness: 0.02 }),
  );
  const creamStoneMat = trackMat(
    createPBRMaterial('sandstone', { repeatX: 2, repeatY: 2, seed: 630, tint: '#e4cca8' }),
  );
  const redRockMat = trackMat(
    createPBRMaterial('sandstone', { repeatX: 2, repeatY: 2, seed: 631, tint: '#c5603e' }),
  );
  const terracottaMat = trackMat(
    new THREE.MeshStandardMaterial({ color: '#cc5c3b', roughness: 0.74, metalness: 0.03 }),
  );
  const roofTileMat = trackMat(
    createPBRMaterial('roofTiles', { repeatX: 3, repeatY: 2, seed: 632, tint: '#d46642' }),
  );
  const brassMat = trackMat(
    createPBRMaterial('brushedBrass', { repeatX: 1, repeatY: 1, seed: 633 }),
  );
  const darkIronMat = trackMat(
    new THREE.MeshStandardMaterial({ color: '#2b3036', roughness: 0.45, metalness: 0.75 }),
  );
  const shutterBlueMat = trackMat(
    new THREE.MeshStandardMaterial({ color: '#2a779c', roughness: 0.65, metalness: 0.05 }),
  );
  const woodMat = trackMat(
    createPBRMaterial('woodPlanks', { repeatX: 1, repeatY: 1, seed: 634, tint: '#9a6b42' }),
  );
  const umbrellaStripeA = trackMat(
    new THREE.MeshStandardMaterial({ color: '#d85b3a', roughness: 0.76, side: THREE.DoubleSide }),
  );
  const umbrellaStripeB = trackMat(
    new THREE.MeshStandardMaterial({ color: '#fbf2e3', roughness: 0.82, side: THREE.DoubleSide }),
  );
  const cactusMat = trackMat(
    new THREE.MeshStandardMaterial({ color: '#587f47', roughness: 0.78, metalness: 0.02 }),
  );
  const cactusBloomMat = trackMat(
    new THREE.MeshStandardMaterial({ color: '#e63946', roughness: 0.52, emissive: '#591015', emissiveIntensity: 0.25 }),
  );
  const cactusSpineMat = trackMat(
    new THREE.MeshStandardMaterial({ color: '#ead59b', roughness: 0.9 }),
  );
  const bougMat = trackMat(
    new THREE.MeshStandardMaterial({ color: '#d63384', roughness: 0.72 }),
  );
  const leafDarkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: '#3f6b3a', roughness: 0.82 }),
  );

  // --- 1. Gleaming Turquoise Mediterranean Sea ---
  const water: WaterSurface = createWaterSurface({
    width: 620,
    depth: 620,
    shape: 'plane',
    segments: 92,
    deepColor: '#0b5c7d',
    shallowColor: '#30c7c4',
    skyColor: '#8ad4ea',
    foamColor: '#f5fbff',
    sunDirection: atmosphere.sunDirection,
    sunColor: atmosphere.sunColor,
    waveSpeed: 0.92,
    waveScale: 0.44,
    waveHeight: 0.16,
    edgeFoamWidth: 0.06,
    opacity: 0.92,
    fogColor: atmosphere.fogColor,
    fogDensity: atmosphere.fogDensity,
  });
  water.mesh.position.set(-40, trail.waterLevel, -10);
  water.mesh.name = 'MediterraneanSea';
  group.add(water.mesh);

  // --- 2. Handcrafted Bobbing Mediterranean Fishing Skiffs in the Harbor Cove ---
  const boats: BobbingBoat[] = [];
  const buildFishingBoat = (x: number, z: number, yaw: number, hullColor: string, stripeColor: string) => {
    const b = new THREE.Group();
    const hullMat = trackMat(new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.58 }));
    const stripeMat = trackMat(new THREE.MeshStandardMaterial({ color: stripeColor, roughness: 0.52 }));
    const sailMat = trackMat(new THREE.MeshStandardMaterial({ color: '#fbf4e6', roughness: 0.85, side: THREE.DoubleSide }));

    // Sculpted hull via tapered sphere/box silhouette
    const hull = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.95, 0.58, 4.1, 10, 1, false, 0, Math.PI)), hullMat);
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = Math.PI / 2;
    hull.scale.set(1.0, 1.0, 0.72);
    hull.position.y = 0.25;
    hull.castShadow = true;
    b.add(hull);

    // Painted coastal trim band
    const gunwale = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.75, 0.14, 3.6)), stripeMat);
    gunwale.position.y = 0.34;
    b.add(gunwale);

    // Timber thwart benches
    for (const tz of [-0.7, 0.55]) {
      const bench = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.45, 0.08, 0.32)), woodMat);
      bench.position.set(0, 0.36, tz);
      b.add(bench);
    }

    // Mast + furled lateen yardarm
    const mast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.05, 0.07, 3.6, 8)), woodMat);
    mast.position.set(0, 1.9, -0.2);
    mast.castShadow = true;
    b.add(mast);

    const sail = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.85, 2.5, 3)), sailMat);
    sail.position.set(0.18, 2.05, 0.2);
    sail.rotation.set(0.18, 0.4, -0.15);
    sail.scale.set(0.18, 1.0, 1.0);
    sail.castShadow = true;
    b.add(sail);

    b.position.set(x, trail.waterLevel + 0.02, z);
    b.rotation.y = yaw;
    group.add(b);
    boats.push({ group: b, baseY: trail.waterLevel + 0.02, phase: rand() * Math.PI * 2, baseYaw: yaw });
  };

  buildFishingBoat(-34, 60, 0.65, '#f7f1e6', '#d85a3a');
  buildFishingBoat(-42, 42, -0.45, '#f2eadc', '#2983a8');
  buildFishingBoat(-48, -14, 1.15, '#f5eee0', '#d99838');

  // --- 3. Sculpted Terracotta Café Umbrella Builder ---
  const buildCafeUmbrella = (scale = 1.0, withTable = true): THREE.Group => {
    const u = new THREE.Group();
    const pole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.045, 0.055, 2.85, 8)), woodMat);
    pole.position.y = 1.42;
    pole.castShadow = true;
    u.add(pole);

    // 8-panel alternating coral & cream scalloped umbrella canopy!
    const segs = 8;
    const panelGeo = trackGeo(new THREE.ConeGeometry(1.75, 0.62, segs, 1, true, 0, (Math.PI * 2) / segs));
    for (let i = 0; i < segs; i++) {
      const panel = new THREE.Mesh(panelGeo, i % 2 === 0 ? umbrellaStripeA : umbrellaStripeB);
      panel.position.y = 2.68;
      panel.rotation.y = (i * Math.PI * 2) / segs;
      panel.castShadow = true;
      u.add(panel);
    }

    const finial = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.09, 10, 8)), brassMat);
    finial.position.y = 3.04;
    u.add(finial);

    if (withTable) {
      const tableTop = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.68, 0.68, 0.06, 16)), stuccoMat);
      tableTop.position.y = 0.86;
      tableTop.castShadow = true;
      tableTop.receiveShadow = true;
      u.add(tableTop);

      const baseFoot = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.36, 0.14, 12)), darkIronMat);
      baseFoot.position.y = 0.07;
      u.add(baseFoot);

      // Two cute Mediterranean bistro chairs
      for (const side of [-1, 1]) {
        const chair = new THREE.Group();
        chair.position.set(side * 0.92, 0, 0);
        chair.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        const seat = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 10)), terracottaMat);
        seat.position.y = 0.48;
        const back = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.46, 0.05)), darkIronMat);
        back.position.set(0, 0.72, -0.22);
        const leg = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.04, 0.14, 0.46, 8)), darkIronMat);
        leg.position.y = 0.23;
        chair.add(seat, back, leg);
        u.add(chair);
      }
    }

    u.scale.setScalar(scale);
    return u;
  };

  // --- 4. Handcrafted Multi-Pad Prickly Pear Cacti with Red Blossoms ---
  const padGeo = trackGeo(new THREE.SphereGeometry(0.42, 10, 8));
  padGeo.scale(0.85, 1.25, 0.28);
  const bloomGeo = trackGeo(new THREE.DodecahedronGeometry(0.11, 0));
  const spineTuftGeo = trackGeo(new THREE.OctahedronGeometry(0.04, 0));

  const buildPricklyPearCactus = (seed: number, scale = 1.0): THREE.Group => {
    const r = mulberry32(seed);
    const c = new THREE.Group();

    const makePad = (
      px: number,
      py: number,
      pz: number,
      rx: number,
      ry: number,
      rz: number,
      s: number,
      hasBlossoms: boolean,
    ) => {
      const pad = new THREE.Mesh(padGeo, cactusMat);
      pad.position.set(px, py, pz);
      pad.rotation.set(rx, ry, rz);
      pad.scale.setScalar(s);
      pad.castShadow = true;
      pad.receiveShadow = true;
      c.add(pad);

      // Tiny golden spine dots
      for (let sp = 0; sp < 3; sp++) {
        const dot = new THREE.Mesh(spineTuftGeo, cactusSpineMat);
        dot.position.set(
          px + (r() - 0.5) * 0.28 * s,
          py + (r() - 0.3) * 0.35 * s,
          pz + (sp % 2 === 0 ? 0.12 : -0.12) * s,
        );
        c.add(dot);
      }

      // Vibrant coral-red cactus blossoms perched on upper pad rim!
      if (hasBlossoms) {
        const bCount = 1 + Math.floor(r() * 2);
        for (let b = 0; b < bCount; b++) {
          const fl = new THREE.Mesh(bloomGeo, cactusBloomMat);
          const side = b === 0 ? -0.18 : 0.18;
          fl.position.set(px + side * s, py + 0.5 * s, pz);
          c.add(fl);
        }
      }
    };

    // Base cladode trunk pad
    makePad(0, 0.44, 0, 0.08, r() * Math.PI, (r() - 0.5) * 0.16, 1.05, false);
    // Mid-level branching pads
    const branchCount = 2 + Math.floor(r() * 2);
    for (let i = 0; i < branchCount; i++) {
      const ang = (i / branchCount) * Math.PI * 2 + r() * 0.8;
      const dx = Math.cos(ang) * 0.42;
      const dz = Math.sin(ang) * 0.42;
      makePad(dx, 1.02 + r() * 0.14, dz, (r() - 0.5) * 0.25, ang + 0.5, (r() - 0.5) * 0.5, 0.84, i === 0);
      // Crown pad on some branches with bright red blossoms!
      if (r() > 0.35) {
        makePad(
          dx * 1.48,
          1.58 + r() * 0.18,
          dz * 1.48,
          (r() - 0.5) * 0.3,
          ang + 1.1,
          (r() - 0.5) * 0.45,
          0.66,
          true,
        );
      }
    }

    c.scale.setScalar(scale);
    return c;
  };

  // --- 5. Start Harbor Pier Welcome Kiosk & Coastal Signpost ---
  {
    const startSample = trail.sampleAtS(10);
    const yaw = Math.atan2(startSample.tangent.x, startSample.tangent.z);
    // Place tea kiosk neatly on the right boardwalk shoulder (never occluding road or camera!)
    const kiosk = new THREE.Group();
    const kx = startSample.pos.x + startSample.right.x * 5.0;
    const kz = startSample.pos.z + startSample.right.z * 5.0;
    kiosk.position.set(kx, startSample.pos.y, kz);
    kiosk.rotation.y = yaw - Math.PI * 0.5;

    // Platform on pilings
    const deck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 0.2, 3.0)), woodMat);
    deck.position.y = -0.05;
    deck.receiveShadow = true;
    kiosk.add(deck);
    for (const sx of [-1.3, 1.3]) {
      for (const sz of [-1.2, 1.2]) {
        const leg = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 4.6, 8)), woodMat);
        leg.position.set(sx, -2.3, sz);
        kiosk.add(leg);
      }
    }

    // Counter & striped coral awning
    const counter = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 1.0, 1.0)), stuccoMat);
    counter.position.set(0, 0.5, 0.2);
    counter.castShadow = true;
    kiosk.add(counter);

    const counterTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.55, 0.1, 1.15)), woodMat);
    counterTop.position.set(0, 1.05, 0.2);
    kiosk.add(counterTop);

    for (const sx of [-1.1, 1.1]) {
      const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8)), woodMat);
      post.position.set(sx, 1.35, 0.2);
      kiosk.add(post);
    }

    for (let st = 0; st < 6; st++) {
      const stripe = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.42, 0.07, 1.75)),
        st % 2 === 0 ? umbrellaStripeA : umbrellaStripeB,
      );
      stripe.position.set(-1.05 + st * 0.42, 2.62, 0.1);
      stripe.rotation.x = 0.22;
      stripe.castShadow = true;
      kiosk.add(stripe);
    }

    const pierLantern = createLantern('brass_lamp', { scale: 0.9, withLight: false, castShadow: true });
    pierLantern.position.set(1.2, 1.1, -0.2);
    kiosk.add(pierLantern);

    group.add(kiosk);
  }

  // --- 6. Build the 4 Scenic Coastal Delivery Checkpoints & Landmarks ---
  const checkpointVisuals: CheckpointVisual[] = [];
  let lighthouseBeamGroup: THREE.Group | null = null;

  const buildCheckpointStation = (cp: CheckpointDef) => {
    const yaw = Math.atan2(cp.tangent.x, cp.tangent.z);

    // A) Glowing Ground Delivery Ring (always clearly legible on the trail!)
    const ringGeo = trackGeo(new THREE.RingGeometry(cp.radius * 0.62, cp.radius * 0.78, 36));
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: cp.isFinish ? '#f5b83d' : '#32c8bd',
        transparent: true,
        opacity: 0.68,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(cp.pos.x, cp.pos.y + 0.08, cp.pos.z);
    group.add(ringMesh);

    // B) Floating Rotating Delivery Beacon Emblem (high side post, never blocks view of character)
    const beaconGroup = new THREE.Group();
    const sideOffset = cp.id === 3 ? -1 : 1;
    const bx = cp.pos.x + cp.right.x * sideOffset * (cp.radius * 0.95);
    const bz = cp.pos.z + cp.right.z * sideOffset * (cp.radius * 0.95);
    const baseBeaconY = cp.pos.y + 4.2;
    beaconGroup.position.set(bx, baseBeaconY, bz);

    const beaconMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#ffd25a',
        emissive: '#ffaa2b',
        emissiveIntensity: 0.85,
        roughness: 0.22,
        metalness: 0.7,
      }),
    );
    const diamond = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.55, 0)), beaconMat);
    diamond.scale.set(0.85, 1.35, 0.85);
    const halo = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.82, 0.055, 8, 24)), beaconMat);
    halo.rotation.x = Math.PI / 2;
    beaconGroup.add(diamond, halo);
    group.add(beaconGroup);

    checkpointVisuals.push({ ringMat, beaconGroup, beaconMat, baseBeaconY });

    // C) Roadside Brass Delivery Bell Post + Terracotta Café Umbrellas + Warm Brass Lantern
    const postGroup = new THREE.Group();
    postGroup.position.set(bx, cp.pos.y, bz);
    postGroup.rotation.y = yaw;

    const stonePlinth = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.42, 0.52, 0.8, 10)), stuccoMat);
    stonePlinth.position.y = 0.4;
    stonePlinth.castShadow = true;
    stonePlinth.receiveShadow = true;
    postGroup.add(stonePlinth);

    const bellPole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 8)), brassMat);
    bellPole.position.y = 1.95;
    bellPole.castShadow = true;
    postGroup.add(bellPole);

    const bellArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.65, 0.07, 0.07)), brassMat);
    bellArm.position.set(sideOffset * 0.25, 3.0, 0);
    postGroup.add(bellArm);

    const bell = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.22, 0.3, 12)), brassMat);
    bell.position.set(sideOffset * 0.48, 2.78, 0);
    postGroup.add(bell);

    const lantern = createLantern('brass_lamp', { scale: 1.05, withLight: false, castShadow: true });
    lantern.position.set(0, 3.12, 0);
    postGroup.add(lantern);
    group.add(postGroup);

    // D) Checkpoint-Specific Bespoke Architecture!
    if (cp.id === 1) {
      // CP1: HARBOR CAFÉ — Terracotta Umbrellas, Bistro Tables & Low Pergola Patio
      const patio = new THREE.Group();
      const px = cp.pos.x + cp.right.x * 8.2;
      const pz = cp.pos.z + cp.right.z * 8.2;
      patio.position.set(px, cp.pos.y, pz);
      patio.rotation.y = yaw;

      // Deep foundation plinth so patio anchors solidly into the hillside
      const floor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 4.2, 11.8)), creamStoneMat);
      floor.position.y = -2.02;
      floor.receiveShadow = true;
      floor.castShadow = true;
      patio.add(floor);

      // Note: with rotation.y = yaw, local +X = -right (toward road), local -X = +right (back of patio)
      const cafeWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 3.4, 8.6)), stuccoMat);
      cafeWall.position.set(-2.7, 1.7, 0);
      cafeWall.castShadow = true;
      cafeWall.receiveShadow = true;
      patio.add(cafeWall);

      const cafeRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 0.24, 9.2)), roofTileMat);
      cafeRoof.position.set(-2.0, 3.45, 0);
      cafeRoof.rotation.z = -0.2;
      cafeRoof.castShadow = true;
      patio.add(cafeRoof);

      const u1 = buildCafeUmbrella(1.05, true);
      u1.position.set(1.1, 0.08, -2.6);
      const u2 = buildCafeUmbrella(1.0, true);
      u2.position.set(0.9, 0.08, 2.5);
      patio.add(u1, u2);
      group.add(patio);
    } else if (cp.id === 2) {
      // CP2: CYPRESS ARCH TERRACE — Grand High-Clearance Mediterranean Stone Archway!
      // Clearance = 7.4m tall, 11.4m wide -> iconic visual landmark, ZERO chase camera obstruction!
      const arch = new THREE.Group();
      arch.position.copy(cp.pos);
      arch.rotation.y = yaw;

      const pillarSpan = 5.8;
      const pillarH = 7.2;
      const pillarGeo = trackGeo(new THREE.BoxGeometry(1.35, pillarH + 2.4, 1.45));
      const capGeo = trackGeo(new THREE.BoxGeometry(1.72, 0.35, 1.8));
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(pillarGeo, stuccoMat);
        pillar.position.set(side * pillarSpan, pillarH * 0.5 - 1.3, 0);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        arch.add(pillar);

        const cap = new THREE.Mesh(capGeo, terracottaMat);
        cap.position.set(side * pillarSpan, pillarH - 0.05, 0);
        cap.castShadow = true;
        arch.add(cap);

        // Cascading bougainvillea bush clinging to each pillar shoulder
        for (let b = 0; b < 5; b++) {
          const puff = new THREE.Mesh(
            trackGeo(new THREE.DodecahedronGeometry(0.46 + (b % 2) * 0.16, 1)),
            b % 2 === 0 ? bougMat : leafDarkMat,
          );
          puff.position.set(
            side * (pillarSpan - 0.55),
            4.8 + b * 0.52,
            (b % 2 === 0 ? 0.5 : -0.5),
          );
          arch.add(puff);
        }
      }

      // High gracefully arched stone lintel (bottom clearance >= 7.1m!)
      const lintel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(pillarSpan * 2 + 1.8, 0.9, 1.35)), stuccoMat);
      lintel.position.set(0, pillarH + 0.55, 0);
      lintel.castShadow = true;
      arch.add(lintel);

      const tileCrown = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(pillarSpan * 2 + 2.2, 0.34, 1.7)), roofTileMat);
      tileCrown.position.set(0, pillarH + 1.15, 0);
      tileCrown.castShadow = true;
      arch.add(tileCrown);

      // Stone balcony terrace + sunlit café umbrella on the inland side (-X = +right) beside the arch
      const sidePad = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(3.2, 3.8, 5.2, 12)), creamStoneMat);
      sidePad.position.set(-9.0, -2.55, -2.2);
      sidePad.receiveShadow = true;
      arch.add(sidePad);

      const u = buildCafeUmbrella(1.0, true);
      u.position.set(-9.0, 0.05, -2.2);
      arch.add(u);

      group.add(arch);
    } else if (cp.id === 3) {
      // CP3: CHASM BRIDGE POST — Bridgehead Stone Lookout & Terracotta Umbrellas
      const post = new THREE.Group();
      const px = cp.pos.x - cp.right.x * 7.2;
      const pz = cp.pos.z - cp.right.z * 7.2;
      post.position.set(px, cp.pos.y, pz);
      post.rotation.y = yaw;

      const pad = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(4.2, 5.0, 7.6, 12)), creamStoneMat);
      pad.position.y = -3.72;
      pad.receiveShadow = true;
      pad.castShadow = true;
      post.add(pad);

      const u = buildCafeUmbrella(1.08, true);
      u.position.set(0, 0.08, 0);
      post.add(u);

      // Terracotta amphorae jars beside lookout
      const ampGeo = trackGeo(new THREE.LatheGeometry([
        new THREE.Vector2(0.0, 0),
        new THREE.Vector2(0.22, 0.08),
        new THREE.Vector2(0.36, 0.45),
        new THREE.Vector2(0.26, 0.78),
        new THREE.Vector2(0.14, 0.96),
        new THREE.Vector2(0.2, 1.08),
      ], 12));
      for (const [ax, az, s] of [[-1.6, 1.4, 1.0], [-2.1, 0.7, 0.78]]) {
        const amp = new THREE.Mesh(ampGeo, terracottaMat);
        amp.position.set(ax, 0.08, az);
        amp.scale.setScalar(s);
        amp.castShadow = true;
        post.add(amp);
      }

      group.add(post);
    } else if (cp.id === 4) {
      // CP4 (FINISH): CLIFFSIDE LIGHTHOUSE VILLA — Showpiece Coastal Monument!
      const villa = new THREE.Group();
      // Placed heroically directly beyond the finish plaza facing back toward the arriving player!
      const vx = cp.pos.x + cp.tangent.x * 21.5;
      const vz = cp.pos.z + cp.tangent.z * 21.5;
      villa.position.set(vx, cp.pos.y, vz);
      villa.rotation.y = yaw;

      // Grand dressed-stone cliff fortress terrace plinth anchored deep into bedrock
      const terrace = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(11.8, 14.4, 10.6, 16)), creamStoneMat);
      terrace.position.y = -5.22;
      terrace.receiveShadow = true;
      terrace.castShadow = true;
      villa.add(terrace);

      // --- Towering Red-and-White Striped Mediterranean Lighthouse (17.5m tall!) ---
      const lh = new THREE.Group();
      lh.position.set(-2.6, 0.08, -1.2);

      // Octagonal sandstone base
      const base = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.65, 3.15, 2.8, 8)), creamStoneMat);
      base.position.y = 1.4;
      base.castShadow = true;
      base.receiveShadow = true;
      lh.add(base);

      // 5 Alternating Whitewashed Cream & Coral-Terracotta Horizontal Tower Bands!
      const bandHeights = [2.4, 2.4, 2.4, 2.4, 2.2];
      let curY = 2.8;
      for (let i = 0; i < bandHeights.length; i++) {
        const h = bandHeights[i];
        const rBot = THREE.MathUtils.lerp(2.45, 1.52, i / bandHeights.length);
        const rTop = THREE.MathUtils.lerp(2.45, 1.52, (i + 1) / bandHeights.length);
        const band = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(rTop, rBot, h, 20)),
          i % 2 === 0 ? stuccoMat : terracottaMat,
        );
        band.position.y = curY + h * 0.5;
        band.castShadow = true;
        band.receiveShadow = true;
        lh.add(band);
        curY += h;
      }

      // Iron gallery deck + railing ring
      const gallery = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.05, 1.72, 0.35, 20)), darkIronMat);
      gallery.position.y = curY + 0.16;
      gallery.castShadow = true;
      lh.add(gallery);

      const railRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.96, 0.055, 8, 24)), darkIronMat);
      railRing.rotation.x = Math.PI / 2;
      railRing.position.y = curY + 1.05;
      lh.add(railRing);

      // Glowing Glass Fresnel Lantern Room
      const lanternGlassMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: '#fff4d4',
          emissive: '#ffcf6e',
          emissiveIntensity: 2.2,
          roughness: 0.15,
          metalness: 0.1,
        }),
      );
      const lanternRoom = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(1.22, 1.22, 1.9, 16)),
        lanternGlassMat,
      );
      lanternRoom.position.y = curY + 1.28;
      lh.add(lanternRoom);

      // Cupola terracotta dome + brass lightning spire
      const cupola = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(1.32, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)),
        terracottaMat,
      );
      cupola.position.y = curY + 2.18;
      cupola.castShadow = true;
      lh.add(cupola);

      const spire = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.04, 0.12, 1.5, 8)), brassMat);
      spire.position.y = curY + 3.65;
      lh.add(spire);

      // Rotating twin golden volumetric Fresnel light beams!
      lighthouseBeamGroup = new THREE.Group();
      lighthouseBeamGroup.position.set(0, curY + 1.35, 0);
      const beamMat = trackMat(
        new THREE.MeshBasicMaterial({
          color: '#ffe6a3',
          transparent: true,
          opacity: 0.17,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const beamGeo = trackGeo(new THREE.ConeGeometry(4.4, 34, 16, 1, true));
      beamGeo.translate(0, -17, 0);
      beamGeo.rotateX(Math.PI / 2);

      const beamA = new THREE.Mesh(beamGeo, beamMat);
      const beamB = new THREE.Mesh(beamGeo, beamMat);
      beamB.rotation.y = Math.PI;
      lighthouseBeamGroup.add(beamA, beamB);
      lh.add(lighthouseBeamGroup);

      villa.add(lh);

      // --- Attached Whitewashed Mediterranean Villa Wing with Terracotta Tile Roof ---
      const wing = new THREE.Group();
      wing.position.set(3.2, 0.08, 1.8);

      const mainBlock = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 5.2, 5.6)), stuccoMat);
      mainBlock.position.y = 2.6;
      mainBlock.castShadow = true;
      mainBlock.receiveShadow = true;
      wing.add(mainBlock);

      // Pitched terracotta tile roof
      const roofA = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.8, 0.3, 3.6)), roofTileMat);
      roofA.position.set(0, 5.75, 1.48);
      roofA.rotation.x = 0.34;
      roofA.castShadow = true;
      const roofB = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.8, 0.3, 3.6)), roofTileMat);
      roofB.position.set(0, 5.75, -1.48);
      roofB.rotation.x = -0.34;
      roofB.castShadow = true;
      wing.add(roofA, roofB);

      // Cobalt-blue Mediterranean shuttered windows on villa facade
      const windowMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: '#ffdca3',
          emissive: '#ffbf66',
          emissiveIntensity: 0.55,
          roughness: 0.25,
        }),
      );
      for (const wx of [-2.0, 0, 2.0]) {
        const pane = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.9, 1.45, 0.14)), windowMat);
        pane.position.set(wx, 3.1, -2.8);
        wing.add(pane);
        for (const sSide of [-1, 1]) {
          const shutter = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 1.5, 0.12)), shutterBlueMat);
          shutter.position.set(wx + sSide * 0.66, 3.1, -2.84);
          wing.add(shutter);
        }
      }

      // Bougainvillea flowering cascade over the villa entrance
      for (let b = 0; b < 8; b++) {
        const bush = new THREE.Mesh(
          trackGeo(new THREE.DodecahedronGeometry(0.55 + (b % 3) * 0.14, 1)),
          b % 3 === 0 ? leafDarkMat : bougMat,
        );
        bush.position.set(-3.2 + b * 0.9, 1.8 + Math.sin(b * 1.3) * 0.5, -2.95);
        wing.add(bush);
      }

      // Celebratory Café Umbrellas on the Villa Overlook Plaza!
      const u1 = buildCafeUmbrella(1.1, true);
      u1.position.set(-4.8, 0, -5.2);
      const u2 = buildCafeUmbrella(1.05, true);
      u2.position.set(2.8, 0, -5.8);
      wing.add(u1, u2);

      villa.add(wing);
      group.add(villa);
    }
  };

  for (const cp of trail.checkpoints) {
    buildCheckpointStation(cp);
  }

  // --- 7. Sculpted Layered Red-Rock Canyon Monoliths & Coastal Sea Stacks ---
  {
    const strataBlockGeo = trackGeo(new THREE.CylinderGeometry(1, 1.24, 1, 7));

    const buildMesaStack = (x: number, z: number, baseY: number, radius: number, layers: number) => {
      const mGroup = new THREE.Group();
      mGroup.position.set(x, baseY, z);
      let cy = 0;
      for (let l = 0; l < layers; l++) {
        const r = radius * (1 - l * 0.16) * (0.9 + rand() * 0.2);
        const h = 2.4 + rand() * 1.8;
        const slab = new THREE.Mesh(
          strataBlockGeo,
          l % 2 === 0 ? redRockMat : creamStoneMat,
        );
        slab.scale.set(r, h, r * (0.82 + rand() * 0.36));
        slab.position.set((rand() - 0.5) * 0.9, cy + h * 0.5, (rand() - 0.5) * 0.9);
        slab.rotation.y = rand() * Math.PI * 2;
        slab.castShadow = true;
        slab.receiveShadow = true;
        mGroup.add(slab);
        cy += h * 0.88;
      }
      group.add(mGroup);
    };

    // Sea Stacks rising dramatically from the turquoise Mediterranean bay!
    buildMesaStack(-58, 36, -1.8, 6.4, 4);
    buildMesaStack(-68, -6, -2.0, 8.2, 5);
    buildMesaStack(-26, -14, -1.8, 4.2, 3);
    buildMesaStack(-78, -56, -2.0, 9.2, 5);

    // Towering Sedona-style Stratified Sandstone Mesas on the inland cliff ridge!
    const mesaCoords: Array<[number, number, number, number]> = [
      [56, 22, 8.5, 5],
      [62, -16, 9.5, 6],
      [50, -52, 8.2, 5],
      [26, -68, 7.2, 4],
      [-48, -124, 8.8, 5],
      [-8, -130, 9.4, 6],
      [34, -112, 8.5, 5],
    ];
    for (const [mx, mz, mr, layers] of mesaCoords) {
      const by = Math.max(2, trail.getTerrainHeight(mx, mz) - 2.5);
      buildMesaStack(mx, mz, by, mr, layers);
    }
  }

  // --- 8. Rich Coastal Flora: Olive, Cypress & Palm Forests + Grass + Wildflowers + Boulders + Cacti ---
  const isClearOfTrail = (x: number, z: number, extraMargin: number): boolean => {
    const near = trail.findNearest(x, z);
    if (near.distance < near.width * 0.5 + extraMargin) return false;
    // Keep lighthouse villa terrace & Harbor Café patio crisp and clear of stray trees
    if (Math.hypot(x - 22, z + 77) < 16.5) return false;
    if (Math.hypot(x - 14, z - 12) < 14.5) return false;
    return true;
  };

  const terrainSlopeAt = (x: number, z: number): number => {
    const hL = trail.getTerrainHeight(x - 1.2, z);
    const hR = trail.getTerrainHeight(x + 1.2, z);
    const hD = trail.getTerrainHeight(x, z - 1.2);
    const hU = trail.getTerrainHeight(x, z + 1.2);
    return Math.hypot((hR - hL) / 2.4, (hU - hD) / 2.4);
  };

  const olivePlacements: Array<{ x: number; y: number; z: number; scale: number; rotationY: number }> = [];
  const cypressPlacements: Array<{ x: number; y: number; z: number; scale: number; rotationY: number }> = [];
  const palmPlacements: Array<{ x: number; y: number; z: number; scale: number; rotationY: number }> = [];

  // Curated hero cypress avenues framing Cypress Arch Terrace (well off to the sides — zero occlusion!)
  const cp2 = trail.checkpoints[1];
  for (let k = -2; k <= 2; k++) {
    if (k === 0) continue;
    for (const side of [-1, 1]) {
      const cx = cp2.pos.x + cp2.tangent.x * (k * 5.2) + cp2.right.x * side * 9.8;
      const cz = cp2.pos.z + cp2.tangent.z * (k * 5.2) + cp2.right.z * side * 9.8;
      const cy = trail.getTerrainHeight(cx, cz);
      if (cy > 2.5 && isClearOfTrail(cx, cz, 3.6)) {
        cypressPlacements.push({
          x: cx,
          y: cy - 0.15,
          z: cz,
          scale: 0.92 + rand() * 0.34,
          rotationY: rand() * Math.PI * 2,
        });
      }
    }
  }

  // Curated coastal palms framing the harbor shoreline & lighthouse cape!
  const heroPalms: Array<[number, number]> = [
    [-6, 46], [-2, 54], [6, 36], [12, 26], [-18, 26],
    [22, 16], [28, 22], [-56, -88], [-68, -66], [24, -76], [20, -98],
  ];
  for (const [px, pz] of heroPalms) {
    const py = trail.getTerrainHeight(px, pz);
    if (py > 0.7 && isClearOfTrail(px, pz, 3.2)) {
      palmPlacements.push({
        x: px,
        y: py - 0.15,
        z: pz,
        scale: 0.88 + rand() * 0.32,
        rotationY: rand() * Math.PI * 2,
      });
    }
  }

  // Procedural botanical scatter across the sunlit terraced canyon slopes
  for (let tries = 0; tries < 950; tries++) {
    const x = -88 + rand() * 172;
    const z = -126 + rand() * 195;
    if (!isClearOfTrail(x, z, 3.8)) continue;

    const y = trail.getTerrainHeight(x, z);
    if (y < 1.2 || y > 38) continue;
    const slope = terrainSlopeAt(x, z);
    if (slope > 0.82) continue;

    const r = rand();
    if (y < 7.5 && palmPlacements.length < 24 && r < 0.38) {
      palmPlacements.push({
        x,
        y: y - 0.15,
        z,
        scale: 0.82 + rand() * 0.38,
        rotationY: rand() * Math.PI * 2,
      });
    } else if (olivePlacements.length < 40 && r < 0.62) {
      olivePlacements.push({
        x,
        y: y - 0.18,
        z,
        scale: 0.85 + rand() * 0.42,
        rotationY: rand() * Math.PI * 2,
      });
    } else if (cypressPlacements.length < 44) {
      cypressPlacements.push({
        x,
        y: y - 0.18,
        z,
        scale: 0.85 + rand() * 0.45,
        rotationY: rand() * Math.PI * 2,
      });
    }
  }

  const forests: ForestBatch[] = [];
  if (olivePlacements.length > 0) {
    const f = createForest(olivePlacements, {
      style: 'olive',
      baseHeight: 5.2,
      archetypes: 3,
      canopyDensity: 0.92,
      seed: 641,
      castShadow: true,
    });
    forests.push(f);
    group.add(f.group);
  }
  if (cypressPlacements.length > 0) {
    const f = createForest(cypressPlacements, {
      style: 'cypress',
      baseHeight: 7.4,
      archetypes: 3,
      canopyDensity: 0.9,
      seed: 642,
      castShadow: true,
    });
    forests.push(f);
    group.add(f.group);
  }
  if (palmPlacements.length > 0) {
    const f = createForest(palmPlacements, {
      style: 'palm',
      baseHeight: 6.8,
      archetypes: 3,
      canopyDensity: 0.95,
      seed: 643,
      castShadow: true,
    });
    forests.push(f);
    group.add(f.group);
  }

  // Handcrafted Prickly Pear Cacti + Mossy Sandstone Boulders scattered near road bends!
  let cactusCount = 0;
  let boulderCount = 0;
  for (let tries = 0; tries < 420 && (cactusCount < 28 || boulderCount < 32); tries++) {
    // Pick a point near a trail sample so players admire them right alongside the scenic route!
    const samp = trail.samples[Math.floor(rand() * trail.samples.length)];
    if (samp.surface === 'pier' || samp.surface === 'bridge') continue;

    const side = rand() > 0.42 ? 1 : -1;
    const dist = samp.width * 0.5 + 2.4 + rand() * 14.0;
    const x = samp.pos.x + samp.right.x * side * dist;
    const z = samp.pos.z + samp.right.z * side * dist;
    if (!isClearOfTrail(x, z, 2.2)) continue;

    const y = trail.getTerrainHeight(x, z);
    if (y < 1.3 || y > 34) continue;
    const slope = terrainSlopeAt(x, z);

    if (cactusCount < 28 && slope < 0.72 && rand() < 0.52) {
      const cactus = buildPricklyPearCactus(7000 + cactusCount * 17, 0.78 + rand() * 0.45);
      cactus.position.set(x, y - 0.08, z);
      cactus.rotation.y = rand() * Math.PI * 2;
      group.add(cactus);
      cactusCount++;
    } else if (boulderCount < 32) {
      const boulder = createMossyBoulder({
        radius: 0.85 + rand() * 1.45,
        mossAmount: 0.14,
        stoneTint: boulderCount % 2 === 0 ? '#c96f4a' : '#d69766',
        mossColor: '#6f7e4f',
        includeAccentStones: true,
        seed: 8000 + boulderCount * 23,
        castShadow: true,
      });
      boulder.position.set(x, y - 0.25, z);
      boulder.rotation.y = rand() * Math.PI * 2;
      group.add(boulder);
      boulderCount++;
    }
  }

  // Wind-Swept Dry Golden-Olive Mediterranean Scrub Grass Field (5,200 blades, masking trail & sea!)
  const grassField: GrassField = createGrassField({
    area: { minX: -82, maxX: 64, minZ: -120, maxZ: 64 },
    count: 5200,
    heightAt: (x, z) => trail.getTerrainHeight(x, z),
    mask: (x, z) => {
      const y = trail.getTerrainHeight(x, z);
      if (y < 1.35 || y > 32) return false;
      if (!isClearOfTrail(x, z, 1.75)) return false;
      return terrainSlopeAt(x, z) < 0.72;
    },
    bladeHeightRange: [0.34, 0.78],
    bladeWidth: 0.068,
    baseColor: '#626f3c',
    tipColor: '#c8b464',
    dryColor: '#d99854',
    windStrength: 1.05,
    pushRadius: 1.45,
    pushStrength: 1.15,
    seed: 650,
    castShadow: false,
  });
  group.add(grassField.mesh);

  // Mediterranean Coastal Wildflowers (Bougainvillea Magenta, Marigold, Coral & Lavender!)
  const wildflowers: WildflowerPatch = createWildflowerPatch({
    area: { minX: -78, maxX: 58, minZ: -116, maxZ: 58 },
    count: 950,
    heightAt: (x, z) => trail.getTerrainHeight(x, z),
    mask: (x, z) => {
      const y = trail.getTerrainHeight(x, z);
      if (y < 1.6 || y > 30) return false;
      if (!isClearOfTrail(x, z, 1.85)) return false;
      return terrainSlopeAt(x, z) < 0.65;
    },
    palette: ['#d63384', '#f59f00', '#e85d3f', '#9775fa', '#ff87b2'],
    scaleRange: [0.75, 1.35],
    seed: 651,
  });
  group.add(wildflowers.group);

  // --- 9. Dynamic Scenery Update Loop ---
  let activeCpIndex = 0;

  const setCheckpointState = (nextCheckpointIdx: number, completedCount: number) => {
    activeCpIndex = nextCheckpointIdx;
    for (let i = 0; i < checkpointVisuals.length; i++) {
      const cv = checkpointVisuals[i];
      if (i < completedCount) {
        // Completed checkpoint: calm celebratory Aegean emerald!
        cv.ringMat.color.set('#38c98a');
        cv.ringMat.opacity = 0.38;
        cv.beaconMat.color.set('#55e0a3');
        cv.beaconMat.emissive.set('#22a86e');
        cv.beaconMat.emissiveIntensity = 0.55;
      } else if (i === nextCheckpointIdx) {
        // Active next destination: bright sunlit gold!
        cv.ringMat.color.set('#ffcb47');
        cv.ringMat.opacity = 0.85;
        cv.beaconMat.color.set('#ffe27a');
        cv.beaconMat.emissive.set('#ff9d24');
        cv.beaconMat.emissiveIntensity = 1.25;
      } else {
        // Future checkpoint: soft coastal coral
        cv.ringMat.color.set('#e88b68');
        cv.ringMat.opacity = 0.42;
        cv.beaconMat.color.set('#f2aa82');
        cv.beaconMat.emissive.set('#d66d4b');
        cv.beaconMat.emissiveIntensity = 0.45;
      }
    }
  };

  setCheckpointState(0, 0);

  const update = (time: number, dt: number, playerPos: THREE.Vector3) => {
    updateFoliageWind(time, 1.0);
    water.update(time);
    grassField.update(time, playerPos);
    wildflowers.update(time);
    for (const f of forests) f.update(time);

    // Gentle harbor wave bobbing on Mediterranean skiffs
    for (const boat of boats) {
      boat.group.position.y = boat.baseY + Math.sin(time * 1.45 + boat.phase) * 0.14;
      boat.group.rotation.z = Math.sin(time * 1.15 + boat.phase) * 0.055;
      boat.group.rotation.x = Math.cos(time * 0.92 + boat.phase) * 0.035;
      boat.group.rotation.y = boat.baseYaw + Math.sin(time * 0.42 + boat.phase) * 0.04;
    }

    // Rotate Cliffside Lighthouse Fresnel light beams majestically over the sea!
    if (lighthouseBeamGroup) {
      lighthouseBeamGroup.rotation.y += dt * 0.52;
    }

    // Animate checkpoint beacons (active beacon pulses brightly)
    for (let i = 0; i < checkpointVisuals.length; i++) {
      const cv = checkpointVisuals[i];
      const isActive = i === activeCpIndex;
      cv.beaconGroup.rotation.y = time * (isActive ? 1.8 : 0.85) + i;
      cv.beaconGroup.position.y =
        cv.baseBeaconY + Math.sin(time * (isActive ? 3.2 : 1.7) + i) * (isActive ? 0.32 : 0.16);
      if (isActive) {
        cv.ringMat.opacity = 0.62 + Math.sin(time * 4.5) * 0.24;
      }
    }
  };

  const dispose = () => {
    water.dispose();
    grassField.dispose();
    wildflowers.dispose();
    for (const f of forests) f.dispose();
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMats) m.dispose();
    ownedGeos.length = 0;
    ownedMats.length = 0;
  };

  return {
    group,
    update,
    setCheckpointState,
    dispose,
  };
}

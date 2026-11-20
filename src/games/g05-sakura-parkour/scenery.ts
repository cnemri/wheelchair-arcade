import * as THREE from 'three';
import {
  createBambooCluster,
  createDetailedTree,
  createFernCluster,
  createForest,
  createGrassField,
  createLantern,
  createMossyBoulder,
  createPBRMaterial,
  createWildflowerPatch,
  type BambooCluster,
  type DetailedTree,
  type ForestBatch,
  type GrassField,
  type WildflowerPatch,
} from '../../art';
import {
  buildBellPavilion,
  buildCheckpointTorii,
  buildCurvedLaunchRamp,
  buildFestivalBanner,
  buildGoldenSkyPagoda,
  buildLanternGarland,
  buildPergolaBridge,
  buildRooftopIsland,
  buildSpringPad,
  buildSummitMedallion,
  createArchitecturePalette,
  type ArchitecturePalette,
} from './architecture';
import type {
  AnimatedCheckpoint,
  AnimatedCrane,
  AnimatedSpringPad,
  CourseData,
  CraneDef,
  SolidCylinderCollider,
  WalkableSurface,
} from './types';

export interface CloudPuff {
  mesh: THREE.Object3D;
  baseX: number;
  baseY: number;
  baseZ: number;
  speed: number;
  bobPhase: number;
}

export interface CanopySphere {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface WorldBuildResult {
  worldGroup: THREE.Group;
  palette: ArchitecturePalette;
  springPads: AnimatedSpringPad[];
  checkpoints: AnimatedCheckpoint[];
  cranes: AnimatedCrane[];
  solidCylinders: SolidCylinderCollider[];
  canopySpheres: CanopySphere[];
  trees: DetailedTree[];
  forests: ForestBatch[];
  grassFields: GrassField[];
  wildflowers: WildflowerPatch[];
  bamboos: BambooCluster[];
  swayingLanterns: Array<{ pivot: THREE.Object3D; phase: number; speed: number }>;
  wavingBanners: Array<{ mesh: THREE.Mesh; phase: number }>;
  chevronMaterials: THREE.MeshStandardMaterial[];
  cloudPuffs: CloudPuff[];
  cloudSeaUniforms: { uTime: { value: number } };
  summitMedallion: {
    ringOuter: THREE.Mesh;
    ringInner: THREE.Mesh;
    pillarBeam: THREE.Mesh;
    light: THREE.PointLight;
  };
  templeBell: THREE.Object3D | null;
  landingIndicator: {
    group: THREE.Group;
    shadowMat: THREE.MeshBasicMaterial;
    ringMat: THREE.MeshBasicMaterial;
    ringMesh: THREE.Mesh;
  };
  dispose: () => void;
}

/**
 * Transforms local coordinates on a WalkableSurface to world coordinates.
 */
function surfaceLocalToWorld(
  s: WalkableSurface,
  lx: number,
  lz: number,
  ly = 0,
): THREE.Vector3 {
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  return new THREE.Vector3(
    s.x + lx * c + lz * sn,
    s.baseY + ly,
    s.z - lx * sn + lz * c,
  );
}

/**
 * Builds the handcrafted multi-faceted 3D Golden Origami Crane collectible.
 */
function createOrigamiCrane(
  def: CraneDef,
  goldMat: THREE.MeshStandardMaterial,
  bonusMat: THREE.MeshStandardMaterial,
  haloMat: THREE.MeshBasicMaterial,
  phase: number,
): AnimatedCrane {
  const group = new THREE.Group();
  group.name = `crane_${def.id}`;
  group.position.set(def.x, def.y, def.z);

  const mat = def.bonus ? bonusMat : goldMat;

  // Inner pivot for graceful banking & spinning
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  // Faceted diamond origami torso (octahedron stretched along flight axis -Z)
  const bodyGeo = new THREE.OctahedronGeometry(0.28, 0);
  bodyGeo.scale(0.85, 0.58, 1.45);
  const bodyMesh = new THREE.Mesh(bodyGeo, mat);
  bodyMesh.castShadow = false;
  bodyGroup.add(bodyMesh);

  // Crisp angled origami neck & folded head/beak pointing forward (-Z)
  const neckGeo = new THREE.ConeGeometry(0.11, 0.62, 4);
  const neck = new THREE.Mesh(neckGeo, mat);
  neck.position.set(0, 0.24, -0.44);
  neck.rotation.x = -0.62;
  bodyGroup.add(neck);

  const headGeo = new THREE.ConeGeometry(0.08, 0.34, 4);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.set(0, 0.45, -0.68);
  head.rotation.x = -Math.PI * 0.58;
  bodyGroup.add(head);

  // Swept origami tail blade pointing backward & upward (+Z)
  const tailGeo = new THREE.ConeGeometry(0.12, 0.68, 4);
  const tail = new THREE.Mesh(tailGeo, mat);
  tail.position.set(0, 0.26, 0.48);
  tail.rotation.x = 0.72;
  bodyGroup.add(tail);

  // Handcrafted triangular folded origami wings (custom sharp-crease geometry)
  const makeWing = (side: -1 | 1): THREE.Object3D => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.14, 0.04, 0.02);

    const verts = new Float32Array([
      // Inner fold triangle
      0, 0, -0.26,
      side * 0.68, 0.18, -0.05,
      0, 0, 0.28,
      // Outer swept wingtip crease
      side * 0.68, 0.18, -0.05,
      side * 0.96, -0.04, 0.24,
      0, 0, 0.28,
    ]);
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    wGeo.computeVertexNormals();

    const wingMat = mat.clone();
    wingMat.side = THREE.DoubleSide;
    const wingMesh = new THREE.Mesh(wGeo, wingMat);
    pivot.add(wingMesh);
    return pivot;
  };

  const leftWing = makeWing(-1);
  const rightWing = makeWing(1);
  bodyGroup.add(leftWing, rightWing);

  // Delicate luminous pickup halo ring around the crane
  const haloMesh = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.032, 6, 24), haloMat);
  haloMesh.rotation.x = Math.PI * 0.5;
  group.add(haloMesh);

  const scale = def.bonus ? 1.24 : 1.06;
  group.scale.setScalar(scale);

  return {
    def,
    group,
    leftWing,
    rightWing,
    haloMesh,
    collected: false,
    collectAnim: 0,
    phase,
  };
}

/**
 * Builds the majestic snow-capped Mount Fuji silhouette + misty mountain horizon
 * framed heroically behind the ascending rooftop skyline & Golden Sky Pagoda.
 */
function buildMountFujiHorizon(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'MountFujiHorizon';

  // Iconic concave stratovolcano silhouette using LatheGeometry
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(175, 0),
    new THREE.Vector2(132, 16),
    new THREE.Vector2(92, 36),
    new THREE.Vector2(62, 58),
    new THREE.Vector2(38, 82),
    new THREE.Vector2(21, 102),
    new THREE.Vector2(14.5, 108),
    new THREE.Vector2(9.5, 105.5), // Subtle caldera crater rim
  ];
  const fujiGeo = new THREE.LatheGeometry(profile, 44);

  // Add subtle natural volcanic erosion gullies & paint vertex colors (plum-indigo base -> blush snow cap)
  const pos = fujiGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const baseCol = new THREE.Color('#6f5884');
  const midCol = new THREE.Color('#8e6e96');
  const snowCol = new THREE.Color('#ffeae8');
  const tmpCol = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const ridge = Math.sin(angle * 9) * 0.035 + Math.cos(angle * 15 + 0.8) * 0.018;
    const scaleR = 1 + ridge * (1 - y / 115);
    pos.setX(i, x * scaleR);
    pos.setZ(i, z * scaleR);

    // Jagged snowline contour around y ≈ 74..84
    const snowLine = 74 + Math.sin(angle * 7) * 5.5 + Math.cos(angle * 13) * 3.2;
    const snowT = THREE.MathUtils.smoothstep(y, snowLine - 5, snowLine + 9);
    const hT = THREE.MathUtils.clamp(y / 85, 0, 1);
    tmpCol.copy(baseCol).lerp(midCol, hT).lerp(snowCol, snowT);
    colors[i * 3 + 0] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
  }
  fujiGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  fujiGeo.computeVertexNormals();

  const fujiMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.0,
    fog: false, // Render clearly through atmospheric tint with its own gentle dusk palette!
    emissive: new THREE.Color('#d48aa0'),
    emissiveIntensity: 0.24,
  });

  const fujiMesh = new THREE.Mesh(fujiGeo, fujiMat);
  // Placed far ahead along -Z, slightly right of Pagoda center so both Pagoda & Fuji form an iconic composition!
  fujiMesh.position.set(52, -32, -415);
  group.add(fujiMesh);

  // Soft misty flanking mountain ridges for sweeping depth
  const ridgeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8a6b90'),
    emissive: new THREE.Color('#c88ca0'),
    emissiveIntensity: 0.25,
    roughness: 0.96,
    fog: false,
  });
  const ridgeSpecs = [
    { x: -165, y: -38, z: -380, rx: 140, ry: 54, rz: 70 },
    { x: -65, y: -38, z: -410, rx: 115, ry: 44, rz: 65 },
    { x: 215, y: -38, z: -375, rx: 135, ry: 48, rz: 70 },
  ];
  for (const r of ridgeSpecs) {
    const geo = new THREE.ConeGeometry(1, 1, 14);
    geo.scale(r.rx, r.ry, r.rz);
    const mesh = new THREE.Mesh(geo, ridgeMat);
    mesh.position.set(r.x, r.y + r.ry * 0.45, r.z);
    group.add(mesh);
  }

  return group;
}

/**
 * Builds the luminous sunlit sea of soft pink-gold clouds floating beneath the rooftops.
 */
function buildPinkGoldCloudSea(): {
  group: THREE.Group;
  cloudPuffs: CloudPuff[];
  uniforms: { uTime: { value: number } };
} {
  const group = new THREE.Group();
  group.name = 'PinkGoldCloudSea';

  const uniforms = {
    uTime: { value: 0 },
  };

  // Vast animated glowing cloud-sea layer far below the islands
  const seaGeo = new THREE.PlaneGeometry(920, 920, 1, 1);
  seaGeo.rotateX(-Math.PI * 0.5);
  const seaMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vWorldXZ;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldXZ = wp.xz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vWorldXZ;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.04 + vec2(19.3, 7.1);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 uv = vWorldXZ * 0.011;
        vec2 drift = vec2(uTime * 0.022, -uTime * 0.012);
        float n1 = fbm(uv + drift);
        float n2 = fbm(uv * 2.1 - drift * 0.7);
        float cloud = smoothstep(0.28, 0.78, n1 * 0.72 + n2 * 0.38);

        vec3 shadowMist = vec3(0.62, 0.45, 0.62);
        vec3 blushPink  = vec3(0.95, 0.68, 0.74);
        vec3 warmGold   = vec3(1.00, 0.86, 0.74);

        vec3 col = mix(shadowMist, blushPink, smoothstep(0.15, 0.68, cloud));
        col = mix(col, warmGold, smoothstep(0.55, 0.95, cloud));

        // Soft radial horizon fade
        float dist = length(vWorldXZ - vec2(0.0, -140.0));
        float alpha = (0.74 + cloud * 0.22) * (1.0 - smoothstep(260.0, 440.0, dist));
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const seaMesh = new THREE.Mesh(seaGeo, seaMat);
  seaMesh.position.set(0, -24, -140);
  group.add(seaMesh);

  // Sculpted 3D billowing pink-gold cumulus cloud clusters drifting below & flanking the sky-town
  const cloudPuffs: CloudPuff[] = [];
  const puffMatWarm = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffd8d2'),
    emissive: new THREE.Color('#f7a49e'),
    emissiveIntensity: 0.36,
    roughness: 0.96,
    metalness: 0.0,
    transparent: true,
    opacity: 0.92,
  });
  const puffMatLavender = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f2c8d8'),
    emissive: new THREE.Color('#c88cb0'),
    emissiveIntensity: 0.28,
    roughness: 0.96,
    metalness: 0.0,
    transparent: true,
    opacity: 0.86,
  });

  const lobeGeo = new THREE.IcosahedronGeometry(1, 2);

  // Deterministic seeded placement along the ascending sky-town corridor
  let seed = 7771;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 64; i++) {
    const cluster = new THREE.Group();
    const t = i / 63;
    const z = 45 - t * 380 + (rand() - 0.5) * 18;
    const side = i % 3 === 0 ? 0 : i % 2 === 0 ? 1 : -1;
    const x =
      side === 0
        ? (rand() - 0.5) * 75
        : side * (24 + rand() * 88);
    // Clouds rise gradually underneath the ascending course
    const courseApproxY = THREE.MathUtils.clamp((-z / 270) * 26, 0, 26);
    const y =
      side === 0
        ? courseApproxY - 15 - rand() * 10
        : courseApproxY - 11 + (rand() - 0.35) * 16;

    const mat = i % 2 === 0 ? puffMatWarm : puffMatLavender;
    const baseScale = 4.5 + rand() * 6.5;

    const lobes = 4 + (i % 3);
    for (let l = 0; l < lobes; l++) {
      const m = new THREE.Mesh(lobeGeo, mat);
      const ang = (l / lobes) * Math.PI * 2 + rand() * 0.5;
      const rad = l === 0 ? 0 : (0.55 + rand() * 0.5) * baseScale;
      const sx = baseScale * (l === 0 ? 1.45 : 0.78 + rand() * 0.45);
      const sy = baseScale * (l === 0 ? 0.55 : 0.36 + rand() * 0.24);
      const sz = baseScale * (l === 0 ? 1.15 : 0.72 + rand() * 0.42);
      m.scale.set(sx, sy, sz);
      m.position.set(Math.cos(ang) * rad, (rand() - 0.4) * baseScale * 0.2, Math.sin(ang) * rad * 0.75);
      cluster.add(m);
    }

    cluster.position.set(x, y, z);
    group.add(cluster);
    cloudPuffs.push({
      mesh: cluster,
      baseX: x,
      baseY: y,
      baseZ: z,
      speed: 0.7 + rand() * 1.1,
      bobPhase: rand() * Math.PI * 2,
    });
  }

  return { group, cloudPuffs, uniforms };
}

/**
 * Builds floating decorative distant Japanese roof-islets & sakura groves
 * cradled by sunlit pink-gold cloud pillows for dramatic parallax & soft atmospheric blend.
 */
function buildDistantSkyTownIslets(
  pal: ArchitecturePalette,
): { group: THREE.Group; forest: ForestBatch } {
  const group = new THREE.Group();
  group.name = 'DistantSkyTownIslets';

  const isletSpecs = [
    { x: -34, y: 2, z: -26, s: 0.9 },
    { x: 36, y: 5, z: -58, s: 1.05 },
    { x: -38, y: 11, z: -98, s: 1.1 },
    { x: 42, y: 14, z: -145, s: 0.95 },
    { x: -44, y: 18, z: -188, s: 1.15 },
    { x: 38, y: 23, z: -232, s: 1.0 },
    { x: -34, y: 28, z: -282, s: 1.2 },
    { x: 36, y: 29, z: -292, s: 1.15 },
  ];

  // Bright, dusk-mist sunlit mossy terrace stone (zero harsh black shadow undersides!)
  const sunlitRockMat = createPBRMaterial('rock', {
    repeatX: 2,
    repeatY: 2,
    tint: '#cbb8c0',
    mossAmount: 0.45,
  });
  sunlitRockMat.roughness = 0.9;
  sunlitRockMat.emissive = new THREE.Color('#e8a8b4');
  sunlitRockMat.emissiveIntensity = 0.36;

  // Sunlit mossy grass top cap on each floating islet
  const isletMossMat = createPBRMaterial('grassSoil', {
    repeatX: 2,
    repeatY: 2,
    tint: '#7d9464',
  });
  isletMossMat.roughness = 0.92;
  isletMossMat.emissive = new THREE.Color('#a88488');
  isletMossMat.emissiveIntensity = 0.14;

  // Soft glowing pink-gold cloud pillow cradling the base of each floating islet
  const mistPillowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffe0da'),
    emissive: new THREE.Color('#f7b4b0'),
    emissiveIntensity: 0.44,
    roughness: 0.96,
    metalness: 0.0,
    transparent: true,
    opacity: 0.88,
  });

  // Reusable sculpted shallow rounded rock bowl & cloud lobe
  const rockBowlGeo = new THREE.SphereGeometry(5.6, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
  rockBowlGeo.scale(1.12, 0.48, 1.04);
  const rPos = rockBowlGeo.attributes.position;
  for (let i = 0; i < rPos.count; i++) {
    const vx = rPos.getX(i);
    const vy = rPos.getY(i);
    const vz = rPos.getZ(i);
    const undul = 1 + Math.sin(vx * 0.5 + vz * 0.45) * 0.11;
    rPos.setX(i, vx * undul);
    rPos.setZ(i, vz * undul);
    rPos.setY(i, vy * (1 + Math.cos(vx * 0.6 - vz * 0.5) * 0.08));
  }
  rockBowlGeo.computeVertexNormals();

  const mossCapGeo = new THREE.CylinderGeometry(5.65, 6.0, 0.55, 14);
  const cloudLobeGeo = new THREE.IcosahedronGeometry(1, 2);

  const forestPlacements: Array<{ x: number; y: number; z: number; scale: number; rotationY: number }> = [];

  for (let i = 0; i < isletSpecs.length; i++) {
    const sp = isletSpecs[i];
    const islet = new THREE.Group();
    islet.position.set(sp.x, sp.y, sp.z);
    islet.scale.setScalar(sp.s);

    // Warm sunlit mossy terrace cap + soft rounded sunlit rock underside
    const mossCap = new THREE.Mesh(mossCapGeo, isletMossMat);
    mossCap.position.y = -0.15;
    const rockBowl = new THREE.Mesh(rockBowlGeo, sunlitRockMat);
    rockBowl.position.y = -0.35;
    islet.add(mossCap, rockBowl);

    // Cushioning ring of 6 soft pink-gold cumulus cloud puffs blending the islet into the dusk sky!
    for (let c = 0; c < 6; c++) {
      const ang = (c / 6) * Math.PI * 2 + i * 0.55;
      const puff = new THREE.Mesh(cloudLobeGeo, mistPillowMat);
      const rDist = 4.2 + (c % 2) * 1.1;
      puff.scale.set(3.4 + (c % 3) * 0.65, 1.35 + (c % 2) * 0.35, 3.0 + (c % 2) * 0.7);
      puff.position.set(
        Math.cos(ang) * rDist,
        -2.25 - (c % 2) * 0.45,
        Math.sin(ang) * rDist * 0.9,
      );
      islet.add(puff);
    }
    const centerCloud = new THREE.Mesh(cloudLobeGeo, mistPillowMat);
    centerCloud.scale.set(5.2, 1.65, 4.8);
    centerCloud.position.set(0, -2.95, 0);
    islet.add(centerCloud);

    // Traditional small tiled pavilion silhouette on top
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.0, 2.7, 5.0), pal.plasterMat);
    body.position.y = 1.45;
    const glow = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 5.12), pal.shojiGlowMat);
    glow.position.y = 1.55;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.1, 4), pal.eaveTileMat);
    roof.rotation.y = Math.PI * 0.25;
    roof.position.y = 3.55;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), pal.goldMat);
    finial.position.y = 4.65;
    islet.add(body, glow, roof, finial);

    group.add(islet);

    // Place 2 sakura trees on each distant islet via instanced ForestBatch!
    forestPlacements.push({
      x: sp.x - 3.2 * sp.s,
      y: sp.y + 0.1,
      z: sp.z + 2.2 * sp.s,
      scale: 0.9 * sp.s,
      rotationY: i * 1.1,
    });
    forestPlacements.push({
      x: sp.x + 3.4 * sp.s,
      y: sp.y + 0.1,
      z: sp.z - 2.0 * sp.s,
      scale: 0.78 * sp.s,
      rotationY: i * 2.3,
    });
  }

  const forest = createForest(forestPlacements, {
    style: 'sakura',
    baseHeight: 6.4,
    archetypes: 3,
    canopyDensity: 0.82,
    seed: 909,
    castShadow: false,
    receiveShadow: false,
  });
  group.add(forest.group);

  return { group, forest };
}

/**
 * Builds the pinpoint landing drop-shadow & pink-gold ring indicator beneath the wheelchair.
 */
function createLandingIndicator(): WorldBuildResult['landingIndicator'] {
  const group = new THREE.Group();
  group.name = 'LandingIndicator';

  // Soft radial contact shadow canvas texture
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(28, 16, 26, 0.58)');
  grad.addColorStop(0.58, 'rgba(28, 16, 26, 0.24)');
  grad.addColorStop(1, 'rgba(28, 16, 26, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const shadowTex = new THREE.CanvasTexture(canvas);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 1.85), shadowMat);
  shadowDisc.rotation.x = -Math.PI * 0.5;
  shadowDisc.position.y = 0.03;
  group.add(shadowDisc);

  // Crisp glowing pink-gold target ring (illuminates brightly when airborne!)
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffd3a8'),
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.72, 28), ringMat);
  ringMesh.rotation.x = -Math.PI * 0.5;
  ringMesh.position.y = 0.045;
  group.add(ringMesh);

  return { group, shadowMat, ringMat, ringMesh };
}

/**
 * Assembles the complete 3D Sakura Rooftop Parkour sky-town world!
 */
export function buildParkourWorld(course: CourseData): WorldBuildResult {
  const worldGroup = new THREE.Group();
  worldGroup.name = 'SakuraParkourWorld';

  const palette = createArchitecturePalette();
  const springPads: AnimatedSpringPad[] = [];
  const checkpoints: AnimatedCheckpoint[] = [];
  const cranes: AnimatedCrane[] = [];
  const solidCylinders: SolidCylinderCollider[] = [];
  const canopySpheres: CanopySphere[] = [];
  const trees: DetailedTree[] = [];
  const forests: ForestBatch[] = [];
  const grassFields: GrassField[] = [];
  const wildflowers: WildflowerPatch[] = [];
  const bamboos: BambooCluster[] = [];
  const swayingLanterns: Array<{ pivot: THREE.Object3D; phase: number; speed: number }> = [];
  const wavingBanners: Array<{ mesh: THREE.Mesh; phase: number }> = [];
  const chevronMaterials: THREE.MeshStandardMaterial[] = [];
  let templeBell: THREE.Object3D | null = null;

  const surfaceById = new Map<string, WalkableSurface>();
  for (const s of course.surfaces) {
    surfaceById.set(s.id, s);
  }

  // 1. Build all walkable surfaces (10 islands, balconies, stepping roofs, ramps, arched bridges)
  for (const s of course.surfaces) {
    if (s.kind === 'ramp') {
      worldGroup.add(buildCurvedLaunchRamp(s, palette, chevronMaterials));
    } else if (s.kind === 'bridge') {
      worldGroup.add(buildPergolaBridge(s, palette, swayingLanterns));
    } else {
      worldGroup.add(buildRooftopIsland(s, palette));
    }
  }

  // 2. Spring Jump Pads
  for (const sp of course.springPads) {
    const built = buildSpringPad(sp, palette);
    worldGroup.add(built.group);
    springPads.push(built);
  }

  // 3. Checkpoint Torii Arches (keep active PointLights crisp & lean: put beacon lights on alternating checkpoints)
  for (const cp of course.checkpoints) {
    const withLight = cp.index === 0 || cp.index === 2 || cp.index === 4;
    const built = buildCheckpointTorii(cp, palette, withLight);
    worldGroup.add(built.group);
    checkpoints.push(built);
    const cosY = Math.cos(cp.yaw);
    const sinY = Math.sin(cp.yaw);
    for (const side of [-1, 1]) {
      const lx = side * 3.1;
      solidCylinders.push({
        x: cp.x + lx * cosY,
        y: cp.y,
        z: cp.z - lx * sinY,
        radius: 0.48,
        height: 5.5,
      });
    }
  }

  // 4. Collectible Golden Origami Cranes
  const craneGoldMat = createPBRMaterial('brushedBrass', {
    repeatX: 1,
    repeatY: 1,
    tint: '#ffe078',
  });
  craneGoldMat.metalness = 0.85;
  craneGoldMat.roughness = 0.24;
  craneGoldMat.emissive = new THREE.Color('#ffaa32');
  craneGoldMat.emissiveIntensity = 0.55;

  const craneBonusMat = createPBRMaterial('brushedBrass', {
    repeatX: 1,
    repeatY: 1,
    tint: '#ff96c2',
  });
  craneBonusMat.metalness = 0.78;
  craneBonusMat.roughness = 0.2;
  craneBonusMat.emissive = new THREE.Color('#ff5d9e');
  craneBonusMat.emissiveIntensity = 0.78;

  const craneHaloMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffe8a3'),
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  for (let i = 0; i < course.cranes.length; i++) {
    const crane = createOrigamiCrane(
      course.cranes[i],
      craneGoldMat,
      craneBonusMat,
      craneHaloMat,
      i * 0.73,
    );
    worldGroup.add(crane.group);
    cranes.push(crane);
  }

  // 5. Lush Botanical Gardens, Sakura Trees, Bamboo, Ferns, Mossy Boulders, Lanterns & Landmarks
  const gardenSoilMat = createPBRMaterial('grassSoil', {
    repeatX: 2,
    repeatY: 3,
    tint: '#6b7e4c',
  });
  gardenSoilMat.roughness = 0.92;

  for (const dec of course.decors) {
    const surf = surfaceById.get(dec.surfaceId);
    if (!surf) continue;

    // Raised mossy rooftop garden beds with interactive grass & wildflowers!
    if (dec.gardenBeds) {
      for (const bed of dec.gardenBeds) {
        const bedPos = surfaceLocalToWorld(surf, bed.lx, bed.lz, 0);
        const curbH = 0.22;

        // Carved stone garden curb + rich mossy soil mound
        const curb = new THREE.Mesh(
          new THREE.BoxGeometry(bed.w + 0.26, curbH, bed.l + 0.26),
          palette.stoneBaseMat,
        );
        curb.position.set(bedPos.x, bedPos.y + curbH * 0.5, bedPos.z);
        curb.rotation.y = surf.yaw;
        curb.receiveShadow = true;
        curb.castShadow = true;
        worldGroup.add(curb);

        const soil = new THREE.Mesh(
          new THREE.BoxGeometry(bed.w, curbH + 0.04, bed.l),
          gardenSoilMat,
        );
        soil.position.set(bedPos.x, bedPos.y + curbH * 0.5 + 0.01, bedPos.z);
        soil.rotation.y = surf.yaw;
        soil.receiveShadow = true;
        worldGroup.add(soil);

        // Real interactive instanced grass blades on the rooftop garden bed!
        const halfW = bed.w * 0.45;
        const halfL = bed.l * 0.46;
        const grass = createGrassField({
          area: {
            minX: bedPos.x - halfW,
            maxX: bedPos.x + halfW,
            minZ: bedPos.z - halfL,
            maxZ: bedPos.z + halfL,
          },
          count: Math.round(bed.w * bed.l * 24),
          heightAt: () => bedPos.y + curbH + 0.02,
          bladeHeightRange: [0.22, 0.48],
          bladeWidth: 0.045,
          baseColor: '#3f6338',
          tipColor: '#88b35a',
          dryColor: '#c9a66b',
          windStrength: 1.15,
          pushRadius: 1.5,
          pushStrength: 0.85,
          seed: bed.seed,
        });
        worldGroup.add(grass.mesh);
        grassFields.push(grass);

        // Blooming pink/cream spring wildflowers nestled in the grass
        const wf = createWildflowerPatch({
          area: {
            minX: bedPos.x - halfW,
            maxX: bedPos.x + halfW,
            minZ: bedPos.z - halfL,
            maxZ: bedPos.z + halfL,
          },
          count: Math.round(bed.w * bed.l * 4.5),
          heightAt: () => bedPos.y + curbH + 0.03,
          palette: ['#ffb8cc', '#ffeef4', '#ffd88a', '#f287a8'],
          scaleRange: [0.65, 1.15],
          seed: bed.seed + 50,
        });
        worldGroup.add(wf.group);
        wildflowers.push(wf);
      }
    }

    // Lush Multi-Branch Sakura Trees!
    if (dec.sakuraTrees) {
      const isHeroIsland = dec.islandIndex === 1 || dec.islandIndex === 10;
      for (const t of dec.sakuraTrees) {
        const tree = createDetailedTree({
          style: 'sakura',
          height: t.height,
          seed: t.seed,
          canopyDensity: isHeroIsland ? 0.98 : 0.86,
          castShadow: dec.islandIndex <= 2 || dec.islandIndex === 10,
          receiveShadow: true,
        });
        const pos = surfaceLocalToWorld(surf, t.lx, t.lz, 0.16);
        tree.group.position.copy(pos);
        tree.group.rotation.y = (t.seed * 1.7) % (Math.PI * 2);
        worldGroup.add(tree.group);
        trees.push(tree);
        solidCylinders.push({
          x: pos.x,
          y: pos.y - 0.16,
          z: pos.z,
          radius: 0.42,
          height: 3.4,
        });
        canopySpheres.push({
          x: pos.x,
          y: pos.y + t.height * 0.62,
          z: pos.z,
          radius: t.height * 0.44,
        });
      }
    }

    // Bamboo clusters
    if (dec.bamboo) {
      for (const b of dec.bamboo) {
        const bam = createBambooCluster({
          culmCount: 8,
          heightRange: [3.2, 5.2],
          spread: 0.72,
          seed: b.seed,
          castShadow: true,
        });
        bam.group.position.copy(surfaceLocalToWorld(surf, b.lx, b.lz, 0.14));
        worldGroup.add(bam.group);
        bamboos.push(bam);
      }
    }

    // Mossy zen boulders
    if (dec.boulders) {
      for (const r of dec.boulders) {
        const boulder = createMossyBoulder({
          radius: r.radius,
          mossAmount: 0.72,
          stoneTint: '#7a7582',
          mossColor: '#5c8248',
          includeAccentStones: true,
          seed: r.seed,
          castShadow: true,
        });
        boulder.position.copy(surfaceLocalToWorld(surf, r.lx, r.lz, 0.16));
        worldGroup.add(boulder);
      }
    }

    // Fern clusters
    if (dec.ferns) {
      for (const f of dec.ferns) {
        const fern = createFernCluster({
          frondCount: 11,
          radius: 0.95,
          height: 0.78,
          seed: f.seed,
          castShadow: false,
        });
        fern.position.copy(surfaceLocalToWorld(surf, f.lx, f.lz, 0.18));
        worldGroup.add(fern);
      }
    }

    // Glowing Japanese paper_sakura lanterns
    if (dec.paperLanterns) {
      for (const l of dec.paperLanterns) {
        const lan = createLantern('paper_sakura', {
          scale: 1.05,
          withLight: Boolean(l.withLight),
          lightIntensity: 2.6,
          lightDistance: 12.0,
          castShadow: false,
        });
        lan.position.copy(surfaceLocalToWorld(surf, l.lx, l.lz, 0));
        lan.rotation.y = surf.yaw + l.rotY;
        worldGroup.add(lan);
      }
    }

    // Carved stone Tōrō shrine lanterns
    if (dec.stoneLanterns) {
      for (const l of dec.stoneLanterns) {
        const lan = createLantern('stone_toro', {
          scale: 1.05,
          withLight: Boolean(l.withLight),
          lightIntensity: 2.5,
          lightDistance: 11.0,
          castShadow: true,
        });
        lan.position.copy(surfaceLocalToWorld(surf, l.lx, l.lz, 0));
        worldGroup.add(lan);
      }
    }

    // Waving festival nobori banners
    if (dec.banners) {
      for (let bi = 0; bi < dec.banners.length; bi++) {
        const b = dec.banners[bi];
        const built = buildFestivalBanner(b.color, palette);
        built.group.position.copy(surfaceLocalToWorld(surf, b.lx, b.lz, 0));
        built.group.rotation.y = surf.yaw + b.rotY;
        worldGroup.add(built.group);
        wavingBanners.push({
          mesh: built.clothMesh,
          phase: dec.islandIndex * 1.4 + bi * 2.1,
        });
      }
    }

    // Overhead hanging lantern garlands
    if (dec.hasGarland) {
      const g = dec.hasGarland;
      const gar = buildLanternGarland(
        g.fromX,
        g.fromZ,
        g.toX,
        g.toZ,
        g.height,
        g.count,
        palette,
        swayingLanterns,
      );
      gar.position.set(surf.x, surf.baseY, surf.z);
      gar.rotation.y = surf.yaw;
      worldGroup.add(gar);
    }

    // Island 7 Temple Bell Pavilion
    if (dec.hasBellPavilion) {
      const built = buildBellPavilion(palette);
      built.group.position.copy(surfaceLocalToWorld(surf, dec.hasBellPavilion.lx, dec.hasBellPavilion.lz, 0));
      worldGroup.add(built.group);
      templeBell = built.bell;
    }

    // Island 10 Monumental 3-Tier Golden Sky Pagoda!
    if (dec.hasPagoda) {
      const pagoda = buildGoldenSkyPagoda(palette);
      pagoda.position.copy(surfaceLocalToWorld(surf, dec.hasPagoda.lx, dec.hasPagoda.lz, 0));
      worldGroup.add(pagoda);
    }
  }

  // 6. Ceremonial Golden Summit Shrine Medallion
  const medallion = buildSummitMedallion(
    course.summitGoal.x,
    course.summitGoal.y,
    course.summitGoal.z,
    course.summitGoal.radius,
    palette,
  );
  worldGroup.add(medallion.group);

  // 7. Distant Misty Mount Fuji Horizon, Sunlit Pink-Gold Cloud Sea & Distant Floating Sky-Town Islets
  worldGroup.add(buildMountFujiHorizon());

  const cloudSea = buildPinkGoldCloudSea();
  worldGroup.add(cloudSea.group);

  const distantIslets = buildDistantSkyTownIslets(palette);
  worldGroup.add(distantIslets.group);
  forests.push(distantIslets.forest);

  // 8. Pinpoint Drop-Shadow & Landing Ring Indicator
  const landingIndicator = createLandingIndicator();
  worldGroup.add(landingIndicator.group);

  const dispose = () => {
    for (const t of trees) t.dispose();
    for (const f of forests) f.dispose();
    for (const g of grassFields) g.dispose();
    for (const w of wildflowers) w.dispose();
    for (const b of bamboos) b.dispose();
    trees.length = 0;
    forests.length = 0;
    grassFields.length = 0;
    wildflowers.length = 0;
    bamboos.length = 0;
  };

  return {
    worldGroup,
    palette,
    springPads,
    checkpoints,
    cranes,
    solidCylinders,
    canopySpheres,
    trees,
    forests,
    grassFields,
    wildflowers,
    bamboos,
    swayingLanterns,
    wavingBanners,
    chevronMaterials,
    cloudPuffs: cloudSea.cloudPuffs,
    cloudSeaUniforms: cloudSea.uniforms,
    summitMedallion: {
      ringOuter: medallion.ringOuter,
      ringInner: medallion.ringInner,
      pillarBeam: medallion.pillarBeam,
      light: medallion.light,
    },
    templeBell,
    landingIndicator,
    dispose,
  };
}

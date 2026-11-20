import * as THREE from 'three';
import { createParticleSystem, createPBRMaterial, type ParticleSystem } from '../../art';
import type {
  AwningZone,
  BoxCollider,
  ClueDefinition,
  ClueState,
  NoirEnvironment,
  SearchlightRig,
  WatchmanRig,
} from './types';

// ---------------------------------------------------------------------------
// 5 Handcrafted Case Clues
// ---------------------------------------------------------------------------

export const CLUE_DEFINITIONS: ClueDefinition[] = [
  {
    id: 'clue-telegram',
    title: 'Soaked Telegram',
    locationHint: 'Le Phare Noir Awning (West)',
    narration: 'Clue 1/5 — Soaked Telegram: "Contraband loads at 02:00. Watch the crane shadows."',
    position: new THREE.Vector3(-21.2, 0, -7.6),
    kind: 'telegram',
  },
  {
    id: 'clue-compass',
    title: 'Cracked Brass Compass',
    locationHint: 'West Customs Pier',
    narration: 'Clue 2/5 — Brass Compass: Needle jammed at 042° — aimed squarely at the East Pier.',
    position: new THREE.Vector3(-14.0, 0.02, 17.6),
    kind: 'compass',
  },
  {
    id: 'clue-footprints',
    title: 'Muddy Bootprint Trail',
    locationHint: 'Central Cypress Square',
    narration: 'Clue 3/5 — Bootprint Trail: Heavy iron-heeled boots hauling oiled clockwork crates.',
    position: new THREE.Vector3(-0.4, 0, -5.2),
    kind: 'footprints',
  },
  {
    id: 'clue-manifest',
    title: "Smugglers' Manifest",
    locationHint: 'Central Ferry Landing',
    narration: 'Clue 4/5 — Smugglers’ Manifest: "12 unmarked optics crates — Quai No. 3 Midnight."',
    position: new THREE.Vector3(1.4, 0.02, 11.4),
    kind: 'manifest',
  },
  {
    id: 'clue-ledger',
    title: 'Locked Harbor Ledger',
    locationHint: 'East Warehouse Awning',
    narration: 'Clue 5/5 — Harbor Ledger: Signed by the Syndicate! Race to the East Pier Beacon!',
    position: new THREE.Vector3(23.2, 0, -6.8),
    kind: 'ledger',
  },
];

// ---------------------------------------------------------------------------
// Helper Shaders & Geometry
// ---------------------------------------------------------------------------

function createUnitBeamConeGeo(): THREE.BufferGeometry {
  // Apex at (0,0,0), wide base radius 1 at (0,0,+1) so `lookAt(target)` aims straight along +Z
  const geo = new THREE.ConeGeometry(1, 1, 24, 1, true);
  geo.translate(0, -0.5, 0);
  geo.rotateX(-Math.PI * 0.5);
  return geo;
}

function createBeamShaderMaterial(colorHex: number, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        float fresnel = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 1.15);
        float along = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
        float rainMotes = 0.88 + 0.12 * sin(uTime * 5.2 + vUv.y * 22.0 + vUv.x * 16.0);
        float alpha = fresnel * along * uOpacity * rainMotes;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
}

function createProgressRingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uProgress: { value: 0 },
      uColor: { value: new THREE.Color(0xffd66b) },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float ring = smoothstep(0.68, 0.74, r) * (1.0 - smoothstep(0.92, 0.98, r));
        float angle = atan(p.y, p.x); // -PI..PI
        float norm = (angle + 3.14159265) / 6.2831853;
        float fill = step(norm, uProgress);
        float alpha = ring * (0.22 + 0.78 * fill) * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
}

function createSoftDiscTexture(inner: string, mid: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, inner);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// 2D Line-of-Sight Occlusion Against Tall Cover AABBs
// ---------------------------------------------------------------------------

export function isSegmentOccluded(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  colliders: BoxCollider[],
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.blocksSight) continue;

    let tmin = 0.02;
    let tmax = 0.98;

    if (Math.abs(dx) < 1e-6) {
      if (ax < c.minX || ax > c.maxX) continue;
    } else {
      const invD = 1 / dx;
      let t1 = (c.minX - ax) * invD;
      let t2 = (c.maxX - ax) * invD;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (Math.abs(dz) < 1e-6) {
      if (az < c.minZ || az > c.maxZ) continue;
    } else {
      const invD = 1 / dz;
      let t1 = (c.minZ - az) * invD;
      let t2 = (c.maxZ - az) * invD;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (tmax >= tmin) return true;
  }
  return false;
}

export function isInsideAwning(x: number, z: number, awnings: AwningZone[]): boolean {
  for (let i = 0; i < awnings.length; i++) {
    const a = awnings[i];
    if (x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 3D Clue Vignette Builders
// ---------------------------------------------------------------------------

function buildCluePropMesh(
  kind: ClueDefinition['kind'],
  brassMat: THREE.MeshStandardMaterial,
  woodMat: THREE.MeshStandardMaterial,
  ironMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const g = new THREE.Group();
  const paperMat = new THREE.MeshStandardMaterial({
    color: '#efe3c6',
    emissive: '#3a2b14',
    emissiveIntensity: 0.35,
    roughness: 0.72,
  });
  const waxMat = new THREE.MeshStandardMaterial({
    color: '#9e2626',
    roughness: 0.38,
  });

  if (kind === 'telegram') {
    // Small cast-iron bistro café table + soggy telegram slip + upturned teacup
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.24, 0.72, 10), ironMat);
    ped.position.y = 0.36;
    g.add(ped);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16), woodMat);
    top.position.y = 0.73;
    top.castShadow = true;
    g.add(top);
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.015, 0.24), paperMat);
    sheet.position.set(-0.04, 0.765, 0.02);
    sheet.rotation.y = 0.35;
    g.add(sheet);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.08, 10), paperMat);
    cup.position.set(0.18, 0.79, -0.1);
    cup.rotation.z = 1.25;
    g.add(cup);
    const weight = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), brassMat);
    weight.position.set(-0.12, 0.8, 0.06);
    g.add(weight);
  } else if (kind === 'compass') {
    // Low weathered wood plank box + gleaming brass pocket compass + kerchief
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 0.56), woodMat);
    box.position.y = 0.21;
    box.castShadow = true;
    g.add(box);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.015, 0.36), paperMat);
    cloth.position.set(-0.06, 0.43, 0.02);
    cloth.rotation.y = -0.4;
    g.add(cloth);
    const caseBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.045, 16), brassMat);
    caseBase.position.set(0.06, 0.455, 0);
    g.add(caseBase);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16), brassMat);
    lid.position.set(0.06, 0.57, -0.13);
    lid.rotation.x = 1.25;
    g.add(lid);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.015, 0.18), waxMat);
    needle.position.set(0.06, 0.485, 0);
    needle.rotation.y = 0.72;
    g.add(needle);
  } else if (kind === 'footprints') {
    // Curved trail of dark wet glistening bootprints + smoldering dropped cigar stub
    const mudMat = new THREE.MeshStandardMaterial({
      color: '#1b1613',
      roughness: 0.16,
      metalness: 0.2,
    });
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -0.14 : 0.14;
      const print = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.014, 0.3), mudMat);
      print.position.set(-0.75 + i * 0.32, 0.022, side + Math.sin(i * 0.65) * 0.18);
      print.rotation.y = 0.22;
      g.add(print);
    }
    const cigar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), woodMat);
    cigar.rotation.z = Math.PI * 0.5;
    cigar.rotation.y = 0.6;
    cigar.position.set(0.12, 0.03, 0.26);
    g.add(cigar);
    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6229 }),
    );
    ember.position.set(0.19, 0.03, 0.22);
    g.add(ember);
  } else if (kind === 'manifest') {
    // Hooped barrel pedestal + wax-sealed parchment scroll + brass customs stamp
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.84, 12), woodMat);
    barrel.position.y = 0.42;
    barrel.castShadow = true;
    g.add(barrel);
    for (const hy of [0.2, 0.65]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.02, 6, 14), ironMat);
      hoop.rotation.x = Math.PI * 0.5;
      hoop.position.y = hy;
      g.add(hoop);
    }
    const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.44, 10), paperMat);
    scroll.rotation.z = Math.PI * 0.5;
    scroll.rotation.y = 0.32;
    scroll.position.set(-0.04, 0.88, 0.04);
    g.add(scroll);
    const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10), waxMat);
    seal.position.set(0.02, 0.925, 0.02);
    g.add(seal);
    const stamp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.14, 10), brassMat);
    stamp.position.set(0.16, 0.91, -0.1);
    g.add(stamp);
  } else {
    // Leather-bound brass-clasped Harbor Ledger + skeleton key + fallen brass oil lantern
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.56, 0.62), woodMat);
    crate.position.y = 0.28;
    crate.castShadow = true;
    g.add(crate);
    const leatherMat = new THREE.MeshStandardMaterial({ color: '#451d1c', roughness: 0.62 });
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.3), leatherMat);
    book.position.set(-0.06, 0.605, 0.04);
    book.rotation.y = -0.25;
    g.add(book);
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.05), brassMat);
    clasp.position.set(0.12, 0.605, 0.09);
    g.add(clasp);
    const key = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), brassMat);
    key.rotation.z = Math.PI * 0.5;
    key.rotation.y = 0.55;
    key.position.set(0.2, 0.58, -0.12);
    g.add(key);
    const fallenLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.22, 10), brassMat);
    fallenLamp.rotation.z = Math.PI * 0.48;
    fallenLamp.position.set(-0.22, 0.63, -0.15);
    g.add(fallenLamp);
  }

  return g;
}

// ---------------------------------------------------------------------------
// Patrolling Lantern Watchman Builder
// ---------------------------------------------------------------------------

function buildWatchmanRig(
  id: string,
  waypoints: THREE.Vector3[],
  speed: number,
  ironMat: THREE.MeshStandardMaterial,
  brassMat: THREE.MeshStandardMaterial,
  coneGeo: THREE.BufferGeometry,
  softDiscTex: THREE.CanvasTexture,
): WatchmanRig {
  const root = new THREE.Group();
  root.position.copy(waypoints[0]);

  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const coatMat = new THREE.MeshStandardMaterial({
    color: '#1b222c',
    roughness: 0.42,
    metalness: 0.18,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: '#323c4a',
    roughness: 0.45,
    metalness: 0.35,
  });

  // Heavy rain-slicker trenchcoat silhouette
  const coatLower = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.44, 1.05, 12), coatMat);
  coatLower.position.y = 0.58;
  coatLower.castShadow = true;
  bodyPivot.add(coatLower);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.27, 0.58, 12), coatMat);
  torso.position.y = 1.32;
  torso.castShadow = true;
  bodyPivot.add(torso);

  // Turned-up trenchcoat collar & brass syndicate badge
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.2, 10), trimMat);
  collar.position.y = 1.66;
  bodyPivot.add(collar);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), ironMat);
  head.position.y = 1.82;
  head.castShadow = true;
  bodyPivot.add(head);

  // Classic noir brimmed rain fedora hat
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.04, 14), coatMat);
  brim.position.y = 1.94;
  brim.castShadow = true;
  bodyPivot.add(brim);

  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.22, 12), coatMat);
  crown.position.y = 2.06;
  crown.castShadow = true;
  bodyPivot.add(crown);

  const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.02, 6, 14), brassMat);
  hatBand.rotation.x = Math.PI * 0.5;
  hatBand.position.y = 1.97;
  bodyPivot.add(hatBand);

  // Extended right arm holding glowing amber-crimson storm patrol lantern
  const lanternArm = new THREE.Group();
  lanternArm.position.set(0.32, 1.32, 0.08);
  bodyPivot.add(lanternArm);

  const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.52, 8), coatMat);
  armMesh.rotation.x = Math.PI * 0.38;
  armMesh.position.set(0.04, -0.06, 0.22);
  lanternArm.add(armMesh);

  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.28, 8), brassMat);
  cage.position.set(0.06, -0.18, 0.46);
  lanternArm.add(cage);

  const lampGlowMat = new THREE.MeshStandardMaterial({
    color: '#ffe0b0',
    emissive: '#ff8a3d',
    emissiveIntensity: 3.0,
    roughness: 0.18,
  });
  const lanternCore = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), lampGlowMat);
  lanternCore.position.set(0.06, -0.18, 0.46);
  lanternArm.add(lanternCore);

  // Volumetric forward lantern sight cone (attached to root so it aligns with look direction cleanly)
  const coneMat = createBeamShaderMaterial(0xff9b4a, 0.22);
  const coneMesh = new THREE.Mesh(coneGeo, coneMat);
  coneMesh.position.set(0.36, 1.12, 0.48);
  root.add(coneMesh);

  // Clear glowing ground detection footprint ahead of the watchman
  const groundConeMat = new THREE.MeshBasicMaterial({
    map: softDiscTex,
    color: 0xff8d42,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const groundCone = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 8.2), groundConeMat);
  groundCone.rotation.x = -Math.PI * 0.5;
  groundCone.position.set(0, 0.055, 4.4);
  root.add(groundCone);

  return {
    id,
    root,
    bodyPivot,
    lanternArm,
    coneMesh,
    coneMat,
    groundCone,
    groundConeMat,
    lampGlowMat,
    waypoints,
    currentWaypoint: 1,
    pauseTimer: 0,
    speed,
    yaw: 0,
    lookOffset: 0,
    walkPhase: 0,
    sightRange: 8.6,
    sightHalfAngle: 0.48,
    alertFactor: 0,
  };
}

// ---------------------------------------------------------------------------
// Noir Gameplay Controller
// ---------------------------------------------------------------------------

export interface PlayerSpotlightState {
  highBeam: boolean;
  aimWorldPos: THREE.Vector3;
  aimYawOffset: number;
  turretGroup: THREE.Group;
  spotLight: THREE.SpotLight;
  spotTarget: THREE.Object3D;
  coneMesh: THREE.Mesh;
  coneMat: THREE.ShaderMaterial;
  reticleMesh: THREE.Mesh;
  reticleMat: THREE.MeshBasicMaterial;
  keyGlow: THREE.PointLight;
}

export interface GameplayFrameResult {
  cluesCollected: number;
  totalClues: number;
  activeIlluminatedClue: ClueState | null;
  newlyCollectedClue: ClueDefinition | null;
  isSpotted: boolean;
  isShadowed: boolean;
  nearSafeLamppost: boolean;
  reachedBeacon: boolean;
  spottedIntensity: number;
}

export class NoirGameplaySystem {
  readonly group = new THREE.Group();
  readonly clues: ClueState[] = [];
  readonly searchlights: SearchlightRig[] = [];
  readonly watchmen: WatchmanRig[] = [];
  readonly spotlight: PlayerSpotlightState;
  readonly sparkBursts: ParticleSystem;
  readonly compassArrow: THREE.Mesh;
  readonly compassMat: THREE.MeshBasicMaterial;

  private readonly env: NoirEnvironment;
  private readonly coneGeo: THREE.BufferGeometry;
  private readonly clueFocusLight: THREE.PointLight;
  private readonly tmpVecA = new THREE.Vector3();
  private readonly tmpVecB = new THREE.Vector3();
  private readonly tmpWorldOrigin = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();

  constructor(scene: THREE.Scene, env: NoirEnvironment, headlightMount: THREE.Group) {
    this.env = env;
    this.group.name = 'NoirGameplaySystem';
    scene.add(this.group);

    this.coneGeo = createUnitBeamConeGeo();
    const softDiscTex = createSoftDiscTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0.28)');

    const brassMat = createPBRMaterial('brushedBrass', { tint: '#e0b05c', seed: 901 });
    const woodMat = createPBRMaterial('woodPlanks', { wet: true, tint: '#6e4e35', seed: 902 });
    const ironMat = new THREE.MeshStandardMaterial({ color: '#222831', roughness: 0.38, metalness: 0.8 });

    // -----------------------------------------------------------------------
    // 1. Steerable Halogen Detective Spotlight (mounted on rig.headlightMount)
    // -----------------------------------------------------------------------
    const turretGroup = new THREE.Group();
    turretGroup.name = 'DetectiveSpotlightTurret';
    headlightMount.add(turretGroup);

    // Twin sleek brushed-brass halogen lamp canisters
    const lampCanGeo = new THREE.CylinderGeometry(0.055, 0.068, 0.11, 14);
    lampCanGeo.rotateX(Math.PI * 0.5);
    const lensMat = new THREE.MeshStandardMaterial({
      color: '#fff8de',
      emissive: '#ffd888',
      emissiveIntensity: 3.4,
      roughness: 0.15,
    });
    for (const side of [-0.14, 0.14]) {
      const can = new THREE.Mesh(lampCanGeo, brassMat);
      can.position.set(side, 0.06, -0.02);
      turretGroup.add(can);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.048, 12), lensMat);
      lens.rotation.y = Math.PI;
      lens.position.set(side, 0.06, -0.078);
      turretGroup.add(lens);
    }

    const spotLight = new THREE.SpotLight(0xfff0cc, 14.0, 26, Math.PI / 5.4, 0.55, 1.25);
    spotLight.castShadow = false;
    spotLight.position.set(0, 0.42, 0);
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0, -8);
    scene.add(spotLight, spotTarget);
    spotLight.target = spotTarget;

    // Gentle warm close-range detective aura so figurine is always clearly lit even in shadow
    const keyGlow = new THREE.PointLight(0xffdca0, 1.65, 5.5, 1.8);
    keyGlow.position.set(0, 0.72, -0.35);
    headlightMount.add(keyGlow);

    const coneMat = createBeamShaderMaterial(0xffe9b5, 0.25);
    const coneMesh = new THREE.Mesh(this.coneGeo, coneMat);
    coneMesh.frustumCulled = false;
    this.group.add(coneMesh);

    const reticleMat = new THREE.MeshBasicMaterial({
      map: softDiscTex,
      color: 0xffe4a0,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const reticleMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), reticleMat);
    reticleMesh.rotation.x = -Math.PI * 0.5;
    reticleMesh.position.y = 0.065;
    this.group.add(reticleMesh);

    this.spotlight = {
      highBeam: true,
      aimWorldPos: new THREE.Vector3(0, 0.2, 0),
      aimYawOffset: 0,
      turretGroup,
      spotLight,
      spotTarget,
      coneMesh,
      coneMat,
      reticleMesh,
      reticleMat,
      keyGlow,
    };

    // -----------------------------------------------------------------------
    // 2. Build 5 Handcrafted 3D Clues + 1 Shared Dynamic Forensic Focus Light
    // -----------------------------------------------------------------------
    this.clueFocusLight = new THREE.PointLight(0xffcb5c, 0, 10.5, 1.6);
    this.clueFocusLight.position.set(0, 1.3, 0);
    this.group.add(this.clueFocusLight);

    const sparkTex = createSoftDiscTexture('rgba(255,244,195,1.0)', 'rgba(255,198,84,0.45)');
    for (let i = 0; i < CLUE_DEFINITIONS.length; i++) {
      const def = CLUE_DEFINITIONS[i];
      const g = new THREE.Group();
      g.position.copy(def.position);
      this.group.add(g);

      const propMesh = buildCluePropMesh(def.kind, brassMat, woodMat, ironMat);
      g.add(propMesh);

      const glintRingMat = new THREE.MeshBasicMaterial({
        color: 0xffcf66,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const glintRing = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.86, 28), glintRingMat);
      glintRing.rotation.x = -Math.PI * 0.5;
      glintRing.position.y = 0.07;
      g.add(glintRing);

      const progressRingMat = createProgressRingMaterial();
      const progressRing = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 2.35), progressRingMat);
      progressRing.rotation.x = -Math.PI * 0.5;
      progressRing.position.y = 0.085;
      g.add(progressRing);

      const beaconSparkMat = new THREE.MeshBasicMaterial({
        map: sparkTex,
        color: 0xffe296,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const beaconSpark = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), beaconSparkMat);
      beaconSpark.position.y = 0.92;
      g.add(beaconSpark);

      this.clues.push({
        def,
        group: g,
        glintRing,
        glintRingMat,
        progressRing,
        progressRingMat,
        beaconSpark,
        beaconSparkMat,
        progress: 0,
        illuminated: false,
        collected: false,
        pulsePhase: i * 1.35,
      });
    }

    // -----------------------------------------------------------------------
    // 3. Build 2 Sweeping Harbor Searchlights (West Crane + East Watchtower)
    // -----------------------------------------------------------------------
    const searchlightSpecs: {
      id: string;
      origin: THREE.Vector3;
      sweepPoints: THREE.Vector3[];
      speed: number;
      phase: number;
      radius: number;
    }[] = [
      {
        id: 'crane-searchlight',
        origin: env.craneHeadOrigin.clone(),
        sweepPoints: [
          new THREE.Vector3(-23.5, 0, -5.0),
          new THREE.Vector3(-15.5, 0, -4.5),
          new THREE.Vector3(-14.2, 0, 12.8),
          new THREE.Vector3(-22.0, 0, 5.5),
        ],
        speed: 0.24,
        phase: 0.0,
        radius: 3.1,
      },
      {
        id: 'tower-searchlight',
        origin: env.lighthouseHeadOrigin.clone(),
        sweepPoints: [
          new THREE.Vector3(23.2, 0, -4.5),
          new THREE.Vector3(14.5, 0, -4.2),
          new THREE.Vector3(15.5, 0, 14.8),
          new THREE.Vector3(22.5, 0, 5.2),
        ],
        speed: 0.22,
        phase: 1.85,
        radius: 3.15,
      },
    ];

    for (const s of searchlightSpecs) {
      const pivot = new THREE.Group();
      pivot.position.copy(s.origin);
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.62, 12), brassMat);
      housing.rotation.x = Math.PI * 0.5;
      pivot.add(housing);
      this.group.add(pivot);

      const spot = new THREE.SpotLight(0xcbe6ff, 12.0, 44, Math.PI / 7.5, 0.42, 1.1);
      spot.position.copy(s.origin);
      const tgt = new THREE.Object3D();
      tgt.position.copy(s.sweepPoints[0]);
      scene.add(spot, tgt);
      spot.target = tgt;

      const sConeMat = createBeamShaderMaterial(0xbcdfff, 0.22);
      const sCone = new THREE.Mesh(this.coneGeo, sConeMat);
      sCone.frustumCulled = false;
      this.group.add(sCone);

      const discMat = new THREE.MeshBasicMaterial({
        map: softDiscTex,
        color: 0xc2e2ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(s.radius * 2.25, s.radius * 2.25), discMat);
      disc.rotation.x = -Math.PI * 0.5;
      disc.position.y = 0.06;
      this.group.add(disc);

      this.searchlights.push({
        id: s.id,
        pivot,
        origin: s.origin.clone(),
        spotLight: spot,
        targetObj: tgt,
        coneMesh: sCone,
        coneMat: sConeMat,
        groundDisc: disc,
        groundDiscMat: discMat,
        sweepPoints: s.sweepPoints,
        speed: s.speed,
        phase: s.phase,
        radius: s.radius,
        currentTarget: s.sweepPoints[0].clone(),
        alertFactor: 0,
      });
    }

    // -----------------------------------------------------------------------
    // 4. Build 2 Patrolling Lantern Watchmen
    // -----------------------------------------------------------------------
    const westWatchman = buildWatchmanRig(
      'watchman-west',
      [
        new THREE.Vector3(-18.5, 0, -2.6),
        new THREE.Vector3(-7.6, 0, -2.6),
        new THREE.Vector3(-7.6, 0, 2.8),
        new THREE.Vector3(-18.5, 0, 2.8),
      ],
      2.25,
      ironMat,
      brassMat,
      this.coneGeo,
      softDiscTex,
    );
    this.group.add(westWatchman.root);
    this.watchmen.push(westWatchman);

    const eastWatchman = buildWatchmanRig(
      'watchman-east',
      [
        new THREE.Vector3(16.2, 0, 3.8),
        new THREE.Vector3(4.2, 0, 3.8),
        new THREE.Vector3(4.2, 0, -2.6),
        new THREE.Vector3(16.2, 0, -2.6),
      ],
      2.35,
      ironMat,
      brassMat,
      this.coneGeo,
      softDiscTex,
    );
    this.group.add(eastWatchman.root);
    this.watchmen.push(eastWatchman);

    // -----------------------------------------------------------------------
    // 5. Golden Forensic Sparkle Burst Particles + Subtle Brass Compass Chevron
    // -----------------------------------------------------------------------
    this.sparkBursts = createParticleSystem({
      type: 'sparks',
      count: 0,
      ambient: false,
      burstCapacity: 180,
      colors: [0xffdf7a, 0xffb845, 0xfff6d1],
      size: 0.14,
    });
    this.group.add(this.sparkBursts.group);

    // Subtle ground-hugging brass forensic compass chevron pointing to nearest objective
    const chevronShape = new THREE.Shape();
    chevronShape.moveTo(0, 0.34);
    chevronShape.lineTo(0.22, -0.14);
    chevronShape.lineTo(0, -0.02);
    chevronShape.lineTo(-0.22, -0.14);
    chevronShape.closePath();
    const chevronGeo = new THREE.ShapeGeometry(chevronShape);
    chevronGeo.rotateX(-Math.PI * 0.5);
    this.compassMat = new THREE.MeshBasicMaterial({
      color: 0xf4c465,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.compassArrow = new THREE.Mesh(chevronGeo, this.compassMat);
    this.compassArrow.position.y = 0.08;
    this.group.add(this.compassArrow);
  }

  reset(): void {
    this.spotlight.highBeam = true;
    this.spotlight.aimYawOffset = 0;

    for (const c of this.clues) {
      c.progress = 0;
      c.illuminated = false;
      c.collected = false;
      c.glintRing.visible = true;
      c.progressRing.visible = true;
      c.beaconSpark.visible = true;
      c.progressRingMat.uniforms.uProgress.value = 0;
      c.progressRingMat.uniforms.uOpacity.value = 0;
    }
    this.clueFocusLight.intensity = 0;

    this.env.beacon.activated = false;

    for (let i = 0; i < this.searchlights.length; i++) {
      this.searchlights[i].phase = i * 1.85;
      this.searchlights[i].alertFactor = 0;
    }

    for (const w of this.watchmen) {
      w.root.position.copy(w.waypoints[0]);
      w.currentWaypoint = 1;
      w.pauseTimer = 0;
      w.lookOffset = 0;
      w.alertFactor = 0;
    }

    this.sparkBursts.clear();
  }

  toggleHighBeam(): boolean {
    this.spotlight.highBeam = !this.spotlight.highBeam;
    return this.spotlight.highBeam;
  }

  update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    playerYaw: number,
    aimWorldTarget: THREE.Vector3,
    inspectPressed: boolean,
    cameraPos: THREE.Vector3,
    graceTimer: number,
  ): GameplayFrameResult {
    this.sparkBursts.update(dt);

    // -----------------------------------------------------------------------
    // 1. Update Steerable Halogen Detective Spotlight
    // -----------------------------------------------------------------------
    const highBeam = this.spotlight.highBeam;
    this.spotlight.turretGroup.getWorldPosition(this.tmpWorldOrigin);
    this.tmpWorldOrigin.y = Math.max(this.tmpWorldOrigin.y, 0.52);

    this.tmpDir.subVectors(aimWorldTarget, this.tmpWorldOrigin);
    this.tmpDir.y = 0;
    const rawAimDist = this.tmpDir.length();
    if (rawAimDist < 0.05) {
      this.tmpDir.set(-Math.sin(playerYaw), 0, -Math.cos(playerYaw));
    } else {
      this.tmpDir.divideScalar(rawAimDist);
    }

    // Clamp max turret yaw slightly or let it swivel freely 360° (free swivel feels super responsive!)
    const desiredWorldYaw = Math.atan2(-this.tmpDir.x, -this.tmpDir.z);
    let localYaw = desiredWorldYaw - playerYaw;
    while (localYaw > Math.PI) localYaw -= Math.PI * 2;
    while (localYaw < -Math.PI) localYaw += Math.PI * 2;
    this.spotlight.turretGroup.rotation.y = localYaw;

    const beamLength = highBeam ? 15.2 : 5.4;
    const beamRadius = highBeam ? 2.85 : 1.35;
    const clampedTargetDist = Math.min(Math.max(rawAimDist, 2.2), beamLength);

    this.spotlight.aimWorldPos.set(
      this.tmpWorldOrigin.x + this.tmpDir.x * clampedTargetDist,
      0.08,
      this.tmpWorldOrigin.z + this.tmpDir.z * clampedTargetDist,
    );

    // Position SpotLight & volumetric beam cone
    this.spotlight.spotLight.position.copy(this.tmpWorldOrigin);
    this.spotlight.spotLight.position.y += 0.25;
    this.spotlight.spotTarget.position.copy(this.spotlight.aimWorldPos);
    this.spotlight.spotLight.intensity = highBeam ? 16.0 : 4.2;
    this.spotlight.spotLight.distance = highBeam ? 27 : 11;
    this.spotlight.spotLight.angle = highBeam ? Math.PI / 5.2 : Math.PI / 7.2;

    this.spotlight.coneMesh.position.copy(this.tmpWorldOrigin);
    this.tmpVecA.copy(this.tmpWorldOrigin).addScaledVector(this.tmpDir, beamLength);
    this.tmpVecA.y = 0.05;
    this.spotlight.coneMesh.lookAt(this.tmpVecA);
    this.spotlight.coneMesh.scale.set(beamRadius, beamRadius, beamLength);
    this.spotlight.coneMat.uniforms.uOpacity.value = highBeam ? 0.26 : 0.09;
    this.spotlight.coneMat.uniforms.uTime.value = elapsed;

    this.spotlight.reticleMesh.position.set(
      this.spotlight.aimWorldPos.x,
      this.spotlight.aimWorldPos.z > 8 ? 0.075 : 0.06,
      this.spotlight.aimWorldPos.z,
    );
    const reticleSize = highBeam ? 1.15 : 0.52;
    this.spotlight.reticleMesh.scale.setScalar(reticleSize);
    this.spotlight.reticleMat.opacity = highBeam ? 0.42 : 0.16;

    this.spotlight.keyGlow.intensity = highBeam ? 1.9 : 1.15;

    // -----------------------------------------------------------------------
    // 2. Update 5 Clues (Forensic Glint, High-Beam Illumination & Inspection)
    // -----------------------------------------------------------------------
    let collectedCount = 0;
    let activeIlluminatedClue: ClueState | null = null;
    let newlyCollectedClue: ClueDefinition | null = null;

    const beamCosThreshold = Math.cos(highBeam ? 0.36 : 0.28);

    for (const c of this.clues) {
      if (c.collected) {
        collectedCount++;
        continue;
      }

      // Billboard the subtle forensic sparkle toward camera
      c.beaconSpark.lookAt(cameraPos);

      const dx = c.def.position.x - this.tmpWorldOrigin.x;
      const dz = c.def.position.z - this.tmpWorldOrigin.z;
      const dist = Math.hypot(dx, dz);

      let litByBeam = false;
      if (highBeam && dist <= beamLength + 1.2 && dist > 0.05) {
        const dot = (dx * this.tmpDir.x + dz * this.tmpDir.z) / dist;
        if (dot >= beamCosThreshold) {
          const occluded = isSegmentOccluded(
            this.tmpWorldOrigin.x,
            this.tmpWorldOrigin.z,
            c.def.position.x,
            c.def.position.z,
            this.env.colliders,
          );
          if (!occluded) {
            litByBeam = true;
          }
        }
      }
      // Close-range direct inspection works even in Stealth Low-Beam if aimed roughly toward clue or right beside it
      const closeEnough = dist <= 2.95;
      c.illuminated = litByBeam || closeEnough;

      if (c.illuminated) {
        activeIlluminatedClue = c;
        const fillRate = litByBeam ? 1 / 1.2 : 1 / 1.65;
        c.progress = Math.min(1, c.progress + dt * fillRate);
        if (inspectPressed && (litByBeam || dist <= 4.2)) {
          c.progress = 1;
        }
      } else {
        c.progress = Math.max(0, c.progress - dt * 0.55);
      }

      // Visual forensic glint feedback
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3.8 + c.pulsePhase);
      if (c.illuminated) {
        c.glintRingMat.opacity = 0.72 + 0.24 * pulse;
        c.glintRing.scale.setScalar(1.05 + 0.12 * pulse);
        c.beaconSparkMat.opacity = 0.92;
        c.beaconSpark.scale.setScalar(1.2 + 0.25 * pulse);
        c.progressRingMat.uniforms.uProgress.value = c.progress;
        c.progressRingMat.uniforms.uOpacity.value = 0.92;
      } else {
        const distFade = THREE.MathUtils.clamp(1 - dist / 30, 0.15, 0.85);
        c.glintRingMat.opacity = (0.14 + 0.18 * pulse) * distFade;
        c.glintRing.scale.setScalar(0.92 + 0.08 * pulse);
        c.beaconSparkMat.opacity = (0.24 + 0.28 * pulse) * distFade;
        c.beaconSpark.scale.setScalar(0.65 + 0.25 * pulse);
        c.progressRingMat.uniforms.uProgress.value = c.progress;
        c.progressRingMat.uniforms.uOpacity.value = c.progress > 0.02 ? 0.65 : 0;
      }

      if (c.progress >= 1) {
        c.collected = true;
        c.illuminated = false;
        c.glintRing.visible = false;
        c.progressRing.visible = false;
        c.beaconSpark.visible = false;
        collectedCount++;
        newlyCollectedClue = c.def;
        this.sparkBursts.emitBurst(
          new THREE.Vector3(c.def.position.x, c.def.position.y + 0.75, c.def.position.z),
          42,
          { speed: 4.6, upwardBias: 2.8, spread: 1.0, lifeRange: [0.55, 1.15], sizeScale: 1.3 },
        );
      }
    }

    // Drive shared dynamic forensic focus light on active or nearest clue
    if (activeIlluminatedClue) {
      this.clueFocusLight.position.set(
        activeIlluminatedClue.def.position.x,
        activeIlluminatedClue.def.position.y + 1.25,
        activeIlluminatedClue.def.position.z,
      );
      this.clueFocusLight.intensity = 4.2 + Math.sin(elapsed * 8.0) * 0.9;
    } else {
      let nearestClue: ClueState | null = null;
      let nearestDistSq = 12 * 12;
      for (const c of this.clues) {
        if (c.collected) continue;
        const d2 = c.def.position.distanceToSquared(playerPos);
        if (d2 < nearestDistSq) {
          nearestDistSq = d2;
          nearestClue = c;
        }
      }
      if (nearestClue) {
        this.clueFocusLight.position.set(
          nearestClue.def.position.x,
          nearestClue.def.position.y + 1.15,
          nearestClue.def.position.z,
        );
        this.clueFocusLight.intensity = 1.1 + 0.45 * Math.sin(elapsed * 3.5);
      } else {
        this.clueFocusLight.intensity = 0;
      }
    }

    // Activate Harbor Master's Pier Beacon once all 5 clues are decoded!
    if (collectedCount >= this.clues.length) {
      this.env.beacon.activated = true;
    }

    // -----------------------------------------------------------------------
    // 3. Update 2 Sweeping Harbor Searchlights + Detection Check
    // -----------------------------------------------------------------------
    const underAwning = isInsideAwning(playerPos.x, playerPos.z, this.env.awningZones);
    let isSpotted = false;
    let isShadowed = underAwning;
    let spottedIntensity = 0;

    for (const sl of this.searchlights) {
      sl.phase += dt * sl.speed;
      const pts = sl.sweepPoints;
      const total = pts.length;
      const u = ((sl.phase % total) + total) % total;
      const idx = Math.floor(u);
      const nextIdx = (idx + 1) % total;
      const localT = u - idx;
      // Smooth ease-in-out between patrol sweep anchors
      const smoothT = localT * localT * (3 - 2 * localT);
      sl.currentTarget.lerpVectors(pts[idx], pts[nextIdx], smoothT);

      // Update searchlight geometry & light
      sl.pivot.lookAt(sl.currentTarget);
      sl.targetObj.position.copy(sl.currentTarget);

      const distToGround = sl.origin.distanceTo(sl.currentTarget);
      sl.coneMesh.position.copy(sl.origin);
      sl.coneMesh.lookAt(sl.currentTarget);
      sl.coneMesh.scale.set(sl.radius * 1.02, sl.radius * 1.02, distToGround);
      sl.coneMat.uniforms.uTime.value = elapsed;

      sl.groundDisc.position.set(
        sl.currentTarget.x,
        sl.currentTarget.z > 8 ? 0.075 : 0.06,
        sl.currentTarget.z,
      );

      // Stealth detection check against player
      const effectiveRadius = sl.radius + (highBeam ? 1.05 : -0.35);
      const dPlayer = Math.hypot(playerPos.x - sl.currentTarget.x, playerPos.z - sl.currentTarget.z);
      let hitsThis = false;
      if (dPlayer <= effectiveRadius) {
        if (underAwning) {
          isShadowed = true;
        } else {
          // Check tall crate/planter cover between tower direction and player
          const blocked = isSegmentOccluded(
            sl.origin.x,
            sl.origin.z,
            playerPos.x,
            playerPos.z,
            this.env.colliders,
          );
          if (blocked) {
            isShadowed = true;
          } else if (graceTimer <= 0) {
            hitsThis = true;
            isSpotted = true;
            spottedIntensity = Math.max(spottedIntensity, 1 - dPlayer / (effectiveRadius + 0.5));
          }
        }
      }

      sl.alertFactor += ((hitsThis ? 1 : 0) - sl.alertFactor) * (1 - Math.exp(-8 * dt));
      const beamColor = this.tmpVecB.set(
        THREE.MathUtils.lerp(0.74, 1.0, sl.alertFactor),
        THREE.MathUtils.lerp(0.88, 0.34, sl.alertFactor),
        THREE.MathUtils.lerp(1.0, 0.28, sl.alertFactor),
      );
      sl.spotLight.color.setRGB(beamColor.x, beamColor.y, beamColor.z);
      (sl.coneMat.uniforms.uColor.value as THREE.Color).setRGB(beamColor.x, beamColor.y, beamColor.z);
      sl.coneMat.uniforms.uOpacity.value = 0.2 + sl.alertFactor * 0.16;
      sl.groundDiscMat.color.setRGB(beamColor.x, beamColor.y, beamColor.z);
      sl.groundDiscMat.opacity = 0.48 + sl.alertFactor * 0.32;
    }

    // -----------------------------------------------------------------------
    // 4. Update 2 Patrolling Lantern Watchmen + Line-of-Sight Detection
    // -----------------------------------------------------------------------
    for (const w of this.watchmen) {
      const targetWp = w.waypoints[w.currentWaypoint];
      const dx = targetWp.x - w.root.position.x;
      const dz = targetWp.z - w.root.position.z;
      const dist = Math.hypot(dx, dz);

      if (w.pauseTimer > 0) {
        w.pauseTimer -= dt;
        // Look gently left and right while pausing at a corner
        w.lookOffset = Math.sin(w.pauseTimer * 2.8) * 0.55;
      } else if (dist < 0.25) {
        w.currentWaypoint = (w.currentWaypoint + 1) % w.waypoints.length;
        w.pauseTimer = 1.35;
      } else {
        const desiredYaw = Math.atan2(dx, dz);
        let diff = desiredYaw - w.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        w.yaw += diff * Math.min(1, dt * 5.5);
        w.lookOffset *= Math.exp(-6 * dt);

        const step = Math.min(dist, w.speed * dt);
        w.root.position.x += (dx / dist) * step;
        w.root.position.z += (dz / dist) * step;
        w.walkPhase += dt * 7.2;
      }

      const facingYaw = w.yaw + w.lookOffset;
      w.root.rotation.y = facingYaw;
      w.bodyPivot.position.y = Math.abs(Math.sin(w.walkPhase)) * 0.055;
      w.bodyPivot.rotation.z = Math.sin(w.walkPhase) * 0.04;
      w.lanternArm.rotation.x = Math.sin(w.walkPhase) * 0.12;

      // Orient watchman lantern volumetric cone forward along local +Z
      w.coneMesh.rotation.set(0.11, 0, 0);
      w.coneMesh.scale.set(2.35, 2.35, w.sightRange);
      w.coneMat.uniforms.uTime.value = elapsed;

      // Check player inside watchman's sight cone
      const px = playerPos.x - w.root.position.x;
      const pz = playerPos.z - w.root.position.z;
      const pDist = Math.hypot(px, pz);
      const effectiveRange = w.sightRange + (highBeam ? 2.4 : -0.6);
      const effectiveAngle = w.sightHalfAngle + (highBeam ? 0.09 : -0.04);

      let seesPlayer = false;
      if (pDist < effectiveRange && pDist > 0.05) {
        const fx = Math.sin(facingYaw);
        const fz = Math.cos(facingYaw);
        const dot = (px * fx + pz * fz) / pDist;
        if (dot >= Math.cos(effectiveAngle) || pDist < 1.85) {
          const occluded = isSegmentOccluded(
            w.root.position.x,
            w.root.position.z,
            playerPos.x,
            playerPos.z,
            this.env.colliders,
          );
          if (occluded) {
            isShadowed = true;
          } else if (graceTimer <= 0) {
            seesPlayer = true;
            isSpotted = true;
            spottedIntensity = Math.max(spottedIntensity, 1 - pDist / (effectiveRange + 0.5));
          }
        }
      }

      w.alertFactor += ((seesPlayer ? 1 : 0) - w.alertFactor) * (1 - Math.exp(-8 * dt));
      const r = THREE.MathUtils.lerp(1.0, 1.0, w.alertFactor);
      const g = THREE.MathUtils.lerp(0.62, 0.22, w.alertFactor);
      const b = THREE.MathUtils.lerp(0.28, 0.2, w.alertFactor);
      (w.coneMat.uniforms.uColor.value as THREE.Color).setRGB(r, g, b);
      w.coneMat.uniforms.uOpacity.value = 0.21 + w.alertFactor * 0.18;
      w.groundConeMat.color.setRGB(r, g, b);
      w.groundConeMat.opacity = 0.28 + w.alertFactor * 0.34;
      w.lampGlowMat.emissive.setRGB(r, g, b);
    }

    // -----------------------------------------------------------------------
    // 5. Safe Lamppost Proximity + Subtle Forensic Compass Chevron + Beacon
    // -----------------------------------------------------------------------
    let nearSafeLamppost = false;
    for (const lp of this.env.lampposts) {
      if (lp.position.distanceToSquared(playerPos) <= 18.5) {
        nearSafeLamppost = true;
        break;
      }
    }

    // Point subtle ground compass chevron toward nearest uncollected clue (or Beacon once 5/5!)
    let targetObjective: THREE.Vector3 | null = null;
    if (this.env.beacon.activated) {
      targetObjective = this.env.beacon.position;
      this.compassMat.color.setHex(0x6ff0a8);
      this.compassMat.opacity = 0.65 + 0.25 * Math.sin(elapsed * 5.0);
    } else {
      let bestD2 = Infinity;
      for (const c of this.clues) {
        if (c.collected) continue;
        const d2 = c.def.position.distanceToSquared(playerPos);
        if (d2 < bestD2) {
          bestD2 = d2;
          targetObjective = c.def.position;
        }
      }
      this.compassMat.color.setHex(0xf4c465);
      this.compassMat.opacity = 0.42 + 0.16 * Math.sin(elapsed * 3.2);
    }

    if (targetObjective) {
      const ox = targetObjective.x - playerPos.x;
      const oz = targetObjective.z - playerPos.z;
      const oDist = Math.hypot(ox, oz);
      this.compassArrow.visible = oDist > 2.4;
      if (oDist > 0.1) {
        const ang = Math.atan2(ox, oz);
        this.compassArrow.position.set(
          playerPos.x + (ox / oDist) * 1.48,
          playerPos.z > 8 ? 0.085 : 0.07,
          playerPos.z + (oz / oDist) * 1.48,
        );
        this.compassArrow.rotation.y = ang + Math.PI;
      }
    } else {
      this.compassArrow.visible = false;
    }

    const reachedBeacon =
      this.env.beacon.activated &&
      Math.hypot(playerPos.x - this.env.beacon.position.x, playerPos.z - this.env.beacon.position.z) <=
        this.env.beacon.radius;

    return {
      cluesCollected: collectedCount,
      totalClues: this.clues.length,
      activeIlluminatedClue,
      newlyCollectedClue,
      isSpotted,
      isShadowed,
      nearSafeLamppost,
      reachedBeacon,
      spottedIntensity,
    };
  }

  getRemainingHint(): string {
    if (this.env.beacon.activated) {
      return 'All 5 clues decoded — race to the East Pier Beacon!';
    }
    const next = this.clues.find((c) => !c.collected);
    return next ? `Lead: ${next.def.locationHint}` : 'Investigate the quay';
  }

  dispose(): void {
    this.sparkBursts.dispose();
  }
}

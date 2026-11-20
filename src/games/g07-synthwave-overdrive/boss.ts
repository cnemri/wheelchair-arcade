import * as THREE from 'three';
import { BOSS_PHASES, COLORS, getLaneX } from './constants';

export interface InterceptorBoss {
  group: THREE.Group;
  readonly shieldsRemaining: number;
  readonly defeated: boolean;
  /** World position of the boss core for EMP shockwave impact / explosion bursts */
  getCoreWorldPosition(out: THREE.Vector3): THREE.Vector3;
  /** Trigger boss attack telegraph beam pointing down toward target lanes */
  telegraphAttack(targetLanes: number[]): void;
  /** Shatter one boss shield phase via EMP Overdrive Pulse. Returns true if boss was defeated! */
  applyEmpHit(): boolean;
  update(
    dt: number,
    elapsed: number,
    opts: {
      playerX: number;
      beatPulse: number;
      overdrive: boolean;
    }
  ): void;
  reset(): void;
}

/**
 * Multi-part geometric Synth Interceptor Boss hovering ahead on the Outrun horizon:
 * - Faceted obsidian-chrome octahedral core + glowing cyan scanning eye
 * - 3 concentric rotating gyroscopic chrome shield rings (1 shatters per EMP hit!)
 * - Twin articulated swept wing pods with glowing thruster vents & lane telegraph lasers
 */
export function createInterceptorBoss(): InterceptorBoss {
  const group = new THREE.Group();
  group.name = 'SynthInterceptorBoss';
  group.position.set(0, 5.4, -56);

  const obsidianMat = new THREE.MeshStandardMaterial({
    color: 0x160f2e,
    metalness: 0.84,
    roughness: 0.22,
    envMapIntensity: 1.75,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: COLORS.chrome,
    metalness: 0.94,
    roughness: 0.12,
    envMapIntensity: 2.0,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: COLORS.cyan,
    emissive: COLORS.cyan,
    emissiveIntensity: 3.2,
    roughness: 0.15,
  });
  const wingNeonMat = new THREE.MeshStandardMaterial({
    color: COLORS.magenta,
    emissive: COLORS.magenta,
    emissiveIntensity: 2.4,
    roughness: 0.2,
  });

  // 1. Central Core Assembly
  const corePivot = new THREE.Group();
  group.add(corePivot);

  const coreHull = new THREE.Mesh(new THREE.OctahedronGeometry(2.05, 0), obsidianMat);
  coreHull.scale.set(1.18, 0.95, 1.05);
  corePivot.add(coreHull);

  // Inner faceted chrome cage
  const cageWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.OctahedronGeometry(2.16, 0)),
    new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.85 })
  );
  cageWire.scale.set(1.18, 0.95, 1.05);
  corePivot.add(cageWire);

  // Glowing Cyan Scanning Eye facing the player (+Z)
  const eyeSocket = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.05, 0.42, 16), chromeMat);
  eyeSocket.rotation.x = Math.PI * 0.5;
  eyeSocket.position.set(0, 0, 1.72);
  corePivot.add(eyeSocket);

  const eyeCore = new THREE.Mesh(new THREE.SphereGeometry(0.72, 18, 14), eyeMat);
  eyeCore.scale.set(1, 0.72, 0.52);
  eyeCore.position.set(0, 0, 1.88);
  corePivot.add(eyeCore);

  // 2. Three Concentric Orbital Chrome Shield Rings (1 per Boss Phase)
  const shieldRings: THREE.Group[] = [];
  const ringMats: THREE.MeshStandardMaterial[] = [];
  const ringSpecs = [
    { radius: 3.15, tube: 0.12, color: COLORS.cyan, tiltX: 0.42, tiltZ: 0.25 },
    { radius: 3.85, tube: 0.13, color: COLORS.magenta, tiltX: -0.52, tiltZ: -0.35 },
    { radius: 4.55, tube: 0.14, color: COLORS.gold, tiltX: 0.26, tiltZ: -0.58 },
  ];

  for (let i = 0; i < BOSS_PHASES; i++) {
    const spec = ringSpecs[i];
    const ringGroup = new THREE.Group();
    const ringGlowMat = new THREE.MeshStandardMaterial({
      color: spec.color,
      emissive: spec.color,
      emissiveIntensity: 2.3,
      roughness: 0.2,
      metalness: 0.4,
    });
    ringMats.push(ringGlowMat);

    const outerChrome = new THREE.Mesh(new THREE.TorusGeometry(spec.radius, spec.tube, 10, 36), chromeMat);
    const innerNeon = new THREE.Mesh(
      new THREE.TorusGeometry(spec.radius - 0.16, spec.tube * 0.55, 8, 36),
      ringGlowMat
    );
    ringGroup.add(outerChrome, innerNeon);

    // 4 geometric node pylons around each ring
    const nodeGeo = new THREE.OctahedronGeometry(0.28, 0);
    for (let n = 0; n < 4; n++) {
      const a = (n / 4) * Math.PI * 2;
      const node = new THREE.Mesh(nodeGeo, ringGlowMat);
      node.position.set(Math.cos(a) * spec.radius, Math.sin(a) * spec.radius, 0);
      ringGroup.add(node);
    }

    ringGroup.rotation.set(spec.tiltX, 0, spec.tiltZ);
    group.add(ringGroup);
    shieldRings.push(ringGroup);
  }

  // 3. Twin Articulated Swept Wing Pods
  const leftWing = new THREE.Group();
  const rightWing = new THREE.Group();
  const wingBodyGeo = new THREE.BoxGeometry(3.4, 0.55, 1.9);
  const wingBladeGeo = new THREE.ConeGeometry(0.65, 3.4, 4);
  const wingNeonGeo = new THREE.BoxGeometry(3.1, 0.16, 0.2);
  const emitterGeo = new THREE.CylinderGeometry(0.24, 0.34, 1.35, 10);
  emitterGeo.rotateX(Math.PI * 0.5);

  for (const side of [-1, 1] as const) {
    const wing = side < 0 ? leftWing : rightWing;

    const strut = new THREE.Mesh(wingBodyGeo, obsidianMat);
    strut.position.set(side * 4.4, 0.25, -0.2);
    strut.rotation.z = side * -0.24;
    strut.rotation.y = side * 0.18;
    wing.add(strut);

    const blade = new THREE.Mesh(wingBladeGeo, chromeMat);
    blade.rotation.z = side * -Math.PI * 0.5;
    blade.position.set(side * 6.5, -0.35, -0.3);
    wing.add(blade);

    const neonBar = new THREE.Mesh(wingNeonGeo, wingNeonMat);
    neonBar.position.set(side * 4.45, 0.28, 0.8);
    neonBar.rotation.z = side * -0.24;
    neonBar.rotation.y = side * 0.18;
    wing.add(neonBar);

    const emitter = new THREE.Mesh(emitterGeo, chromeMat);
    emitter.position.set(side * 4.2, -0.65, 0.85);
    wing.add(emitter);

    const emitterTip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), wingNeonMat);
    emitterTip.position.set(side * 4.2, -0.65, 1.55);
    wing.add(emitterTip);

    group.add(wing);
  }

  // 4. Telegraph Targeting Beams (brief laser pointers when launching a wave/barrier)
  const telegraphBeams: THREE.Mesh[] = [];
  const beamGeo = new THREE.CylinderGeometry(0.08, 0.26, 26, 8, 1, true);
  beamGeo.translate(0, -13, 0);
  beamGeo.rotateX(-Math.PI * 0.5);
  const beamMat = new THREE.MeshBasicMaterial({
    color: COLORS.magenta,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.visible = false;
    group.add(b);
    telegraphBeams.push(b);
  }

  // Dynamic Boss state
  let shieldsRemaining = BOSS_PHASES;
  let defeated = false;
  let stunTimer = 0;
  let recoilZ = 0;
  let defeatTimer = 0;
  let telegraphTimer = 0;
  let smoothX = 0;

  const telegraphAttack = (targetLanes: number[]): void => {
    if (defeated) return;
    telegraphTimer = 0.55;
    for (let i = 0; i < telegraphBeams.length; i++) {
      const b = telegraphBeams[i];
      if (i < targetLanes.length) {
        const laneX = getLaneX(targetLanes[i]);
        const fromX = i % 2 === 0 ? -4.2 : 4.2;
        b.position.set(fromX, -0.65, 1.5);
        b.lookAt(laneX, 0.4, -26);
        b.visible = true;
      } else {
        b.visible = false;
      }
    }
  };

  const applyEmpHit = (): boolean => {
    if (defeated) return false;
    shieldsRemaining = Math.max(0, shieldsRemaining - 1);
    stunTimer = 2.0;
    recoilZ = -12;

    // Hide the outermost remaining shield ring immediately
    const ringIdx = shieldsRemaining;
    if (shieldRings[ringIdx]) {
      shieldRings[ringIdx].visible = false;
    }

    if (shieldsRemaining <= 0) {
      defeated = true;
      defeatTimer = 0.001;
      for (const b of telegraphBeams) b.visible = false;
      return true;
    }
    return false;
  };

  const update = (
    dt: number,
    elapsed: number,
    opts: {
      playerX: number;
      beatPulse: number;
      overdrive: boolean;
    }
  ): void => {
    const { playerX, beatPulse, overdrive } = opts;

    if (defeated) {
      defeatTimer += dt;
      // Dramatic tumbling implosion & vanish into the sunset horizon
      const t = Math.min(1, defeatTimer / 1.8);
      group.position.z = -56 - t * 38;
      group.position.y = 5.4 + Math.sin(t * Math.PI) * 3.5 - t * 4.0;
      group.rotation.z += dt * 4.5;
      group.rotation.x += dt * 2.8;
      const scale = Math.max(0.001, 1 - t * t);
      group.scale.setScalar(scale);
      group.visible = t < 0.99;
      return;
    }

    group.visible = true;
    group.scale.setScalar(1);

    // Track player smoothly across the horizon while weaving rhythmically
    const targetX = playerX * 0.42 + Math.sin(elapsed * 1.15) * 3.2;
    smoothX += (targetX - smoothX) * (1 - Math.exp(-3.4 * dt));

    // Recover from EMP recoil
    recoilZ += (0 - recoilZ) * (1 - Math.exp(-3.2 * dt));
    if (stunTimer > 0) {
      stunTimer = Math.max(0, stunTimer - dt);
    }

    const phaseIntensity = 1 + (BOSS_PHASES - shieldsRemaining) * 0.42;
    const hoverY = 5.35 + Math.sin(elapsed * 2.2) * 0.55 + beatPulse * 0.22;
    const baseZ = -56 + Math.sin(elapsed * 0.85) * 3.5 + recoilZ;

    group.position.set(smoothX, hoverY, baseZ);

    // Stun jitter vs sleek menacing bank
    if (stunTimer > 0) {
      const s = stunTimer / 2.0;
      group.rotation.z = Math.sin(elapsed * 32) * 0.34 * s;
      group.rotation.x = Math.cos(elapsed * 26) * 0.22 * s;
      eyeMat.emissive.setHex(Math.floor(elapsed * 24) % 2 === 0 ? 0xffffff : COLORS.crimson);
      eyeMat.emissiveIntensity = 4.5;
    } else {
      group.rotation.z = (smoothX - targetX) * 0.04;
      group.rotation.x = 0.08 + Math.sin(elapsed * 1.7) * 0.05;
      const eyeHex = shieldsRemaining === 1 ? COLORS.crimson : shieldsRemaining === 2 ? COLORS.magenta : COLORS.cyan;
      eyeMat.emissive.setHex(eyeHex);
      eyeMat.emissiveIntensity = 2.6 + beatPulse * 1.6 + (overdrive ? 0.8 : 0);
    }

    // Core slow pulse & eye tracking
    corePivot.rotation.y = THREE.MathUtils.clamp((playerX - smoothX) * 0.06, -0.45, 0.45);
    const coreScale = 1 + beatPulse * 0.065;
    corePivot.scale.setScalar(coreScale);

    // Wing pod subtle articulated beat-flapping
    const wingAngle = Math.sin(elapsed * 3.0) * 0.07 + beatPulse * 0.08;
    leftWing.rotation.z = wingAngle;
    rightWing.rotation.z = -wingAngle;
    wingNeonMat.emissiveIntensity = 2.0 + beatPulse * 1.6 + (telegraphTimer > 0 ? 2.2 : 0);

    // Spin active gyroscopic chrome shield rings faster on each phase
    for (let i = 0; i < shieldRings.length; i++) {
      const ring = shieldRings[i];
      if (!ring.visible) continue;
      const dir = i % 2 === 0 ? 1 : -1;
      ring.rotation.z += dt * dir * (1.2 + i * 0.45) * phaseIntensity;
      ring.rotation.y += dt * -dir * (0.65 + i * 0.28) * phaseIntensity;
      ringMats[i].emissiveIntensity = 1.9 + beatPulse * 1.4;
    }

    // Fade attack telegraph laser beams
    if (telegraphTimer > 0) {
      telegraphTimer = Math.max(0, telegraphTimer - dt);
      beamMat.opacity = (telegraphTimer / 0.55) * 0.62;
      if (telegraphTimer <= 0) {
        for (const b of telegraphBeams) b.visible = false;
      }
    }
  };

  const reset = (): void => {
    shieldsRemaining = BOSS_PHASES;
    defeated = false;
    stunTimer = 0;
    recoilZ = 0;
    defeatTimer = 0;
    telegraphTimer = 0;
    smoothX = 0;
    group.visible = true;
    group.scale.setScalar(1);
    group.rotation.set(0, 0, 0);
    group.position.set(0, 5.4, -56);
    for (const r of shieldRings) r.visible = true;
    for (const b of telegraphBeams) b.visible = false;
  };

  return {
    group,
    get shieldsRemaining() {
      return shieldsRemaining;
    },
    get defeated() {
      return defeated;
    },
    getCoreWorldPosition(out: THREE.Vector3) {
      return group.getWorldPosition(out);
    },
    telegraphAttack,
    applyEmpHit,
    update,
    reset,
  };
}

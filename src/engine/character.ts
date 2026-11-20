import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SHARED_RESOURCE_FLAG } from './sceneHost';
import type { FigurineMotionState, FigurineRig, FigurineRigOptions } from './types';

const MODEL_URL = '/models/me_3d_game_ready.glb';

// Exact verified metrics from GLB inspection:
// Raw BBox: min [-0.34024, 0.0, -0.47668], max [+0.34024, 1.26928, +0.44741]
// Front = +Z, Up = +Y, Character Left = +X, Right (joystick) = -X.
const RAW_WIDTH = 0.68048;
const RAW_HEIGHT = 1.26928;
const RAW_DEPTH = 0.92409;
const RAW_REAR_WHEEL_RADIUS = 0.159;
const RAW_CASTER_WHEEL_RADIUS = 0.087;
const RAW_ANTITIP_WHEEL_RADIUS = 0.03;
const RAW_HALF_TRACK = 0.284;

const CHAIR_METAL_MATS = new Set([
  'Mat_BlackHousing',
  'Mat_FrameMetal',
  'Mat_V11_ChairBlack',
  'Mat_V11_Rim',
  'Mat_V11_Aluminium',
]);

const ORGANIC_MATS = new Set([
  'Mat_V11_Body',
  'Mat_V11_Head',
  'Mat_Hands',
  'Mat_Eyelid',
  'Mat_Collar',
  'Mat_ShirtCuff',
  'Mat_ShirtFront',
  'Mat_KnitCuff',
  'Mat_NeckRib',
]);

let cachedGltfPromise: Promise<GLTF> | null = null;

/**
 * Loads `/models/me_3d_game_ready.glb` once and caches the parsed GLTF.
 * Shared geometries and textures are marked with `SHARED_RESOURCE_FLAG` so
 * scene disposal between games never frees the cached figurine template.
 */
export function loadFigurineTemplate(url = MODEL_URL): Promise<GLTF> {
  if (!cachedGltfPromise) {
    const loader = new GLTFLoader();
    cachedGltfPromise = loader.loadAsync(url).then((gltf) => {
      gltf.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          if (mesh.geometry) {
            mesh.geometry.userData[SHARED_RESOURCE_FLAG] = true;
          }
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            if (!mat) continue;
            mat.userData[SHARED_RESOURCE_FLAG] = true;
            for (const value of Object.values(mat)) {
              if (
                value &&
                typeof value === 'object' &&
                'isTexture' in value &&
                (value as THREE.Texture).isTexture
              ) {
                const tex = value as THREE.Texture;
                tex.userData[SHARED_RESOURCE_FLAG] = true;
                tex.anisotropy = Math.max(tex.anisotropy || 1, 8);
              }
            }
          }
        }
      });
      return gltf;
    });
  }
  return cachedGltfPromise;
}

interface BoneRecord {
  bone: THREE.Object3D;
  restRot: THREE.Euler;
}

/**
 * Instantiates a fresh, independently rigged & animated Wheelchair Figurine.
 * - `root`: positioned at ground level (`y = 0` flush under tires), facing `-Z` (Three.js forward).
 * - `model`: inner pivot for procedural suspension pitch/roll/bounce without fighting `root` yaw/pos.
 */
export async function createFigurineRig(options: FigurineRigOptions = {}): Promise<FigurineRig> {
  const {
    targetHeight = 1.65,
    headlights = false,
    boostGlow = false,
    envMapIntensity = 1.0,
    castShadow = true,
    receiveShadow = true,
  } = options;

  const gltf = await loadFigurineTemplate();
  const clone = SkeletonUtils.clone(gltf.scene);

  const scale = targetHeight / RAW_HEIGHT;
  const dimensions = new THREE.Vector3(
    RAW_WIDTH * scale,
    RAW_HEIGHT * scale,
    RAW_DEPTH * scale
  );

  // Hierarchy: root (world pos/yaw, -Z forward) -> model (spring pitch/roll/bounce) -> visual (rotated PI to face -Z & scaled)
  const root = new THREE.Group();
  root.name = 'FigurineRoot';

  const model = new THREE.Group();
  model.name = 'FigurineModelPivot';
  root.add(model);

  const visual = new THREE.Group();
  visual.name = 'FigurineNormalizedVisual';
  visual.scale.setScalar(scale);
  visual.rotation.y = Math.PI; // Raw +Z front -> -Z standard Three.js forward
  visual.add(clone);
  model.add(visual);

  // Clone lightweight materials per rig (textures & geometries remain shared!) and configure shadows/PBR
  const ownedMaterials: THREE.Material[] = [];
  const ownedGeometries: THREE.BufferGeometry[] = [];
  const matCache = new Map<THREE.Material, THREE.Material>();

  const morphRefs: {
    head?: THREE.SkinnedMesh;
    eyelids?: THREE.SkinnedMesh;
  } = {};

  clone.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;

    const isGlassLens = mesh.name === 'Mesh_Glasses';
    mesh.castShadow = isGlassLens ? false : castShadow;
    mesh.receiveShadow = isGlassLens ? false : receiveShadow;
    // Prevent skinned mesh culling artifacts during dramatic jumps/tilts
    mesh.frustumCulled = false;

    if (mesh.name === 'Mesh_Head') morphRefs.head = mesh;
    if (mesh.name === 'Mesh_Eyelids_Blink') morphRefs.eyelids = mesh;

    const cloneMat = (src: THREE.Material): THREE.Material => {
      const existing = matCache.get(src);
      if (existing) return existing;
      const m = src.clone();
      delete m.userData[SHARED_RESOURCE_FLAG];

      if (m instanceof THREE.MeshStandardMaterial) {
        if (m.name === 'Mat_GlassesLens' || isGlassLens) {
          m.depthWrite = false;
          m.envMapIntensity = 1.25 * envMapIntensity;
        } else if (CHAIR_METAL_MATS.has(m.name)) {
          m.envMapIntensity = 1.35 * envMapIntensity;
          if (m instanceof THREE.MeshPhysicalMaterial && m.clearcoat === 0) {
            m.clearcoat = 0.24;
            m.clearcoatRoughness = 0.28;
          }
        } else if (ORGANIC_MATS.has(m.name)) {
          m.envMapIntensity = 0.8 * envMapIntensity;
        } else {
          m.envMapIntensity = 1.0 * envMapIntensity;
        }
      }

      matCache.set(src, m);
      ownedMaterials.push(m);
      return m;
    };

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(cloneMat);
    } else if (mesh.material) {
      mesh.material = cloneMat(mesh.material);
    }
  });

  // Look up key animatable bones and cache their bind-pose Euler angles
  const findBone = (name: string): BoneRecord | null => {
    const found = clone.getObjectByName(name);
    if (!found) return null;
    return { bone: found, restRot: found.rotation.clone() };
  };

  const wheelRearL = findBone('Wheel_Rear_L');
  const wheelRearR = findBone('Wheel_Rear_R');
  const casterWheelL = findBone('Caster_Wheel_L');
  const casterWheelR = findBone('Caster_Wheel_R');
  const casterSwivelL = findBone('Caster_Swivel_L');
  const casterSwivelR = findBone('Caster_Swivel_R');
  const antiTipL = findBone('AntiTip_Wheel_L');
  const antiTipR = findBone('AntiTip_Wheel_R');
  const joystickBone = findBone('Joystick_Stick');
  const headBone = findBone('Head');
  const spineBone = findBone('Spine');
  const chestBone = findBone('Chest');

  // Morph target indices
  const blinkIdx = morphRefs.eyelids?.morphTargetDictionary?.['Blink'];
  const smileIdx = morphRefs.head?.morphTargetDictionary?.['Smile'];
  const browIdx = morphRefs.head?.morphTargetDictionary?.['Brow_Raise'];

  // Front headlight & rear boost mounts attached to `model` so they lean naturally with the chassis
  const headlightMount = new THREE.Group();
  headlightMount.name = 'FigurineHeadlightMount';
  headlightMount.position.set(0, 0.34 * scale, -0.34 * scale);
  model.add(headlightMount);

  const rearMount = new THREE.Group();
  rearMount.name = 'FigurineRearMount';
  rearMount.position.set(0, 0.28 * scale, 0.44 * scale);
  model.add(rearMount);

  const headlightLights: THREE.SpotLight[] = [];
  const headlightBulbs: THREE.MeshStandardMaterial[] = [];

  if (headlights) {
    const lampGeo = new THREE.CylinderGeometry(0.032, 0.038, 0.05, 12);
    lampGeo.rotateX(Math.PI / 2);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x22252a,
      roughness: 0.4,
      metalness: 0.7,
    });
    const bulbGeo = new THREE.SphereGeometry(0.026, 12, 10);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff4d6,
      emissive: 0xffd996,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });
    ownedGeometries.push(lampGeo, bulbGeo);
    ownedMaterials.push(housingMat, bulbMat);
    headlightBulbs.push(bulbMat);

    for (const side of [-1, 1]) {
      const lamp = new THREE.Group();
      lamp.position.set(side * 0.22 * scale, 0, 0);

      const housing = new THREE.Mesh(lampGeo, housingMat);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.z = -0.02;
      lamp.add(housing, bulb);

      const spot = new THREE.SpotLight(0xffe7b8, 3.2, 26, Math.PI / 4.2, 0.55, 1.3);
      spot.position.set(0, 0.03, -0.04);
      const target = new THREE.Object3D();
      target.position.set(side * 0.15, -0.25, -8.5);
      lamp.add(spot, target);
      spot.target = target;

      headlightLights.push(spot);
      headlightMount.add(lamp);
    }
  }

  let boostCoreMat: THREE.MeshBasicMaterial | null = null;
  let boostCoreMesh: THREE.Mesh | null = null;
  let boostLight: THREE.PointLight | null = null;

  if (boostGlow) {
    const coreGeo = new THREE.ConeGeometry(0.11, 0.42, 14, 1, true);
    coreGeo.rotateX(-Math.PI / 2);
    coreGeo.translate(0, 0, 0.21);
    boostCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffa64d,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    boostCoreMesh = new THREE.Mesh(coreGeo, boostCoreMat);
    boostCoreMesh.visible = false;
    rearMount.add(boostCoreMesh);

    boostLight = new THREE.PointLight(0xff9944, 0, 5.5, 1.8);
    boostLight.position.set(0, 0.05, 0.25);
    rearMount.add(boostLight);

    ownedGeometries.push(coreGeo);
    ownedMaterials.push(boostCoreMat);
  }

  // Scaled wheel kinematics
  const rearWheelRadius = RAW_REAR_WHEEL_RADIUS * scale;
  const casterWheelRadius = RAW_CASTER_WHEEL_RADIUS * scale;
  const antiTipRadius = RAW_ANTITIP_WHEEL_RADIUS * scale;
  const halfTrack = RAW_HALF_TRACK * scale;

  // Procedural spring-damped animation state
  let prevSpeed = 0;
  let pitch = 0;
  let pitchVel = 0;
  let roll = 0;
  let rollVel = 0;
  let bounceY = 0;
  let bounceVel = 0;
  let rumblePhase = 0;
  let breathPhase = Math.random() * Math.PI * 2;

  let rearSpinL = 0;
  let rearSpinR = 0;
  let casterSpinL = 0;
  let casterSpinR = 0;
  let antiTipSpinL = 0;
  let antiTipSpinR = 0;
  let swivelAngle = 0;
  let joyPitch = 0;
  let joyRoll = 0;
  let headYaw = 0;
  let boostAmount = 0;

  // Natural blinking & subtle expression state
  let blinkTimer = 1.6 + Math.random() * 2.5;
  let blinkElapsed = -1;
  let smileValue = 0.08;
  let browValue = 0;

  const update = (dt: number, state: FigurineMotionState): void => {
    const safeDt = Math.min(Math.max(dt, 0.0001), 0.05);
    const {
      speed,
      turnRate,
      groundBump = 0,
      boost = false,
      airborne = false,
      tiltX = 0,
      tiltZ = 0,
    } = state;

    // 1. Longitudinal acceleration for nose-up / brake-dip spring dynamics
    const accel = (speed - prevSpeed) / safeDt;
    prevSpeed = speed;
    const clampedAccel = Math.max(-24, Math.min(24, accel));

    // Nose up (+X in -Z-forward frame!) when accelerating or boosting; nose dip on brake
    const targetPitch =
      THREE.MathUtils.clamp(clampedAccel * 0.0045 + (boost ? 0.055 : 0), -0.14, 0.15) + tiltX;

    // Lean slightly outward or carve smoothly with turn rate (subtle weight shift)
    const speedFactor = Math.min(1, Math.abs(speed) / 6 + 0.25);
    const targetRoll =
      THREE.MathUtils.clamp(-turnRate * 0.055 * speedFactor, -0.16, 0.16) + tiltZ;

    // Second-order spring-damper for juicy suspension feel
    const pitchStiff = 88;
    const pitchDamp = 13.5;
    pitchVel += ((targetPitch - pitch) * pitchStiff - pitchVel * pitchDamp) * safeDt;
    pitch += pitchVel * safeDt;

    const rollStiff = 82;
    const rollDamp = 13.0;
    rollVel += ((targetRoll - roll) * rollStiff - rollVel * rollDamp) * safeDt;
    roll += rollVel * safeDt;

    // Vertical suspension bounce + high-frequency tire rumble
    if (groundBump !== 0) {
      bounceVel += groundBump * 2.6;
    }
    const bounceStiff = 125;
    const bounceDamp = 14.5;
    bounceVel += (-bounceY * bounceStiff - bounceVel * bounceDamp) * safeDt;
    bounceY = THREE.MathUtils.clamp(bounceY + bounceVel * safeDt, -0.06, 0.11);

    const absSpeed = Math.abs(speed);
    rumblePhase += safeDt * (11 + absSpeed * 2.8);
    const rumbleAmp = airborne ? 0 : Math.min(0.009, absSpeed * 0.0011) * (boost ? 1.5 : 1);
    const rumbleY = Math.sin(rumblePhase) * rumbleAmp;
    const rumbleRoll = Math.cos(rumblePhase * 0.73) * rumbleAmp * 1.4;

    model.position.y = Math.max(-0.025, bounceY + rumbleY);
    model.rotation.x = pitch;
    model.rotation.z = roll + rumbleRoll;

    // 2. Differential wheel rotation (exact speed-matched rolling!)
    // In -Z forward space, turning left (turnRate > 0) puts Left wheels on inside, Right on outside.
    const vL = speed - turnRate * halfTrack;
    const vR = speed + turnRate * halfTrack;
    const airDrag = airborne ? 0.25 : 1;

    rearSpinL += ((vL / rearWheelRadius) * safeDt) * airDrag;
    rearSpinR += ((vR / rearWheelRadius) * safeDt) * airDrag;
    casterSpinL += ((vL / casterWheelRadius) * safeDt) * airDrag;
    casterSpinR += ((vR / casterWheelRadius) * safeDt) * airDrag;
    antiTipSpinL += ((vL / antiTipRadius) * safeDt) * airDrag * 0.4;
    antiTipSpinR += ((vR / antiTipRadius) * safeDt) * airDrag * 0.4;

    if (wheelRearL) wheelRearL.bone.rotation.x = wheelRearL.restRot.x + rearSpinL;
    if (wheelRearR) wheelRearR.bone.rotation.x = wheelRearR.restRot.x + rearSpinR;
    if (casterWheelL) casterWheelL.bone.rotation.x = casterWheelL.restRot.x + casterSpinL;
    if (casterWheelR) casterWheelR.bone.rotation.x = casterWheelR.restRot.x + casterSpinR;
    if (antiTipL) antiTipL.bone.rotation.x = antiTipL.restRot.x + antiTipSpinL;
    if (antiTipR) antiTipR.bone.rotation.x = antiTipR.restRot.x + antiTipSpinR;

    // Front caster fork swivel (+Y = left, -Y = right)
    const targetSwivel = THREE.MathUtils.clamp(turnRate * 0.24, -0.45, 0.45);
    const swivelAlpha = 1 - Math.exp(-10 * safeDt);
    swivelAngle += (targetSwivel - swivelAngle) * swivelAlpha;
    if (casterSwivelL) casterSwivelL.bone.rotation.y = casterSwivelL.restRot.y + swivelAngle;
    if (casterSwivelR) casterSwivelR.bone.rotation.y = casterSwivelR.restRot.y + swivelAngle;

    // 3. Joystick stick & right hand tracking (local +Z forward -> +X pitch; local +X left -> -Z roll)
    const targetJoyPitch = THREE.MathUtils.clamp(speed * 0.032 + (boost ? 0.1 : 0), -0.22, 0.26);
    const targetJoyRoll = THREE.MathUtils.clamp(-turnRate * 0.13, -0.24, 0.24);
    const joyAlpha = 1 - Math.exp(-12 * safeDt);
    joyPitch += (targetJoyPitch - joyPitch) * joyAlpha;
    joyRoll += (targetJoyRoll - joyRoll) * joyAlpha;
    if (joystickBone) {
      joystickBone.bone.rotation.x = joystickBone.restRot.x + joyPitch;
      joystickBone.bone.rotation.z = joystickBone.restRot.z + joyRoll;
    }

    // 4. Expressive Head look-into-turn + subtle living breathing on Spine/Chest
    breathPhase += safeDt * 1.85;
    const breath = Math.sin(breathPhase);

    const targetHeadYaw = THREE.MathUtils.clamp(turnRate * 0.18, -0.34, 0.34);
    headYaw += (targetHeadYaw - headYaw) * (1 - Math.exp(-7 * safeDt));
    if (headBone) {
      headBone.bone.rotation.y = headBone.restRot.y + headYaw;
      headBone.bone.rotation.x = headBone.restRot.x + breath * 0.015 + (airborne ? -0.06 : 0);
    }
    if (spineBone) {
      spineBone.bone.rotation.x = spineBone.restRot.x + breath * 0.012;
    }
    if (chestBone) {
      chestBone.bone.rotation.x = chestBone.restRot.x + breath * 0.014;
    }

    // 5. Natural periodic blinking & joyful expressions (morph targets)
    if (morphRefs.eyelids?.morphTargetInfluences && blinkIdx !== undefined) {
      if (blinkElapsed < 0) {
        blinkTimer -= safeDt;
        if (blinkTimer <= 0) {
          blinkElapsed = 0;
        }
        morphRefs.eyelids.morphTargetInfluences[blinkIdx] = 0;
      } else {
        blinkElapsed += safeDt;
        const blinkDur = 0.15;
        if (blinkElapsed >= blinkDur) {
          morphRefs.eyelids.morphTargetInfluences[blinkIdx] = 0;
          blinkElapsed = -1;
          blinkTimer = 2.6 + Math.random() * 3.4;
        } else {
          const t = blinkElapsed / blinkDur;
          morphRefs.eyelids.morphTargetInfluences[blinkIdx] = Math.sin(t * Math.PI);
        }
      }
    }

    if (morphRefs.head?.morphTargetInfluences) {
      const targetSmile = boost ? 0.65 : absSpeed > 3 ? 0.28 : 0.1;
      const targetBrow = boost || airborne ? 0.42 : 0;
      const exprAlpha = 1 - Math.exp(-6 * safeDt);
      smileValue += (targetSmile - smileValue) * exprAlpha;
      browValue += (targetBrow - browValue) * exprAlpha;
      if (smileIdx !== undefined) morphRefs.head.morphTargetInfluences[smileIdx] = smileValue;
      if (browIdx !== undefined) morphRefs.head.morphTargetInfluences[browIdx] = browValue;
    }

    // 6. Optional boost thruster glow
    const targetBoost = boost ? 1 : 0;
    boostAmount += (targetBoost - boostAmount) * (1 - Math.exp(-12 * safeDt));
    if (boostCoreMesh && boostCoreMat) {
      boostCoreMesh.visible = boostAmount > 0.03;
      boostCoreMat.opacity = boostAmount * (0.65 + Math.sin(rumblePhase * 3.2) * 0.15);
      const pulse = 0.85 + Math.sin(rumblePhase * 4.5) * 0.18;
      boostCoreMesh.scale.set(0.85 + boostAmount * 0.3, 0.85 + boostAmount * 0.3, (0.5 + boostAmount * 0.9) * pulse);
    }
    if (boostLight) {
      boostLight.intensity = boostAmount * 3.4;
    }
  };

  const setHeadlightIntensity = (intensity: number) => {
    for (const light of headlightLights) {
      light.intensity = intensity;
    }
    for (const bulb of headlightBulbs) {
      bulb.emissiveIntensity = Math.max(0, intensity * 0.75);
    }
  };

  const dispose = () => {
    for (const m of ownedMaterials) m.dispose();
    for (const g of ownedGeometries) g.dispose();
    ownedMaterials.length = 0;
    ownedGeometries.length = 0;
  };

  return {
    root,
    model,
    dimensions,
    headlightMount,
    rearMount,
    setHeadlightIntensity,
    update,
    dispose,
  };
}

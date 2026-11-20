import type * as THREE from 'three';

export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Height of obstacle; >= 1.25 blocks searchlight & watchman line-of-sight */
  height: number;
  blocksSight: boolean;
  label?: string;
}

export interface AwningZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WalkableZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  elevation: number;
}

export interface SafeLamppost {
  id: string;
  position: THREE.Vector3;
  spawnPos: THREE.Vector3;
  spawnYaw: number;
  haloMesh: THREE.Mesh;
  coneMat: THREE.ShaderMaterial;
  pointLight?: THREE.PointLight;
  baseIntensity: number;
}

export interface MooredBoat {
  group: THREE.Group;
  baseY: number;
  baseRotY: number;
  phase: number;
  rollAmp: number;
  pitchAmp: number;
  bobAmp: number;
  lanternLight?: THREE.PointLight;
}

export interface ClueDefinition {
  id: string;
  title: string;
  locationHint: string;
  narration: string;
  position: THREE.Vector3;
  kind: 'telegram' | 'compass' | 'footprints' | 'manifest' | 'ledger';
}

export interface ClueState {
  def: ClueDefinition;
  group: THREE.Group;
  glintRing: THREE.Mesh;
  glintRingMat: THREE.MeshBasicMaterial;
  progressRing: THREE.Mesh;
  progressRingMat: THREE.ShaderMaterial;
  beaconSpark: THREE.Mesh;
  beaconSparkMat: THREE.MeshBasicMaterial;
  progress: number;
  illuminated: boolean;
  collected: boolean;
  pulsePhase: number;
}

export interface SearchlightRig {
  id: string;
  pivot: THREE.Group;
  origin: THREE.Vector3;
  spotLight: THREE.SpotLight;
  targetObj: THREE.Object3D;
  coneMesh: THREE.Mesh;
  coneMat: THREE.ShaderMaterial;
  groundDisc: THREE.Mesh;
  groundDiscMat: THREE.MeshBasicMaterial;
  sweepPoints: THREE.Vector3[];
  speed: number;
  phase: number;
  radius: number;
  currentTarget: THREE.Vector3;
  alertFactor: number;
}

export interface WatchmanRig {
  id: string;
  root: THREE.Group;
  bodyPivot: THREE.Group;
  lanternArm: THREE.Group;
  coneMesh: THREE.Mesh;
  coneMat: THREE.ShaderMaterial;
  groundCone: THREE.Mesh;
  groundConeMat: THREE.MeshBasicMaterial;
  lampGlowMat: THREE.MeshStandardMaterial;
  waypoints: THREE.Vector3[];
  currentWaypoint: number;
  pauseTimer: number;
  speed: number;
  yaw: number;
  lookOffset: number;
  walkPhase: number;
  sightRange: number;
  sightHalfAngle: number;
  alertFactor: number;
}

export interface BeaconRig {
  group: THREE.Group;
  position: THREE.Vector3;
  radius: number;
  lensMat: THREE.MeshStandardMaterial;
  skyBeam: THREE.Mesh;
  skyBeamMat: THREE.ShaderMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  pointLight: THREE.PointLight;
  activated: boolean;
}

export interface PuddleRipple {
  x: number;
  z: number;
  phase: number;
  speed: number;
  maxScale: number;
}

export interface NoirEnvironment {
  root: THREE.Group;
  walkableZones: WalkableZone[];
  colliders: BoxCollider[];
  awningZones: AwningZone[];
  lampposts: SafeLamppost[];
  boats: MooredBoat[];
  craneHeadOrigin: THREE.Vector3;
  lighthouseHeadOrigin: THREE.Vector3;
  beacon: BeaconRig;
  update: (dt: number, elapsed: number, playerPos: THREE.Vector3, cameraPos?: THREE.Vector3) => void;
  dispose: () => void;
}

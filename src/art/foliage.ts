import * as THREE from 'three';
import {
  getLeafCardTexture,
  getPBRTextures,
  type LeafCardStyle,
} from './textures';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export type TreeStyle =
  | 'oak'
  | 'maple_autumn'
  | 'sakura'
  | 'pine'
  | 'snow_pine'
  | 'cypress'
  | 'olive'
  | 'palm'
  | 'neon_palm'
  | 'bonsai';

export interface TreeOptions {
  style: TreeStyle;
  height?: number;
  seed?: number;
  canopyDensity?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Bonsai-only options */
  includePot?: boolean;
  bonsaiVariant?: 'emerald' | 'maple' | 'sakura';
  /** Neon palm accent color */
  neonAccent?: THREE.ColorRepresentation;
}

export interface DetailedTree {
  group: THREE.Group;
  update: (time: number) => void;
  dispose: () => void;
}

export interface ForestPlacement {
  x: number;
  y?: number;
  z: number;
  scale?: number;
  rotationY?: number;
}

export interface ForestOptions {
  style: TreeStyle;
  baseHeight?: number;
  archetypes?: number;
  canopyDensity?: number;
  seed?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  neonAccent?: THREE.ColorRepresentation;
}

export interface ForestBatch {
  group: THREE.Group;
  update: (time: number) => void;
  dispose: () => void;
}

export interface GrassFieldOptions {
  area?: { minX: number; maxX: number; minZ: number; maxZ: number };
  center?: [number, number];
  radius?: number;
  count?: number;
  heightAt?: (x: number, z: number) => number;
  mask?: (x: number, z: number) => boolean;
  bladeHeightRange?: [number, number];
  bladeWidth?: number;
  baseColor?: THREE.ColorRepresentation;
  tipColor?: THREE.ColorRepresentation;
  dryColor?: THREE.ColorRepresentation;
  windStrength?: number;
  pushRadius?: number;
  pushStrength?: number;
  seed?: number;
  castShadow?: boolean;
}

export interface GrassField {
  mesh: THREE.InstancedMesh;
  update: (time: number, playerPos?: THREE.Vector3) => void;
  dispose: () => void;
}

export interface WildflowerPatchOptions {
  area?: { minX: number; maxX: number; minZ: number; maxZ: number };
  center?: [number, number];
  radius?: number;
  count?: number;
  heightAt?: (x: number, z: number) => number;
  mask?: (x: number, z: number) => boolean;
  palette?: THREE.ColorRepresentation[];
  scaleRange?: [number, number];
  seed?: number;
}

export interface WildflowerPatch {
  group: THREE.Group;
  update: (time: number) => void;
  dispose: () => void;
}

export interface FernClusterOptions {
  frondCount?: number;
  radius?: number;
  height?: number;
  color?: THREE.ColorRepresentation;
  seed?: number;
  castShadow?: boolean;
}

export interface MossyBoulderOptions {
  radius?: number;
  mossAmount?: number;
  stoneTint?: THREE.ColorRepresentation;
  mossColor?: THREE.ColorRepresentation;
  includeAccentStones?: boolean;
  seed?: number;
  castShadow?: boolean;
}

export interface BambooClusterOptions {
  culmCount?: number;
  heightRange?: [number, number];
  spread?: number;
  seed?: number;
  castShadow?: boolean;
}

export interface BambooCluster {
  group: THREE.Group;
  update: (time: number) => void;
  dispose: () => void;
}

export type LanternStyle = 'stone_toro' | 'paper_sakura' | 'noir_street' | 'brass_lamp';

export interface LanternOptions {
  scale?: number;
  withLight?: boolean;
  lightIntensity?: number;
  lightDistance?: number;
  lightColor?: THREE.ColorRepresentation;
  castShadow?: boolean;
}

// ---------------------------------------------------------------------------
// Deterministic PRNG & Shared Foliage Wind Uniforms
// ---------------------------------------------------------------------------

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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let n =
    Math.imul(x, 374761393) +
    Math.imul(y, 668265263) +
    Math.imul(z, 2147483647) +
    Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function noise3D(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash3(ix, iy, iz, seed);
  const n100 = hash3(ix + 1, iy, iz, seed);
  const n010 = hash3(ix, iy + 1, iz, seed);
  const n110 = hash3(ix + 1, iy + 1, iz, seed);
  const n001 = hash3(ix, iy, iz + 1, seed);
  const n101 = hash3(ix + 1, iy, iz + 1, seed);
  const n011 = hash3(ix, iy + 1, iz + 1, seed);
  const n111 = hash3(ix + 1, iy + 1, iz + 1, seed);

  const nx00 = lerp(n000, n100, ux);
  const nx10 = lerp(n010, n110, ux);
  const nx01 = lerp(n001, n101, ux);
  const nx11 = lerp(n011, n111, ux);
  return lerp(lerp(nx00, nx10, uy), lerp(nx01, nx11, uy), uz);
}

const sharedFoliageUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 1.0 },
};

/**
 * Updates the shared wind animation clock used across all trees, forests,
 * ferns, bamboo, and wildflowers. Individual `.update(time)` callbacks also
 * advance this clock safely.
 */
export function updateFoliageWind(time: number, windStrength?: number): void {
  sharedFoliageUniforms.uTime.value = time;
  if (windStrength !== undefined) {
    sharedFoliageUniforms.uWindStrength.value = windStrength;
  }
}

// ---------------------------------------------------------------------------
// Self-Contained BufferGeometry Merger (Zero Extra Imports)
// ---------------------------------------------------------------------------

function mergeBufferGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 0) return new THREE.BufferGeometry();
  if (geos.length === 1) return geos[0].clone();

  let totalVerts = 0;
  let totalIndices = 0;
  let hasColor = true;
  let hasUv = true;

  const normalized = geos.map((g) => {
    const pos = g.getAttribute('position');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('color')) hasColor = false;
    if (!g.getAttribute('uv')) hasUv = false;
    totalVerts += pos.count;
    const idx = g.getIndex();
    totalIndices += idx ? idx.count : pos.count;
    return g;
  });

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = hasUv ? new Float32Array(totalVerts * 2) : null;
  const colors = hasColor ? new Float32Array(totalVerts * 3) : null;
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;

  for (const g of normalized) {
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const col = g.getAttribute('color');
    const idx = g.getIndex();

    for (let i = 0; i < pos.count; i++) {
      const vo3 = (vOffset + i) * 3;
      positions[vo3] = pos.getX(i);
      positions[vo3 + 1] = pos.getY(i);
      positions[vo3 + 2] = pos.getZ(i);
      normals[vo3] = norm.getX(i);
      normals[vo3 + 1] = norm.getY(i);
      normals[vo3 + 2] = norm.getZ(i);
      if (uvs && uv) {
        const vo2 = (vOffset + i) * 2;
        uvs[vo2] = uv.getX(i);
        uvs[vo2 + 1] = uv.getY(i);
      }
      if (colors && col) {
        colors[vo3] = col.getX(i);
        colors[vo3 + 1] = col.getY(i);
        colors[vo3 + 2] = col.getZ(i);
      }
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices[iOffset + i] = idx.getX(i) + vOffset;
      }
      iOffset += idx.count;
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices[iOffset + i] = vOffset + i;
      }
      iOffset += pos.count;
    }

    vOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (uvs) merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (colors) merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------
// Custom Tapered Organic Curved Branch Tube Geometry (Parallel Transport)
// ---------------------------------------------------------------------------

interface TaperedTubeOptions {
  curve: THREE.CatmullRomCurve3;
  tubularSegments: number;
  radialSegments: number;
  radiusStart: number;
  radiusEnd: number;
  rootFlare?: number;
  rootLobes?: number;
  ringed?: number;
  uvScaleV?: number;
  capEnd?: boolean;
}

function buildTaperedTube(opts: TaperedTubeOptions): THREE.BufferGeometry {
  const {
    curve,
    tubularSegments,
    radialSegments,
    radiusStart,
    radiusEnd,
    rootFlare = 0,
    rootLobes = 5,
    ringed = 0,
    uvScaleV = 1.4,
    capEnd = true,
  } = opts;

  const arcLen = Math.max(0.01, curve.getLength());
  const ringCount = tubularSegments + 1;
  const cols = radialSegments + 1;

  const points: THREE.Vector3[] = [];
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    points.push(curve.getPoint(t));
    tangents.push(curve.getTangent(t).normalize());
  }

  // Parallel transport frames so curved branches never pinch or twist abruptly
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];
  const initRef = Math.abs(tangents[0].y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const n0 = new THREE.Vector3().crossVectors(tangents[0], initRef).normalize();
  const b0 = new THREE.Vector3().crossVectors(tangents[0], n0).normalize();
  normals.push(n0);
  binormals.push(b0);

  const rotAxis = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (let i = 1; i <= tubularSegments; i++) {
    const prevT = tangents[i - 1];
    const currT = tangents[i];
    const prevN = normals[i - 1].clone();
    rotAxis.crossVectors(prevT, currT);
    const axisLen = rotAxis.length();
    if (axisLen > 1e-5) {
      rotAxis.divideScalar(axisLen);
      const angle = Math.acos(clamp(prevT.dot(currT), -1, 1));
      q.setFromAxisAngle(rotAxis, angle);
      prevN.applyQuaternion(q);
    }
    prevN.addScaledVector(currT, -prevN.dot(currT)).normalize();
    normals.push(prevN);
    binormals.push(new THREE.Vector3().crossVectors(currT, prevN).normalize());
  }

  const posArr: number[] = [];
  const normArr: number[] = [];
  const uvArr: number[] = [];
  const idxArr: number[] = [];

  const dir = new THREE.Vector3();
  for (let i = 0; i < ringCount; i++) {
    const t = i / tubularSegments;
    const p = points[i];
    const n = normals[i];
    const b = binormals[i];
    const baseR = lerp(radiusStart, radiusEnd, Math.pow(t, 0.88));
    // Smooth exponential root buttress flare at trunk base
    const flare = rootFlare > 0 ? Math.pow(Math.max(0, 1 - t / 0.28), 2.2) * rootFlare : 0;
    // Palm trunk horizontal leaf-scar rings
    const ringBump = ringed > 0 ? 1 + Math.sin(t * Math.PI * 2 * ringed) * 0.085 : 1;

    for (let j = 0; j < cols; j++) {
      const u = j / radialSegments;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const lobe = flare > 0 ? 1 + flare * (0.55 + 0.45 * Math.cos(theta * rootLobes)) : 1;
      const r = baseR * lobe * ringBump;

      dir.set(0, 0, 0).addScaledVector(n, cosT).addScaledVector(b, sinT);
      posArr.push(p.x + dir.x * r, p.y + dir.y * r, p.z + dir.z * r);
      normArr.push(dir.x, dir.y, dir.z);
      uvArr.push(u * 1.5, t * arcLen * uvScaleV);
    }
  }

  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * cols + j;
      const b = (i + 1) * cols + j;
      const c = (i + 1) * cols + (j + 1);
      const d = i * cols + (j + 1);
      idxArr.push(a, b, d);
      idxArr.push(b, c, d);
    }
  }

  if (capEnd && radiusEnd > 0.004) {
    const tipCenterIdx = posArr.length / 3;
    const endP = points[tubularSegments];
    const endT = tangents[tubularSegments];
    posArr.push(endP.x + endT.x * radiusEnd * 0.5, endP.y + endT.y * radiusEnd * 0.5, endP.z + endT.z * radiusEnd * 0.5);
    normArr.push(endT.x, endT.y, endT.z);
    uvArr.push(0.5, arcLen * uvScaleV);
    const lastRing = tubularSegments * cols;
    for (let j = 0; j < radialSegments; j++) {
      idxArr.push(lastRing + j, tipCenterIdx, lastRing + j + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  geo.setIndex(idxArr);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Crossed Cupped Botanical Leaf Cluster Geometry & Wind-Sway Materials
// ---------------------------------------------------------------------------

let cachedCrossedClusterGeo: THREE.BufferGeometry | null = null;
let cachedPineClusterGeo: THREE.BufferGeometry | null = null;

function createCardSubMesh(
  width: number,
  height: number,
  rotY: number,
  pitchX: number,
  rollZ: number,
  cupCurve: number,
  offsetY: number,
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, height, 2, 2);
  // Shift pivot slightly toward base of sprig so wind bends naturally from stem
  geo.translate(0, height * 0.14, 0);

  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const nx = x / (width * 0.5);
    const ny = (y + height * 0.36) / height;
    // Gentle organic leaf arch & cupping so planes never look rigid or flat
    const archZ = -cupCurve * (nx * nx * 0.45 + ny * ny * 0.55);
    pos.setZ(i, archZ);
  }

  const euler = new THREE.Euler(pitchX, rotY, rollZ, 'YXZ');
  const mat = new THREE.Matrix4().makeRotationFromEuler(euler);
  geo.applyMatrix4(mat);
  geo.translate(0, offsetY, 0);
  return geo;
}

/**
 * 3-card intersecting gently-cupped botanical sprig cluster with outward-hemisphere
 * soft normals so canopies catch directional sunlight as rich lush volumes without
 * harsh intersecting-plane shadow seams.
 */
function getCrossedLeafClusterGeometry(isConifer = false): THREE.BufferGeometry {
  if (!isConifer && cachedCrossedClusterGeo) return cachedCrossedClusterGeo;
  if (isConifer && cachedPineClusterGeo) return cachedPineClusterGeo;

  const parts: THREE.BufferGeometry[] = isConifer
    ? [
        // Flatter radiating drooping conifer bough fan
        createCardSubMesh(1.18, 1.06, 0, -0.58, 0.05, 0.16, 0.02),
        createCardSubMesh(1.14, 1.02, Math.PI * 0.66, -0.52, -0.08, 0.16, -0.02),
        createCardSubMesh(1.14, 1.02, -Math.PI * 0.66, -0.52, 0.08, 0.16, -0.02),
      ]
    : [
        // Volumetric 3-plane botanical sprig crown
        createCardSubMesh(1.0, 1.0, 0.0, 0.24, 0.08, 0.14, 0.0),
        createCardSubMesh(0.98, 0.98, Math.PI / 3, -0.26, -0.1, 0.14, 0.04),
        createCardSubMesh(0.96, 0.96, (Math.PI * 2) / 3, 0.22, 0.12, 0.14, -0.03),
      ];

  const merged = mergeBufferGeometries(parts);
  for (const p of parts) p.dispose();

  // Compute soft canopy-wrapping outward + upward blended normals!
  const pos = merged.getAttribute('position');
  const norm = merged.getAttribute('normal');
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i) + 0.35, pos.getZ(i)).normalize();
    n.set(norm.getX(i), norm.getY(i), norm.getZ(i));
    n.lerp(v, 0.78).normalize();
    norm.setXYZ(i, n.x, n.y, n.z);
  }
  norm.needsUpdate = true;
  merged.userData = { shared: true, sharedAsset: true, artKitCached: true, __atelierSharedResource: true };

  if (isConifer) {
    cachedPineClusterGeo = merged;
  } else {
    cachedCrossedClusterGeo = merged;
  }
  return merged;
}

const foliageMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const foliageDepthMaterialCache = new Map<string, THREE.MeshDepthMaterial>();

function injectFoliageWindVertex(
  shader: THREE.WebGLProgramParametersWithUniforms,
  amplitude: number,
  speed: number,
  isDepth = false,
): void {
  shader.uniforms.uTime = sharedFoliageUniforms.uTime;
  shader.uniforms.uWindStrength = sharedFoliageUniforms.uWindStrength;
  shader.uniforms.uWindAmp = { value: amplitude };
  shader.uniforms.uWindSpeed = { value: speed };

  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform float uWindStrength;
      uniform float uWindAmp;
      uniform float uWindSpeed;
      ${isDepth ? '' : 'varying float vLeafSunWeight;'}
      `,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        mat3 fWorldMat3 = mat3( modelMatrix ) * mat3( instanceMatrix );
        vec3 fWorldPos = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
      #else
        mat3 fWorldMat3 = mat3( modelMatrix );
        vec3 fWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
      #endif
      float fPhase = fWorldPos.x * 0.42 + fWorldPos.z * 0.37 + fWorldPos.y * 0.21;
      float fPrimary = sin( uTime * uWindSpeed + fPhase );
      float fFlutter = sin( uTime * ( uWindSpeed * 2.75 ) + fWorldPos.x * 1.9 + fWorldPos.y * 1.6 + fWorldPos.z * 1.3 );
      float fFlex = clamp( uv.y, 0.0, 1.0 );
      vec3 fWorldOffset = vec3(
        ( fPrimary * 0.72 + fFlutter * 0.28 ),
        fFlutter * 0.16,
        ( cos( uTime * ( uWindSpeed * 0.85 ) + fPhase * 0.9 ) * 0.58 + fFlutter * 0.22 )
      ) * uWindAmp * uWindStrength * ( 0.35 + fFlex * 0.65 );
      transformed += inverse( fWorldMat3 ) * fWorldOffset;
      ${isDepth ? '' : 'vLeafSunWeight = clamp( ( fWorldPos.y * 0.12 ) + uv.y * 0.45, 0.0, 1.0 );'}
      `,
    );

  if (!isDepth) {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vLeafSunWeight;
        `,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Subtle sunlit leaf translucency glow so canopies look alive and luminous
        reflectedLight.indirectDiffuse += diffuseColor.rgb * ( 0.075 + vLeafSunWeight * 0.07 );
        `,
      );
  }
}

function getFoliageMaterial(
  leafStyle: LeafCardStyle,
  amplitude = 0.085,
  speed = 1.45,
): THREE.MeshStandardMaterial {
  const key = `${leafStyle}|${amplitude.toFixed(3)}|${speed.toFixed(2)}`;
  const cached = foliageMaterialCache.get(key);
  if (cached) return cached;

  const card = getLeafCardTexture(leafStyle);
  const mat = new THREE.MeshStandardMaterial({
    map: card.map,
    bumpMap: card.bumpMap,
    bumpScale: 0.025,
    alphaTest: card.alphaTest,
    side: THREE.DoubleSide,
    roughness: leafStyle === 'sakura' ? 0.64 : 0.74,
    metalness: 0.0,
    envMapIntensity: 0.65,
  });

  mat.customProgramCacheKey = () => `artkit_foliage_${key}`;
  mat.onBeforeCompile = (shader) => {
    injectFoliageWindVertex(shader, amplitude, speed, false);
  };
  mat.userData = { shared: true, sharedAsset: true, artKitCached: true, __atelierSharedResource: true };
  foliageMaterialCache.set(key, mat);
  return mat;
}

function getFoliageDepthMaterial(
  leafStyle: LeafCardStyle,
  amplitude = 0.085,
  speed = 1.45,
): THREE.MeshDepthMaterial {
  const key = `${leafStyle}|${amplitude.toFixed(3)}|${speed.toFixed(2)}`;
  const cached = foliageDepthMaterialCache.get(key);
  if (cached) return cached;

  const card = getLeafCardTexture(leafStyle);
  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: card.map,
    alphaTest: card.alphaTest,
    side: THREE.DoubleSide,
  });
  depthMat.customProgramCacheKey = () => `artkit_foliage_depth_${key}`;
  depthMat.onBeforeCompile = (shader) => {
    injectFoliageWindVertex(shader, amplitude, speed, true);
  };
  depthMat.userData = { shared: true, sharedAsset: true, artKitCached: true, __atelierSharedResource: true };
  foliageDepthMaterialCache.set(key, depthMat);
  return depthMat;
}

const barkMatCache = new Map<string, THREE.MeshStandardMaterial>();

function getBarkMaterial(tintHex: string, roughness = 0.94, metalness = 0.02): THREE.MeshStandardMaterial {
  const key = `${tintHex}|${roughness.toFixed(2)}|${metalness.toFixed(2)}`;
  const cached = barkMatCache.get(key);
  if (cached) return cached;
  const pbr = getPBRTextures('bark', { repeatX: 1, repeatY: 1 });
  const mat = new THREE.MeshStandardMaterial({
    map: pbr.map,
    bumpMap: pbr.bumpMap,
    bumpScale: 0.08,
    roughnessMap: pbr.roughnessMap,
    roughness,
    metalness,
    color: new THREE.Color(tintHex),
    envMapIntensity: 0.5,
  });
  mat.userData = { shared: true, sharedAsset: true, artKitCached: true, __atelierSharedResource: true };
  barkMatCache.set(key, mat);
  return mat;
}

// ---------------------------------------------------------------------------
// Organic Multi-Branch Skeleton & Botanical Canopy Builders (All 10 Styles!)
// ---------------------------------------------------------------------------

interface LeafAnchor {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  scale: number;
  shade: number; // 0 = shaded inner core, 1 = sunlit outer crown
}

interface TreeArchetypeData {
  woodGeo: THREE.BufferGeometry;
  barkTint: string;
  leafStyle: LeafCardStyle;
  isConifer: boolean;
  leafMatrices: THREE.Matrix4[];
  leafColors: THREE.Color[];
  /** Optional extra meshes for palm fronds / coconuts / bonsai pot / neon glow */
  extraGeo?: THREE.BufferGeometry;
  extraMaterial?: THREE.Material;
  accentGeo?: THREE.BufferGeometry;
  accentMaterial?: THREE.Material;
}

interface StylePalette {
  barkTint: string;
  leafStyle: LeafCardStyle;
  isConifer: boolean;
  innerColors: number[];
  midColors: number[];
  outerColors: number[];
}

function getStylePalette(style: TreeStyle, bonsaiVariant: 'emerald' | 'maple' | 'sakura' = 'emerald'): StylePalette {
  switch (style) {
    case 'oak':
      return {
        barkTint: '#b89f86',
        leafStyle: 'oak',
        isConifer: false,
        innerColors: [0x24461f, 0x2a5022, 0x1f3f1d],
        midColors: [0x3d6e29, 0x4a7d2f, 0x356426],
        outerColors: [0x6c9c3a, 0x82b043, 0x5c8f32],
      };
    case 'maple_autumn':
      return {
        barkTint: '#9c8676',
        leafStyle: 'maple',
        isConifer: false,
        innerColors: [0x78181b, 0x8d201c, 0x6a1519],
        midColors: [0xc92a2a, 0xd9480f, 0xe03b1e],
        outerColors: [0xf06516, 0xf59f00, 0xf7b731, 0xe8481c],
      };
    case 'sakura':
      return {
        barkTint: '#6c5454',
        leafStyle: 'sakura',
        isConifer: false,
        innerColors: [0xd97d98, 0xe28da6, 0xcf728f],
        midColors: [0xf7adc2, 0xffbed0, 0xf49fb7],
        outerColors: [0xffd8e4, 0xfff0f5, 0xffe4ec],
      };
    case 'pine':
      return {
        barkTint: '#9a7055',
        leafStyle: 'pine',
        isConifer: true,
        innerColors: [0x1c3824, 0x203f29],
        midColors: [0x2a5534, 0x305e3a, 0x254b32],
        outerColors: [0x3d7345, 0x497d4b, 0x366642],
      };
    case 'snow_pine':
      return {
        barkTint: '#846d5e',
        leafStyle: 'snow_pine',
        isConifer: true,
        innerColors: [0x2a4842, 0x30524c],
        midColors: [0x4c746e, 0x628b85, 0x8fb0b2],
        outerColors: [0xdceaf5, 0xeef5fc, 0xc2d9ea],
      };
    case 'cypress':
      return {
        barkTint: '#856e5a',
        leafStyle: 'cypress',
        isConifer: false,
        innerColors: [0x1c3322, 0x213b27],
        midColors: [0x2d4e31, 0x355a37, 0x28472e],
        outerColors: [0x456e40, 0x527d48, 0x3e653a],
      };
    case 'olive':
      return {
        barkTint: '#c4beb2',
        leafStyle: 'olive',
        isConifer: false,
        innerColors: [0x4f6148, 0x586b51],
        midColors: [0x7c9173, 0x8aa080, 0x72866b],
        outerColors: [0xa9bc9f, 0xb9cbb0, 0x9ab08e],
      };
    case 'bonsai':
      if (bonsaiVariant === 'maple') return getStylePalette('maple_autumn');
      if (bonsaiVariant === 'sakura') return getStylePalette('sakura');
      return {
        barkTint: '#8a725e',
        leafStyle: 'oak',
        isConifer: false,
        innerColors: [0x234a26, 0x2a542b],
        midColors: [0x3e7434, 0x4c863c],
        outerColors: [0x70aa48, 0x86bd54],
      };
    case 'palm':
    case 'neon_palm':
      return {
        barkTint: style === 'neon_palm' ? '#3a2a58' : '#b29778',
        leafStyle: 'palm_leaflet',
        isConifer: false,
        innerColors: [0x3b6e28],
        midColors: [0x589634],
        outerColors: [0x7bb846],
      };
  }
}

function pickClusterColor(
  palette: StylePalette,
  shade: number,
  rng: () => number,
): THREE.Color {
  const c = new THREE.Color();
  const s = clamp(shade + (rng() - 0.5) * 0.22, 0, 1);
  if (s < 0.34) {
    const arr = palette.innerColors;
    c.setHex(arr[Math.floor(rng() * arr.length)]);
  } else if (s < 0.68) {
    const arr = palette.midColors;
    c.setHex(arr[Math.floor(rng() * arr.length)]);
  } else {
    const arr = palette.outerColors;
    c.setHex(arr[Math.floor(rng() * arr.length)]);
  }
  c.offsetHSL((rng() - 0.5) * 0.025, (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.06);
  return c;
}

/**
 * Generates a realistic 3D arched palm frond with curved central rachis +
 * 26 individually angled 3D tapered leaflets along both sides!
 */
function buildPalmFrondGeometry(length: number, droop: number, leafletWidth: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spinePts: THREE.Vector3[] = [];
  const spineSegs = 8;
  for (let i = 0; i <= spineSegs; i++) {
    const t = i / spineSegs;
    const z = t * length;
    const y = Math.sin(t * Math.PI * 0.68) * length * 0.36 - t * t * droop * length;
    spinePts.push(new THREE.Vector3(0, y, z));
  }
  const spineCurve = new THREE.CatmullRomCurve3(spinePts);
  parts.push(
    buildTaperedTube({
      curve: spineCurve,
      tubularSegments: 10,
      radialSegments: 5,
      radiusStart: length * 0.024,
      radiusEnd: length * 0.005,
      uvScaleV: 1,
      capEnd: true,
    }),
  );

  // Paired 3D arched leaflets along rachis
  const pairs = 13;
  const dummy = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);

  for (let i = 1; i <= pairs; i++) {
    const t = 0.12 + (i / (pairs + 1)) * 0.85;
    const pt = spineCurve.getPoint(t);
    const tang = spineCurve.getTangent(t);
    const envelope = Math.sin(Math.pow(t, 0.72) * Math.PI);
    const lLen = length * (0.14 + envelope * 0.28);
    const lWid = leafletWidth * (0.65 + envelope * 0.55);

    for (const side of [-1, 1]) {
      // Custom 3-segment gracefully drooping pointed leaflet strip
      const lGeo = new THREE.BufferGeometry();
      const verts: number[] = [];
      const uvs: number[] = [];
      const idxs: number[] = [];
      const segs = 3;
      for (let s = 0; s <= segs; s++) {
        const st = s / segs;
        const x = side * st * lLen;
        const y = Math.sin(st * Math.PI * 0.6) * lLen * 0.08 - st * st * lLen * 0.34;
        const z = st * lLen * 0.32;
        const hw = lWid * 0.5 * Math.sin((1 - st * 0.85) * Math.PI * 0.65);
        verts.push(x, y + hw * 0.25, z - hw);
        verts.push(x, y - hw * 0.25, z + hw);
        uvs.push(st, 0, st, 1);
      }
      for (let s = 0; s < segs; s++) {
        const b = s * 2;
        idxs.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
      lGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      lGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      lGeo.setIndex(idxs);
      lGeo.computeVertexNormals();

      const pitch = Math.atan2(-tang.y, tang.z);
      euler.set(pitch * 0.6, side * 0.14, side * -0.18);
      q.setFromEuler(euler);
      pos.copy(pt);
      dummy.compose(pos, q, scl);
      lGeo.applyMatrix4(dummy);
      parts.push(lGeo);
    }
  }

  const merged = mergeBufferGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}

function generateTreeArchetype(
  style: TreeStyle,
  height: number,
  seed: number,
  canopyDensity: number,
  bonsaiVariant: 'emerald' | 'maple' | 'sakura' = 'emerald',
  neonAccent?: THREE.ColorRepresentation,
): TreeArchetypeData {
  const rng = mulberry32(seed);
  const palette = getStylePalette(style, bonsaiVariant);
  const woodParts: THREE.BufferGeometry[] = [];
  const anchors: LeafAnchor[] = [];

  // Special bespoke sculptural builder for PALM & NEON_PALM
  if (style === 'palm' || style === 'neon_palm') {
    const leanX = (rng() - 0.5) * height * 0.28;
    const leanZ = (rng() - 0.5) * height * 0.28;
    const trunkPts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(leanX * 0.25, height * 0.3, leanZ * 0.25),
      new THREE.Vector3(leanX * 0.72, height * 0.66, leanZ * 0.72),
      new THREE.Vector3(leanX, height * 0.96, leanZ),
    ];
    const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
    const baseR = height * 0.044;
    woodParts.push(
      buildTaperedTube({
        curve: trunkCurve,
        tubularSegments: 18,
        radialSegments: 9,
        radiusStart: baseR,
        radiusEnd: baseR * 0.48,
        rootFlare: 0.45,
        rootLobes: 6,
        ringed: 16,
        uvScaleV: 1.8,
      }),
    );

    const crownPos = trunkCurve.getPoint(1.0);
    const frondParts: THREE.BufferGeometry[] = [];
    const frondCount = 12;
    const mat4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const scl = new THREE.Vector3(1, 1, 1);

    for (let i = 0; i < frondCount; i++) {
      const tier = i < 5 ? 0 : 1;
      const yaw = (i / frondCount) * Math.PI * 2 + tier * 0.32 + (rng() - 0.5) * 0.2;
      const pitch = tier === 0 ? -0.35 - rng() * 0.2 : 0.14 + rng() * 0.22;
      const fLen = height * (tier === 0 ? 0.36 + rng() * 0.06 : 0.44 + rng() * 0.08);
      const frond = buildPalmFrondGeometry(fLen, tier === 0 ? 0.42 : 0.58, height * 0.028);
      eul.set(pitch, yaw, (rng() - 0.5) * 0.15, 'YXZ');
      quat.setFromEuler(eul);
      mat4.compose(
        new THREE.Vector3(crownPos.x, crownPos.y - tier * 0.08, crownPos.z),
        quat,
        scl,
      );
      frond.applyMatrix4(mat4);
      frondParts.push(frond);
    }

    const extraGeo = mergeBufferGeometries(frondParts);
    for (const f of frondParts) f.dispose();

    // Cluster of coconuts or neon glow rings
    const accentParts: THREE.BufferGeometry[] = [];
    if (style === 'palm') {
      for (let c = 0; c < 4; c++) {
        const a = (c / 4) * Math.PI * 2 + rng() * 0.4;
        const nut = new THREE.SphereGeometry(height * 0.028, 7, 6);
        nut.scale(0.88, 1.15, 0.88);
        nut.translate(
          crownPos.x + Math.cos(a) * baseR * 0.72,
          crownPos.y - height * 0.032,
          crownPos.z + Math.sin(a) * baseR * 0.72,
        );
        accentParts.push(nut);
      }
    } else {
      // Glowing synthwave cyber-rings along trunk + crown halo
      for (let r = 1; r <= 7; r++) {
        const t = r / 8;
        const p = trunkCurve.getPoint(t);
        const rad = lerp(baseR, baseR * 0.48, t) * 1.12;
        const torus = new THREE.TorusGeometry(rad, rad * 0.16, 6, 14);
        torus.rotateX(Math.PI * 0.5);
        torus.translate(p.x, p.y, p.z);
        accentParts.push(torus);
      }
    }

    const palmTex = getLeafCardTexture('palm_leaflet');
    const frondMat =
      style === 'neon_palm'
        ? new THREE.MeshStandardMaterial({
            color: new THREE.Color('#20e8d8'),
            emissive: new THREE.Color(neonAccent ?? '#ff2ea6'),
            emissiveIntensity: 0.42,
            roughness: 0.32,
            metalness: 0.25,
            side: THREE.DoubleSide,
          })
        : new THREE.MeshStandardMaterial({
            map: palmTex.map,
            bumpMap: palmTex.bumpMap,
            bumpScale: 0.025,
            color: new THREE.Color('#c8e8a4'),
            roughness: 0.68,
            metalness: 0.02,
            side: THREE.DoubleSide,
          });
    // Wind sway on palm fronds
    frondMat.customProgramCacheKey = () => `artkit_palm_frond_${style}`;
    frondMat.onBeforeCompile = (shader) => {
      injectFoliageWindVertex(shader, 0.06, 1.35, false);
    };

    const accentMat =
      style === 'neon_palm'
        ? new THREE.MeshStandardMaterial({
            color: new THREE.Color(neonAccent ?? '#ff2ea6'),
            emissive: new THREE.Color(neonAccent ?? '#ff2ea6'),
            emissiveIntensity: 2.0,
            roughness: 0.2,
          })
        : new THREE.MeshStandardMaterial({
            color: new THREE.Color('#5a3d24'),
            roughness: 0.85,
          });

    return {
      woodGeo: mergeBufferGeometries(woodParts),
      barkTint: palette.barkTint,
      leafStyle: 'palm_leaflet',
      isConifer: false,
      leafMatrices: [],
      leafColors: [],
      extraGeo,
      extraMaterial: frondMat,
      accentGeo: mergeBufferGeometries(accentParts),
      accentMaterial: accentMat,
    };
  }

  // -------------------------------------------------------------------------
  // Organic Branching Skeletons for Deciduous, Conifer & Bonsai Trees
  // -------------------------------------------------------------------------
  const addClusterCloud = (
    center: THREE.Vector3,
    spreadXZ: number,
    spreadY: number,
    count: number,
    clusterScale: number,
    minShade: number,
    maxShade: number,
  ) => {
    for (let i = 0; i < count; i++) {
      const u = rng();
      const v = rng();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const r = Math.pow(rng(), 0.52);
      const ox = Math.sin(phi) * Math.cos(theta) * spreadXZ * r;
      const oy = Math.cos(phi) * spreadY * r;
      const oz = Math.sin(phi) * Math.sin(theta) * spreadXZ * r;
      const p = new THREE.Vector3(center.x + ox, center.y + oy, center.z + oz);
      const radialDir = new THREE.Vector3(ox, oy + spreadY * 0.45, oz).normalize();
      const heightShade = clamp((oy / Math.max(0.01, spreadY)) * 0.5 + 0.5, 0, 1);
      const shade = lerp(minShade, maxShade, heightShade * 0.65 + r * 0.35);
      anchors.push({
        pos: p,
        dir: radialDir,
        scale: clusterScale * (0.72 + rng() * 0.56),
        shade,
      });
    }
  };

  if (style === 'pine' || style === 'snow_pine') {
    // Tall organic conifer trunk + 6 tiered drooping whorls of horizontal boughs
    const baseR = height * 0.042;
    const swayX = (rng() - 0.5) * height * 0.05;
    const swayZ = (rng() - 0.5) * height * 0.05;
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(swayX * 0.4, height * 0.35, swayZ * 0.4),
      new THREE.Vector3(swayX * 0.85, height * 0.72, swayZ * 0.85),
      new THREE.Vector3(swayX, height * 0.98, swayZ),
    ]);
    woodParts.push(
      buildTaperedTube({
        curve: trunkCurve,
        tubularSegments: 14,
        radialSegments: 8,
        radiusStart: baseR,
        radiusEnd: baseR * 0.14,
        rootFlare: 0.55,
        rootLobes: 5,
      }),
    );

    const tiers = 7;
    for (let tier = 0; tier < tiers; tier++) {
      const tNorm = tier / (tiers - 1);
      const hFrac = lerp(0.24, 0.90, tNorm);
      const origin = trunkCurve.getPoint(hFrac);
      const boughCount = Math.round(lerp(6, 4, tNorm));
      const tierLen = height * lerp(0.32, 0.09, Math.pow(tNorm, 0.88));
      const baseAngle = tier * 0.95 + rng() * 0.4;

      for (let b = 0; b < boughCount; b++) {
        const ang = baseAngle + (b / boughCount) * Math.PI * 2 + (rng() - 0.5) * 0.35;
        const len = tierLen * (0.82 + rng() * 0.36);
        const dx = Math.cos(ang);
        const dz = Math.sin(ang);
        const droop = -len * lerp(0.22, 0.04, tNorm);
        const pMid = new THREE.Vector3(origin.x + dx * len * 0.55, origin.y + droop * 0.7, origin.z + dz * len * 0.55);
        const pEnd = new THREE.Vector3(origin.x + dx * len, origin.y + droop * 0.45 + len * 0.08, origin.z + dz * len);
        const bCurve = new THREE.CatmullRomCurve3([origin.clone(), pMid, pEnd]);
        woodParts.push(
          buildTaperedTube({
            curve: bCurve,
            tubularSegments: 6,
            radialSegments: 5,
            radiusStart: baseR * lerp(0.38, 0.15, tNorm),
            radiusEnd: baseR * 0.07,
          }),
        );

        const cPerBough = Math.max(3, Math.round(lerp(6, 3, tNorm) * canopyDensity));
        for (let k = 0; k < cPerBough; k++) {
          const kt = 0.25 + (k / Math.max(1, cPerBough - 1)) * 0.78;
          const cp = bCurve.getPoint(clamp(kt, 0, 1));
          cp.x += (rng() - 0.5) * len * 0.28;
          cp.y += (rng() - 0.35) * len * 0.16;
          cp.z += (rng() - 0.5) * len * 0.28;
          anchors.push({
            pos: cp,
            dir: new THREE.Vector3(dx, 0.35 + tNorm * 0.5, dz).normalize(),
            scale: height * lerp(0.18, 0.10, tNorm) * (0.78 + rng() * 0.44),
            shade: clamp(tNorm * 0.55 + kt * 0.45, 0.08, 1.0),
          });
        }
      }
    }
    // Irregular feathery spire crown
    addClusterCloud(trunkCurve.getPoint(0.96), height * 0.08, height * 0.1, Math.round(10 * canopyDensity), height * 0.11, 0.55, 1.0);
  } else if (style === 'cypress') {
    // Tall slender Mediterranean columnar silhouette
    const baseR = height * 0.036;
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3((rng() - 0.5) * 0.15, height * 0.5, (rng() - 0.5) * 0.15),
      new THREE.Vector3((rng() - 0.5) * 0.12, height * 0.94, (rng() - 0.5) * 0.12),
    ]);
    woodParts.push(
      buildTaperedTube({
        curve: trunkCurve,
        tubularSegments: 12,
        radialSegments: 7,
        radiusStart: baseR,
        radiusEnd: baseR * 0.16,
        rootFlare: 0.4,
      }),
    );

    const clusterCount = Math.round(115 * canopyDensity);
    for (let i = 0; i < clusterCount; i++) {
      const t = 0.14 + Math.pow(rng(), 0.92) * 0.86;
      const spine = trunkCurve.getPoint(clamp(t, 0, 1));
      const colRadius = height * 0.135 * Math.sin(Math.pow(clamp((t - 0.1) / 0.9, 0, 1), 0.55) * Math.PI);
      const ang = rng() * Math.PI * 2;
      const rr = (0.35 + 0.65 * rng()) * colRadius;
      const p = new THREE.Vector3(spine.x + Math.cos(ang) * rr, spine.y, spine.z + Math.sin(ang) * rr);
      anchors.push({
        pos: p,
        dir: new THREE.Vector3(Math.cos(ang) * 0.4, 0.9, Math.sin(ang) * 0.4).normalize(),
        scale: height * lerp(0.14, 0.075, t) * (0.78 + rng() * 0.44),
        shade: clamp(t * 0.6 + (rr / Math.max(0.01, colRadius)) * 0.4, 0.08, 1.0),
      });
    }
  } else if (style === 'bonsai') {
    // Museum sculptural S-curved tabletop bonsai with exposed knotted nebari roots + dense foliage pads
    const baseR = height * 0.082;
    const trunkPts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(height * 0.16, height * 0.24, height * 0.06),
      new THREE.Vector3(-height * 0.12, height * 0.52, -height * 0.08),
      new THREE.Vector3(height * 0.08, height * 0.76, height * 0.04),
    ];
    const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
    woodParts.push(
      buildTaperedTube({
        curve: trunkCurve,
        tubularSegments: 16,
        radialSegments: 9,
        radiusStart: baseR,
        radiusEnd: baseR * 0.34,
        rootFlare: 0.75,
        rootLobes: 5,
      }),
    );

    // 5 exposed surface nebari roots gripping the mossy mound
    for (let r = 0; r < 5; r++) {
      const a = (r / 5) * Math.PI * 2 + rng() * 0.35;
      const rLen = height * (0.22 + rng() * 0.09);
      const rCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(a) * baseR * 0.4, height * 0.06, Math.sin(a) * baseR * 0.4),
        new THREE.Vector3(Math.cos(a) * rLen * 0.55, height * 0.045, Math.sin(a) * rLen * 0.55),
        new THREE.Vector3(Math.cos(a + 0.18) * rLen, -height * 0.01, Math.sin(a + 0.18) * rLen),
      ]);
      woodParts.push(
        buildTaperedTube({
          curve: rCurve,
          tubularSegments: 7,
          radialSegments: 6,
          radiusStart: baseR * 0.46,
          radiusEnd: baseR * 0.12,
        }),
      );
    }

    // 4 asymmetrical cantilevered sculptural bonsai pads
    const padSpecs: { t: number; dir: THREE.Vector3; len: number; padXZ: number; padY: number; count: number }[] = [
      { t: 0.46, dir: new THREE.Vector3(0.95, 0.12, 0.28), len: height * 0.42, padXZ: height * 0.28, padY: height * 0.11, count: 28 },
      { t: 0.64, dir: new THREE.Vector3(-0.92, 0.16, -0.34), len: height * 0.38, padXZ: height * 0.25, padY: height * 0.10, count: 26 },
      { t: 0.78, dir: new THREE.Vector3(0.25, 0.22, -0.92), len: height * 0.32, padXZ: height * 0.22, padY: height * 0.09, count: 22 },
      { t: 0.96, dir: new THREE.Vector3(-0.12, 0.65, 0.24), len: height * 0.22, padXZ: height * 0.29, padY: height * 0.12, count: 34 },
    ];

    for (const spec of padSpecs) {
      const origin = trunkCurve.getPoint(spec.t);
      const d = spec.dir.clone().normalize();
      const mid = origin.clone().addScaledVector(d, spec.len * 0.55).add(new THREE.Vector3(0, -height * 0.03, 0));
      const tip = origin.clone().addScaledVector(d, spec.len);
      const bCurve = new THREE.CatmullRomCurve3([origin, mid, tip]);
      woodParts.push(
        buildTaperedTube({
          curve: bCurve,
          tubularSegments: 8,
          radialSegments: 6,
          radiusStart: baseR * 0.36,
          radiusEnd: baseR * 0.11,
        }),
      );
      // Two fine fork twigs under each foliage pad
      for (const sgn of [-1, 1]) {
        const perp = new THREE.Vector3(-d.z * sgn, 0.22, d.x * sgn).normalize();
        const twigTip = tip.clone().addScaledVector(perp, spec.padXZ * 0.52);
        woodParts.push(
          buildTaperedTube({
            curve: new THREE.CatmullRomCurve3([mid.clone().lerp(tip, 0.55), twigTip]),
            tubularSegments: 4,
            radialSegments: 4,
            radiusStart: baseR * 0.16,
            radiusEnd: baseR * 0.06,
          }),
        );
      }
      addClusterCloud(
        tip.clone().add(new THREE.Vector3(0, spec.padY * 0.35, 0)),
        spec.padXZ,
        spec.padY,
        Math.round(spec.count * canopyDensity),
        height * 0.17,
        0.18,
        0.98,
      );
    }
  } else {
    // Broadleaf multi-branch trees: 'oak', 'maple_autumn', 'sakura', 'olive'
    const isSakura = style === 'sakura';
    const isMaple = style === 'maple_autumn';
    const isOlive = style === 'olive';

    const baseR = height * (isOlive ? 0.068 : isSakura ? 0.056 : 0.058);
    const forkH = height * (isOlive ? 0.34 : isMaple ? 0.36 : isSakura ? 0.38 : 0.42);
    const leanX = (rng() - 0.5) * height * (isSakura || isOlive ? 0.16 : 0.09);
    const leanZ = (rng() - 0.5) * height * (isSakura || isOlive ? 0.16 : 0.09);

    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(leanX * 0.35, forkH * 0.48, leanZ * 0.35),
      new THREE.Vector3(leanX, forkH, leanZ),
    ]);
    woodParts.push(
      buildTaperedTube({
        curve: trunkCurve,
        tubularSegments: 12,
        radialSegments: 9,
        radiusStart: baseR,
        radiusEnd: baseR * 0.62,
        rootFlare: isOlive ? 0.85 : 0.68,
        rootLobes: 5,
      }),
    );

    const primaryCount = isMaple ? 5 : isSakura ? 5 : isOlive ? 4 : 5;
    const forkPos = trunkCurve.getPoint(1.0);

    for (let i = 0; i < primaryCount; i++) {
      const ang = (i / primaryCount) * Math.PI * 2 + (rng() - 0.5) * 0.45;
      const startT = 0.72 + rng() * 0.28;
      const limbStart = trunkCurve.getPoint(startT);
      const spread = isSakura ? 0.44 : isMaple ? 0.42 : isOlive ? 0.38 : 0.36;
      const limbLen = height * (spread + rng() * 0.14);
      const lift = height * (isSakura ? 0.26 + rng() * 0.16 : isMaple ? 0.34 + rng() * 0.16 : 0.38 + rng() * 0.16);

      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      const pMid = new THREE.Vector3(
        limbStart.x + dx * limbLen * 0.54,
        limbStart.y + lift * (isSakura ? 0.78 : 0.62),
        limbStart.z + dz * limbLen * 0.54,
      );
      // Graceful arching droop at tips for sakura, horizontal layered cantilever for Kyoto maple
      const pEnd = new THREE.Vector3(
        limbStart.x + dx * limbLen,
        limbStart.y + lift * (isSakura ? 0.84 : isMaple ? 0.92 : 1.0),
        limbStart.z + dz * limbLen,
      );

      const limbCurve = new THREE.CatmullRomCurve3([limbStart, pMid, pEnd]);
      const limbR = baseR * (0.48 + rng() * 0.12);
      woodParts.push(
        buildTaperedTube({
          curve: limbCurve,
          tubularSegments: 9,
          radialSegments: 7,
          radiusStart: limbR,
          radiusEnd: limbR * 0.28,
        }),
      );

      // 3 Secondary crooked branches forking off each primary limb
      const subCount = 3;
      for (let s = 0; s < subCount; s++) {
        const st = 0.42 + (s / (subCount - 1)) * 0.52;
        const subStart = limbCurve.getPoint(st);
        const subAng = ang + (s - 1) * 0.68 + (rng() - 0.5) * 0.32;
        const subLen = limbLen * (0.42 + rng() * 0.22);
        const subLift = height * (isSakura ? 0.04 + rng() * 0.14 : 0.12 + rng() * 0.14);
        const sdx = Math.cos(subAng);
        const sdz = Math.sin(subAng);
        const subMid = new THREE.Vector3(
          subStart.x + sdx * subLen * 0.55,
          subStart.y + subLift * 0.75,
          subStart.z + sdz * subLen * 0.55,
        );
        const subEnd = new THREE.Vector3(
          subStart.x + sdx * subLen,
          subStart.y + subLift * (isSakura ? 0.55 : 0.95),
          subStart.z + sdz * subLen,
        );
        woodParts.push(
          buildTaperedTube({
            curve: new THREE.CatmullRomCurve3([subStart, subMid, subEnd]),
            tubularSegments: 6,
            radialSegments: 5,
            radiusStart: limbR * 0.42,
            radiusEnd: limbR * 0.14,
          }),
        );

        // Anchor lush leaf clusters along each secondary branch tip!
        const cCount = Math.round((isSakura ? 12 : isMaple ? 11 : isOlive ? 8 : 10) * canopyDensity);
        addClusterCloud(
          subEnd,
          height * (isSakura ? 0.19 : 0.16),
          height * (isMaple ? 0.095 : 0.13),
          cCount,
          height * (isSakura ? 0.18 : isOlive ? 0.155 : 0.175),
          0.12,
          0.98,
        );
      }

      // Extra blossom/leaf puff around primary limb tip
      addClusterCloud(
        pEnd,
        height * 0.16,
        height * 0.12,
        Math.round(8 * canopyDensity),
        height * 0.17,
        0.22,
        0.95,
      );
    }

    // Upper central crown leader branch & lush canopy cap
    const leaderEnd = new THREE.Vector3(
      forkPos.x + (rng() - 0.5) * height * 0.12,
      height * (isSakura ? 0.84 : 0.92),
      forkPos.z + (rng() - 0.5) * height * 0.12,
    );
    woodParts.push(
      buildTaperedTube({
        curve: new THREE.CatmullRomCurve3([
          forkPos,
          forkPos.clone().lerp(leaderEnd, 0.5).add(new THREE.Vector3((rng() - 0.5) * 0.25, 0, (rng() - 0.5) * 0.25)),
          leaderEnd,
        ]),
        tubularSegments: 7,
        radialSegments: 6,
        radiusStart: baseR * 0.46,
        radiusEnd: baseR * 0.14,
      }),
    );
    addClusterCloud(
      leaderEnd,
      height * 0.24,
      height * 0.16,
      Math.round(22 * canopyDensity),
      height * 0.18,
      0.38,
      1.0,
    );
  }

  // Convert leaf anchors into instance matrices & colors
  const leafMatrices: THREE.Matrix4[] = [];
  const leafColors: THREE.Color[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const rotYQuat = new THREE.Quaternion();
  const sclVec = new THREE.Vector3();

  for (const a of anchors) {
    const m = new THREE.Matrix4();
    const tiltDir = a.dir.clone().lerp(up, palette.isConifer ? 0.45 : 0.62).normalize();
    quat.setFromUnitVectors(up, tiltDir);
    rotYQuat.setFromAxisAngle(up, rng() * Math.PI * 2);
    quat.multiply(rotYQuat);
    const sx = a.scale * (0.88 + rng() * 0.24);
    const sy = a.scale * (0.86 + rng() * 0.26);
    const sz = a.scale * (0.88 + rng() * 0.24);
    sclVec.set(sx, sy, sz);
    m.compose(a.pos, quat, sclVec);
    leafMatrices.push(m);
    leafColors.push(pickClusterColor(palette, a.shade, rng));
  }

  const woodGeo = mergeBufferGeometries(woodParts);
  for (const w of woodParts) w.dispose();

  return {
    woodGeo,
    barkTint: palette.barkTint,
    leafStyle: palette.leafStyle,
    isConifer: palette.isConifer,
    leafMatrices,
    leafColors,
  };
}

function buildBonsaiPotAndMoss(height: number): THREE.Group {
  const potGroup = new THREE.Group();
  const potW = height * 0.62;
  const potD = height * 0.44;
  const potH = height * 0.13;

  // Glazed dark slate-celadon ceramic bonsai tray with beveled lip & corner feet
  const ceramicMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2c3639'),
    roughness: 0.34,
    metalness: 0.12,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3b484c'),
    roughness: 0.26,
    metalness: 0.18,
  });

  const bodyGeo = new THREE.BoxGeometry(potW, potH, potD);
  const body = new THREE.Mesh(bodyGeo, ceramicMat);
  body.position.y = potH * 0.5 + potH * 0.16;
  body.castShadow = true;
  body.receiveShadow = true;
  potGroup.add(body);

  const rimGeo = new THREE.BoxGeometry(potW * 1.07, potH * 0.24, potD * 1.07);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.position.y = potH + potH * 0.12;
  rim.castShadow = true;
  rim.receiveShadow = true;
  potGroup.add(rim);

  // 4 carved corner feet
  const footGeo = new THREE.BoxGeometry(potW * 0.14, potH * 0.22, potD * 0.16);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = new THREE.Mesh(footGeo, ceramicMat);
      foot.position.set(sx * potW * 0.38, potH * 0.11, sz * potD * 0.36);
      foot.castShadow = true;
      potGroup.add(foot);
    }
  }

  // Sculpted velvety moss cushion mound inside tray
  const soilPbr = getPBRTextures('grassSoil', { mossAmount: 0.92, repeatX: 2, repeatY: 2 });
  const mossMat = new THREE.MeshStandardMaterial({
    map: soilPbr.map,
    bumpMap: soilPbr.bumpMap,
    bumpScale: 0.03,
    roughness: 0.92,
    color: new THREE.Color('#7eb252'),
  });
  const moundGeo = new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  moundGeo.scale(potW * 0.46, potH * 0.52, potD * 0.44);
  const mound = new THREE.Mesh(moundGeo, mossMat);
  mound.position.y = potH * 0.98;
  mound.receiveShadow = true;
  potGroup.add(mound);

  return potGroup;
}

// ---------------------------------------------------------------------------
// 1. createDetailedTree
// ---------------------------------------------------------------------------

export function createDetailedTree(options: TreeOptions): DetailedTree {
  const {
    style,
    seed = 101,
    canopyDensity = 1.0,
    castShadow = true,
    receiveShadow = true,
    includePot = style === 'bonsai',
    bonsaiVariant = 'emerald',
    neonAccent,
  } = options;

  const defaultHeight =
    style === 'bonsai' ? 1.35 :
    style === 'cypress' ? 7.8 :
    style === 'pine' || style === 'snow_pine' ? 7.4 :
    style === 'palm' || style === 'neon_palm' ? 6.8 :
    style === 'olive' ? 4.4 : 6.2;

  const height = options.height ?? defaultHeight;
  const archetype = generateTreeArchetype(style, height, seed, canopyDensity, bonsaiVariant, neonAccent);

  const group = new THREE.Group();
  group.name = `tree_${style}`;
  const disposables: { dispose(): void }[] = [archetype.woodGeo];

  const treeRoot = new THREE.Group();
  if (style === 'bonsai' && includePot) {
    const pot = buildBonsaiPotAndMoss(height);
    pot.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        disposables.push(obj.geometry);
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => disposables.push(m));
        } else {
          disposables.push(obj.material);
        }
      }
    });
    group.add(pot);
    treeRoot.position.y = height * 0.145;
  }
  group.add(treeRoot);

  // Woody multi-branch skeleton mesh
  const barkMat =
    style === 'neon_palm'
      ? new THREE.MeshStandardMaterial({
          color: new THREE.Color('#24183d'),
          roughness: 0.38,
          metalness: 0.45,
        })
      : getBarkMaterial(archetype.barkTint);
  if (style === 'neon_palm') disposables.push(barkMat);

  const woodMesh = new THREE.Mesh(archetype.woodGeo, barkMat);
  woodMesh.castShadow = castShadow;
  woodMesh.receiveShadow = receiveShadow;
  treeRoot.add(woodMesh);

  // Canopy leaf sprig InstancedMesh (for all non-palm trees)
  if (archetype.leafMatrices.length > 0) {
    const clusterGeo = getCrossedLeafClusterGeometry(archetype.isConifer);
    const windAmp = style === 'bonsai' ? 0.018 : 0.085;
    const leafMat = getFoliageMaterial(archetype.leafStyle, windAmp, 1.45);
    const depthMat = getFoliageDepthMaterial(archetype.leafStyle, windAmp, 1.45);

    const leafInst = new THREE.InstancedMesh(clusterGeo, leafMat, archetype.leafMatrices.length);
    leafInst.castShadow = castShadow;
    leafInst.receiveShadow = receiveShadow;
    leafInst.customDepthMaterial = depthMat;

    for (let i = 0; i < archetype.leafMatrices.length; i++) {
      leafInst.setMatrixAt(i, archetype.leafMatrices[i]);
      leafInst.setColorAt(i, archetype.leafColors[i]);
    }
    leafInst.instanceMatrix.needsUpdate = true;
    if (leafInst.instanceColor) leafInst.instanceColor.needsUpdate = true;
    leafInst.computeBoundingSphere();
    treeRoot.add(leafInst);
    disposables.push(leafInst);
  }

  // Palm 3D fronds & coconuts / neon rings
  if (archetype.extraGeo && archetype.extraMaterial) {
    const extraMesh = new THREE.Mesh(archetype.extraGeo, archetype.extraMaterial);
    extraMesh.castShadow = castShadow;
    extraMesh.receiveShadow = receiveShadow;
    treeRoot.add(extraMesh);
    disposables.push(archetype.extraGeo, archetype.extraMaterial);
  }
  if (archetype.accentGeo && archetype.accentMaterial) {
    const accentMesh = new THREE.Mesh(archetype.accentGeo, archetype.accentMaterial);
    accentMesh.castShadow = castShadow;
    treeRoot.add(accentMesh);
    disposables.push(archetype.accentGeo, archetype.accentMaterial);
  }

  return {
    group,
    update(time: number) {
      updateFoliageWind(time);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// 2. createForest — Ultra-Efficient Batched Instanced Multi-Tree Forest
// ---------------------------------------------------------------------------

export function createForest(
  placements: ForestPlacement[],
  options: ForestOptions,
): ForestBatch {
  const {
    style,
    seed = 777,
    canopyDensity = 0.9,
    castShadow = true,
    receiveShadow = true,
    neonAccent,
  } = options;

  const group = new THREE.Group();
  group.name = `forest_${style}`;
  const disposables: { dispose(): void }[] = [];

  if (placements.length === 0) {
    return {
      group,
      update: (t) => updateFoliageWind(t),
      dispose: () => {},
    };
  }

  const defaultHeight =
    style === 'cypress' ? 7.8 :
    style === 'pine' || style === 'snow_pine' ? 7.4 :
    style === 'palm' || style === 'neon_palm' ? 6.8 :
    style === 'olive' ? 4.4 : 6.2;
  const baseHeight = options.baseHeight ?? defaultHeight;

  const archetypeCount = Math.min(Math.max(1, options.archetypes ?? 3), placements.length);
  const archetypes: TreeArchetypeData[] = [];
  for (let a = 0; a < archetypeCount; a++) {
    archetypes.push(
      generateTreeArchetype(style, baseHeight, seed + a * 137, canopyDensity, 'emerald', neonAccent),
    );
  }

  const rng = mulberry32(seed + 999);
  const buckets: { placement: ForestPlacement; matrix: THREE.Matrix4 }[][] = Array.from(
    { length: archetypeCount },
    () => [],
  );

  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  let totalLeafInstances = 0;
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    const bucketIdx = i % archetypeCount;
    const s = p.scale ?? (0.85 + rng() * 0.34);
    const ry = p.rotationY ?? rng() * Math.PI * 2;
    pos.set(p.x, p.y ?? 0, p.z);
    quat.setFromAxisAngle(up, ry);
    scl.set(s, s, s);
    const mat = new THREE.Matrix4().compose(pos, quat, scl);
    buckets[bucketIdx].push({ placement: p, matrix: mat });
    totalLeafInstances += archetypes[bucketIdx].leafMatrices.length;
  }

  const barkMat =
    style === 'neon_palm'
      ? new THREE.MeshStandardMaterial({
          color: new THREE.Color('#24183d'),
          roughness: 0.38,
          metalness: 0.45,
        })
      : getBarkMaterial(archetypes[0].barkTint);
  if (style === 'neon_palm') disposables.push(barkMat);

  // 1 InstancedMesh per archetype for wood skeletons (and palm fronds/accents)
  for (let a = 0; a < archetypeCount; a++) {
    const items = buckets[a];
    if (items.length === 0) continue;
    const arch = archetypes[a];

    const trunkInst = new THREE.InstancedMesh(arch.woodGeo, barkMat, items.length);
    trunkInst.castShadow = castShadow;
    trunkInst.receiveShadow = receiveShadow;
    for (let i = 0; i < items.length; i++) {
      trunkInst.setMatrixAt(i, items[i].matrix);
    }
    trunkInst.instanceMatrix.needsUpdate = true;
    trunkInst.computeBoundingSphere();
    group.add(trunkInst);
    disposables.push(arch.woodGeo, trunkInst);

    if (arch.extraGeo && arch.extraMaterial) {
      const frondInst = new THREE.InstancedMesh(arch.extraGeo, arch.extraMaterial, items.length);
      frondInst.castShadow = castShadow;
      frondInst.receiveShadow = receiveShadow;
      for (let i = 0; i < items.length; i++) {
        frondInst.setMatrixAt(i, items[i].matrix);
      }
      frondInst.instanceMatrix.needsUpdate = true;
      frondInst.computeBoundingSphere();
      group.add(frondInst);
      disposables.push(arch.extraGeo, arch.extraMaterial, frondInst);
    }

    if (arch.accentGeo && arch.accentMaterial) {
      const accInst = new THREE.InstancedMesh(arch.accentGeo, arch.accentMaterial, items.length);
      for (let i = 0; i < items.length; i++) {
        accInst.setMatrixAt(i, items[i].matrix);
      }
      accInst.instanceMatrix.needsUpdate = true;
      accInst.computeBoundingSphere();
      group.add(accInst);
      disposables.push(arch.accentGeo, arch.accentMaterial, accInst);
    }
  }

  // 1 single combined InstancedMesh for ALL leaf clusters across the ENTIRE forest!
  if (totalLeafInstances > 0) {
    const first = archetypes[0];
    const clusterGeo = getCrossedLeafClusterGeometry(first.isConifer);
    const leafMat = getFoliageMaterial(first.leafStyle, 0.085, 1.45);
    const depthMat = getFoliageDepthMaterial(first.leafStyle, 0.085, 1.45);

    const allLeaves = new THREE.InstancedMesh(clusterGeo, leafMat, totalLeafInstances);
    allLeaves.castShadow = castShadow;
    allLeaves.receiveShadow = receiveShadow;
    allLeaves.customDepthMaterial = depthMat;

    const combinedMat = new THREE.Matrix4();
    const tmpColor = new THREE.Color();
    let idx = 0;

    for (let a = 0; a < archetypeCount; a++) {
      const arch = archetypes[a];
      const items = buckets[a];
      for (const item of items) {
        const treeHueJitter = (rng() - 0.5) * 0.024;
        const treeLitJitter = (rng() - 0.5) * 0.05;
        for (let l = 0; l < arch.leafMatrices.length; l++) {
          combinedMat.multiplyMatrices(item.matrix, arch.leafMatrices[l]);
          allLeaves.setMatrixAt(idx, combinedMat);
          tmpColor.copy(arch.leafColors[l]).offsetHSL(treeHueJitter, 0, treeLitJitter);
          allLeaves.setColorAt(idx, tmpColor);
          idx++;
        }
      }
    }

    allLeaves.instanceMatrix.needsUpdate = true;
    if (allLeaves.instanceColor) allLeaves.instanceColor.needsUpdate = true;
    allLeaves.computeBoundingSphere();
    group.add(allLeaves);
    disposables.push(allLeaves);
  }

  return {
    group,
    update(time: number) {
      updateFoliageWind(time);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// 3. createGrassField — Lush Interactive 3-Blade Tuft Field with Wheelchair Push
// ---------------------------------------------------------------------------

/**
 * Creates a custom 3-blade crossed-curved grass tuft geometry (4 vertical
 * segments per blade tapering to crisp arched pointed tips, uv.y = 0 at root -> 1 at tip).
 */
function createGrassTuftGeometry(bladeWidth: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const blades = 3;
  const segments = 4;

  for (let b = 0; b < blades; b++) {
    const yaw = (b * Math.PI * 2) / blades + (b === 1 ? 0.22 : b === 2 ? -0.18 : 0);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const rootOffset = 0.032;
    const rx0 = cosY * rootOffset;
    const rz0 = sinY * rootOffset;
    const heightScale = b === 0 ? 1.0 : b === 1 ? 0.86 : 0.74;
    const archAmount = b === 0 ? 0.24 : b === 1 ? 0.30 : 0.26;
    const baseVert = positions.length / 3;

    for (let s = 0; s <= segments; s++) {
      const t = s / segments; // 0 = root, 1 = tip
      const y = t * heightScale;
      const arch = t * t * archAmount;
      const halfW = bladeWidth * 0.5 * (1 - Math.pow(t, 1.35));

      // Outward bend direction along blade yaw; width perpendicular to yaw
      const cx = rx0 + cosY * arch;
      const cz = rz0 + sinY * arch;
      const px = -sinY * halfW;
      const pz = cosY * halfW;

      // Upward-biased soft normal so grass never goes harsh black on shadowed sides
      const nx = cosY * (0.25 + t * 0.2);
      const ny = 0.92;
      const nz = sinY * (0.25 + t * 0.2);
      const nLen = Math.hypot(nx, ny, nz);

      if (s === segments) {
        // Sharp tapered point tip
        positions.push(cx, y, cz);
        normals.push(nx / nLen, ny / nLen, nz / nLen);
        uvs.push(b / blades, 1.0);
      } else {
        positions.push(cx - px, y, cz - pz);
        normals.push(nx / nLen, ny / nLen, nz / nLen);
        uvs.push(b / blades, t);

        positions.push(cx + px, y, cz + pz);
        normals.push(nx / nLen, ny / nLen, nz / nLen);
        uvs.push(b / blades, t);
      }
    }

    for (let s = 0; s < segments; s++) {
      if (s === segments - 1) {
        const v0 = baseVert + s * 2;
        const v1 = v0 + 1;
        const tip = baseVert + segments * 2;
        indices.push(v0, v1, tip);
      } else {
        const v0 = baseVert + s * 2;
        const v1 = v0 + 1;
        const v2 = v0 + 2;
        const v3 = v0 + 3;
        indices.push(v0, v1, v2, v1, v3, v2);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export function createGrassField(options: GrassFieldOptions = {}): GrassField {
  const {
    count = 8000,
    heightAt = () => 0,
    mask,
    bladeHeightRange = [0.28, 0.68],
    bladeWidth = 0.056,
    baseColor = '#1e4520',
    tipColor = '#8bc449',
    dryColor = '#c8b454',
    windStrength = 1.0,
    pushRadius = 1.65,
    pushStrength = 0.92,
    seed = 515,
    castShadow = false,
  } = options;

  const rng = mulberry32(seed);
  const center = options.center ?? [0, 0];
  const radius = options.radius;
  const area = options.area ?? {
    minX: center[0] - (radius ?? 24),
    maxX: center[0] + (radius ?? 24),
    minZ: center[1] - (radius ?? 24),
    maxZ: center[1] + (radius ?? 24),
  };

  // Sample valid positions respecting circular radius & user mask()
  const transforms: { x: number; y: number; z: number; h: number; rotY: number; sx: number }[] = [];
  const maxAttempts = count * 4;
  for (let attempt = 0; attempt < maxAttempts && transforms.length < count; attempt++) {
    let x: number;
    let z: number;
    if (radius !== undefined) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      x = center[0] + Math.cos(a) * r;
      z = center[1] + Math.sin(a) * r;
    } else {
      x = lerp(area.minX, area.maxX, rng());
      z = lerp(area.minZ, area.maxZ, rng());
    }
    if (mask && !mask(x, z)) continue;

    // Natural clumpy meadow density variation using low-freq spatial noise
    const patch = noise3D(x * 0.14, 0.5, z * 0.14, seed + 13);
    const y = heightAt(x, z);
    const h = lerp(bladeHeightRange[0], bladeHeightRange[1], clamp(rng() * 0.72 + patch * 0.35, 0, 1));
    transforms.push({
      x,
      y,
      z,
      h,
      rotY: rng() * Math.PI * 2,
      sx: 0.78 + rng() * 0.48,
    });
  }

  const tuftGeo = createGrassTuftGeometry(bladeWidth);

  const grassUniforms = {
    uTime: { value: 0 },
    uWindStrength: { value: windStrength },
    uPlayerPos: { value: new THREE.Vector3(0, -999, 0) },
    uPlayerActive: { value: 0.0 },
    uPushRadius: { value: pushRadius },
    uPushStrength: { value: pushStrength },
    uBaseColor: { value: new THREE.Color(baseColor) },
    uTipColor: { value: new THREE.Color(tipColor) },
  };

  const grassMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff),
    roughness: 0.78,
    metalness: 0.0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.45,
  });

  grassMat.customProgramCacheKey = () => 'artkit_interactive_grass_v1';
  grassMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, grassUniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWindStrength;
        uniform vec3 uPlayerPos;
        uniform float uPlayerActive;
        uniform float uPushRadius;
        uniform float uPushStrength;
        varying float vGrassHeight;
        varying float vGustHighlight;
        `,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGrassHeight = uv.y;
        float bendFactor = uv.y * uv.y;
        #ifdef USE_INSTANCING
          mat3 gWorldMat3 = mat3( modelMatrix ) * mat3( instanceMatrix );
          vec3 gOrigin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
        #else
          mat3 gWorldMat3 = mat3( modelMatrix );
          vec3 gOrigin = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
        #endif

        // Multi-octave traveling wind gusts rippling across the meadow
        float wave1 = sin( gOrigin.x * 0.24 + gOrigin.z * 0.16 - uTime * 2.15 );
        float wave2 = sin( gOrigin.x * 0.58 - gOrigin.z * 0.44 - uTime * 3.4 + uv.x * 4.2 ) * 0.42;
        float gustBand = 0.5 + 0.5 * sin( gOrigin.x * 0.09 + gOrigin.z * 0.07 - uTime * 0.95 );
        float windMag = ( wave1 * 0.65 + wave2 * 0.35 + gustBand * 0.45 ) * 0.16 * uWindStrength;
        vGustHighlight = clamp( gustBand * 0.6 + wave1 * 0.4, 0.0, 1.0 );

        vec3 gWorldOffset = vec3( windMag, -abs( windMag ) * 0.22, windMag * 0.62 ) * bendFactor;

        // Real-time wheelchair proximity bending: smoothly parts grass under & around wheels!
        if ( uPlayerActive > 0.5 ) {
          vec2 deltaXZ = gOrigin.xz - uPlayerPos.xz;
          float dist = length( deltaXZ );
          float verticalDiff = abs( gOrigin.y - uPlayerPos.y );
          if ( dist < uPushRadius && verticalDiff < 2.2 ) {
            float pushFactor = smoothstep( uPushRadius, 0.12, dist );
            vec2 pushDir = dist > 0.001 ? ( deltaXZ / dist ) : vec2( 1.0, 0.0 );
            float flatten = pushFactor * uPushStrength * bendFactor;
            gWorldOffset.x += pushDir.x * flatten * 0.58;
            gWorldOffset.z += pushDir.y * flatten * 0.58;
            gWorldOffset.y -= flatten * 0.42;
          }
        }

        transformed += inverse( gWorldMat3 ) * gWorldOffset;
        `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uBaseColor;
        uniform vec3 uTipColor;
        varying float vGrassHeight;
        varying float vGustHighlight;
        `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 grassGrad = mix( uBaseColor, uTipColor, smoothstep( 0.04, 0.94, vGrassHeight ) );
        // Subtle warm golden sunlight shimmer on wind-swept tips
        grassGrad *= 0.86 + 0.26 * vGrassHeight + vGustHighlight * vGrassHeight * 0.12;
        diffuseColor.rgb *= grassGrad;
        `,
      );
  };

  const mesh = new THREE.InstancedMesh(tuftGeo, grassMat, Math.max(1, transforms.length));
  mesh.name = 'grass_field';
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;

  const dummy = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const instCol = new THREE.Color();
  const dryC = new THREE.Color(dryColor);
  const whiteC = new THREE.Color(0xffffff);

  for (let i = 0; i < transforms.length; i++) {
    const tr = transforms[i];
    pos.set(tr.x, tr.y - 0.015, tr.z);
    quat.setFromAxisAngle(up, tr.rotY);
    scl.set(tr.sx, tr.h, tr.sx);
    dummy.compose(pos, quat, scl);
    mesh.setMatrixAt(i, dummy);

    // Subtle meadow patchiness (lush emerald patches vs sunlit golden-tipped patches)
    const patch = noise3D(tr.x * 0.09, 1.7, tr.z * 0.09, seed + 71);
    const dryBlend = clamp((patch - 0.56) * 1.15, 0, 0.42);
    instCol.copy(whiteC).lerp(dryC, dryBlend);
    instCol.offsetHSL((rng() - 0.5) * 0.028, (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.1);
    mesh.setColorAt(i, instCol);
  }
  if (transforms.length === 0) {
    dummy.makeScale(0, 0, 0);
    mesh.setMatrixAt(0, dummy);
    mesh.setColorAt(0, whiteC);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();

  return {
    mesh,
    update(time: number, playerPos?: THREE.Vector3) {
      grassUniforms.uTime.value = time;
      if (playerPos) {
        grassUniforms.uPlayerPos.value.copy(playerPos);
        grassUniforms.uPlayerActive.value = 1.0;
      } else {
        grassUniforms.uPlayerActive.value = 0.0;
      }
    },
    dispose() {
      tuftGeo.dispose();
      grassMat.dispose();
      mesh.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// 4. createWildflowerPatch — Instanced Curved Stems + Multi-Petal 3D Blooms
// ---------------------------------------------------------------------------

function createWildflowerStemGeometry(): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.015, 0.14, 0.01),
    new THREE.Vector3(0.03, 0.30, 0.015),
  ]);
  const stem = buildTaperedTube({
    curve,
    tubularSegments: 5,
    radialSegments: 4,
    radiusStart: 0.0085,
    radiusEnd: 0.005,
  });

  // Two small stem leaves + green calyx cup
  const leafA = new THREE.PlaneGeometry(0.05, 0.09);
  leafA.rotateX(-0.7);
  leafA.rotateY(0.5);
  leafA.translate(0.03, 0.12, 0.02);

  const leafB = new THREE.PlaneGeometry(0.045, 0.08);
  leafB.rotateX(-0.75);
  leafB.rotateY(-2.2);
  leafB.translate(-0.015, 0.16, -0.015);

  const merged = mergeBufferGeometries([stem, leafA, leafB]);
  stem.dispose();
  leafA.dispose();
  leafB.dispose();
  return merged;
}

function createWildflowerBloomGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const petalCount = 6;
  for (let p = 0; p < petalCount; p++) {
    const a = (p / petalCount) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(0.042, 6, 5);
    petal.scale(0.68, 0.16, 1.38);
    petal.rotateX(-0.28); // gently cupped upward
    petal.translate(0, 0.008, 0.048);
    petal.rotateY(a);
    petal.translate(0.03, 0.305, 0.015);
    parts.push(petal);
  }
  const merged = mergeBufferGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}

export function createWildflowerPatch(options: WildflowerPatchOptions = {}): WildflowerPatch {
  const {
    count = 260,
    heightAt = () => 0,
    mask,
    palette = ['#ffd43b', '#ff6b6b', '#b197fc', '#fff5f5', '#74c0fc', '#ffa94d'],
    scaleRange = [0.75, 1.35],
    seed = 313,
  } = options;

  const rng = mulberry32(seed);
  const center = options.center ?? [0, 0];
  const radius = options.radius;
  const area = options.area ?? {
    minX: center[0] - (radius ?? 14),
    maxX: center[0] + (radius ?? 14),
    minZ: center[1] - (radius ?? 14),
    maxZ: center[1] + (radius ?? 14),
  };

  const samples: { x: number; y: number; z: number; rotY: number; s: number; col: THREE.Color }[] = [];
  const colors = palette.map((c) => new THREE.Color(c));
  const maxAttempts = count * 4;
  for (let a = 0; a < maxAttempts && samples.length < count; a++) {
    let x: number;
    let z: number;
    if (radius !== undefined) {
      const ang = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      x = center[0] + Math.cos(ang) * r;
      z = center[1] + Math.sin(ang) * r;
    } else {
      x = lerp(area.minX, area.maxX, rng());
      z = lerp(area.minZ, area.maxZ, rng());
    }
    if (mask && !mask(x, z)) continue;
    const baseCol = colors[Math.floor(rng() * colors.length)].clone();
    baseCol.offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.08);
    samples.push({
      x,
      y: heightAt(x, z),
      z,
      rotY: rng() * Math.PI * 2,
      s: lerp(scaleRange[0], scaleRange[1], rng()),
      col: baseCol,
    });
  }

  const group = new THREE.Group();
  group.name = 'wildflower_patch';
  if (samples.length === 0) {
    return { group, update: (t) => updateFoliageWind(t), dispose: () => {} };
  }

  const stemGeo = createWildflowerStemGeometry();
  const bloomGeo = createWildflowerBloomGeometry();
  const centerGeo = new THREE.SphereGeometry(0.022, 6, 5);
  centerGeo.scale(1, 0.55, 1);
  centerGeo.translate(0.03, 0.312, 0.015);

  const applySway = (mat: THREE.MeshStandardMaterial, key: string) => {
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = sharedFoliageUniforms.uTime;
      shader.uniforms.uWindStrength = sharedFoliageUniforms.uWindStrength;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform float uWindStrength;
          `,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 wfOrigin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
          #else
            vec3 wfOrigin = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
          #endif
          float wfBend = clamp( transformed.y / 0.32, 0.0, 1.0 );
          wfBend *= wfBend;
          float wfSway = sin( uTime * 2.1 + wfOrigin.x * 0.65 + wfOrigin.z * 0.52 ) * 0.055 * uWindStrength;
          transformed.x += wfSway * wfBend;
          transformed.z += cos( uTime * 1.7 + wfOrigin.z * 0.6 ) * 0.035 * uWindStrength * wfBend;
          `,
        );
    };
  };

  const stemMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3b7328'),
    roughness: 0.78,
    side: THREE.DoubleSide,
  });
  const bloomMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff),
    roughness: 0.52,
    metalness: 0.0,
  });
  const pollenMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f7b500'),
    emissive: new THREE.Color('#5a3900'),
    emissiveIntensity: 0.25,
    roughness: 0.6,
  });

  applySway(stemMat, 'artkit_wildflower_stem');
  applySway(bloomMat, 'artkit_wildflower_bloom');
  applySway(pollenMat, 'artkit_wildflower_pollen');

  const n = samples.length;
  const stemInst = new THREE.InstancedMesh(stemGeo, stemMat, n);
  const bloomInst = new THREE.InstancedMesh(bloomGeo, bloomMat, n);
  const centerInst = new THREE.InstancedMesh(centerGeo, pollenMat, n);
  stemInst.receiveShadow = true;
  bloomInst.receiveShadow = true;

  const mat4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < n; i++) {
    const it = samples[i];
    p.set(it.x, it.y, it.z);
    q.setFromAxisAngle(up, it.rotY);
    s.set(it.s, it.s, it.s);
    mat4.compose(p, q, s);
    stemInst.setMatrixAt(i, mat4);
    bloomInst.setMatrixAt(i, mat4);
    centerInst.setMatrixAt(i, mat4);
    bloomInst.setColorAt(i, it.col);
  }
  stemInst.instanceMatrix.needsUpdate = true;
  bloomInst.instanceMatrix.needsUpdate = true;
  centerInst.instanceMatrix.needsUpdate = true;
  if (bloomInst.instanceColor) bloomInst.instanceColor.needsUpdate = true;
  stemInst.computeBoundingSphere();
  bloomInst.computeBoundingSphere();
  centerInst.computeBoundingSphere();

  group.add(stemInst, bloomInst, centerInst);

  return {
    group,
    update(time: number) {
      updateFoliageWind(time);
    },
    dispose() {
      stemGeo.dispose();
      bloomGeo.dispose();
      centerGeo.dispose();
      stemMat.dispose();
      bloomMat.dispose();
      pollenMat.dispose();
      stemInst.dispose();
      bloomInst.dispose();
      centerInst.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// 5. createFernCluster — Arched Multi-Leaflet Botanical Fronds
// ---------------------------------------------------------------------------

export function createFernCluster(options: FernClusterOptions = {}): THREE.Group {
  const {
    frondCount = 10,
    radius = 0.72,
    height = 0.44,
    color = '#d8f0b8',
    seed = 212,
    castShadow = true,
  } = options;

  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'fern_cluster';

  // Fibrous dark mossy rosette crown at base
  const crownGeo = new THREE.SphereGeometry(radius * 0.14, 8, 6);
  crownGeo.scale(1, 0.55, 1);
  const crownMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3b3222'),
    roughness: 0.95,
  });
  const crown = new THREE.Mesh(crownGeo, crownMat);
  crown.position.y = radius * 0.04;
  group.add(crown);

  const frondParts: THREE.BufferGeometry[] = [];
  for (let f = 0; f < frondCount; f++) {
    const inner = f < Math.floor(frondCount * 0.35);
    const yaw = (f / frondCount) * Math.PI * 2 + (rng() - 0.5) * 0.38;
    const fLen = radius * (inner ? 0.65 + rng() * 0.2 : 0.88 + rng() * 0.28);
    const fWid = fLen * (0.44 + rng() * 0.1);
    const fH = height * (inner ? 1.05 + rng() * 0.2 : 0.72 + rng() * 0.22);

    // Subdivided arched V-creased botanical frond geometry
    const plane = new THREE.PlaneGeometry(fWid, fLen, 2, 7);
    const pos = plane.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      // Convert local y (-fLen/2 .. +fLen/2) -> t (0 at stem base -> 1 at frond tip)
      const t = (pos.getY(i) + fLen * 0.5) / fLen;
      const archY = Math.sin(t * Math.PI * 0.76) * fH - t * t * fH * 0.24;
      const archZ = t * fLen * 0.92;
      const vCrease = Math.abs(x / (fWid * 0.5)) * 0.04 * fLen;
      pos.setXYZ(i, x, archY + vCrease, archZ);
    }
    plane.rotateY(yaw);
    plane.computeVertexNormals();
    frondParts.push(plane);
  }

  const mergedFronds = mergeBufferGeometries(frondParts);
  for (const p of frondParts) p.dispose();

  const fernMat = getFoliageMaterial('fern', 0.032, 1.6);
  // If a custom color tint is provided different from default white, clone lightly
  const useMat =
    color !== '#ffffff' && color !== 0xffffff
      ? (() => {
          const m = fernMat.clone();
          m.userData = {};
          m.color.set(color);
          m.customProgramCacheKey = () => 'artkit_foliage_fern_tinted';
          m.onBeforeCompile = (shader) => injectFoliageWindVertex(shader, 0.032, 1.6, false);
          return m;
        })()
      : fernMat;

  const fernMesh = new THREE.Mesh(mergedFronds, useMat);
  fernMesh.castShadow = castShadow;
  fernMesh.receiveShadow = true;
  fernMesh.customDepthMaterial = getFoliageDepthMaterial('fern', 0.032, 1.6);
  group.add(fernMesh);

  return group;
}

// ---------------------------------------------------------------------------
// 6. createMossyBoulder — Sculpted Faceted Stone + Velvety Moss Cap
// ---------------------------------------------------------------------------

function buildSculptedRockGeo(radius: number, seed: number, mossAmount: number, stoneColor: THREE.Color, mossCol: THREE.Color): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const pos = geo.getAttribute('position');
  const rng = mulberry32(seed);
  const scaleX = 0.88 + rng() * 0.34;
  const scaleY = 0.62 + rng() * 0.26;
  const scaleZ = 0.88 + rng() * 0.34;

  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const n1 = noise3D(v.x * 1.15 / radius + 4.1, v.y * 1.15 / radius + 2.3, v.z * 1.15 / radius + 7.7, seed);
    const n2 = noise3D(v.x * 2.8 / radius, v.y * 2.8 / radius, v.z * 2.8 / radius, seed + 53);
    // Crisp stratified rock facet displacement
    const disp = 0.78 + n1 * 0.34 + (n2 - 0.5) * 0.14;
    v.multiplyScalar(disp);
    v.set(v.x * scaleX, v.y * scaleY, v.z * scaleZ);
    // Flatten underside softly so boulder sits grounded in earth
    if (v.y < -radius * 0.28) {
      v.y = lerp(v.y, -radius * 0.28, 0.72);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.computeBoundingBox();
  if (geo.boundingBox) {
    geo.translate(0, -geo.boundingBox.min.y * 0.82, 0);
  }
  geo.computeVertexNormals();

  // Per-vertex natural granite-to-moss gradient on upward-facing surfaces
  const norm = geo.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  const tmpCol = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const ny = norm.getY(i);
    const mossNoise = noise3D(px * 2.2 / radius, py * 2.2 / radius, pz * 2.2 / radius, seed + 97);
    const upMask = clamp((ny - 0.38 + (mossNoise - 0.5) * 0.45) * 2.4, 0, 1);
    const mossBlend = clamp(upMask * mossAmount, 0, 1);
    const ao = clamp(0.68 + (py / Math.max(0.01, radius * 1.2)) * 0.36, 0.55, 1.05);
    tmpCol.copy(stoneColor).lerp(mossCol, mossBlend).multiplyScalar(ao);
    colors[i * 3] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function createMossyBoulder(options: MossyBoulderOptions = {}): THREE.Group {
  const {
    radius = 0.95,
    mossAmount = 0.72,
    stoneTint = '#96948e',
    mossColor = '#4e7834',
    includeAccentStones = true,
    seed = 616,
    castShadow = true,
  } = options;

  const group = new THREE.Group();
  group.name = 'mossy_boulder';

  const stoneCol = new THREE.Color(stoneTint);
  const mossCol = new THREE.Color(mossColor);
  const rockPbr = getPBRTextures('rock', { repeatX: 2, repeatY: 2 });
  const mat = new THREE.MeshStandardMaterial({
    map: rockPbr.map,
    bumpMap: rockPbr.bumpMap,
    bumpScale: 0.04,
    roughnessMap: rockPbr.roughnessMap,
    roughness: 0.92,
    metalness: 0.02,
    vertexColors: true,
  });

  const mainGeo = buildSculptedRockGeo(radius, seed, mossAmount, stoneCol, mossCol);
  const mainMesh = new THREE.Mesh(mainGeo, mat);
  mainMesh.castShadow = castShadow;
  mainMesh.receiveShadow = true;
  group.add(mainMesh);

  if (includeAccentStones) {
    const rng = mulberry32(seed + 41);
    for (let i = 0; i < 2; i++) {
      const a = rng() * Math.PI * 2;
      const subR = radius * (0.28 + rng() * 0.16);
      const subGeo = buildSculptedRockGeo(subR, seed + 100 + i * 37, mossAmount * 0.85, stoneCol, mossCol);
      const subMesh = new THREE.Mesh(subGeo, mat);
      subMesh.position.set(Math.cos(a) * radius * 0.85, -subR * 0.08, Math.sin(a) * radius * 0.85);
      subMesh.castShadow = castShadow;
      subMesh.receiveShadow = true;
      group.add(subMesh);
    }
  }

  return group;
}

// ---------------------------------------------------------------------------
// 7. createBambooCluster — Segmented Culms with Nodes + Swaying Leaf Sprigs
// ---------------------------------------------------------------------------

export function createBambooCluster(options: BambooClusterOptions = {}): BambooCluster {
  const {
    culmCount = 9,
    heightRange = [3.6, 6.2],
    spread = 0.65,
    seed = 818,
    castShadow = true,
  } = options;

  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'bamboo_cluster';

  const culmParts: THREE.BufferGeometry[] = [];
  const nodeParts: THREE.BufferGeometry[] = [];
  const leafMatrices: THREE.Matrix4[] = [];
  const leafColors: THREE.Color[] = [];

  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const palette = [0x4c8a36, 0x5c9e3e, 0x72b44c, 0x3f782d];

  for (let c = 0; c < culmCount; c++) {
    const a = (c / culmCount) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const dist = Math.sqrt(rng()) * spread;
    const bx = Math.cos(a) * dist;
    const bz = Math.sin(a) * dist;
    const h = lerp(heightRange[0], heightRange[1], rng());
    const rBase = 0.042 + rng() * 0.022;
    const leanX = Math.cos(a) * h * (0.06 + rng() * 0.09);
    const leanZ = Math.sin(a) * h * (0.06 + rng() * 0.09);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bx, 0, bz),
      new THREE.Vector3(bx + leanX * 0.28, h * 0.38, bz + leanZ * 0.28),
      new THREE.Vector3(bx + leanX * 0.72, h * 0.74, bz + leanZ * 0.72),
      new THREE.Vector3(bx + leanX, h, bz + leanZ),
    ]);

    culmParts.push(
      buildTaperedTube({
        curve,
        tubularSegments: 14,
        radialSegments: 7,
        radiusStart: rBase,
        radiusEnd: rBase * 0.45,
        uvScaleV: 0.6,
      }),
    );

    // Distinct raised bamboo culm node rings every ~0.48m + side leaf sprigs on upper half
    const segments = Math.max(5, Math.round(h / 0.52));
    for (let s = 1; s < segments; s++) {
      const t = s / segments;
      const pt = curve.getPoint(t);
      const tang = curve.getTangent(t);
      const r = lerp(rBase, rBase * 0.45, t);
      const ring = new THREE.TorusGeometry(r * 1.06, r * 0.16, 5, 10);
      quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tang);
      ring.applyQuaternion(quat);
      ring.translate(pt.x, pt.y, pt.z);
      nodeParts.push(ring);

      if (t > 0.36) {
        const sprigCount = t > 0.72 ? 3 : 2;
        for (let k = 0; k < sprigCount; k++) {
          const sAng = a + (k - 0.5) * 1.8 + (rng() - 0.5) * 0.8;
          const m = new THREE.Matrix4();
          const dir = new THREE.Vector3(Math.cos(sAng) * 0.7, 0.55, Math.sin(sAng) * 0.7).normalize();
          quat.setFromUnitVectors(up, dir);
          const ls = (0.48 + rng() * 0.32) * (1.15 - t * 0.25);
          scl.set(ls, ls, ls);
          const pos = pt.clone().addScaledVector(dir, ls * 0.28);
          m.compose(pos, quat, scl);
          leafMatrices.push(m);
          const col = new THREE.Color(palette[Math.floor(rng() * palette.length)]);
          col.offsetHSL((rng() - 0.5) * 0.02, 0, (t - 0.5) * 0.12);
          leafColors.push(col);
        }
      }
    }
  }

  const culmGeo = mergeBufferGeometries(culmParts);
  const nodeGeo = mergeBufferGeometries(nodeParts);
  for (const g of culmParts) g.dispose();
  for (const g of nodeParts) g.dispose();

  const culmMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#6a9942'),
    roughness: 0.44,
    metalness: 0.04,
  });
  const nodeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#b6c27a'),
    roughness: 0.58,
  });

  const culmMesh = new THREE.Mesh(culmGeo, culmMat);
  culmMesh.castShadow = castShadow;
  culmMesh.receiveShadow = true;
  const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
  nodeMesh.castShadow = castShadow;
  group.add(culmMesh, nodeMesh);

  const clusterGeo = getCrossedLeafClusterGeometry(false);
  const leafMat = getFoliageMaterial('bamboo', 0.07, 1.75);
  const depthMat = getFoliageDepthMaterial('bamboo', 0.07, 1.75);
  const leafInst = new THREE.InstancedMesh(clusterGeo, leafMat, Math.max(1, leafMatrices.length));
  leafInst.castShadow = castShadow;
  leafInst.receiveShadow = true;
  leafInst.customDepthMaterial = depthMat;
  for (let i = 0; i < leafMatrices.length; i++) {
    leafInst.setMatrixAt(i, leafMatrices[i]);
    leafInst.setColorAt(i, leafColors[i]);
  }
  leafInst.instanceMatrix.needsUpdate = true;
  if (leafInst.instanceColor) leafInst.instanceColor.needsUpdate = true;
  leafInst.computeBoundingSphere();
  group.add(leafInst);

  return {
    group,
    update(time: number) {
      updateFoliageWind(time);
    },
    dispose() {
      culmGeo.dispose();
      nodeGeo.dispose();
      culmMat.dispose();
      nodeMat.dispose();
      leafInst.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// 8. createLantern — 4 Handcrafted Multi-Part Architectural Lanterns
// ---------------------------------------------------------------------------

export function createLantern(
  style: LanternStyle,
  options: LanternOptions = {},
): THREE.Group {
  const {
    scale = 1.0,
    withLight = true,
    castShadow = true,
  } = options;

  const group = new THREE.Group();
  group.name = `lantern_${style}`;

  const addMesh = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    casts = castShadow,
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = casts;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  let lightPos = new THREE.Vector3(0, 1.5, 0);
  let defaultLightColor = 0xffb35c;
  let defaultIntensity = 2.6;
  let defaultDistance = 9.0;

  if (style === 'stone_toro') {
    // Traditional Japanese carved mossy granite Tōrō lantern
    const stonePbr = getPBRTextures('rock', { repeatX: 1, repeatY: 1 });
    const stoneMat = new THREE.MeshStandardMaterial({
      map: stonePbr.map,
      bumpMap: stonePbr.bumpMap,
      bumpScale: 0.04,
      color: new THREE.Color('#9a9b92'),
      roughness: 0.92,
    });
    const mossStoneMat = new THREE.MeshStandardMaterial({
      map: stonePbr.map,
      bumpMap: stonePbr.bumpMap,
      bumpScale: 0.045,
      color: new THREE.Color('#7a876c'),
      roughness: 0.94,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fff2cf'),
      emissive: new THREE.Color('#ff9d3b'),
      emissiveIntensity: 2.8,
      roughness: 0.35,
    });

    // Stepped hexagonal kiso base
    addMesh(new THREE.CylinderGeometry(0.46, 0.54, 0.18, 6), stoneMat, 0, 0.09, 0);
    addMesh(new THREE.CylinderGeometry(0.32, 0.42, 0.14, 6), stoneMat, 0, 0.25, 0);
    // Tapered carved shaft (sao) with central ring
    addMesh(new THREE.CylinderGeometry(0.15, 0.20, 0.78, 8), stoneMat, 0, 0.71, 0);
    addMesh(new THREE.TorusGeometry(0.185, 0.032, 6, 12), stoneMat, 0, 0.72, 0, Math.PI * 0.5);
    // Carved lotus platform (chūdai)
    addMesh(new THREE.CylinderGeometry(0.42, 0.22, 0.18, 6), stoneMat, 0, 1.18, 0);
    // Glowing inner fire chamber (hibukuro) + 6 corner stone mullions
    addMesh(new THREE.CylinderGeometry(0.19, 0.19, 0.34, 6), glowMat, 0, 1.44, 0, 0, 0, 0, false);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      addMesh(
        new THREE.BoxGeometry(0.055, 0.38, 0.055),
        stoneMat,
        Math.cos(a) * 0.27,
        1.45,
        Math.sin(a) * 0.27,
        0,
        -a,
        0,
      );
    }
    // Sweeping pagoda umbrella roof (kasa) + jewel finial (hōju)
    addMesh(new THREE.CylinderGeometry(0.32, 0.64, 0.18, 6), mossStoneMat, 0, 1.72, 0);
    addMesh(new THREE.CylinderGeometry(0.11, 0.34, 0.16, 6), mossStoneMat, 0, 1.88, 0);
    addMesh(new THREE.SphereGeometry(0.1, 8, 8), stoneMat, 0, 2.02, 0);
    addMesh(new THREE.ConeGeometry(0.075, 0.14, 6), stoneMat, 0, 2.13, 0);

    lightPos.set(0, 1.44, 0);
    defaultLightColor = 0xffa642;
    defaultIntensity = 2.8;
    defaultDistance = 9.5;
  } else if (style === 'paper_sakura') {
    // Lacquered timber festival post + hanging arm + ribbed warm chōchin lantern + tassel
    const woodPbr = getPBRTextures('woodPlanks', { repeatX: 1, repeatY: 2 });
    const postMat = new THREE.MeshStandardMaterial({
      map: woodPbr.map,
      bumpMap: woodPbr.bumpMap,
      bumpScale: 0.03,
      color: new THREE.Color('#4a2422'),
      roughness: 0.58,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#221619'),
      roughness: 0.42,
      metalness: 0.15,
    });
    const paperMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffe0e8'),
      emissive: new THREE.Color('#ff8ea8'),
      emissiveIntensity: 1.85,
      roughness: 0.72,
    });
    const tasselMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#d62839'),
      roughness: 0.75,
    });

    // Timber base plinth & tall post
    addMesh(new THREE.BoxGeometry(0.36, 0.16, 0.36), capMat, 0, 0.08, 0);
    addMesh(new THREE.BoxGeometry(0.12, 2.55, 0.12), postMat, 0, 1.35, 0);
    // Angled top bracket & overhanging arm
    addMesh(new THREE.BoxGeometry(0.09, 0.09, 0.76), postMat, 0, 2.56, 0.3);
    addMesh(new THREE.BoxGeometry(0.07, 0.07, 0.48), postMat, 0, 2.34, 0.2, 0.72, 0, 0);
    // Hanging cord
    addMesh(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 6), capMat, 0, 2.40, 0.58);
    // Ribbed glowing chōchin paper lantern body
    const body = addMesh(new THREE.SphereGeometry(0.24, 14, 12), paperMat, 0, 2.04, 0.58, 0, 0, 0, false);
    body.scale.set(0.92, 1.28, 0.92);
    for (let r = -2; r <= 2; r++) {
      const ry = 2.04 + r * 0.085;
      const rad = 0.22 * Math.sqrt(Math.max(0.1, 1 - (r * 0.32) ** 2));
      addMesh(new THREE.TorusGeometry(rad, 0.008, 5, 16), capMat, 0, ry, 0.58, Math.PI * 0.5);
    }
    addMesh(new THREE.CylinderGeometry(0.13, 0.15, 0.06, 12), capMat, 0, 2.32, 0.58);
    addMesh(new THREE.CylinderGeometry(0.14, 0.12, 0.06, 12), capMat, 0, 1.75, 0.58);
    // Crimson dangling tassel
    addMesh(new THREE.CylinderGeometry(0.015, 0.045, 0.24, 8), tasselMat, 0, 1.60, 0.58);

    lightPos.set(0, 2.04, 0.58);
    defaultLightColor = 0xffa6ba;
    defaultIntensity = 2.5;
    defaultDistance = 9.0;
  } else if (style === 'noir_street') {
    // Tall Victorian/noir fluted cast-iron harbour streetlamp
    const ironMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#232931'),
      roughness: 0.48,
      metalness: 0.76,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fff5d6'),
      emissive: new THREE.Color('#ffba52'),
      emissiveIntensity: 3.1,
      roughness: 0.18,
    });

    // Molded octagonal pedestal & tapered fluted post
    addMesh(new THREE.CylinderGeometry(0.26, 0.34, 0.24, 8), ironMat, 0, 0.12, 0);
    addMesh(new THREE.CylinderGeometry(0.18, 0.25, 0.56, 8), ironMat, 0, 0.52, 0);
    addMesh(new THREE.TorusGeometry(0.2, 0.04, 6, 12), ironMat, 0, 0.82, 0, Math.PI * 0.5);
    addMesh(new THREE.CylinderGeometry(0.075, 0.13, 2.65, 10), ironMat, 0, 2.15, 0);
    // Decorative crossbar ladder rest
    addMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 6), ironMat, 0, 3.15, 0, 0, 0, Math.PI * 0.5);
    addMesh(new THREE.SphereGeometry(0.042, 8, 6), ironMat, -0.32, 3.15, 0);
    addMesh(new THREE.SphereGeometry(0.042, 8, 6), ironMat, 0.32, 3.15, 0);
    // Hexagonal lantern cage & glowing sodium-amber core
    addMesh(new THREE.CylinderGeometry(0.24, 0.14, 0.12, 6), ironMat, 0, 3.52, 0);
    addMesh(new THREE.CylinderGeometry(0.24, 0.17, 0.44, 6), glassMat, 0, 3.80, 0, 0, 0, 0, false);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      addMesh(
        new THREE.BoxGeometry(0.028, 0.48, 0.028),
        ironMat,
        Math.cos(a) * 0.23,
        3.80,
        Math.sin(a) * 0.23,
        0,
        -a,
        0.14,
      );
    }
    // Peaked vented iron dome & finial
    addMesh(new THREE.ConeGeometry(0.32, 0.26, 6), ironMat, 0, 4.15, 0);
    addMesh(new THREE.CylinderGeometry(0.02, 0.04, 0.22, 6), ironMat, 0, 4.34, 0);

    lightPos.set(0, 3.8, 0);
    defaultLightColor = 0xffbd63;
    defaultIntensity = 4.2;
    defaultDistance = 15.0;
  } else {
    // 'brass_lamp' — Victorian conservatory / observatory antique brushed brass lamp
    const brassPbr = getPBRTextures('brushedBrass', { repeatX: 1, repeatY: 1 });
    const brassMat = new THREE.MeshStandardMaterial({
      map: brassPbr.map,
      bumpMap: brassPbr.bumpMap,
      bumpScale: 0.015,
      roughnessMap: brassPbr.roughnessMap,
      roughness: 0.9,
      metalness: 0.88,
    });
    const shadeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#206b4f'),
      emissive: new THREE.Color('#1a523b'),
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    const bulbMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fff7d6'),
      emissive: new THREE.Color('#ffc266'),
      emissiveIntensity: 3.0,
      roughness: 0.2,
    });

    // Turned stepped brushed-brass base & fluted stem
    addMesh(new THREE.CylinderGeometry(0.24, 0.30, 0.08, 16), brassMat, 0, 0.04, 0);
    addMesh(new THREE.CylinderGeometry(0.14, 0.22, 0.10, 16), brassMat, 0, 0.13, 0);
    addMesh(new THREE.CylinderGeometry(0.045, 0.065, 1.15, 12), brassMat, 0, 0.74, 0);
    addMesh(new THREE.SphereGeometry(0.085, 12, 10), brassMat, 0, 0.56, 0);
    addMesh(new THREE.TorusGeometry(0.07, 0.018, 6, 14), brassMat, 0, 1.24, 0, Math.PI * 0.5);
    // Warm glowing glass filament bulb
    addMesh(new THREE.SphereGeometry(0.11, 10, 10), bulbMat, 0, 1.38, 0, 0, 0, 0, false);
    // Ribbed translucent emerald Victorian glass dome shade + brass finial
    addMesh(new THREE.CylinderGeometry(0.12, 0.36, 0.26, 16, 1, true), shadeMat, 0, 1.48, 0);
    addMesh(new THREE.TorusGeometry(0.36, 0.016, 6, 18), brassMat, 0, 1.35, 0, Math.PI * 0.5);
    addMesh(new THREE.CylinderGeometry(0.05, 0.13, 0.07, 14), brassMat, 0, 1.63, 0);
    addMesh(new THREE.SphereGeometry(0.045, 10, 8), brassMat, 0, 1.71, 0);

    lightPos.set(0, 1.36, 0);
    defaultLightColor = 0xffcf7a;
    defaultIntensity = 2.6;
    defaultDistance = 9.0;
  }

  if (withLight) {
    const light = new THREE.PointLight(
      options.lightColor ?? defaultLightColor,
      options.lightIntensity ?? defaultIntensity,
      options.lightDistance ?? defaultDistance,
      1.6,
    );
    light.position.copy(lightPos);
    group.add(light);
    group.userData.light = light;
  }

  group.scale.setScalar(scale);
  return group;
}

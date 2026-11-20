import * as THREE from 'three';
import {
  createDetailedTree,
  createParticleSystem,
  createWaterSurface,
  getPBRTextures,
  updateFoliageWind,
  type AtmosphereRig,
  type DetailedTree,
  type ParticleSystem,
  type WaterSurface,
} from '../../art';
import {
  COLORS,
  HIGHWAY_CENTER_Z,
  HIGHWAY_LENGTH,
  LANE_X,
  PLAYER_Z,
  ROAD_CURB_X,
  ROAD_WIDTH,
} from './constants';

export interface ArchTriggerEvent {
  archX: number;
  archY: number;
}

export interface SynthWorld {
  group: THREE.Group;
  sparks: ParticleSystem;
  stars: ParticleSystem;
  /**
   * Advances all scrolling shaders, recycling palms, equalizer monoliths,
   * holographic arches, synth lakes, mountain parallax, particles & wheel trails.
   * Returns count of Holographic Prism Arches threaded this frame.
   */
  update(
    dt: number,
    elapsed: number,
    opts: {
      speed: number;
      distance: number;
      beatPulse: number; // 1.0 on quarter-note beat, decaying to 0
      beatPhase: number; // [0..1) within current beat
      overdrive: boolean;
      grinding: boolean;
      playerPos: THREE.Vector3;
      playerAirborne: boolean;
      cameraPos: THREE.Vector3;
    }
  ): number;
  reset(): void;
  dispose(): void;
}

const ROAD_OVERLAY_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ROAD_OVERLAY_FRAGMENT = /* glsl */ `
  uniform float uDistance;
  uniform float uBeatPulse;
  uniform float uOverdrive;
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    float x = vWorldPos.x;
    float z = vWorldPos.z - uDistance;

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // 4 dashed interior lane dividers at x = +/-1.325 and +/-3.975
    float dInnerL = abs(x + 1.325);
    float dInnerR = abs(x - 1.325);
    float dOuterL = abs(x + 3.975);
    float dOuterR = abs(x - 3.975);

    float dash = smoothstep(0.32, 0.38, fract(-z * 0.125)) * (1.0 - smoothstep(0.84, 0.90, fract(-z * 0.125)));

    float innerLine = (smoothstep(0.085, 0.02, dInnerL) + smoothstep(0.085, 0.02, dInnerR)) * dash;
    float innerHalo = (exp(-dInnerL * 7.0) + exp(-dInnerR * 7.0)) * (0.24 + 0.35 * dash);

    float outerLine = (smoothstep(0.085, 0.02, dOuterL) + smoothstep(0.085, 0.02, dOuterR)) * dash;
    float outerHalo = (exp(-dOuterL * 7.0) + exp(-dOuterR * 7.0)) * (0.24 + 0.35 * dash);

    vec3 cyan = vec3(0.0, 0.96, 1.0);
    vec3 magenta = vec3(1.0, 0.18, 0.65);
    vec3 gold = vec3(1.0, 0.82, 0.28);

    vec3 innerTint = mix(cyan, gold, uOverdrive * 0.45);
    vec3 outerTint = mix(magenta, cyan, uOverdrive * 0.4);

    col += innerTint * (innerLine * 1.65 + innerHalo * 0.55);
    col += outerTint * (outerLine * 1.55 + outerHalo * 0.52);
    alpha += clamp(innerLine + outerLine + (innerHalo + outerHalo) * 0.48, 0.0, 0.95);

    // Continuous glowing shoulder edge strips at x = +/-7.18
    float dEdge = min(abs(x + 7.18), abs(x - 7.18));
    float edgeCore = smoothstep(0.14, 0.03, dEdge);
    float edgeGlow = exp(-dEdge * 4.5) * 0.55;
    vec3 edgeCol = x < 0.0 ? magenta : cyan;
    col += edgeCol * (edgeCore * 1.85 + edgeGlow) * (1.0 + uBeatPulse * 0.45);
    alpha = max(alpha, clamp(edgeCore + edgeGlow * 0.55, 0.0, 0.96));

    // Beat-synced sweeping neon pulse rings rushing down the highway
    float beatWavePos = fract(uTime * 2.0) * 145.0; // 120 BPM = 2 beats/sec
    float waveDist = abs((-vWorldPos.z) - beatWavePos);
    float beatBand = exp(-waveDist * 0.16) * (0.35 + uBeatPulse * 0.55);
    float laneCenterGlow = exp(-abs(x) * 0.18) * 0.6 + 0.4;
    vec3 pulseCol = mix(magenta, cyan, 0.5 + 0.5 * sin(vWorldPos.z * 0.05 + uTime * 3.0));
    col += pulseCol * beatBand * laneCenterGlow * 0.72;
    alpha = max(alpha, beatBand * 0.38);

    // Subtle reflective wet sunset sheen along center road toward the Outrun sun
    float sunTrack = exp(-abs(x) * 0.28) * smoothstep(10.0, -140.0, vWorldPos.z) * 0.26;
    col += vec3(1.0, 0.46, 0.62) * sunTrack;
    alpha = max(alpha, sunTrack * 0.5);

    // Exponential horizon fog fade
    float camDist = length(cameraPosition - vWorldPos);
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * camDist * camDist);
    alpha *= clamp(1.0 - fogFactor * 0.92, 0.0, 1.0);

    if (alpha < 0.008) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.96));
  }
`;

const NEON_GRID_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const NEON_GRID_FRAGMENT = /* glsl */ `
  uniform float uDistance;
  uniform float uBeatPulse;
  uniform float uOverdrive;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec3 vWorldPos;

  void main() {
    float camDist = length(cameraPosition - vWorldPos);
    vec2 coord = vec2(vWorldPos.x * 0.34, (vWorldPos.z - uDistance) * 0.28);
    vec2 cellDist = abs(fract(coord - 0.5) - 0.5);

    // Distance-filtered anti-aliased neon grid lines (zero horizon Moire artifacts)
    float aaX = clamp(0.022 + camDist * 0.00075, 0.022, 0.14);
    float aaZ = clamp(0.022 + camDist * 0.0016, 0.022, 0.22);
    float lineX = 1.0 - smoothstep(0.016, 0.016 + aaX, cellDist.x);
    float lineZ = 1.0 - smoothstep(0.016, 0.016 + aaZ, cellDist.y);

    // Soft additive bloom halo around grid cells
    float glowX = exp(-cellDist.x * 16.0) * 0.35;
    float glowZ = exp(-cellDist.y * 16.0) * 0.35;

    vec3 baseFloor = vec3(0.055, 0.02, 0.13);
    vec3 magenta = vec3(1.0, 0.16, 0.66);
    vec3 cyan = vec3(0.08, 0.92, 1.0);

    vec3 col = baseFloor;
    col += magenta * (lineX * 1.18 + glowX) * (0.95 + uBeatPulse * 0.3);
    col += mix(magenta, cyan, 0.55 + uOverdrive * 0.35) * (lineZ * 1.25 + glowZ) * (0.9 + uBeatPulse * 0.65);

    // Subtle sunset reflection gradient toward distant horizon
    float horizonTint = smoothstep(-20.0, -180.0, vWorldPos.z) * 0.22;
    col += vec3(0.65, 0.14, 0.52) * horizonTint;

    // Exponential scene fog
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * camDist * camDist);
    col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface EqualizerTower {
  group: THREE.Group;
  bars: THREE.Mesh[];
  phaseOffset: number;
  baseZ: number;
}

interface PrismArch {
  group: THREE.Group;
  glowMat: THREE.MeshStandardMaterial;
  chevronMat: THREE.MeshBasicMaterial;
  flash: number;
  passed: boolean;
}

interface WheelRibbonTrail {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  mat: THREE.MeshBasicMaterial;
  points: THREE.Vector3[];
  update(dt: number, speed: number, anchorX: number, anchorY: number, anchorZ: number, active: boolean, color: THREE.Color): void;
  reset(x: number, y: number, z: number): void;
  dispose(): void;
}

function createWheelRibbonTrail(segments = 24, halfWidth = 0.095): WheelRibbonTrail {
  const vertCount = segments * 2;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices: number[] = [];

  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  const points: THREE.Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    points.push(new THREE.Vector3(0, 0.04, i * 0.25));
  }

  const update = (
    dt: number,
    speed: number,
    anchorX: number,
    anchorY: number,
    anchorZ: number,
    active: boolean,
    color: THREE.Color
  ): void => {
    // Shift existing trail points backward along +Z by road travel distance
    const dz = speed * dt;
    for (let i = segments - 1; i >= 1; i--) {
      points[i].copy(points[i - 1]);
      points[i].z += dz;
    }
    points[0].set(anchorX, anchorY, anchorZ);

    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const colAttr = geo.attributes.color as THREE.BufferAttribute;
    const widthScale = active ? 1.0 : 0.28;

    for (let i = 0; i < segments; i++) {
      const t = 1 - i / (segments - 1); // 1 at head -> 0 at tail
      const w = halfWidth * widthScale * (0.25 + t * 0.85);
      const p = points[i];
      const idx = i * 2;

      posAttr.setXYZ(idx, p.x - w, p.y, p.z);
      posAttr.setXYZ(idx + 1, p.x + w, p.y, p.z);

      const fade = t * t * (active ? 1.0 : 0.25);
      colAttr.setXYZ(idx, color.r * fade, color.g * fade, color.b * fade);
      colAttr.setXYZ(idx + 1, color.r * fade, color.g * fade, color.b * fade);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  };

  const reset = (x: number, y: number, z: number): void => {
    for (let i = 0; i < segments; i++) {
      points[i].set(x, y, z + i * 0.22);
    }
  };

  return {
    mesh,
    geo,
    mat,
    points,
    update,
    reset,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/**
 * Builds a seamlessly tileable faceted alpine mountain strip (exact periodic Z-wrap)
 * with obsidian crystal slopes + glowing neon wireframe ridges.
 */
function buildMountainRangeChunk(
  side: -1 | 1,
  chunkLength: number,
  seedOffset: number
): THREE.Group {
  const group = new THREE.Group();
  const segX = 14;
  const segZ = 34;
  const widthX = 96;

  const geo = new THREE.PlaneGeometry(widthX, chunkLength, segX, segZ);
  geo.rotateX(-Math.PI * 0.5);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const twoPi = Math.PI * 2;

  for (let i = 0; i < pos.count; i++) {
    const localX = pos.getX(i); // [-widthX/2, +widthX/2]
    const localZ = pos.getZ(i); // [-chunkLength/2, +chunkLength/2]

    // Normalized distance away from the lake shoreline [0..1]
    const u = side > 0 ? (localX + widthX * 0.5) / widthX : (widthX * 0.5 - localX) / widthX;
    // Periodic phase along Z so z = -L/2 and z = +L/2 match identically
    const zPhase = ((localZ + chunkLength * 0.5) / chunkLength) * twoPi;

    // Dramatic alpine ridge envelope: low at shoreline, towering peaks mid-range, tapering at back
    const env = Math.sin(Math.pow(Math.max(0, Math.min(1, u)), 0.82) * Math.PI);
    const w1 = Math.sin(zPhase * 2 + u * 5.2 + seedOffset) * 0.5 + 0.5;
    const w2 = Math.cos(zPhase * 5 - u * 8.4 + seedOffset * 1.7) * 0.5 + 0.5;
    const w3 = Math.abs(Math.sin(zPhase * 3 + u * 11.0 + seedOffset * 0.6));
    const ridge = Math.pow(w1 * 0.52 + w2 * 0.28 + w3 * 0.2, 1.35);

    const y = Math.max(-0.5, env * (8.5 + ridge * 38.0) - (1 - Math.min(1, u * 5)) * 1.4);
    pos.setY(i, y);
  }

  geo.computeVertexNormals();

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x160932,
    emissive: 0x1e073d,
    emissiveIntensity: 0.42,
    roughness: 0.48,
    metalness: 0.4,
    flatShading: true,
    envMapIntensity: 1.2,
  });

  const solidMesh = new THREE.Mesh(geo, rockMat);
  solidMesh.receiveShadow = false;
  group.add(solidMesh);

  // Glowing Outrun wireframe ridge overlay with altitude magenta -> cyan color gradient
  const wireGeo = new THREE.WireframeGeometry(geo);
  const wPos = wireGeo.attributes.position as THREE.BufferAttribute;
  const wColors = new Float32Array(wPos.count * 3);
  const lowCol = new THREE.Color(0x6918a8);
  const midCol = new THREE.Color(0xff2ea6);
  const peakCol = new THREE.Color(0x00f5ff);
  const tmpCol = new THREE.Color();

  for (let i = 0; i < wPos.count; i++) {
    const wy = wPos.getY(i);
    const hNorm = THREE.MathUtils.clamp(wy / 34, 0, 1);
    if (hNorm < 0.55) {
      tmpCol.lerpColors(lowCol, midCol, hNorm / 0.55);
    } else {
      tmpCol.lerpColors(midCol, peakCol, (hNorm - 0.55) / 0.45);
    }
    wColors[i * 3] = tmpCol.r;
    wColors[i * 3 + 1] = tmpCol.g;
    wColors[i * 3 + 2] = tmpCol.b;
  }
  wireGeo.setAttribute('color', new THREE.BufferAttribute(wColors, 3));

  const wireMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.58,
  });
  const wireLines = new THREE.LineSegments(wireGeo, wireMat);
  wireLines.position.y = 0.08;
  group.add(wireLines);

  // Position range just outside the mirror synth lakes
  group.position.x = side * (51 + widthX * 0.5);
  group.position.y = -0.35;
  return group;
}

export function createSynthWorld(atmosphere: AtmosphereRig): SynthWorld {
  const group = new THREE.Group();
  group.name = 'SynthwaveWorld';

  // -------------------------------------------------------------------------
  // 1. Glossy Wet-Obsidian 5-Lane Highway + Custom Beat-Reactive Neon Overlay
  // -------------------------------------------------------------------------
  const asphaltPbr = getPBRTextures('asphalt', {
    repeatX: 2.2,
    repeatY: 38,
    wet: true,
    tint: '#321c56',
  });

  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltPbr.map,
    bumpMap: asphaltPbr.bumpMap,
    bumpScale: 0.025,
    roughnessMap: asphaltPbr.roughnessMap,
    roughness: 0.25,
    metalness: 0.36,
    color: 0x2a1848,
    envMapIntensity: 1.55,
  });

  const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, HIGHWAY_LENGTH, 1, 1);
  roadGeo.rotateX(-Math.PI * 0.5);
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.position.set(0, 0, HIGHWAY_CENTER_Z);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  const roadOverlayUniforms = {
    uDistance: { value: 0 },
    uBeatPulse: { value: 0 },
    uOverdrive: { value: 0 },
    uTime: { value: 0 },
    uFogColor: { value: atmosphere.fogColor.clone() },
    uFogDensity: { value: atmosphere.fogDensity },
  };
  const roadOverlayMat = new THREE.ShaderMaterial({
    uniforms: roadOverlayUniforms,
    vertexShader: ROAD_OVERLAY_VERTEX,
    fragmentShader: ROAD_OVERLAY_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const roadOverlayGeo = new THREE.PlaneGeometry(ROAD_WIDTH, HIGHWAY_LENGTH, 1, 1);
  roadOverlayGeo.rotateX(-Math.PI * 0.5);
  const roadOverlayMesh = new THREE.Mesh(roadOverlayGeo, roadOverlayMat);
  roadOverlayMesh.position.set(0, 0.015, HIGHWAY_CENTER_Z);
  group.add(roadOverlayMesh);

  // Polished Chrome Highway Side Curbs + Neon Trim Tubes
  const chromeMat = new THREE.MeshStandardMaterial({
    color: COLORS.chrome,
    metalness: 0.92,
    roughness: 0.15,
    envMapIntensity: 1.85,
  });
  const darkChromeMat = new THREE.MeshStandardMaterial({
    color: 0x1c1438,
    metalness: 0.82,
    roughness: 0.22,
    envMapIntensity: 1.5,
  });
  const neonMagentaMat = new THREE.MeshStandardMaterial({
    color: COLORS.magenta,
    emissive: COLORS.magenta,
    emissiveIntensity: 2.3,
    roughness: 0.2,
  });
  const neonCyanMat = new THREE.MeshStandardMaterial({
    color: COLORS.cyan,
    emissive: COLORS.cyan,
    emissiveIntensity: 2.3,
    roughness: 0.2,
  });

  const curbGeo = new THREE.BoxGeometry(0.75, 0.34, HIGHWAY_LENGTH);
  const curbLipGeo = new THREE.BoxGeometry(0.24, 0.14, HIGHWAY_LENGTH);
  const curbStripGeo = new THREE.BoxGeometry(0.1, 0.08, HIGHWAY_LENGTH);

  for (const side of [-1, 1] as const) {
    const curb = new THREE.Mesh(curbGeo, darkChromeMat);
    curb.position.set(side * ROAD_CURB_X, 0.14, HIGHWAY_CENTER_Z);
    curb.receiveShadow = true;
    group.add(curb);

    const lip = new THREE.Mesh(curbLipGeo, chromeMat);
    lip.position.set(side * (ROAD_CURB_X - 0.24), 0.34, HIGHWAY_CENTER_Z);
    group.add(lip);

    const neonStrip = new THREE.Mesh(curbStripGeo, side < 0 ? neonMagentaMat : neonCyanMat);
    neonStrip.position.set(side * (ROAD_CURB_X - 0.39), 0.24, HIGHWAY_CENTER_Z);
    group.add(neonStrip);
  }

  // Recycling Chrome Curb Chevron Bollards
  const bollardGeo = new THREE.BoxGeometry(0.22, 0.72, 0.34);
  const bollardCapGeo = new THREE.BoxGeometry(0.24, 0.14, 0.38);
  const bollardCountPerSide = 22;
  const bollardSpan = 220;
  const bollards: THREE.Group[] = [];
  for (let i = 0; i < bollardCountPerSide; i++) {
    const z = 20 - (i / bollardCountPerSide) * bollardSpan;
    for (const side of [-1, 1] as const) {
      const b = new THREE.Group();
      const post = new THREE.Mesh(bollardGeo, darkChromeMat);
      post.position.y = 0.36;
      const cap = new THREE.Mesh(bollardCapGeo, side < 0 ? neonMagentaMat : neonCyanMat);
      cap.position.y = 0.74;
      b.add(post, cap);
      b.position.set(side * (ROAD_CURB_X + 0.34), 0.16, z);
      group.add(b);
      bollards.push(b);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Scrolling Perspective Neon Grid Promenade Shoulders
  // -------------------------------------------------------------------------
  const gridUniforms = {
    uDistance: { value: 0 },
    uBeatPulse: { value: 0 },
    uOverdrive: { value: 0 },
    uFogColor: { value: atmosphere.fogColor.clone() },
    uFogDensity: { value: atmosphere.fogDensity },
  };
  const gridMat = new THREE.ShaderMaterial({
    uniforms: gridUniforms,
    vertexShader: NEON_GRID_VERTEX,
    fragmentShader: NEON_GRID_FRAGMENT,
  });

  // Inner promenade grid (x from +/-8.2 to +/-19.8) where palms & equalizers sit cleanly
  const promenadeWidth = 11.6;
  const promenadeGeo = new THREE.PlaneGeometry(promenadeWidth, HIGHWAY_LENGTH + 20);
  promenadeGeo.rotateX(-Math.PI * 0.5);
  for (const side of [-1, 1] as const) {
    const prom = new THREE.Mesh(promenadeGeo, gridMat);
    prom.position.set(side * (8.2 + promenadeWidth * 0.5), -0.02, HIGHWAY_CENTER_Z);
    group.add(prom);

    // Sleek glowing shoreline retaining wall flanking the synth lakes
    const seaWallGeo = new THREE.BoxGeometry(0.45, 0.38, HIGHWAY_LENGTH + 20);
    const seaWall = new THREE.Mesh(seaWallGeo, darkChromeMat);
    seaWall.position.set(side * 19.8, -0.06, HIGHWAY_CENTER_Z);
    group.add(seaWall);

    const seaNeonGeo = new THREE.BoxGeometry(0.14, 0.08, HIGHWAY_LENGTH + 20);
    const seaNeon = new THREE.Mesh(seaNeonGeo, side < 0 ? neonCyanMat : neonMagentaMat);
    seaNeon.position.set(side * 19.95, 0.12, HIGHWAY_CENTER_Z);
    group.add(seaNeon);
  }

  // -------------------------------------------------------------------------
  // 3. Translucent Synth Mirror Lakes (createWaterSurface)
  // -------------------------------------------------------------------------
  const lakes: WaterSurface[] = [];
  for (const side of [-1, 1] as const) {
    const lake = createWaterSurface({
      width: 36,
      depth: 250,
      segments: 34,
      deepColor: '#12062a',
      shallowColor: '#5a1688',
      skyColor: '#ff4f9a',
      foamColor: '#29f2ff',
      sunDirection: atmosphere.sunDirection,
      sunColor: '#ffce47',
      waveSpeed: 1.25,
      waveScale: 0.42,
      waveHeight: 0.085,
      edgeFoamWidth: 0.09,
      opacity: 0.88,
      fogColor: atmosphere.fogColor,
      fogDensity: atmosphere.fogDensity,
    });
    lake.mesh.position.set(side * 37.5, -0.22, HIGHWAY_CENTER_Z - 6);
    group.add(lake.mesh);
    lakes.push(lake);
  }

  // -------------------------------------------------------------------------
  // 4. Sculpted Faceted Alpine Mountain Ranges (Looping Seamless Chunks)
  // -------------------------------------------------------------------------
  const mountainChunkLen = 150;
  const mountainChunks: THREE.Group[] = [];
  for (const side of [-1, 1] as const) {
    for (let k = 0; k < 2; k++) {
      const chunk = buildMountainRangeChunk(side, mountainChunkLen, side > 0 ? 1.1 : 3.7);
      chunk.position.z = 25 - k * mountainChunkLen;
      group.add(chunk);
      mountainChunks.push(chunk);
    }
  }

  // -------------------------------------------------------------------------
  // 5. High-Craft Neon Botanicals (Recycling Avenues of `neon_palm`)
  // -------------------------------------------------------------------------
  const palmTrees: DetailedTree[] = [];
  const palmUnits: THREE.Group[] = [];
  const palmCountPerSide = 9;
  const palmSpan = 225;
  const palmAccents = ['#ff2ea6', '#00f5ff', '#b84dff'];
  const plinthGeo = new THREE.CylinderGeometry(0.92, 1.12, 0.34, 8);
  const plinthRingGeo = new THREE.TorusGeometry(0.98, 0.05, 8, 16);
  plinthRingGeo.rotateX(Math.PI * 0.5);

  for (let i = 0; i < palmCountPerSide; i++) {
    for (const side of [-1, 1] as const) {
      const idx = i * 2 + (side < 0 ? 0 : 1);
      const accent = palmAccents[idx % palmAccents.length];
      const height = 6.8 + ((idx * 17) % 10) * 0.22;
      const tree = createDetailedTree({
        style: 'neon_palm',
        height,
        seed: 700 + idx * 31,
        castShadow: false,
        receiveShadow: false,
        neonAccent: accent,
      });
      palmTrees.push(tree);

      const unit = new THREE.Group();
      const plinth = new THREE.Mesh(plinthGeo, darkChromeMat);
      plinth.position.y = 0.16;
      const ring = new THREE.Mesh(plinthRingGeo, accent === '#00f5ff' ? neonCyanMat : neonMagentaMat);
      ring.position.y = 0.32;

      tree.group.position.y = 0.28;
      // Gently angle palms slightly outward so fronds canopy cleanly along roadside
      tree.group.rotation.y = side < 0 ? -0.35 + (i % 3) * 0.35 : Math.PI + 0.35 - (i % 3) * 0.35;
      unit.add(plinth, ring, tree.group);

      const staggerX = i % 2 === 0 ? 10.6 : 13.4;
      const z = 16 - (i / palmCountPerSide) * palmSpan - (side > 0 ? 11.5 : 0);
      unit.position.set(side * staggerX, -0.02, z);
      group.add(unit);
      palmUnits.push(unit);
    }
  }

  // -------------------------------------------------------------------------
  // 6. Beat-Reactive Equalizer Monolith Towers (120 BPM Live Pulse!)
  // -------------------------------------------------------------------------
  const eqTowers: EqualizerTower[] = [];
  const eqCountPerSide = 8;
  const eqSpan = 224;
  const eqBaseGeo = new THREE.BoxGeometry(1.7, 0.5, 1.7);
  const eqSpineGeo = new THREE.BoxGeometry(0.42, 10.5, 0.42);
  const eqBarGeo = new THREE.BoxGeometry(1.36, 0.72, 1.36);

  // 8 shared emissive bar materials (violet -> magenta -> cyan -> gold peak)
  const eqPalette = [
    0x7c2ae8, 0xa82ef0, 0xd82eb8, 0xff2ea6, 0xff4c88, 0x00d9ff, 0x00f5ff, 0xffce47,
  ];
  const eqBarMats = eqPalette.map(
    (hex) =>
      new THREE.MeshStandardMaterial({
        color: hex,
        emissive: hex,
        emissiveIntensity: 1.85,
        roughness: 0.22,
        metalness: 0.25,
      })
  );

  for (let i = 0; i < eqCountPerSide; i++) {
    const z = 12 - (i / eqCountPerSide) * eqSpan;
    for (const side of [-1, 1] as const) {
      const tower = new THREE.Group();
      const base = new THREE.Mesh(eqBaseGeo, darkChromeMat);
      base.position.y = 0.25;
      const spine = new THREE.Mesh(eqSpineGeo, darkChromeMat);
      spine.position.y = 5.25;
      tower.add(base, spine);

      const bars: THREE.Mesh[] = [];
      for (let b = 0; b < 8; b++) {
        const bar = new THREE.Mesh(eqBarGeo, eqBarMats[b]);
        bar.position.y = 1.05 + b * 1.12;
        tower.add(bar);
        bars.push(bar);
      }

      tower.position.set(side * 17.5, -0.02, z);
      group.add(tower);
      eqTowers.push({
        group: tower,
        bars,
        phaseOffset: i * 0.75 + (side > 0 ? 1.4 : 0),
        baseZ: z,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 7. Sweeping Holographic Prism Arches spanning the 5-Lane Highway
  // -------------------------------------------------------------------------
  const archSpacing = 62;
  const archCount = 4;
  const arches: PrismArch[] = [];

  const pylonGeo = new THREE.BoxGeometry(0.75, 10.6, 1.05);
  const crossBeamGeo = new THREE.BoxGeometry(19.2, 0.58, 0.9);
  const trimVerticalGeo = new THREE.BoxGeometry(0.16, 10.2, 0.18);
  const trimTopGeo = new THREE.BoxGeometry(18.6, 0.18, 0.18);
  const keystoneGeo = new THREE.OctahedronGeometry(0.95, 0);
  const chevronRibbonGeo = new THREE.PlaneGeometry(16.2, 1.35);

  for (let i = 0; i < archCount; i++) {
    const archGroup = new THREE.Group();
    const isCyan = i % 2 === 0;
    const baseHex = isCyan ? COLORS.cyan : COLORS.magenta;
    const glowMat = new THREE.MeshStandardMaterial({
      color: baseHex,
      emissive: baseHex,
      emissiveIntensity: 2.2,
      roughness: 0.18,
    });
    const chevronMat = new THREE.MeshBasicMaterial({
      color: baseHex,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (const side of [-1, 1] as const) {
      const pylon = new THREE.Mesh(pylonGeo, darkChromeMat);
      pylon.position.set(side * 9.35, 5.2, 0);
      pylon.rotation.z = side * 0.08;
      archGroup.add(pylon);

      const trim = new THREE.Mesh(trimVerticalGeo, glowMat);
      trim.position.set(side * 8.92, 5.2, 0.52);
      trim.rotation.z = side * 0.08;
      archGroup.add(trim);
    }

    const beam = new THREE.Mesh(crossBeamGeo, darkChromeMat);
    beam.position.set(0, 10.2, 0);
    archGroup.add(beam);

    const topTrim = new THREE.Mesh(trimTopGeo, glowMat);
    topTrim.position.set(0, 9.88, 0.48);
    archGroup.add(topTrim);

    // Subtle hanging faceted prism crystal right at arch crown (high above HUD & camera sightline)
    const keystone = new THREE.Mesh(keystoneGeo, glowMat);
    keystone.position.set(0, 10.2, 0);
    keystone.scale.set(1.25, 0.72, 0.72);
    archGroup.add(keystone);

    const ribbon = new THREE.Mesh(chevronRibbonGeo, chevronMat);
    ribbon.position.set(0, 9.12, 0);
    archGroup.add(ribbon);

    const startZ = -44 - i * archSpacing;
    archGroup.position.set(0, 0, startZ);
    group.add(archGroup);
    arches.push({
      group: archGroup,
      glowMat,
      chevronMat,
      flash: 0,
      passed: false,
    });
  }

  // -------------------------------------------------------------------------
  // 8. Streaking Starfield, Wheel-Trail Sparks & Dual Tire Neon Ribbons
  // -------------------------------------------------------------------------
  const stars = createParticleSystem({
    type: 'stars',
    count: 340,
    bounds: { width: 96, height: 38, depth: 180 },
    center: new THREE.Vector3(0, 16, -70),
    wind: new THREE.Vector3(0, 0, 32),
    size: 0.34,
    colors: [0xffffff, 0x00f5ff, 0xff80cc, 0xffe082],
    ambient: true,
    burstCapacity: 0,
  });
  group.add(stars.group);

  const sparks = createParticleSystem({
    type: 'sparks',
    ambient: false,
    count: 0,
    size: 0.24,
    colors: [0x00f5ff, 0xff2ea6, 0xffce47, 0xffffff],
    burstCapacity: 460,
  });
  group.add(sparks.group);

  const leftWheelTrail = createWheelRibbonTrail(24, 0.085);
  const rightWheelTrail = createWheelRibbonTrail(24, 0.085);
  group.add(leftWheelTrail.mesh, rightWheelTrail.mesh);

  const trailColor = new THREE.Color();
  const cyanCol = new THREE.Color(COLORS.cyan);
  const goldCol = new THREE.Color(COLORS.gold);
  const magentaCol = new THREE.Color(COLORS.magenta);

  const reset = (): void => {
    for (let i = 0; i < arches.length; i++) {
      arches[i].group.position.z = -44 - i * archSpacing;
      arches[i].passed = false;
      arches[i].flash = 0;
    }
    leftWheelTrail.reset(-0.34, 0.06, 0.35);
    rightWheelTrail.reset(0.34, 0.06, 0.35);
    sparks.clear();
  };

  const update = (
    dt: number,
    elapsed: number,
    opts: {
      speed: number;
      distance: number;
      beatPulse: number;
      beatPhase: number;
      overdrive: boolean;
      grinding: boolean;
      playerPos: THREE.Vector3;
      playerAirborne: boolean;
      cameraPos: THREE.Vector3;
    }
  ): number => {
    const { speed, distance, beatPulse, beatPhase, overdrive, grinding, playerPos, playerAirborne } = opts;
    const dz = speed * dt;

    // 1. Scroll wet-obsidian asphalt PBR UVs & custom neon shaders
    // Asphalt repeatY = 38 across HIGHWAY_LENGTH = 270 -> 38/270 UV units per world unit
    const uvScroll = (distance * 38) / HIGHWAY_LENGTH;
    asphaltPbr.map.offset.y = uvScroll;
    asphaltPbr.bumpMap.offset.y = uvScroll;
    asphaltPbr.roughnessMap.offset.y = uvScroll;

    roadOverlayUniforms.uDistance.value = distance;
    roadOverlayUniforms.uBeatPulse.value = beatPulse;
    roadOverlayUniforms.uOverdrive.value = overdrive ? 1.0 : 0.0;
    roadOverlayUniforms.uTime.value = elapsed;

    gridUniforms.uDistance.value = distance;
    gridUniforms.uBeatPulse.value = beatPulse;
    gridUniforms.uOverdrive.value = overdrive ? 1.0 : 0.0;

    // 2. Update translucent mirror synth lakes & palm wind sway
    for (const lake of lakes) {
      lake.update(elapsed);
    }
    updateFoliageWind(elapsed, 1.35 + (speed / 45) * 0.95);

    // 3. Scroll curb bollards
    for (const b of bollards) {
      b.position.z += dz;
      if (b.position.z > 22) {
        b.position.z -= bollardSpan;
      }
    }

    // 4. Scroll flanking neon palms seamlessly
    for (const p of palmUnits) {
      p.position.z += dz;
      if (p.position.z > 24) {
        p.position.z -= palmSpan;
      }
    }

    // 5. Scroll & animate 120 BPM Equalizer Monolith Towers
    for (const eq of eqTowers) {
      eq.group.position.z += dz;
      if (eq.group.position.z > 24) {
        eq.group.position.z -= eqSpan;
      }

      // Compute lively 120 BPM frequency column height [2..8 bars lit]
      const harmonic =
        0.48 +
        0.3 * Math.sin(elapsed * 5.2 + eq.phaseOffset) +
        0.22 * Math.cos(elapsed * 9.6 - eq.phaseOffset * 1.4);
      const level = THREE.MathUtils.clamp(harmonic * 0.58 + beatPulse * 0.58 + (overdrive ? 0.25 : 0), 0.18, 1.0);
      const activeBars = Math.round(level * 8);

      for (let b = 0; b < eq.bars.length; b++) {
        const bar = eq.bars[b];
        const lit = b < activeBars;
        const targetScale = lit ? 1.0 + (b === activeBars - 1 ? beatPulse * 0.22 : 0) : 0.14;
        bar.scale.set(lit ? 1.0 : 0.45, targetScale, lit ? 1.0 : 0.45);
        bar.visible = b < activeBars + 1;
      }
    }

    // 6. Scroll Alpine Mountains at majestic parallax speed (0.48x road speed)
    const mountainDz = dz * 0.48;
    for (const chunk of mountainChunks) {
      chunk.position.z += mountainDz;
      if (chunk.position.z > 25 + mountainChunkLen * 0.5) {
        chunk.position.z -= mountainChunkLen * 2;
      }
    }

    // 7. Scroll Holographic Prism Arches & detect Gate Thread events
    let threadedCount = 0;
    const totalArchLoop = archSpacing * archCount;
    for (const arch of arches) {
      arch.group.position.z += dz;
      if (!arch.passed && arch.group.position.z >= PLAYER_Z) {
        arch.passed = true;
        arch.flash = 1.0;
        threadedCount++;
      }
      if (arch.group.position.z > 24) {
        arch.group.position.z -= totalArchLoop;
        arch.passed = false;
        arch.flash = 0;
      }

      if (arch.flash > 0) {
        arch.flash = Math.max(0, arch.flash - dt * 2.8);
      }
      const pulse = 1.9 + beatPulse * 1.2 + arch.flash * 4.0 + (overdrive ? 0.9 : 0);
      arch.glowMat.emissiveIntensity = pulse;
      arch.chevronMat.opacity = 0.2 + beatPulse * 0.14 + arch.flash * 0.55;
    }

    // 8. Streaking starfield & burst sparks
    stars.setWind(0, 0, speed * (overdrive ? 1.45 : 0.95));
    stars.update(dt);
    sparks.update(dt);

    // 9. Dual glowing neon wheel ribbon trails
    if (overdrive) {
      trailColor.lerpColors(cyanCol, goldCol, 0.5 + 0.5 * Math.sin(beatPhase * Math.PI * 2));
    } else if (grinding) {
      trailColor.lerpColors(goldCol, magentaCol, 0.35);
    } else {
      trailColor.copy(cyanCol);
    }
    const trackOffset = 0.36;
    const trailY = Math.max(0.055, playerPos.y + 0.055);
    const trailActive = !playerAirborne || grinding || overdrive;
    leftWheelTrail.update(dt, speed, playerPos.x - trackOffset, trailY, playerPos.z + 0.36, trailActive, trailColor);
    rightWheelTrail.update(dt, speed, playerPos.x + trackOffset, trailY, playerPos.z + 0.36, trailActive, trailColor);

    // Subtle unused lane reference sanity keep
    void LANE_X;

    return threadedCount;
  };

  const dispose = (): void => {
    // Reset shared PBR texture offsets cleanly before scene disposal
    asphaltPbr.map.offset.set(0, 0);
    asphaltPbr.bumpMap.offset.set(0, 0);
    asphaltPbr.roughnessMap.offset.set(0, 0);

    for (const tree of palmTrees) tree.dispose();
    for (const lake of lakes) lake.dispose();
    stars.dispose();
    sparks.dispose();
    leftWheelTrail.dispose();
    rightWheelTrail.dispose();
  };

  return {
    group,
    sparks,
    stars,
    update,
    reset,
    dispose,
  };
}

import * as THREE from 'three';

export type ParticleType =
  | 'petals'
  | 'autumn_leaves'
  | 'snow'
  | 'rain'
  | 'sparks'
  | 'dust'
  | 'fireflies'
  | 'stars'
  | 'confetti'
  | 'smoke';

export interface ParticleSystemOptions {
  type: ParticleType;
  count?: number;
  bounds?: { width: number; height: number; depth: number };
  center?: THREE.Vector3;
  wind?: THREE.Vector3;
  size?: number;
  colors?: THREE.ColorRepresentation[];
  /** Whether particles spawn continuously across the volume (default true for ambient types, false for sparks/confetti/smoke) */
  ambient?: boolean;
  /** Extra burst capacity reserved in the buffer (default 96) */
  burstCapacity?: number;
}

export interface ParticleBurstOptions {
  speed?: number;
  upwardBias?: number;
  spread?: number;
  lifeRange?: [number, number];
  sizeScale?: number;
  color?: THREE.ColorRepresentation;
}

export interface ParticleSystem {
  group: THREE.Group;
  object: THREE.Object3D;
  update: (dt: number, followTarget?: THREE.Vector3) => void;
  emitBurst: (position: THREE.Vector3, count: number, options?: ParticleBurstOptions) => void;
  setWind: (x: number, y: number, z: number) => void;
  clear: () => void;
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// Preset Defaults & Custom 3D Particle Geometries
// ---------------------------------------------------------------------------

interface ParticleDefaults {
  mode: 'instanced' | 'points';
  ambient: boolean;
  count: number;
  size: number;
  colors: number[];
  gravity: number;
  drag: number;
  fallSpeed: number;
  swayAmp: number;
  swayFreq: number;
  additive: boolean;
}

const PARTICLE_DEFAULTS: Record<ParticleType, ParticleDefaults> = {
  petals: {
    mode: 'instanced',
    ambient: true,
    count: 240,
    size: 0.13,
    colors: [0xffb7c5, 0xffd1dc, 0xffeef4, 0xf79eb6],
    gravity: -0.42,
    drag: 1.4,
    fallSpeed: 0.72,
    swayAmp: 1.15,
    swayFreq: 1.6,
    additive: false,
  },
  autumn_leaves: {
    mode: 'instanced',
    ambient: true,
    count: 200,
    size: 0.18,
    colors: [0xc92a2a, 0xe8590c, 0xf59f00, 0xd9480f, 0xf7b731],
    gravity: -0.58,
    drag: 1.25,
    fallSpeed: 0.95,
    swayAmp: 1.45,
    swayFreq: 1.35,
    additive: false,
  },
  confetti: {
    mode: 'instanced',
    ambient: false,
    count: 0,
    size: 0.14,
    colors: [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xff924c],
    gravity: -4.2,
    drag: 2.2,
    fallSpeed: 1.6,
    swayAmp: 1.4,
    swayFreq: 3.1,
    additive: false,
  },
  rain: {
    mode: 'instanced',
    ambient: true,
    count: 550,
    size: 0.55,
    colors: [0xbcd8f2, 0xd5e9fa, 0x9fc2e3],
    gravity: -18.0,
    drag: 0.1,
    fallSpeed: 16.5,
    swayAmp: 0.0,
    swayFreq: 0.0,
    additive: false,
  },
  snow: {
    mode: 'points',
    ambient: true,
    count: 600,
    size: 0.22,
    colors: [0xffffff, 0xe8f4ff, 0xd6ecff],
    gravity: -0.6,
    drag: 0.9,
    fallSpeed: 1.25,
    swayAmp: 0.85,
    swayFreq: 1.1,
    additive: false,
  },
  sparks: {
    mode: 'points',
    ambient: false,
    count: 0,
    size: 0.28,
    colors: [0xffe066, 0xff922b, 0xff5400, 0xfff3bf],
    gravity: -7.5,
    drag: 1.1,
    fallSpeed: 0.0,
    swayAmp: 0.2,
    swayFreq: 4.0,
    additive: true,
  },
  dust: {
    mode: 'points',
    ambient: true,
    count: 260,
    size: 0.18,
    colors: [0xfff4d6, 0xffe8b8, 0xf2f7e4],
    gravity: 0.0,
    drag: 0.8,
    fallSpeed: -0.08,
    swayAmp: 0.35,
    swayFreq: 0.55,
    additive: true,
  },
  fireflies: {
    mode: 'points',
    ambient: true,
    count: 140,
    size: 0.38,
    colors: [0xd9ff66, 0xffe066, 0x9dff66],
    gravity: 0.0,
    drag: 0.7,
    fallSpeed: 0.0,
    swayAmp: 0.75,
    swayFreq: 0.9,
    additive: true,
  },
  stars: {
    mode: 'points',
    ambient: true,
    count: 340,
    size: 0.26,
    colors: [0xffffff, 0xd0e6ff, 0xffe8c2, 0xb8d4ff],
    gravity: 0.0,
    drag: 0.4,
    fallSpeed: 0.0,
    swayAmp: 0.12,
    swayFreq: 0.35,
    additive: true,
  },
  smoke: {
    mode: 'points',
    ambient: false,
    count: 0,
    size: 0.85,
    colors: [0xd8dce2, 0xc4cad4, 0xebedf0],
    gravity: 1.1,
    drag: 1.6,
    fallSpeed: -0.6,
    swayAmp: 0.5,
    swayFreq: 0.8,
    additive: false,
  },
};

const cachedInstGeos = new Map<ParticleType, THREE.BufferGeometry>();
const cachedSpriteTex = new Map<string, THREE.CanvasTexture>();

function getParticleShapeTexture(kind: 'petal' | 'maple'): THREE.CanvasTexture {
  const existing = cachedSpriteTex.get(kind);
  if (existing) return existing;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  if (kind === 'petal') {
    ctx.save();
    ctx.translate(size * 0.5, size * 0.88);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-44, -28, -42, -88, -11, -98);
    ctx.lineTo(0, -82);
    ctx.lineTo(11, -98);
    ctx.bezierCurveTo(42, -88, 44, -28, 0, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, -98);
    g.addColorStop(0, '#f0d8e0');
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(1, '#fff8fb');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  } else {
    // Crisp 5-pointed single maple leaf silhouette
    ctx.save();
    ctx.translate(size * 0.5, size * 0.62);
    const angles = [-1.9, -1.1, 0, 1.1, 1.9];
    const lens = [28, 46, 56, 46, 28];
    ctx.beginPath();
    ctx.moveTo(0, 14);
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i] - Math.PI * 0.5;
      const len = lens[i];
      ctx.lineTo(Math.cos(a - 0.25) * len * 0.45, Math.sin(a - 0.25) * len * 0.45);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.lineTo(Math.cos(a + 0.25) * len * 0.45, Math.sin(a + 0.25) * len * 0.45);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(0, -4, 4, 0, -8, 56);
    g.addColorStop(0, '#e8e0dc');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData = { shared: true, sharedAsset: true, artKitCached: true, __atelierSharedResource: true };
  tex.needsUpdate = true;
  cachedSpriteTex.set(kind, tex);
  return tex;
}

function getInstancedParticleGeo(type: ParticleType): THREE.BufferGeometry {
  const existing = cachedInstGeos.get(type);
  if (existing) return existing;

  let geo: THREE.BufferGeometry;
  if (type === 'rain') {
    geo = new THREE.PlaneGeometry(0.022, 1.0, 1, 1);
  } else if (type === 'confetti') {
    geo = new THREE.PlaneGeometry(0.58, 1.0, 2, 2);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(y * Math.PI) * 0.12);
    }
    geo.computeVertexNormals();
  } else {
    // Gently cupped 2x2 botanical petal / maple leaf card
    geo = new THREE.PlaneGeometry(1.0, 1.0, 2, 2);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, -(x * x + y * y) * 0.28);
    }
    geo.computeVertexNormals();
  }
  geo.userData = { shared: true, sharedAsset: true, artKitCached: true, __atelierSharedResource: true };
  cachedInstGeos.set(type, geo);
  return geo;
}

// ---------------------------------------------------------------------------
// Custom GPU Points Shader (Snow, Sparks, Dust, Fireflies, Stars, Smoke)
// ---------------------------------------------------------------------------

const POINTS_VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uPulseStrength;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vPhase;

  void main() {
    vColor = aColor;
    vPhase = aPhase;
    float pulse = mix( 1.0, 0.42 + 0.58 * sin( uTime * 3.4 + aPhase * 6.2831 ), uPulseStrength );
    vAlpha = aAlpha * pulse;

    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    float dist = max( 0.8, -mvPosition.z );
    gl_PointSize = clamp( aSize * uPixelRatio * ( 320.0 / dist ), 1.5, 84.0 );
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const POINTS_FRAGMENT_SHADER = /* glsl */ `
  uniform int uShapeMode; // 0=soft bokeh, 1=snowflake, 2=spark, 3=star, 4=smoke

  varying vec3 vColor;
  varying float vAlpha;
  varying float vPhase;

  void main() {
    if ( vAlpha <= 0.004 ) discard;

    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r = length( uv );
    if ( r > 1.0 ) discard;

    float mask = 0.0;
    vec3 col = vColor;

    if ( uShapeMode == 1 ) {
      // Crystalline 6-ray snowflake with soft glow core
      float ang = atan( uv.y, uv.x ) + vPhase * 6.2831;
      float rays = pow( abs( cos( ang * 3.0 ) ), 6.0 );
      float core = smoothstep( 1.0, 0.15, r );
      float crystal = smoothstep( 0.92, 0.25, r ) * ( 0.45 + 0.55 * rays );
      mask = max( core * 0.55, crystal );
    } else if ( uShapeMode == 2 ) {
      // Hot bright spark core + fiery golden glow halo
      float core = exp( -r * r * 9.0 );
      float halo = pow( 1.0 - r, 2.2 ) * 0.72;
      mask = core + halo;
      col = mix( vColor, vec3( 1.0, 0.98, 0.9 ), core * 0.75 );
    } else if ( uShapeMode == 3 ) {
      // Crisp 4-point twinkling star sparkle
      float starCross = exp( -abs( uv.x ) * 9.0 ) * exp( -abs( uv.y ) * 2.2 )
                      + exp( -abs( uv.y ) * 9.0 ) * exp( -abs( uv.x ) * 2.2 );
      float center = exp( -r * r * 12.0 );
      mask = clamp( center + starCross * 0.75, 0.0, 1.0 ) * ( 1.0 - smoothstep( 0.75, 1.0, r ) );
    } else if ( uShapeMode == 4 ) {
      // Fluffy soft expanding smoke puff
      float puff = pow( 1.0 - r * r, 1.8 );
      mask = puff * 0.55;
    } else {
      // Soft glowing orb / firefly / dust mote bokeh
      float core = exp( -r * r * 5.2 );
      float soft = smoothstep( 1.0, 0.0, r ) * 0.45;
      mask = clamp( core + soft, 0.0, 1.0 );
    }

    gl_FragColor = vec4( col, mask * vAlpha );
  }
`;

interface ParticleState {
  active: boolean;
  isAmbient: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  vrz: number;
  size: number;
  age: number;
  life: number;
  phase: number;
  color: THREE.Color;
}

export function createParticleSystem(options: ParticleSystemOptions): ParticleSystem {
  const type = options.type;
  const def = PARTICLE_DEFAULTS[type];
  const isAmbient = options.ambient ?? def.ambient;
  const ambientCount = isAmbient ? (options.count ?? def.count) : 0;
  const burstCap = options.burstCapacity ?? (isAmbient ? 96 : Math.max(160, options.count ?? 180));
  const totalCap = Math.max(1, ambientCount + burstCap);

  const bounds = options.bounds ?? { width: 32, height: 14, depth: 32 };
  const center = options.center ? options.center.clone() : new THREE.Vector3(0, bounds.height * 0.5, 0);
  const wind = options.wind ? options.wind.clone() : new THREE.Vector3(0.65, 0, 0.25);
  const baseSize = options.size ?? def.size;
  const palette = (options.colors ?? def.colors).map((c) => new THREE.Color(c));

  const group = new THREE.Group();
  group.name = `particles_${type}`;

  // Pre-allocate all particle slots (zero per-frame heap allocations!)
  const particles: ParticleState[] = [];
  for (let i = 0; i < totalCap; i++) {
    const amb = i < ambientCount;
    const col = palette[i % palette.length].clone();
    col.offsetHSL((Math.random() - 0.5) * 0.025, 0, (Math.random() - 0.5) * 0.06);
    particles.push({
      active: amb,
      isAmbient: amb,
      x: center.x + (Math.random() - 0.5) * bounds.width,
      y: center.y + (Math.random() - 0.5) * bounds.height,
      z: center.z + (Math.random() - 0.5) * bounds.depth,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -def.fallSpeed * (0.78 + Math.random() * 0.44),
      vz: (Math.random() - 0.5) * 0.4,
      rx: Math.random() * Math.PI * 2,
      ry: Math.random() * Math.PI * 2,
      rz: Math.random() * Math.PI * 2,
      vrx: (Math.random() - 0.5) * 3.2,
      vry: (Math.random() - 0.5) * 2.8,
      vrz: (Math.random() - 0.5) * 3.0,
      size: baseSize * (0.72 + Math.random() * 0.58),
      age: 0,
      life: 1,
      phase: Math.random(),
      color: col,
    });
  }

  let burstCursor = ambientCount;
  let elapsed = 0;

  // Build either InstancedMesh (tumbling 3D flakes/rain) or custom GLSL Points
  let instMesh: THREE.InstancedMesh | null = null;
  let instMat: THREE.Material | null = null;
  let pointsObj: THREE.Points | null = null;
  let pointsGeo: THREE.BufferGeometry | null = null;
  let pointsMat: THREE.ShaderMaterial | null = null;

  let posAttr: THREE.BufferAttribute | null = null;
  let sizeAttr: THREE.BufferAttribute | null = null;
  let alphaAttr: THREE.BufferAttribute | null = null;
  let phaseAttr: THREE.BufferAttribute | null = null;
  let colorAttr: THREE.BufferAttribute | null = null;

  const dummyMat = new THREE.Matrix4();
  const dummyPos = new THREE.Vector3();
  const dummyQuat = new THREE.Quaternion();
  const dummyEuler = new THREE.Euler();
  const dummyScale = new THREE.Vector3();
  const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

  if (def.mode === 'instanced') {
    const geo = getInstancedParticleGeo(type);
    if (type === 'petals') {
      instMat = new THREE.MeshStandardMaterial({
        map: getParticleShapeTexture('petal'),
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.65,
        metalness: 0.0,
      });
    } else if (type === 'autumn_leaves') {
      instMat = new THREE.MeshStandardMaterial({
        map: getParticleShapeTexture('maple'),
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.72,
        metalness: 0.0,
      });
    } else if (type === 'rain') {
      instMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xffffff),
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    } else {
      instMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xffffff),
        roughness: 0.42,
        metalness: 0.12,
        side: THREE.DoubleSide,
      });
    }

    instMesh = new THREE.InstancedMesh(geo, instMat, totalCap);
    instMesh.frustumCulled = false;
    for (let i = 0; i < totalCap; i++) {
      instMesh.setColorAt(i, particles[i].color);
      instMesh.setMatrixAt(i, zeroMat);
    }
    instMesh.instanceMatrix.needsUpdate = true;
    if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
    group.add(instMesh);
  } else {
    pointsGeo = new THREE.BufferGeometry();
    const posArr = new Float32Array(totalCap * 3);
    const sizeArr = new Float32Array(totalCap);
    const alphaArr = new Float32Array(totalCap);
    const phaseArr = new Float32Array(totalCap);
    const colArr = new Float32Array(totalCap * 3);

    for (let i = 0; i < totalCap; i++) {
      const p = particles[i];
      posArr[i * 3] = p.x;
      posArr[i * 3 + 1] = p.y;
      posArr[i * 3 + 2] = p.z;
      sizeArr[i] = p.size;
      alphaArr[i] = p.active ? 1 : 0;
      phaseArr[i] = p.phase;
      colArr[i * 3] = p.color.r;
      colArr[i * 3 + 1] = p.color.g;
      colArr[i * 3 + 2] = p.color.b;
    }

    posAttr = new THREE.BufferAttribute(posArr, 3);
    sizeAttr = new THREE.BufferAttribute(sizeArr, 1);
    alphaAttr = new THREE.BufferAttribute(alphaArr, 1);
    phaseAttr = new THREE.BufferAttribute(phaseArr, 1);
    colorAttr = new THREE.BufferAttribute(colArr, 3);

    pointsGeo.setAttribute('position', posAttr);
    pointsGeo.setAttribute('aSize', sizeAttr);
    pointsGeo.setAttribute('aAlpha', alphaAttr);
    pointsGeo.setAttribute('aPhase', phaseAttr);
    pointsGeo.setAttribute('aColor', colorAttr);

    const shapeMode =
      type === 'snow' ? 1 :
      type === 'sparks' ? 2 :
      type === 'stars' ? 3 :
      type === 'smoke' ? 4 : 0;

    pointsMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2) },
        uPulseStrength: { value: type === 'fireflies' ? 0.92 : type === 'stars' ? 0.55 : 0.0 },
        uShapeMode: { value: shapeMode },
      },
      vertexShader: POINTS_VERTEX_SHADER,
      fragmentShader: POINTS_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    pointsObj = new THREE.Points(pointsGeo, pointsMat);
    pointsObj.frustumCulled = false;
    group.add(pointsObj);
  }

  function wrapCoord(val: number, ctr: number, span: number): number {
    const half = span * 0.5;
    let rel = val - ctr;
    if (rel > half) rel = ((rel + half) % span) - half;
    else if (rel < -half) rel = ((rel - half) % span) + half;
    return ctr + rel;
  }

  function update(dt: number, followTarget?: THREE.Vector3): void {
    const step = Math.min(Math.max(dt, 0.0001), 0.05);
    elapsed += step;

    if (followTarget) {
      center.set(followTarget.x, followTarget.y + bounds.height * 0.42, followTarget.z);
    }

    if (pointsMat) {
      pointsMat.uniforms.uTime.value = elapsed;
    }

    const halfH = bounds.height * 0.5;

    for (let i = 0; i < totalCap; i++) {
      const p = particles[i];
      if (!p.active) {
        if (instMesh) {
          instMesh.setMatrixAt(i, zeroMat);
        } else if (alphaAttr) {
          alphaAttr.setX(i, 0);
        }
        continue;
      }

      if (p.isAmbient) {
        const swayT = elapsed * def.swayFreq + p.phase * Math.PI * 2;
        const swayX = Math.sin(swayT) * def.swayAmp;
        const swayZ = Math.cos(swayT * 0.83 + 1.3) * def.swayAmp * 0.85;
        const bobY = type === 'fireflies' || type === 'dust' || type === 'stars'
          ? Math.sin(swayT * 0.7 + p.phase * 9.0) * 0.45
          : 0;

        p.x += (wind.x + swayX * 0.45) * step;
        p.y += (p.vy + wind.y + bobY) * step;
        p.z += (wind.z + swayZ * 0.45) * step;

        p.x = wrapCoord(p.x, center.x, bounds.width);
        p.z = wrapCoord(p.z, center.z, bounds.depth);
        if (p.y < center.y - halfH) {
          p.y = center.y + halfH;
          p.x = center.x + (Math.random() - 0.5) * bounds.width;
          p.z = center.z + (Math.random() - 0.5) * bounds.depth;
        } else if (p.y > center.y + halfH) {
          p.y = center.y - halfH;
        }

        // Smooth edge alpha fade near top/bottom of volume
        const yNorm = Math.abs((p.y - center.y) / Math.max(0.1, halfH));
        const edgeAlpha = 1 - Math.max(0, (yNorm - 0.78) / 0.22);

        if (instMesh) {
          if (type === 'rain') {
            dummyEuler.set(0, Math.atan2(wind.x, wind.z), -Math.atan2(Math.hypot(wind.x, wind.z), Math.abs(p.vy)));
          } else {
            p.rx += p.vrx * step;
            p.ry += p.vry * step;
            p.rz += p.vrz * step;
            dummyEuler.set(p.rx, p.ry, p.rz);
          }
          dummyQuat.setFromEuler(dummyEuler);
          dummyPos.set(p.x, p.y, p.z);
          const sc = p.size * Math.max(0.001, edgeAlpha);
          dummyScale.set(sc, sc, sc);
          dummyMat.compose(dummyPos, dummyQuat, dummyScale);
          instMesh.setMatrixAt(i, dummyMat);
        } else if (posAttr && alphaAttr && sizeAttr) {
          posAttr.setXYZ(i, p.x, p.y, p.z);
          sizeAttr.setX(i, p.size);
          alphaAttr.setX(i, edgeAlpha * (type === 'dust' ? 0.58 : 0.92));
        }
      } else {
        // Burst particle with velocity, drag, gravity, tumbling, and lifetime fade
        p.age += step;
        if (p.age >= p.life) {
          p.active = false;
          if (instMesh) instMesh.setMatrixAt(i, zeroMat);
          else if (alphaAttr) alphaAttr.setX(i, 0);
          continue;
        }

        const lifeT = p.age / p.life;
        const dragMul = Math.exp(-def.drag * step);
        p.vx = p.vx * dragMul + wind.x * 0.25 * step;
        p.vy = p.vy * dragMul + def.gravity * step;
        p.vz = p.vz * dragMul + wind.z * 0.25 * step;

        p.x += p.vx * step;
        p.y += p.vy * step;
        p.z += p.vz * step;

        const fadeOut = 1 - Math.pow(lifeT, 1.6);
        const scaleCurve = type === 'smoke' ? 0.55 + lifeT * 1.45 : fadeOut;

        if (instMesh) {
          p.rx += p.vrx * step * 1.6;
          p.ry += p.vry * step * 1.6;
          p.rz += p.vrz * step * 1.6;
          dummyEuler.set(p.rx, p.ry, p.rz);
          dummyQuat.setFromEuler(dummyEuler);
          dummyPos.set(p.x, p.y, p.z);
          const sc = p.size * Math.max(0.01, scaleCurve);
          dummyScale.set(sc, sc, sc);
          dummyMat.compose(dummyPos, dummyQuat, dummyScale);
          instMesh.setMatrixAt(i, dummyMat);
        } else if (posAttr && alphaAttr && sizeAttr) {
          posAttr.setXYZ(i, p.x, p.y, p.z);
          sizeAttr.setX(i, p.size * scaleCurve);
          alphaAttr.setX(i, fadeOut * (type === 'smoke' ? 0.65 : 1.0));
        }
      }
    }

    if (instMesh) {
      instMesh.instanceMatrix.needsUpdate = true;
    } else if (posAttr && alphaAttr && sizeAttr) {
      posAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
    }
  }

  function emitBurst(
    position: THREE.Vector3,
    count: number,
    burstOpts: ParticleBurstOptions = {},
  ): void {
    const speed = burstOpts.speed ?? (type === 'sparks' ? 5.2 : type === 'confetti' ? 6.2 : 2.8);
    const upward = burstOpts.upwardBias ?? (type === 'smoke' ? 1.4 : 2.6);
    const spread = burstOpts.spread ?? 0.35;
    const lifeRange = burstOpts.lifeRange ?? (type === 'smoke' ? [0.7, 1.4] : [0.55, 1.35]);
    const sizeScale = burstOpts.sizeScale ?? 1.0;
    const overrideCol = burstOpts.color !== undefined ? new THREE.Color(burstOpts.color) : null;

    const poolSize = Math.max(1, totalCap - ambientCount);
    let spawned = 0;

    for (let k = 0; k < count && spawned < poolSize; k++) {
      const idx = ambientCount + ((burstCursor - ambientCount) % poolSize);
      burstCursor = ambientCount + ((burstCursor - ambientCount + 1) % poolSize);
      const p = particles[idx];
      if (!p) continue;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const spd = speed * (0.45 + Math.random() * 0.75);

      p.active = true;
      p.isAmbient = false;
      p.x = position.x + (Math.random() - 0.5) * spread;
      p.y = position.y + (Math.random() - 0.5) * spread * 0.5;
      p.z = position.z + (Math.random() - 0.5) * spread;
      p.vx = Math.sin(phi) * Math.cos(theta) * spd;
      p.vy = Math.abs(Math.cos(phi)) * spd * 0.75 + upward * (0.6 + Math.random() * 0.6);
      p.vz = Math.sin(phi) * Math.sin(theta) * spd;
      p.rx = Math.random() * Math.PI * 2;
      p.ry = Math.random() * Math.PI * 2;
      p.rz = Math.random() * Math.PI * 2;
      p.vrx = (Math.random() - 0.5) * 8.0;
      p.vry = (Math.random() - 0.5) * 8.0;
      p.vrz = (Math.random() - 0.5) * 8.0;
      p.size = baseSize * sizeScale * (0.7 + Math.random() * 0.65);
      p.age = 0;
      p.life = lifeRange[0] + Math.random() * (lifeRange[1] - lifeRange[0]);
      p.phase = Math.random();

      const col = overrideCol
        ? overrideCol.clone()
        : palette[Math.floor(Math.random() * palette.length)].clone();
      col.offsetHSL((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.06);
      p.color.copy(col);

      if (instMesh) {
        instMesh.setColorAt(idx, col);
      } else if (colorAttr) {
        colorAttr.setXYZ(idx, col.r, col.g, col.b);
      }
      spawned++;
    }

    if (instMesh && instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
    if (colorAttr) colorAttr.needsUpdate = true;
  }

  // Initialize first frame positions cleanly
  update(0.016);

  return {
    group,
    object: group,
    update,
    emitBurst,
    setWind(x: number, y: number, z: number) {
      wind.set(x, y, z);
    },
    clear() {
      for (let i = ambientCount; i < totalCap; i++) {
        particles[i].active = false;
      }
      update(0.001);
    },
    dispose() {
      if (instMesh) instMesh.dispose();
      if (instMat) instMat.dispose();
      if (pointsGeo) pointsGeo.dispose();
      if (pointsMat) pointsMat.dispose();
    },
  };
}

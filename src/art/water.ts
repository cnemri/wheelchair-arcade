import * as THREE from 'three';

export interface WaterOptions {
  width?: number;
  depth?: number;
  radius?: number;
  shape?: 'plane' | 'circle';
  segments?: number;
  deepColor?: THREE.ColorRepresentation;
  shallowColor?: THREE.ColorRepresentation;
  skyColor?: THREE.ColorRepresentation;
  foamColor?: THREE.ColorRepresentation;
  sunDirection?: THREE.Vector3;
  sunColor?: THREE.ColorRepresentation;
  waveSpeed?: number;
  waveScale?: number;
  waveHeight?: number;
  edgeFoamWidth?: number;
  opacity?: number;
  fogColor?: THREE.ColorRepresentation;
  fogDensity?: number;
}

export interface WaterSurface {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  update: (time: number, scene?: THREE.Scene) => void;
  dispose: () => void;
}

const WATER_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveScale;
  uniform float uWaveHeight;

  varying vec3 vWorldPos;
  varying vec2 vUv;
  varying float vWaveElev;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );

    // Gentle multi-directional Gerstner-inspired swell undulation
    float t = uTime * uWaveSpeed;
    float w1 = sin( worldPosition.x * ( 0.38 * uWaveScale ) + worldPosition.z * ( 0.24 * uWaveScale ) + t * 1.35 );
    float w2 = cos( worldPosition.x * ( 0.22 * uWaveScale ) - worldPosition.z * ( 0.45 * uWaveScale ) + t * 1.05 );
    float w3 = sin( ( worldPosition.x - worldPosition.z ) * ( 0.68 * uWaveScale ) - t * 1.75 ) * 0.45;
    float elev = ( w1 * 0.5 + w2 * 0.35 + w3 * 0.25 ) * uWaveHeight;

    worldPosition.y += elev;
    vWorldPos = worldPosition.xyz;
    vWaveElev = elev;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveScale;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyColor;
  uniform vec3 uFoamColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uEdgeFoamWidth;
  uniform float uOpacity;
  uniform float uIsCircle;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec3 vWorldPos;
  varying vec2 vUv;
  varying float vWaveElev;

  float hash21( vec2 p ) {
    p = fract( p * vec2( 127.1, 311.7 ) );
    p += dot( p, p + 34.345 );
    return fract( p.x * p.y );
  }

  float noise2( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash21( i );
    float b = hash21( i + vec2( 1.0, 0.0 ) );
    float c = hash21( i + vec2( 0.0, 1.0 ) );
    float d = hash21( i + vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
  }

  // Dual-scrolling multi-octave water ripple height function
  float rippleHeight( vec2 xz, float t ) {
    vec2 uvA = xz * ( 0.58 * uWaveScale ) + vec2( t * 0.42, t * 0.26 );
    vec2 uvB = xz * ( 0.94 * uWaveScale ) + vec2( -t * 0.34, t * 0.48 );
    vec2 uvC = xz * ( 2.15 * uWaveScale ) + vec2( t * 0.55, -t * 0.38 );

    float rA = noise2( uvA ) * 0.52;
    float rB = noise2( uvB ) * 0.34;
    float rC = noise2( uvC ) * 0.14;
    return rA + rB + rC;
  }

  void main() {
    float t = uTime * uWaveSpeed;
    vec2 xz = vWorldPos.xz;

    // Finite-difference ripple normal for crisp dynamic reflections & glints
    float eps = 0.09;
    float hC = rippleHeight( xz, t );
    float hX = rippleHeight( xz + vec2( eps, 0.0 ), t );
    float hZ = rippleHeight( xz + vec2( 0.0, eps ), t );
    vec3 N = normalize( vec3( ( hC - hX ) * 1.85, 1.0, ( hC - hZ ) * 1.85 ) );

    vec3 V = normalize( cameraPosition - vWorldPos );
    vec3 L = normalize( uSunDir );

    // Normalized edge proximity (0 at shoreline border -> 1 in open deep center)
    float edgeDist;
    if ( uIsCircle > 0.5 ) {
      edgeDist = clamp( 1.0 - length( ( vUv - 0.5 ) * 2.0 ), 0.0, 1.0 );
    } else {
      vec2 d = min( vUv, 1.0 - vUv ) * 2.0;
      edgeDist = clamp( min( d.x, d.y ), 0.0, 1.0 );
    }

    // Depth-modulated water body tint (turquoise/emerald shallows -> rich deep indigo/teal)
    float depthFactor = smoothstep( 0.0, 0.36, edgeDist );
    vec3 waterBody = mix( uShallowColor, uDeepColor, depthFactor );

    // Subtle sunlit subsurface scattering glow on wave crests
    float crestScatter = smoothstep( -0.02, 0.08, vWaveElev ) * ( 0.35 + 0.65 * max( dot( N, L ), 0.0 ) );
    waterBody += uShallowColor * crestScatter * 0.24;

    // Schlick Fresnel sky reflection
    float NdotV = max( dot( N, V ), 0.0 );
    float fresnel = 0.04 + 0.96 * pow( 1.0 - NdotV, 4.0 );
    vec3 skyReflect = mix( uSkyColor * 0.82, uSkyColor * 1.18, clamp( N.y, 0.0, 1.0 ) );
    vec3 col = mix( waterBody, skyReflect, clamp( fresnel * 0.85, 0.08, 0.9 ) );

    // Crisp sun specular highlight + sparkling dancing micro-glints
    vec3 H = normalize( L + V );
    float NdotH = max( dot( N, H ), 0.0 );
    float specBroad = pow( NdotH, 48.0 ) * 0.42;
    float specSparkle = pow( NdotH, 280.0 ) * 2.6;
    float glintNoise = smoothstep( 0.58, 0.88, noise2( xz * 3.8 + vec2( t * 1.4, -t * 1.1 ) ) );
    col += uSunColor * ( specBroad + specSparkle * ( 0.45 + glintNoise * 0.95 ) );

    // Organic animated shoreline foam lace
    if ( uEdgeFoamWidth > 0.001 ) {
      float foamNoise = noise2( xz * 2.4 + vec2( t * 0.65, t * 0.45 ) ) * 0.6
                      + noise2( xz * 5.2 - vec2( t * 0.9, -t * 0.5 ) ) * 0.4;
      float waveLap = sin( edgeDist * 28.0 - t * 2.4 + foamNoise * 3.2 ) * 0.5 + 0.5;
      float shoreBand = 1.0 - smoothstep( 0.0, uEdgeFoamWidth, edgeDist );
      float foamMask = smoothstep( 0.36, 0.74, shoreBand * ( 0.65 + foamNoise * 0.7 ) + shoreBand * waveLap * 0.35 );
      col = mix( col, uFoamColor, clamp( foamMask * 0.88, 0.0, 0.92 ) );
    }

    // Exponential scene fog blending so distant water dissolves cleanly into horizon mist
    if ( uFogDensity > 0.00001 ) {
      float camDist = length( cameraPosition - vWorldPos );
      float fogFactor = 1.0 - exp( -uFogDensity * uFogDensity * camDist * camDist );
      col = mix( col, uFogColor, clamp( fogFactor, 0.0, 1.0 ) );
    }

    float finalAlpha = clamp( mix( uOpacity * 0.72, uOpacity, depthFactor ) + fresnel * 0.18, 0.45, 0.98 );
    gl_FragColor = vec4( col, finalAlpha );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createWaterSurface(options: WaterOptions = {}): WaterSurface {
  const {
    width = 40,
    depth = 40,
    radius = 16,
    shape = 'plane',
    segments = 48,
    deepColor = '#12465c',
    shallowColor = '#2c8c8e',
    skyColor = '#b9d9eb',
    foamColor = '#f2f9fc',
    sunDirection = new THREE.Vector3(0.5, 0.65, 0.5).normalize(),
    sunColor = '#fff3d6',
    waveSpeed = 1.0,
    waveScale = 1.0,
    waveHeight = 0.075,
    edgeFoamWidth = 0.14,
    opacity = 0.9,
    fogColor = '#cde0ec',
    fogDensity = 0.0,
  } = options;

  let geo: THREE.BufferGeometry;
  if (shape === 'circle') {
    geo = new THREE.CircleGeometry(radius, Math.max(24, segments));
    geo.rotateX(-Math.PI * 0.5);
  } else {
    geo = new THREE.PlaneGeometry(width, depth, segments, segments);
    geo.rotateX(-Math.PI * 0.5);
  }

  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uWaveSpeed: { value: waveSpeed },
    uWaveScale: { value: waveScale },
    uWaveHeight: { value: waveHeight },
    uDeepColor: { value: new THREE.Color(deepColor) },
    uShallowColor: { value: new THREE.Color(shallowColor) },
    uSkyColor: { value: new THREE.Color(skyColor) },
    uFoamColor: { value: new THREE.Color(foamColor) },
    uSunDir: { value: sunDirection.clone().normalize() },
    uSunColor: { value: new THREE.Color(sunColor) },
    uEdgeFoamWidth: { value: edgeFoamWidth },
    uOpacity: { value: opacity },
    uIsCircle: { value: shape === 'circle' ? 1.0 : 0.0 },
    uFogColor: { value: new THREE.Color(fogColor) },
    uFogDensity: { value: fogDensity },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
    transparent: opacity < 0.99,
    depthWrite: true,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'water_surface';
  mesh.receiveShadow = true;

  return {
    mesh,
    material,
    update(time: number, scene?: THREE.Scene) {
      uniforms.uTime.value = time;
      if (scene?.fog instanceof THREE.FogExp2) {
        (uniforms.uFogColor.value as THREE.Color).copy(scene.fog.color);
        uniforms.uFogDensity.value = scene.fog.density;
      }
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}

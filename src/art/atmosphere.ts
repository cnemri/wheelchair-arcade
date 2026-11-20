import * as THREE from 'three';

export type AtmospherePreset =
  | 'hub_studio'
  | 'kyoto_autumn'
  | 'meadow_day'
  | 'noir_rain'
  | 'observatory_warm'
  | 'sakura_dusk'
  | 'canyon_sun'
  | 'synthwave'
  | 'conservatory'
  | 'nordic_winter'
  | 'orbital_space';

export interface AtmosphereOptions {
  skyRadius?: number;
  shadowExtent?: number;
  shadowMapSize?: number;
  fogDensityMultiplier?: number;
  enableShadows?: boolean;
  sunDistance?: number;
}

export interface AtmosphereRig {
  preset: AtmospherePreset;
  skyMesh: THREE.Mesh;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  rimLight: THREE.DirectionalLight;
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  fogColor: THREE.Color;
  fogDensity: number;
  envMap: THREE.Texture;
  update: (time: number, cameraPos?: THREE.Vector3) => void;
  dispose: () => void;
}

interface PresetConfig {
  zenith: string;
  midSky: string;
  horizon: string;
  ground: string;
  sunDir: [number, number, number];
  sunColor: string;
  sunDiscColor: string;
  sunSize: number;
  sunHaloStrength: number;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  rimColor: string;
  rimIntensity: number;
  fogColor: string;
  fogDensity: number;
  cloudCoverage: number;
  cloudColor: string;
  starIntensity: number;
  nebulaIntensity: number;
  auroraIntensity: number;
  synthSun: number;
  envIntensity: number;
  exposure: number;
}

const PRESET_CONFIGS: Record<AtmospherePreset, PresetConfig> = {
  hub_studio: {
    zenith: '#cfd8d0',
    midSky: '#e6e4da',
    horizon: '#f5eadb',
    ground: '#c7c1b4',
    sunDir: [0.52, 0.72, 0.46],
    sunColor: '#fff5e4',
    sunDiscColor: '#fff9ed',
    sunSize: 0.04,
    sunHaloStrength: 0.35,
    sunIntensity: 2.35,
    hemiSky: '#f4f6f0',
    hemiGround: '#9f9482',
    hemiIntensity: 1.05,
    rimColor: '#c9e0ff',
    rimIntensity: 0.85,
    fogColor: '#ebe4d8',
    fogDensity: 0.011,
    cloudCoverage: 0.16,
    cloudColor: '#ffffff',
    starIntensity: 0.0,
    nebulaIntensity: 0.0,
    auroraIntensity: 0.0,
    synthSun: 0.0,
    envIntensity: 1.05,
    exposure: 1.05,
  },
  kyoto_autumn: {
    zenith: '#2f5d96',
    midSky: '#789bc0',
    horizon: '#f4bc84',
    ground: '#5e4637',
    sunDir: [0.68, 0.34, -0.65],
    sunColor: '#ffd194',
    sunDiscColor: '#fff2cf',
    sunSize: 0.048,
    sunHaloStrength: 0.85,
    sunIntensity: 2.75,
    hemiSky: '#b7cde8',
    hemiGround: '#7a523c',
    hemiIntensity: 0.85,
    rimColor: '#98bce8',
    rimIntensity: 0.65,
    fogColor: '#e4b890',
    fogDensity: 0.0085,
    cloudCoverage: 0.38,
    cloudColor: '#ffe8cc',
    starIntensity: 0.0,
    nebulaIntensity: 0.0,
    auroraIntensity: 0.0,
    synthSun: 0.0,
    envIntensity: 0.95,
    exposure: 1.05,
  },
  meadow_day: {
    zenith: '#2169c4',
    midSky: '#6eb2ec',
    horizon: '#dceef8',
    ground: '#6a8752',
    sunDir: [0.46, 0.76, 0.45],
    sunColor: '#fff6de',
    sunDiscColor: '#fffdf2',
    sunSize: 0.036,
    sunHaloStrength: 0.55,
    sunIntensity: 2.85,
    hemiSky: '#b8dcff',
    hemiGround: '#59783e',
    hemiIntensity: 0.95,
    rimColor: '#d9ecff',
    rimIntensity: 0.55,
    fogColor: '#cde3ef',
    fogDensity: 0.0065,
    cloudCoverage: 0.46,
    cloudColor: '#ffffff',
    starIntensity: 0.0,
    nebulaIntensity: 0.0,
    auroraIntensity: 0.0,
    synthSun: 0.0,
    envIntensity: 1.0,
    exposure: 1.02,
  },
  noir_rain: {
    zenith: '#0a101d',
    midSky: '#152236',
    horizon: '#283c52',
    ground: '#0f1620',
    sunDir: [-0.45, 0.54, -0.71],
    sunColor: '#9ec2e8',
    sunDiscColor: '#d8e9ff',
    sunSize: 0.034,
    sunHaloStrength: 0.65,
    sunIntensity: 1.35,
    hemiSky: '#3b5878',
    hemiGround: '#1a222b',
    hemiIntensity: 0.72,
    rimColor: '#ffb76b',
    rimIntensity: 0.78,
    fogColor: '#1f2f40',
    fogDensity: 0.017,
    cloudCoverage: 0.65,
    cloudColor: '#48627d',
    starIntensity: 0.25,
    nebulaIntensity: 0.0,
    auroraIntensity: 0.0,
    synthSun: 0.0,
    envIntensity: 0.78,
    exposure: 1.12,
  },
  observatory_warm: {
    zenith: '#121330',
    midSky: '#2f2957',
    horizon: '#c97653',
    ground: '#241c24',
    sunDir: [0.58, 0.30, 0.75],
    sunColor: '#ffc882',
    sunDiscColor: '#ffe9b8',
    sunSize: 0.042,
    sunHaloStrength: 0.75,
    sunIntensity: 2.05,
    hemiSky: '#6e649c',
    hemiGround: '#4a362c',
    hemiIntensity: 0.78,
    rimColor: '#7ea6ff',
    rimIntensity: 0.85,
    fogColor: '#45344d',
    fogDensity: 0.009,
    cloudCoverage: 0.22,
    cloudColor: '#e8a282',
    starIntensity: 0.85,
    nebulaIntensity: 0.28,
    auroraIntensity: 0.0,
    synthSun: 0.0,
    envIntensity: 0.92,
    exposure: 1.08,
  },
  sakura_dusk: {
    zenith: '#4c5492',
    midSky: '#a87ca8',
    horizon: '#ffbe9f',
    ground: '#5d4756',
    sunDir: [-0.62, 0.26, -0.74],
    sunColor: '#ffcca8',
    sunDiscColor: '#fff1db',
    sunSize: 0.056,
    sunHaloStrength: 0.95,
    sunIntensity: 2.45,
    hemiSky: '#f0b8d0',
    hemiGround: '#69515e',
    hemiIntensity: 0.92,
    rimColor: '#b7c2ff',
    rimIntensity: 0.72,
    fogColor: '#e6b2b8',
    fogDensity: 0.0095,
    cloudCoverage: 0.42,
    cloudColor: '#ffd9d2',
    starIntensity: 0.18,
    nebulaIntensity: 0.0,
    auroraIntensity: 0.0,
    synthSun: 0.0,
    envIntensity: 0.95,
    exposure: 1.04,
  },
  canyon_sun: {
    zenith: '#16669e',
    midSky: '#5ca4cc',
    horizon: '#f2ca94',
    ground: '#9e5d38',
    sunDir: [0.56, 0.62, -0.55],
    sunColor: '#ffebc2',
    sunDiscColor: '#fffbe6',
    sunSize: 0.042,
    sunHaloStrength: 0.72,
    sunIntensity: 3.05,
    hemiSky: '#a6d6f0',
    hemiGround: '#b56c42',
    hemiIntensity: 0.92,
    rimColor: '#ffd4a3',
    rimIntensity: 0.58,
    fogColor: '#e6be8c',
    fogDensity: 0.0072,
    cloudCoverage: 0.24,
    cloudColor: '#fff3de',
    starIntensity: 0.0,
    nebulaIntensity: 0.0,
    auroraIntensity: 0.0,
    synthSun: 0.0,
    envIntensity: 1.0,
    exposure: 1.0,
  },
  synthwave: {
    zenith: '#09041c',
    midSky: '#3b0f68',
    horizon: '#ff4d8d',
    ground: '#16082c',
    sunDir: [0.0, 0.17, -0.985],
    sunColor: '#ff70a8',
    sunDiscColor: '#ffce47',
    sunSize: 0.145,
    sunHaloStrength: 1.05,
    sunIntensity: 1.95,
    hemiSky: '#8c3cf0',
    hemiGround: '#1a1038',
    hemiIntensity: 0.85,
    rimColor: '#29f2ff',
    rimIntensity: 1.25,
    fogColor: '#260b44',
    fogDensity: 0.0095,
    cloudCoverage: 0.16,
    cloudColor: '#ff6ba8',
    starIntensity: 0.9,
    nebulaIntensity: 0.35,
    auroraIntensity: 0.0,
    synthSun: 1.0,
    envIntensity: 1.05,
    exposure: 1.08,
  },
  conservatory: {
    zenith: '#8fb9b8',
    midSky: '#c7dfd8',
    horizon: '#f4f0de',
    ground: '#5e7a56',
    sunDir: [0.42, 0.78, 0.46],
    sunColor: '#fff7e0',
    sunDiscColor: '#ffffff',
    sunSize: 0.048,
    sunHaloStrength: 0.52,
    sunIntensity: 2.3,
    hemiSky: '#e2f2ea',
    hemiGround: '#547349',
    hemiIntensity: 1.12,
    rimColor: '#d4f0e8',
    rimIntensity: 0.65,
    fogColor: '#dce6dc',
    fogDensity: 0.0105,
    cloudCoverage: 0.34,
    cloudColor: '#f7fbf8',
    starIntensity: 0.0,
    nebulaIntensity: 0.0,
    auroraIntensity: 0.0,
    synthSun: 0.0,
    envIntensity: 1.08,
    exposure: 1.02,
  },
  nordic_winter: {
    zenith: '#18375c',
    midSky: '#5882a8',
    horizon: '#e8c4c8',
    ground: '#94abc2',
    sunDir: [-0.55, 0.32, 0.77],
    sunColor: '#fff0e6',
    sunDiscColor: '#fffaf5',
    sunSize: 0.044,
    sunHaloStrength: 0.68,
    sunIntensity: 2.45,
    hemiSky: '#a8cbe8',
    hemiGround: '#7a98b8',
    hemiIntensity: 1.0,
    rimColor: '#98f5e1',
    rimIntensity: 0.75,
    fogColor: '#c4d4e3',
    fogDensity: 0.0085,
    cloudCoverage: 0.3,
    cloudColor: '#f5e4e8',
    starIntensity: 0.25,
    nebulaIntensity: 0.0,
    auroraIntensity: 0.55,
    synthSun: 0.0,
    envIntensity: 1.05,
    exposure: 1.02,
  },
  orbital_space: {
    zenith: '#02040a',
    midSky: '#060c1c',
    horizon: '#164575',
    ground: '#050b18',
    sunDir: [0.64, 0.48, 0.6],
    sunColor: '#fff8ec',
    sunDiscColor: '#ffffff',
    sunSize: 0.038,
    sunHaloStrength: 0.9,
    sunIntensity: 2.8,
    hemiSky: '#4f8ed6',
    hemiGround: '#1b2842',
    hemiIntensity: 0.65,
    rimColor: '#66d9ff',
    rimIntensity: 1.15,
    fogColor: '#070f21',
    fogDensity: 0.0,
    cloudCoverage: 0.0,
    cloudColor: '#ffffff',
    starIntensity: 1.45,
    nebulaIntensity: 0.65,
    auroraIntensity: 0.0,
    synthSun: 0.0,
    envIntensity: 0.95,
    exposure: 1.06,
  },
};

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = normalize( position );
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uZenithColor;
  uniform vec3 uMidColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunDiscColor;
  uniform float uSunSize;
  uniform float uSunHaloStrength;
  uniform float uCloudCoverage;
  uniform vec3 uCloudColor;
  uniform float uStarIntensity;
  uniform float uNebulaIntensity;
  uniform float uAuroraIntensity;
  uniform float uSynthSun;
  uniform float uTime;

  varying vec3 vWorldDir;

  float hash21( vec2 p ) {
    p = fract( p * vec2( 234.34, 435.345 ) );
    p += dot( p, p + 34.23 );
    return fract( p.x * p.y );
  }

  float hash31( vec3 p ) {
    p = fract( p * 0.1031 );
    p += dot( p, p.yzx + 33.33 );
    return fract( ( p.x + p.y ) * p.z );
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

  float fbm( vec2 p ) {
    float v = 0.0;
    float amp = 0.5;
    mat2 rot = mat2( 0.80, 0.60, -0.60, 0.80 );
    for ( int i = 0; i < 4; i++ ) {
      v += amp * noise2( p );
      p = rot * p * 2.04;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize( vWorldDir );
    float y = dir.y;

    // 4-stop vertical atmospheric sky dome gradient
    vec3 sky;
    if ( y >= 0.0 ) {
      float lowMix = smoothstep( 0.0, 0.28, y );
      float highMix = smoothstep( 0.22, 0.88, y );
      sky = mix( uHorizonColor, uMidColor, lowMix );
      sky = mix( sky, uZenithColor, highMix );
    } else {
      float downMix = smoothstep( 0.0, -0.42, y );
      sky = mix( uHorizonColor, uGroundColor, downMix );
    }

    // Horizon warm/atmospheric Mie glow near sun azimuth
    vec3 sunD = normalize( uSunDir );
    float sunDot = max( dot( dir, sunD ), 0.0 );
    float mieWide = pow( sunDot, 5.0 ) * 0.34 * uSunHaloStrength;
    float mieTight = pow( sunDot, 42.0 ) * 0.72 * uSunHaloStrength;
    float horizonBoost = exp( -abs( y ) * 6.5 ) * pow( sunDot, 2.0 ) * 0.38 * uSunHaloStrength;
    sky += uSunDiscColor * ( mieWide + mieTight + horizonBoost );

    // Crisp sun / moon disc (or iconic horizontal-sliced synthwave sun!)
    float angDist = acos( clamp( dot( dir, sunD ), -1.0, 1.0 ) );
    if ( uSynthSun > 0.5 ) {
      float disc = 1.0 - smoothstep( uSunSize * 0.94, uSunSize * 1.02, angDist );
      if ( disc > 0.001 ) {
        float relY = clamp( ( dir.y - ( sunD.y - uSunSize ) ) / ( uSunSize * 2.0 ), 0.0, 1.0 );
        vec3 sCol = mix( vec3( 1.0, 0.16, 0.56 ), vec3( 1.0, 0.88, 0.28 ), smoothstep( 0.08, 0.88, relY ) );
        // Iconic horizontal scanline slices across lower half of retro sun
        float sliceFreq = 32.0;
        float stripe = fract( relY * sliceFreq );
        float cutWidth = clamp( ( 0.58 - relY ) * 0.85, 0.0, 0.62 );
        float sliceMask = step( cutWidth, stripe );
        sky = mix( sky, sCol * 1.65, disc * sliceMask );
      }
    } else {
      float disc = 1.0 - smoothstep( uSunSize * 0.72, uSunSize * 1.05, angDist );
      sky += uSunDiscColor * disc * 2.2;
    }

    // Procedural drifting cirrus clouds
    if ( uCloudCoverage > 0.01 && y > 0.02 ) {
      vec2 cloudUv = dir.xz / ( y + 0.16 ) * 1.35;
      cloudUv += vec2( uTime * 0.009, uTime * 0.004 );
      float c1 = fbm( cloudUv );
      float c2 = fbm( cloudUv * 2.15 - vec2( uTime * 0.005, 0.0 ) );
      float cVal = c1 * 0.68 + c2 * 0.32;
      float thresh = 1.0 - uCloudCoverage * 0.82;
      float cloudMask = smoothstep( thresh, thresh + 0.28, cVal ) * smoothstep( 0.02, 0.22, y );
      vec3 litCloud = uCloudColor * ( 0.82 + pow( sunDot, 6.0 ) * 0.45 );
      sky = mix( sky, litCloud, cloudMask * 0.72 );
    }

    // Subtle polar aurora shimmer (for nordic_winter)
    if ( uAuroraIntensity > 0.01 && y > 0.08 ) {
      vec2 aUv = dir.xz / ( y + 0.25 );
      float ribbon = sin( aUv.x * 2.2 + fbm( aUv * 1.4 + uTime * 0.05 ) * 4.5 + uTime * 0.18 );
      float curtain = exp( -abs( ribbon ) * 4.2 ) * smoothstep( 0.08, 0.42, y ) * ( 1.0 - smoothstep( 0.55, 0.9, y ) );
      vec3 auroraCol = mix( vec3( 0.18, 0.92, 0.66 ), vec3( 0.36, 0.52, 0.98 ), clamp( y * 1.4, 0.0, 1.0 ) );
      sky += auroraCol * curtain * uAuroraIntensity * 0.55;
    }

    // Multi-layer twinkling procedural starfield + subtle cosmic nebula
    if ( uStarIntensity > 0.01 ) {
      float starElev = uNebulaIntensity > 0.4 ? smoothstep( -0.35, 0.05, y ) : smoothstep( 0.04, 0.38, y );
      if ( starElev > 0.001 ) {
        vec3 cellA = floor( dir * 185.0 );
        float rndA = hash31( cellA );
        float starA = smoothstep( 0.992, 0.9995, rndA );
        float twinkleA = 0.65 + 0.35 * sin( uTime * ( 2.0 + rndA * 4.0 ) + rndA * 62.8 );

        vec3 cellB = floor( dir * 320.0 );
        float rndB = hash31( cellB + 19.7 );
        float starB = smoothstep( 0.994, 0.9998, rndB ) * 0.65;

        vec3 starTint = mix( vec3( 0.78, 0.88, 1.0 ), vec3( 1.0, 0.92, 0.78 ), fract( rndA * 37.0 ) );
        sky += starTint * ( starA * twinkleA + starB ) * uStarIntensity * starElev * 1.5;

        if ( uNebulaIntensity > 0.01 ) {
          float band = exp( -pow( ( dir.y * 0.7 + dir.x * 0.45 - 0.12 ) * 3.2, 2.0 ) );
          float neb = fbm( vec2( atan( dir.z, dir.x ) * 2.2, dir.y * 5.0 ) );
          vec3 nebCol = mix( vec3( 0.14, 0.22, 0.52 ), vec3( 0.46, 0.16, 0.48 ), neb );
          sky += nebCol * band * neb * uNebulaIntensity * 0.52 * starElev;
        }
      }
    }

    gl_FragColor = vec4( sky, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createSkyUniforms(cfg: PresetConfig): Record<string, THREE.IUniform> {
  return {
    uZenithColor: { value: new THREE.Color(cfg.zenith) },
    uMidColor: { value: new THREE.Color(cfg.midSky) },
    uHorizonColor: { value: new THREE.Color(cfg.horizon) },
    uGroundColor: { value: new THREE.Color(cfg.ground) },
    uSunDir: { value: new THREE.Vector3(...cfg.sunDir).normalize() },
    uSunDiscColor: { value: new THREE.Color(cfg.sunDiscColor) },
    uSunSize: { value: cfg.sunSize },
    uSunHaloStrength: { value: cfg.sunHaloStrength },
    uCloudCoverage: { value: cfg.cloudCoverage },
    uCloudColor: { value: new THREE.Color(cfg.cloudColor) },
    uStarIntensity: { value: cfg.starIntensity },
    uNebulaIntensity: { value: cfg.nebulaIntensity },
    uAuroraIntensity: { value: cfg.auroraIntensity },
    uSynthSun: { value: cfg.synthSun },
    uTime: { value: 0 },
  };
}

export function applyAtmosphere(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  preset: AtmospherePreset,
  options: AtmosphereOptions = {},
): AtmosphereRig {
  const cfg = PRESET_CONFIGS[preset];
  const skyRadius = options.skyRadius ?? 260;
  const shadowExtent = options.shadowExtent ?? 34;
  const shadowMapSize = options.shadowMapSize ?? 2048;
  const enableShadows = options.enableShadows ?? true;
  const sunDistance = options.sunDistance ?? 65;
  const fogMult = options.fogDensityMultiplier ?? 1.0;

  renderer.toneMappingExposure = cfg.exposure;

  // 1. Custom GLSL Procedural Sky Dome
  const skyUniforms = createSkyUniforms(cfg);
  const skyGeo = new THREE.SphereGeometry(skyRadius, 48, 32);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.name = `atmosphere_sky_${preset}`;
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -1000;
  scene.add(skyMesh);

  // 2. Procedural PMREM Environment Map matching the sky dome + crisp studio specular panels
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const envSkyGeo = new THREE.SphereGeometry(20, 32, 20);
  const envSkyMat = new THREE.ShaderMaterial({
    uniforms: createSkyUniforms(cfg),
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });
  envScene.add(new THREE.Mesh(envSkyGeo, envSkyMat));

  // Add subtle directional softbox reflection cards for richer chrome/glasses highlights
  const sunDirection = new THREE.Vector3(...cfg.sunDir).normalize();
  const keyCardGeo = new THREE.PlaneGeometry(7, 7);
  const keyCardMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(cfg.sunColor).multiplyScalar(2.4),
    side: THREE.DoubleSide,
  });
  const keyCard = new THREE.Mesh(keyCardGeo, keyCardMat);
  keyCard.position.copy(sunDirection).multiplyScalar(14);
  keyCard.lookAt(0, 0, 0);
  envScene.add(keyCard);

  const rimCardGeo = new THREE.PlaneGeometry(9, 5);
  const rimCardMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(cfg.rimColor).multiplyScalar(1.35),
    side: THREE.DoubleSide,
  });
  const rimCard = new THREE.Mesh(rimCardGeo, rimCardMat);
  rimCard.position.set(-sunDirection.x * 14, 5, -sunDirection.z * 14);
  rimCard.lookAt(0, 0, 0);
  envScene.add(rimCard);

  const envRT = pmrem.fromScene(envScene, 0.035);
  scene.environment = envRT.texture;
  scene.environmentIntensity = cfg.envIntensity;

  // Immediately release temporary PMREM builder assets
  envSkyGeo.dispose();
  envSkyMat.dispose();
  keyCardGeo.dispose();
  keyCardMat.dispose();
  rimCardGeo.dispose();
  rimCardMat.dispose();
  pmrem.dispose();

  // 3. Atmospheric Exponential Fog
  const fogColor = new THREE.Color(cfg.fogColor);
  const fogDensity = cfg.fogDensity * fogMult;
  if (fogDensity > 0) {
    scene.fog = new THREE.FogExp2(fogColor.getHex(), fogDensity);
  } else {
    scene.fog = null;
  }

  // 4. Crisp 3-Point Lighting Rig (Key Sun + Hemisphere Bounce + Rim Separation)
  const sunColor = new THREE.Color(cfg.sunColor);
  const sunLight = new THREE.DirectionalLight(sunColor, cfg.sunIntensity);
  sunLight.name = 'atmosphere_sun_light';
  sunLight.position.copy(sunDirection).multiplyScalar(sunDistance);
  sunLight.castShadow = enableShadows;
  if (enableShadows) {
    sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = sunDistance * 2.6;
    sunLight.shadow.camera.left = -shadowExtent;
    sunLight.shadow.camera.right = shadowExtent;
    sunLight.shadow.camera.top = shadowExtent;
    sunLight.shadow.camera.bottom = -shadowExtent;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.025;
  }
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(
    new THREE.Color(cfg.hemiSky),
    new THREE.Color(cfg.hemiGround),
    cfg.hemiIntensity,
  );
  hemiLight.name = 'atmosphere_hemi_light';
  scene.add(hemiLight);

  const rimLight = new THREE.DirectionalLight(new THREE.Color(cfg.rimColor), cfg.rimIntensity);
  rimLight.name = 'atmosphere_rim_light';
  rimLight.position.set(-sunDirection.x * 40, Math.max(12, sunDirection.y * 28), -sunDirection.z * 40);
  rimLight.castShadow = false;
  scene.add(rimLight);

  return {
    preset,
    skyMesh,
    sunLight,
    hemiLight,
    rimLight,
    sunDirection,
    sunColor,
    fogColor,
    fogDensity,
    envMap: envRT.texture,
    update(time: number, cameraPos?: THREE.Vector3) {
      skyUniforms.uTime.value = time;
      if (cameraPos) {
        skyMesh.position.copy(cameraPos);
      }
    },
    dispose() {
      scene.remove(skyMesh, sunLight, sunLight.target, hemiLight, rimLight);
      if (scene.environment === envRT.texture) {
        scene.environment = null;
      }
      skyGeo.dispose();
      skyMat.dispose();
      envRT.dispose();
    },
  };
}

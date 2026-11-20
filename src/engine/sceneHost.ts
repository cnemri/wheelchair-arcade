import * as THREE from 'three';

/**
 * Mark shared cached geometries/materials/textures (like the figurine GLB template)
 * with `userData[SHARED_RESOURCE_FLAG] = true` so `disposeScene` never frees them.
 */
export const SHARED_RESOURCE_FLAG = '__atelierSharedResource';

export interface SceneHostOptions {
  container: HTMLElement;
  fov?: number;
  near?: number;
  far?: number;
  maxPixelRatio?: number;
  exposure?: number;
  shadows?: boolean;
  antialias?: boolean;
  background?: THREE.ColorRepresentation;
}

export interface SceneHost {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** Start a requestAnimationFrame loop with clamped dt <= 0.05s */
  start(tick: (dt: number, elapsed: number) => void): void;
  /** Pause or resume the tick callback (rendering stops when paused unless manual) */
  setPaused(paused: boolean): void;
  /** Render one frame immediately */
  render(): void;
  /** Cleanly stops loop, disconnects ResizeObserver, disposes non-shared GPU assets, removes canvas */
  dispose(): void;
}

export function createSceneHost(options: SceneHostOptions): SceneHost {
  const {
    container,
    fov = 48,
    near = 0.1,
    far = 600,
    maxPixelRatio = 2,
    exposure = 1.08,
    shadows = true,
    antialias = true,
    background,
  } = options;

  const scene = new THREE.Scene();
  if (background !== undefined) {
    scene.background = new THREE.Color(background);
  }

  const initialWidth = Math.max(1, container.clientWidth || window.innerWidth);
  const initialHeight = Math.max(1, container.clientHeight || window.innerHeight);

  const camera = new THREE.PerspectiveCamera(fov, initialWidth / initialHeight, near, far);
  camera.position.set(0, 3, 6);

  const renderer = new THREE.WebGLRenderer({
    antialias,
    powerPreference: 'high-performance',
    alpha: false,
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  renderer.setSize(initialWidth, initialHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.tabIndex = -1;
  container.appendChild(canvas);

  let width = initialWidth;
  let height = initialHeight;

  const handleResize = () => {
    const nextW = Math.max(1, container.clientWidth || window.innerWidth);
    const nextH = Math.max(1, container.clientHeight || window.innerHeight);
    if (nextW === width && nextH === height) return;
    width = nextW;
    height = nextH;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setSize(width, height, false);
  };

  const resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(container);
  window.addEventListener('resize', handleResize);

  let rafId = 0;
  let running = false;
  let paused = false;
  let lastTime = 0;
  let elapsed = 0;
  let disposed = false;
  let tickFn: ((dt: number, elapsed: number) => void) | null = null;

  const frame = (now: number) => {
    if (disposed || !running) return;
    rafId = requestAnimationFrame(frame);
    if (lastTime === 0) lastTime = now;
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.0001), 0.05);

    if (!paused && tickFn) {
      elapsed += dt;
      tickFn(dt, elapsed);
    }
    renderer.render(scene, camera);
  };

  return {
    scene,
    camera,
    renderer,
    canvas,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    start(tick: (dt: number, elapsed: number) => void) {
      tickFn = tick;
      if (running || disposed) return;
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    },
    setPaused(nextPaused: boolean) {
      paused = nextPaused;
      if (!paused) lastTime = 0;
    },
    render() {
      if (!disposed) {
        renderer.render(scene, camera);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      disposeScene(scene, renderer);
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    },
  };
}

/**
 * Safely disposes geometries, materials, and textures in a scene WITHOUT freeing
 * resources flagged with `SHARED_RESOURCE_FLAG` (e.g. cached GLB figurine template).
 */
export function disposeScene(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && !mesh.geometry.userData?.[SHARED_RESOURCE_FLAG]) {
      geometries.add(mesh.geometry);
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m || m.userData?.[SHARED_RESOURCE_FLAG]) continue;
        materials.add(m);
        for (const value of Object.values(m)) {
          if (
            value &&
            typeof value === 'object' &&
            'isTexture' in value &&
            (value as THREE.Texture).isTexture &&
            !(value as THREE.Texture).userData?.[SHARED_RESOURCE_FLAG]
          ) {
            textures.add(value as THREE.Texture);
          }
        }
      }
    }
  });

  if (scene.environment && !scene.environment.userData?.[SHARED_RESOURCE_FLAG]) {
    textures.add(scene.environment);
  }
  if (
    scene.background &&
    scene.background instanceof THREE.Texture &&
    !scene.background.userData?.[SHARED_RESOURCE_FLAG]
  ) {
    textures.add(scene.background);
  }

  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  for (const t of textures) t.dispose();

  scene.clear();

  if (renderer) {
    renderer.renderLists.dispose();
    renderer.dispose();
  }
}

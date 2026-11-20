import * as THREE from 'three';
import {
  applyAtmosphere,
  createBambooCluster,
  createDetailedTree,
  createFernCluster,
  createForest,
  createGrassField,
  createLantern,
  createMossyBoulder,
  createParticleSystem,
  createPBRMaterial,
  createWildflowerPatch,
  updateFoliageWind,
  type AtmosphereRig,
  type BambooCluster,
  type DetailedTree,
  type ForestBatch,
  type GrassField,
  type ParticleSystem,
  type WildflowerPatch,
} from '../art';
import { createFigurineRig } from '../engine/character';
import { createSceneHost, type SceneHost } from '../engine/sceneHost';
import type { AudioEngine, FigurineRig, GameId, GameMeta } from '../engine/types';
import { GAME_CATALOG, getBestScore, isGameAvailable } from '../games/registry';

export interface HubCallbacks {
  onLaunchGame: (id: GameId) => void;
}

const PEDESTAL_TOP_Y = 0.28;

export class HubView {
  private readonly parent: HTMLElement;
  private readonly audio: AudioEngine;
  private readonly callbacks: HubCallbacks;

  private readonly shell: HTMLDivElement;
  private readonly canvasHost: HTMLDivElement;
  private readonly shelfList: HTMLDivElement;
  private readonly shelfCountEl: HTMLSpanElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly plaqueEl: HTMLElement;

  private host: SceneHost | null = null;
  private atmosphere: AtmosphereRig | null = null;
  private figurine: FigurineRig | null = null;
  private trees: DetailedTree[] = [];
  private forests: ForestBatch[] = [];
  private grassField: GrassField | null = null;
  private wildflowerPatch: WildflowerPatch | null = null;
  private bambooClusters: BambooCluster[] = [];
  private motes: ParticleSystem | null = null;
  private limestoneMat: THREE.MeshStandardMaterial | null = null;

  private turntableGroup: THREE.Group | null = null;
  private accentHaloMat: THREE.MeshBasicMaterial | null = null;
  private accentLight: THREE.PointLight | null = null;
  private targetAccentColor = new THREE.Color('#c85a32');
  private currentAccentColor = new THREE.Color('#c85a32');

  private selectedId: GameId = GAME_CATALOG[0].id;
  private cardButtons = new Map<GameId, HTMLButtonElement>();
  private toastEl: HTMLDivElement | null = null;
  private toastTimer = 0;

  // Smooth orbit camera state (camera on +Z side so hub_studio sun lights figurine face warmly)
  private orbitYaw = -0.22;
  private orbitPitch = 0.21;
  private orbitDist = 4.25;
  private targetYaw = -0.22;
  private targetPitch = 0.21;
  private targetDist = 4.25;
  private isDragging = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private idleSpinResumeTimer = 0;
  private figurineReactionPulse = 0;

  private disposed = false;

  constructor(parent: HTMLElement, audio: AudioEngine, callbacks: HubCallbacks) {
    this.parent = parent;
    this.audio = audio;
    this.callbacks = callbacks;

    // Default to first available game if any, otherwise first game in catalog
    const firstReady = GAME_CATALOG.find((g) => isGameAvailable(g.id));
    if (firstReady) this.selectedId = firstReady.id;
    const initMeta = GAME_CATALOG.find((g) => g.id === this.selectedId) ?? GAME_CATALOG[0];
    this.targetAccentColor.set(initMeta.accentColor);
    this.currentAccentColor.set(initMeta.accentColor);

    this.shell = document.createElement('div');
    this.shell.className = 'hub-shell';

    this.canvasHost = document.createElement('div');
    this.canvasHost.className = 'hub-canvas-host';

    const vignette = document.createElement('div');
    vignette.className = 'hub-vignette';

    const overlay = document.createElement('div');
    overlay.className = 'hub-overlay';

    // Top-left Masthead
    const masthead = document.createElement('header');
    masthead.className = 'hub-masthead';
    masthead.innerHTML = `
      <div class="hub-kicker">
        <span class="hub-kicker-dot"></span>
        <span>Collectible 3D Anthology · Edition I</span>
      </div>
      <h1 class="hub-title">Atelier <em>Ten</em></h1>
      <p class="hub-subtitle">
        Ten handcrafted 3D worlds built around your wheelchair figurine — from autumn drift gardens to zero-gravity glasshouses.
      </p>
    `;

    // Bottom-left Exhibition Plaque + Orbit Hint
    const plaqueArea = document.createElement('div');
    plaqueArea.className = 'hub-plaque-area';

    this.plaqueEl = document.createElement('section');
    this.plaqueEl.className = 'hub-plaque';

    const orbitHint = document.createElement('div');
    orbitHint.className = 'hub-orbit-hint';
    orbitHint.innerHTML = `
      <span>Drag to orbit figurine</span>
      <span>·</span>
      <span><kbd>1</kbd>–<kbd>0</kbd> quick launch</span>
      <span>·</span>
      <span><kbd>Enter</kbd> play selected</span>
    `;
    plaqueArea.append(this.plaqueEl, orbitHint);

    // Right Anthology Shelf
    const shelfPanel = document.createElement('aside');
    shelfPanel.className = 'hub-shelf-panel';

    const shelfHeader = document.createElement('div');
    shelfHeader.className = 'hub-shelf-header';

    const shelfHeading = document.createElement('div');
    shelfHeading.className = 'hub-shelf-heading';
    const shelfTitle = document.createElement('span');
    shelfTitle.className = 'hub-shelf-title';
    shelfTitle.textContent = 'The Exhibitions';
    this.shelfCountEl = document.createElement('span');
    this.shelfCountEl.className = 'hub-shelf-count';
    shelfHeading.append(shelfTitle, this.shelfCountEl);

    const shelfActions = document.createElement('div');
    shelfActions.className = 'hub-shelf-actions';

    this.muteBtn = document.createElement('button');
    this.muteBtn.type = 'button';
    this.muteBtn.className = 'hud-icon-btn';
    this.muteBtn.title = 'Toggle Audio';
    this.syncMuteButton();
    this.muteBtn.addEventListener('click', () => {
      this.audio.toggleMute();
      this.syncMuteButton();
    });
    shelfActions.append(this.muteBtn);

    shelfHeader.append(shelfHeading, shelfActions);

    this.shelfList = document.createElement('div');
    this.shelfList.className = 'hub-shelf-list';
    this.buildShelfCards();

    shelfPanel.append(shelfHeader, this.shelfList);
    overlay.append(masthead, plaqueArea, shelfPanel);

    this.shell.append(this.canvasHost, vignette, overlay);
    this.parent.appendChild(this.shell);

    this.renderPlaque();
    this.bindInteraction();
  }

  async init(): Promise<void> {
    if (this.disposed) return;

    this.host = createSceneHost({
      container: this.canvasHost,
      fov: 40,
      near: 0.1,
      far: 220,
      maxPixelRatio: 2,
      exposure: 1.04,
      shadows: true,
    });

    const { scene, renderer, camera } = this.host;

    // 1. Sunlit botanical gallery atmosphere + procedural PMREM reflections
    this.atmosphere = applyAtmosphere(scene, renderer, 'hub_studio', {
      skyRadius: 120,
      shadowExtent: 13,
      shadowMapSize: 2048,
      fogDensityMultiplier: 1.25,
    });

    // Shared fine-grained honed limestone material (no sedimentary banding on cylindrical/lathe forms)
    this.limestoneMat = createHonedLimestoneMaterial('#e8e1d4');

    // Warm subtle front-fill bounce to keep the cable-knit sweater & glasses richly detailed
    const studioFill = new THREE.DirectionalLight('#fff2df', 0.48);
    studioFill.position.set(-4.5, 3.2, 5.5);
    scene.add(studioFill);

    // 2. Architectural Museum Conservatory Diorama
    this.buildGalleryEnvironment(scene);

    // 3. Brushed-stone & brass turntable plinth
    this.turntableGroup = this.buildTurntable(scene);

    // 4. Botanical ensemble around the plinth (all real multi-part art-kit foliage!)
    this.buildBotanicalAlcove(scene);

    // 5. Load & place the live 3D wheelchair figurine flush on the turntable
    try {
      const rig = await createFigurineRig({
        targetHeight: 1.65,
        headlights: false,
        boostGlow: false,
        envMapIntensity: 1.05,
      });
      if (this.disposed) {
        rig.dispose();
        return;
      }
      this.figurine = rig;
      // Rotate PI inside turntable so figurine faces +Z toward the warm sun & hero camera
      rig.root.position.set(0, PEDESTAL_TOP_Y, 0);
      rig.root.rotation.y = Math.PI;
      this.turntableGroup.add(rig.root);
    } catch (err) {
      console.error('[HubView] Failed to load wheelchair figurine:', err);
      this.showToast('Could not load 3D figurine model.');
    }

    // 6. Floating sunlit dust motes
    this.motes = createParticleSystem({
      type: 'dust',
      count: 150,
      bounds: { width: 12, height: 5.4, depth: 12 },
      center: new THREE.Vector3(0, 2.5, -1.5),
      wind: new THREE.Vector3(0.16, 0.04, 0.08),
      size: 0.06,
      colors: ['#fff6dc', '#f6dfb0', '#e3efe0'],
      ambient: true,
    });
    scene.add(this.motes.group);

    // Position camera cleanly on first frame
    this.updateCameraTransform(camera);

    // 7. Start smooth animation loop
    this.host.start((dt, elapsed) => {
      if (this.disposed) return;

      // Gentle turntable rotation pauses during drag and softly resumes
      if (!this.isDragging) {
        if (this.idleSpinResumeTimer > 0) {
          this.idleSpinResumeTimer = Math.max(0, this.idleSpinResumeTimer - dt);
        } else if (this.turntableGroup) {
          this.turntableGroup.rotation.y += dt * 0.14;
        }
      }

      // Smooth damped orbit interpolation
      const damp = 1 - Math.exp(-9 * dt);
      this.orbitYaw += (this.targetYaw - this.orbitYaw) * damp;
      this.orbitPitch += (this.targetPitch - this.orbitPitch) * damp;
      this.orbitDist += (this.targetDist - this.orbitDist) * damp;
      this.updateCameraTransform(camera);

      // Subtle color accent shift on the brass plinth halo
      this.currentAccentColor.lerp(this.targetAccentColor, 1 - Math.exp(-5 * dt));
      if (this.accentHaloMat) this.accentHaloMat.color.copy(this.currentAccentColor);
      if (this.accentLight) this.accentLight.color.copy(this.currentAccentColor);

      // Living figurine idle animation (subtle breathing, blinking, gentle look)
      if (this.figurine) {
        this.figurineReactionPulse = Math.max(0, this.figurineReactionPulse - dt * 1.6);
        const gentleTurn = Math.sin(elapsed * 0.55) * 0.35 + this.figurineReactionPulse * 0.9;
        this.figurine.update(dt, {
          speed: 0,
          turnRate: gentleTurn,
          boost: this.figurineReactionPulse > 0.35,
        });
      }

      // Advance botanical wind & atmospheric particles
      updateFoliageWind(elapsed, 0.72);
      for (const tree of this.trees) tree.update(elapsed);
      for (const forest of this.forests) forest.update(elapsed);
      this.grassField?.update(elapsed);
      this.wildflowerPatch?.update(elapsed);
      for (const b of this.bambooClusters) b.update(elapsed);
      this.atmosphere?.update(elapsed, camera.position);
      this.motes?.update(dt);
    });
  }

  selectGame(id: GameId): void {
    const meta = GAME_CATALOG.find((g) => g.id === id);
    if (!meta) return;
    if (this.selectedId !== id) {
      this.selectedId = id;
      this.targetAccentColor.set(meta.accentColor);
      this.figurineReactionPulse = 0.75;
    }
    for (const [cardId, btn] of this.cardButtons) {
      btn.classList.toggle('is-selected', cardId === id);
    }
    this.renderPlaque();
  }

  refreshScores(): void {
    this.buildShelfCards();
    this.renderPlaque();
  }

  showToast(message: string): void {
    if (this.disposed) return;
    if (this.toastEl) this.toastEl.remove();
    if (this.toastTimer) window.clearTimeout(this.toastTimer);

    const el = document.createElement('div');
    el.className = 'hub-toast';
    el.textContent = message;
    this.shell.appendChild(el);
    this.toastEl = el;

    this.toastTimer = window.setTimeout(() => {
      el.remove();
      if (this.toastEl === el) this.toastEl = null;
    }, 2500);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.toastTimer) window.clearTimeout(this.toastTimer);

    this.canvasHost.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvasHost.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);

    this.figurine?.dispose();
    this.figurine = null;

    for (const tree of this.trees) tree.dispose();
    this.trees = [];
    for (const forest of this.forests) forest.dispose();
    this.forests = [];
    this.grassField?.dispose();
    this.grassField = null;
    this.wildflowerPatch?.dispose();
    this.wildflowerPatch = null;
    for (const b of this.bambooClusters) b.dispose();
    this.bambooClusters = [];
    this.motes?.dispose();
    this.motes = null;
    this.atmosphere?.dispose();
    this.atmosphere = null;
    this.limestoneMat = null;

    this.host?.dispose();
    this.host = null;
    this.shell.remove();
  }

  private buildGalleryEnvironment(scene: THREE.Scene): void {
    // 1. Wide sunlit gallery courtyard floor (marble tiles)
    const courtFloorMat = createPBRMaterial('marbleTiles', {
      repeatX: 6,
      repeatY: 6,
      tint: '#e2dcd0',
    });
    courtFloorMat.roughness = 0.52;
    courtFloorMat.envMapIntensity = 0.85;

    const courtDisc = new THREE.Mesh(new THREE.CylinderGeometry(3.55, 3.62, 0.08, 64), courtFloorMat);
    courtDisc.position.y = -0.04;
    courtDisc.receiveShadow = true;
    scene.add(courtDisc);

    // Subtle brushed-brass & honed limestone curb encircling the courtyard
    const brassMat = createPBRMaterial('brushedBrass', { repeatX: 6, repeatY: 1 });
    brassMat.roughness = 0.34;
    brassMat.metalness = 0.82;

    const limestoneMat = this.limestoneMat ?? createHonedLimestoneMaterial('#e5ded0');

    const curbRing = new THREE.Mesh(new THREE.TorusGeometry(3.58, 0.085, 16, 72), limestoneMat);
    curbRing.rotation.x = Math.PI / 2;
    curbRing.position.y = 0.02;
    curbRing.receiveShadow = true;
    curbRing.castShadow = true;
    scene.add(curbRing);

    const innerBrassInlay = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.015, 10, 72), brassMat);
    innerBrassInlay.rotation.x = Math.PI / 2;
    innerBrassInlay.position.y = 0.004;
    scene.add(innerBrassInlay);

    // 2. Sunlit landscaped botanical garden bowl (soft undulating outer berm dissolving into warm mist)
    const gardenGroundMat = createPBRMaterial('grassSoil', {
      repeatX: 22,
      repeatY: 22,
      tint: '#d9e3c2',
      mossAmount: 0.3,
    });
    gardenGroundMat.roughness = 0.92;
    const gardenGeo = new THREE.PlaneGeometry(110, 110, 96, 96);
    gardenGeo.rotateX(-Math.PI / 2);
    const posAttr = gardenGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const gx = posAttr.getX(i);
      const gz = posAttr.getZ(i);
      posAttr.setY(i, gardenHeightAt(gx, gz));
    }
    gardenGeo.computeVertexNormals();
    const gardenGround = new THREE.Mesh(gardenGeo, gardenGroundMat);
    gardenGround.receiveShadow = true;
    scene.add(gardenGround);

    // 3. Curved conservatory pavilion archways behind the turntable (-Z semicircle)
    const ironMat = new THREE.MeshStandardMaterial({
      color: '#2d3531',
      roughness: 0.42,
      metalness: 0.68,
      envMapIntensity: 1.1,
    });
    const pillarBaseMat = limestoneMat;

    const archRadius = 5.4;
    const pillarAngles = [-2.55, -2.02, -1.49, -0.96, -0.43];
    const pillarPositions: THREE.Vector3[] = [];

    for (const angle of pillarAngles) {
      const px = Math.cos(angle) * archRadius;
      const pz = Math.sin(angle) * archRadius;
      pillarPositions.push(new THREE.Vector3(px, 0, pz));

      const colGroup = new THREE.Group();
      colGroup.position.set(px, 0, pz);
      colGroup.lookAt(0, 0, 0);

      // Stone plinth foot
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.46), pillarBaseMat);
      plinth.position.y = 0.26;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      colGroup.add(plinth);

      // Fluted dark conservatory iron post
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 3.6, 12), ironMat);
      post.position.y = 2.3;
      post.castShadow = true;
      colGroup.add(post);

      // Brass capital collar
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.14, 14), brassMat);
      collar.position.y = 4.08;
      colGroup.add(collar);

      scene.add(colGroup);
    }

    // Curved conservatory top beam + delicate glazing ribs connecting the pillars
    const arcCurvePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const a = THREE.MathUtils.lerp(pillarAngles[0], pillarAngles[pillarAngles.length - 1], t);
      arcCurvePts.push(new THREE.Vector3(Math.cos(a) * archRadius, 4.15, Math.sin(a) * archRadius));
    }
    const topBeamCurve = new THREE.CatmullRomCurve3(arcCurvePts);
    const topBeam = new THREE.Mesh(new THREE.TubeGeometry(topBeamCurve, 40, 0.065, 10, false), ironMat);
    topBeam.castShadow = true;
    scene.add(topBeam);

    // Graceful arched transoms between adjacent pillars
    for (let i = 0; i < pillarPositions.length - 1; i++) {
      const p0 = pillarPositions[i];
      const p1 = pillarPositions[i + 1];
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      const archPts = [
        new THREE.Vector3(p0.x, 3.45, p0.z),
        new THREE.Vector3(mid.x, 4.05, mid.z),
        new THREE.Vector3(p1.x, 3.45, p1.z),
      ];
      const curve = new THREE.CatmullRomCurve3(archPts);
      const archMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.036, 8, false), ironMat);
      scene.add(archMesh);
    }
  }

  private buildTurntable(scene: THREE.Scene): THREE.Group {
    const limestoneMat = this.limestoneMat ?? createHonedLimestoneMaterial('#e8e1d4');
    const lowerStoneMat = createHonedLimestoneMaterial('#d9d1c2');

    const darkBronzeMat = new THREE.MeshStandardMaterial({
      color: '#292622',
      roughness: 0.36,
      metalness: 0.72,
    });

    const brassMat = createPBRMaterial('brushedBrass', { repeatX: 5, repeatY: 1 });
    brassMat.roughness = 0.28;
    brassMat.metalness = 0.86;

    // Stationary lower stepped travertine plinth
    const lowerPlinth = new THREE.Mesh(new THREE.CylinderGeometry(1.76, 1.88, 0.11, 64), lowerStoneMat);
    lowerPlinth.position.y = 0.055;
    lowerPlinth.castShadow = true;
    lowerPlinth.receiveShadow = true;
    scene.add(lowerPlinth);

    // Shadow-gap recessed bronze waist
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(1.46, 1.54, 0.075, 64), darkBronzeMat);
    waist.position.y = 0.145;
    waist.receiveShadow = true;
    scene.add(waist);

    // Subtle game-accent halo ring tucked cleanly inside the recessed bronze shadow gap
    this.accentHaloMat = new THREE.MeshBasicMaterial({
      color: this.currentAccentColor,
      transparent: true,
      opacity: 0.44,
    });
    const haloRing = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.013, 10, 72), this.accentHaloMat);
    haloRing.rotation.x = Math.PI / 2;
    haloRing.position.y = 0.174;
    scene.add(haloRing);

    // Gently recessed under-lip glow (kept low & subtle so the upper stone deck stays clean and architectural)
    this.accentLight = new THREE.PointLight(this.currentAccentColor, 0.28, 2.4, 2);
    this.accentLight.position.set(0, 0.14, 1.55);
    scene.add(this.accentLight);

    // Rotating turntable group (rotates smoothly with figurine + engraved brass dial)
    const turntable = new THREE.Group();
    turntable.name = 'HubTurntable';
    // Start at the iconic 3/4 gallery angle showing face, bow tie, cable-knit sweater & joystick
    turntable.rotation.y = 0.28;

    // Crisp architectural cylinder platter + planar-UV honed limestone top disc (zero concentric swirl!)
    const platterBody = new THREE.Mesh(
      new THREE.CylinderGeometry(1.50, 1.52, 0.095, 72),
      limestoneMat
    );
    platterBody.position.y = PEDESTAL_TOP_Y - 0.0475;
    platterBody.castShadow = true;
    platterBody.receiveShadow = true;
    turntable.add(platterBody);

    const topDeckMat = createHonedLimestoneMaterial('#eee8dc');
    topDeckMat.roughness = 0.48;
    const topDeck = new THREE.Mesh(new THREE.CircleGeometry(1.492, 72), topDeckMat);
    topDeck.rotation.x = -Math.PI / 2;
    topDeck.position.y = PEDESTAL_TOP_Y + 0.0006;
    topDeck.receiveShadow = true;
    turntable.add(topDeck);

    // Gleaming brushed-brass outer bezel ring
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(1.498, 0.022, 14, 72), brassMat);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.y = PEDESTAL_TOP_Y - 0.01;
    bezel.castShadow = true;
    turntable.add(bezel);

    // Delicate inner brass dial circle + 12 watchmaker index ticks
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.008, 8, 64), brassMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = PEDESTAL_TOP_Y + 0.002;
    turntable.add(innerRing);

    const tickGeo = new THREE.BoxGeometry(0.014, 0.004, 0.09);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tick = new THREE.Mesh(tickGeo, brassMat);
      tick.position.set(Math.sin(a) * 1.33, PEDESTAL_TOP_Y + 0.002, Math.cos(a) * 1.33);
      tick.rotation.y = a;
      turntable.add(tick);
    }

    scene.add(turntable);
    return turntable;
  }

  private buildBotanicalAlcove(scene: THREE.Scene): void {
    const stonePedestalMat = this.limestoneMat ?? createHonedLimestoneMaterial('#e5ded0');
    const pedestalCapMat = createHonedLimestoneMaterial('#ede7db');

    // 1. Flanking miniature sculptural Bonsai trees on clean honed limestone pedestals!
    const bonsaiConfigs: Array<{ pos: [number, number, number]; rotY: number; variant: 'maple' | 'emerald'; seed: number }> = [
      { pos: [-2.45, 0, -1.65], rotY: 0.55, variant: 'maple', seed: 11 },
      { pos: [2.25, 0, -2.05], rotY: -0.9, variant: 'emerald', seed: 29 },
    ];

    for (const cfg of bonsaiConfigs) {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.4, 32), stonePedestalMat);
      stand.position.set(cfg.pos[0], 0.2, cfg.pos[2]);
      stand.castShadow = true;
      stand.receiveShadow = true;
      scene.add(stand);

      const standCap = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.47, 0.035, 32), pedestalCapMat);
      standCap.position.set(cfg.pos[0], 0.405, cfg.pos[2]);
      standCap.castShadow = true;
      standCap.receiveShadow = true;
      scene.add(standCap);

      const bonsai = createDetailedTree({
        style: 'bonsai',
        height: 1.55,
        includePot: true,
        bonsaiVariant: cfg.variant,
        seed: cfg.seed,
        castShadow: true,
        receiveShadow: true,
      });
      bonsai.group.position.set(cfg.pos[0], 0.422, cfg.pos[2]);
      bonsai.group.rotation.y = cfg.rotY;
      scene.add(bonsai.group);
      this.trees.push(bonsai);
    }

    // 2. Conservatory showcase trees framing the rear sunlit garden
    const showcaseTrees: Array<{
      style: 'maple_autumn' | 'sakura' | 'olive' | 'oak';
      pos: [number, number, number];
      height: number;
      seed: number;
      rotY: number;
    }> = [
      { style: 'maple_autumn', pos: [-4.6, gardenHeightAt(-4.6, -5.8), -5.8], height: 5.2, seed: 101, rotY: 0.4 },
      { style: 'olive', pos: [0.3, gardenHeightAt(0.3, -7.2), -7.2], height: 5.5, seed: 204, rotY: 1.3 },
      { style: 'sakura', pos: [4.8, gardenHeightAt(4.8, -5.4), -5.4], height: 5.0, seed: 309, rotY: -0.7 },
      { style: 'oak', pos: [-6.9, gardenHeightAt(-6.9, -1.6), -1.6], height: 5.8, seed: 412, rotY: 2.1 },
    ];

    for (const t of showcaseTrees) {
      const tree = createDetailedTree({
        style: t.style,
        height: t.height,
        seed: t.seed,
        canopyDensity: 1.0,
        castShadow: true,
        receiveShadow: true,
      });
      tree.group.position.set(t.pos[0], t.pos[1], t.pos[2]);
      tree.group.rotation.y = t.rotY;
      scene.add(tree.group);
      this.trees.push(tree);
    }

    // 2b. Full 360° outer botanical grove (frames both the distant horizon AND the +Z orbit side!)
    const oliveRing: Array<{ x: number; y: number; z: number; scale: number; rotationY: number }> = [];
    const oakRing: Array<{ x: number; y: number; z: number; scale: number; rotationY: number }> = [];
    const cypressRing: Array<{ x: number; y: number; z: number; scale: number; rotationY: number }> = [];

    const totalOuterTrees = 26;
    for (let i = 0; i < totalOuterTrees; i++) {
      const angle = (i / totalOuterTrees) * Math.PI * 2 + 0.14;
      const radius = 10.6 + ((i * 7) % 5) * 1.45;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = gardenHeightAt(x, z) - 0.08;
      const placement = {
        x,
        y,
        z,
        scale: 0.85 + ((i * 13) % 7) * 0.075,
        rotationY: angle * 1.7 + i * 0.6,
      };
      if (i % 3 === 0) oliveRing.push(placement);
      else if (i % 3 === 1) oakRing.push(placement);
      else cypressRing.push(placement);
    }

    const oliveForest = createForest(oliveRing, {
      style: 'olive',
      baseHeight: 5.8,
      archetypes: 3,
      canopyDensity: 0.9,
      seed: 511,
      castShadow: false,
    });
    const oakForest = createForest(oakRing, {
      style: 'oak',
      baseHeight: 6.4,
      archetypes: 3,
      canopyDensity: 0.9,
      seed: 613,
      castShadow: false,
    });
    const cypressForest = createForest(cypressRing, {
      style: 'cypress',
      baseHeight: 6.8,
      archetypes: 2,
      canopyDensity: 0.9,
      seed: 719,
      castShadow: false,
    });
    scene.add(oliveForest.group, oakForest.group, cypressForest.group);
    this.forests.push(oliveForest, oakForest, cypressForest);

    // 3. Lush arched fern clusters & mossy boulders nestled 360° along the stone courtyard curb
    const fernSpots: Array<[number, number, number, number]> = [
      [-3.1, 0.0, -0.9, 1.05],
      [-2.8, 0.0, -2.6, 1.15],
      [-1.1, 0.0, -3.65, 1.1],
      [1.3, 0.0, -3.55, 1.0],
      [3.15, 0.0, -1.4, 1.1],
      [-3.45, 0.0, 1.5, 0.95],
      [3.2, 0.0, 1.35, 0.9],
      [-2.1, 0.0, 3.35, 1.0],
      [0.4, 0.0, 3.75, 0.95],
      [2.55, 0.0, 3.0, 1.0],
    ];
    fernSpots.forEach(([x, y, z, s], i) => {
      const fern = createFernCluster({
        frondCount: 11,
        radius: 0.65 * s,
        height: 0.52 * s,
        seed: 50 + i * 17,
        castShadow: true,
      });
      fern.position.set(x, y, z);
      fern.rotation.y = i * 1.1;
      scene.add(fern);
    });

    const boulderSpots: Array<[number, number, number]> = [
      [-3.75, -2.35, 0.68],
      [3.55, -2.85, 0.72],
      [-1.95, -4.15, 0.56],
      [2.1, -4.4, 0.52],
      [-3.6, 3.1, 0.62],
      [3.4, 3.25, 0.58],
    ];
    boulderSpots.forEach(([x, z, r], i) => {
      const boulder = createMossyBoulder({
        radius: r,
        mossAmount: 0.65,
        includeAccentStones: true,
        seed: 700 + i * 31,
        castShadow: true,
      });
      boulder.position.set(x, gardenHeightAt(x, z), z);
      scene.add(boulder);
    });

    // 4. Delicate bamboo sprigs flanking the outer conservatory columns
    const bamboo1 = createBambooCluster({ culmCount: 7, heightRange: [2.8, 4.4], spread: 0.75, seed: 88 });
    bamboo1.group.position.set(-5.3, gardenHeightAt(-5.3, -3.2), -3.2);
    scene.add(bamboo1.group);
    this.bambooClusters.push(bamboo1);

    const bamboo2 = createBambooCluster({ culmCount: 6, heightRange: [2.6, 4.0], spread: 0.65, seed: 94 });
    bamboo2.group.position.set(5.1, gardenHeightAt(5.1, -3.0), -3.0);
    scene.add(bamboo2.group);
    this.bambooClusters.push(bamboo2);

    // 5. Warm conservatory lanterns
    const stoneLantern = createLantern('stone_toro', {
      scale: 0.82,
      withLight: true,
      lightIntensity: 1.3,
      lightDistance: 6.5,
      castShadow: true,
    });
    stoneLantern.position.set(-3.3, 0, -2.75);
    scene.add(stoneLantern);

    const brassLamp = createLantern('brass_lamp', {
      scale: 0.92,
      withLight: true,
      lightIntensity: 1.35,
      lightDistance: 7.5,
      castShadow: true,
    });
    brassLamp.position.set(2.95, 0, -2.95);
    scene.add(brassLamp);

    // 6. Wind-swept interactive botanical grass ring + wildflowers 360° around the marble court
    this.grassField = createGrassField({
      center: [0, 0],
      radius: 13.5,
      count: 6200,
      heightAt: gardenHeightAt,
      bladeHeightRange: [0.22, 0.52],
      bladeWidth: 0.038,
      baseColor: '#456a38',
      tipColor: '#a2c36c',
      dryColor: '#d0c078',
      windStrength: 0.75,
      mask: (x, z) => {
        const d = Math.hypot(x, z);
        return d > 3.68 && d < 13.3;
      },
      seed: 42,
    });
    scene.add(this.grassField.mesh);

    this.wildflowerPatch = createWildflowerPatch({
      center: [0, 0],
      radius: 10.5,
      count: 190,
      heightAt: gardenHeightAt,
      palette: ['#f5e9cf', '#e4999c', '#e6c36c', '#9dbce0', '#d87b60'],
      mask: (x, z) => {
        const d = Math.hypot(x, z);
        return d > 3.85 && d < 10.2;
      },
      seed: 99,
    });
    scene.add(this.wildflowerPatch.group);
  }

  private updateCameraTransform(camera: THREE.PerspectiveCamera): void {
    // Shift camera & look-at along camera-right so the figurine stays heroically centered
    // in the open 65% canvas space to the left of the right-hand Anthology Shelf at every orbit angle!
    const screenShift = window.innerWidth > 920 ? 0.64 : 0;
    const rightX = Math.cos(this.orbitYaw);
    const rightZ = -Math.sin(this.orbitYaw);

    const targetX = rightX * screenShift;
    const targetY = 1.06;
    const targetZ = rightZ * screenShift;

    const cosPitch = Math.cos(this.orbitPitch);
    const camX = targetX + Math.sin(this.orbitYaw) * cosPitch * this.orbitDist;
    const camY = targetY + Math.sin(this.orbitPitch) * this.orbitDist;
    const camZ = targetZ + Math.cos(this.orbitYaw) * cosPitch * this.orbitDist;

    camera.position.set(camX, camY, camZ);
    camera.lookAt(targetX, targetY, targetZ);
  }

  private buildShelfCards(): void {
    this.shelfList.innerHTML = '';
    this.cardButtons.clear();

    let availableCount = 0;
    for (const meta of GAME_CATALOG) {
      const ready = isGameAvailable(meta.id);
      if (ready) availableCount++;
      const best = getBestScore(meta.id);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `hub-game-card${meta.id === this.selectedId ? ' is-selected' : ''}`;
      btn.style.setProperty('--card-accent', meta.accentColor);
      btn.innerHTML = `
        <span class="hub-card-num">${String(meta.number).padStart(2, '0')}</span>
        <span class="hub-card-body">
          <span class="hub-card-title">${escapeHtml(meta.title)}</span>
          <span class="hub-card-meta">${escapeHtml(meta.genre)} · ${escapeHtml(meta.style)}</span>
        </span>
        <span class="hub-card-right">
          <span class="hub-card-badge ${ready ? 'is-ready' : 'is-soon'}">
            ${ready ? 'Play' : 'Atelier'}
          </span>
          ${best !== null ? `<span class="hub-card-score">Best ${best}</span>` : ''}
        </span>
      `;

      btn.addEventListener('mouseenter', () => {
        this.selectGame(meta.id);
      });

      btn.addEventListener('click', () => {
        this.selectGame(meta.id);
        this.audio.playClick();
        if (ready) {
          this.callbacks.onLaunchGame(meta.id);
        } else {
          this.showToast(`${meta.title} is currently being crafted in the Atelier.`);
        }
      });

      this.cardButtons.set(meta.id, btn);
      this.shelfList.appendChild(btn);
    }

    this.shelfCountEl.textContent = `${availableCount} of ${GAME_CATALOG.length} Exhibitions Ready`;
  }

  private renderPlaque(): void {
    const meta: GameMeta = GAME_CATALOG.find((g) => g.id === this.selectedId) ?? GAME_CATALOG[0];
    const ready = isGameAvailable(meta.id);
    const best = getBestScore(meta.id);

    this.plaqueEl.style.setProperty('--plaque-accent', meta.accentColor);
    this.plaqueEl.innerHTML = `
      <div class="hub-plaque-top">
        <span class="hub-plaque-tag">Exhibition ${String(meta.number).padStart(2, '0')} · ${escapeHtml(meta.style)}</span>
        <span class="hub-plaque-best">${best !== null ? `Best ${best}` : 'Unplayed'}</span>
      </div>
      <h2 class="hub-plaque-title">${escapeHtml(meta.title)}</h2>
      <p class="hub-plaque-desc">${escapeHtml(meta.objective)}</p>
      <div class="hub-plaque-footer">
        <button type="button" class="hub-launch-btn" ${ready ? '' : 'disabled'}>
          <span>${ready ? 'Enter Exhibition' : 'In Atelier · Coming Soon'}</span>
          ${ready ? '<span>→</span>' : ''}
        </button>
      </div>
    `;

    const launchBtn = this.plaqueEl.querySelector('.hub-launch-btn') as HTMLButtonElement | null;
    if (launchBtn && ready) {
      launchBtn.addEventListener('click', () => {
        this.audio.playClick();
        this.callbacks.onLaunchGame(meta.id);
      });
    }
  }

  private bindInteraction(): void {
    this.canvasHost.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvasHost.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.isDragging = true;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;
    this.idleSpinResumeTimer = 3.5;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastDragX;
    const dy = e.clientY - this.lastDragY;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;

    this.targetYaw -= dx * 0.0075;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * 0.0055, 0.04, 0.72);
    this.idleSpinResumeTimer = 3.5;
  };

  private onPointerUp = (): void => {
    this.isDragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    this.targetDist = THREE.MathUtils.clamp(this.targetDist + e.deltaY * 0.0032, 2.8, 6.8);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.disposed) return;
    if (e.code === 'Enter') {
      const ready = isGameAvailable(this.selectedId);
      if (ready) {
        e.preventDefault();
        this.audio.playClick();
        this.callbacks.onLaunchGame(this.selectedId);
      } else {
        const meta = GAME_CATALOG.find((g) => g.id === this.selectedId);
        this.showToast(`${meta?.title ?? 'This exhibition'} is currently being crafted in the Atelier.`);
      }
    } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      const idx = GAME_CATALOG.findIndex((g) => g.id === this.selectedId);
      const delta = e.code === 'ArrowDown' ? 1 : -1;
      const next = GAME_CATALOG[(idx + delta + GAME_CATALOG.length) % GAME_CATALOG.length];
      if (next) this.selectGame(next.id);
    }
  };

  private syncMuteButton(): void {
    this.muteBtn.innerHTML = this.audio.muted ? '✕♪' : '♪';
    this.muteBtn.classList.toggle('is-muted', this.audio.muted);
  }
}

function gardenHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r <= 6.8) return -0.02;
  const t = Math.min(1, (r - 6.8) / 28);
  const smooth = t * t * (3 - 2 * t);
  const angle = Math.atan2(z, x);
  const undulation = 0.55 * Math.sin(angle * 3 + 0.7) + 0.32 * Math.cos(angle * 5 - 1.1);
  return -0.02 + smooth * (2.35 + undulation);
}

function createHonedLimestoneMaterial(hexColor: string): THREE.MeshStandardMaterial {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = hexColor;
    ctx.fillRect(0, 0, size, size);
    // Fine-grained architectural travertine micro-speckle (zero bands or stripes)
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 3200; i++) {
      const px = rand() * size;
      const py = rand() * size;
      const rad = 0.6 + rand() * 2.1;
      const light = rand() > 0.5;
      ctx.fillStyle = light ? 'rgba(255,253,248,0.065)' : 'rgba(95,86,74,0.055)';
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    // Delicate warm mineral clouding
    for (let i = 0; i < 28; i++) {
      const px = rand() * size;
      const py = rand() * size;
      const rad = 18 + rand() * 34;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, rad);
      grad.addColorStop(0, rand() > 0.5 ? 'rgba(255,252,245,0.08)' : 'rgba(130,118,100,0.05)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  return new THREE.MeshStandardMaterial({
    map,
    roughness: 0.56,
    metalness: 0.04,
    envMapIntensity: 0.72,
  });
}

function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

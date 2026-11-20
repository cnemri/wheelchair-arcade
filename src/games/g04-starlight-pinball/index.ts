import * as THREE from 'three';
import {
  applyAtmosphere,
  createParticleSystem,
  updateFoliageWind,
} from '../../art';
import { createFigurineRig } from '../../engine/character';
import { InputController } from '../../engine/input';
import { createSceneHost } from '../../engine/sceneHost';
import type { GameContext, GameInstance, GameModule, HudStat } from '../../engine/types';
import { createPinballArena } from './arena';
import {
  BALL_RADIUS,
  BONUS_ORB_SPOTS,
  BONUS_ORB_TIME_SEC,
  BUMPERS,
  COMBO_DECAY_SEC,
  DASH_COOLDOWN_SEC,
  DROP_TARGETS,
  GAME_META,
  MATCH_DURATION_SEC,
  MULTIBALL_DURATION_SEC,
  PLAYER_RADIUS,
  SHOCKWAVE_RADIUS,
  ZODIAC_LANES,
} from './constants';
import {
  createPhysicsWorld,
  spawnPinball,
  stepPhysics,
  type PhysicsCallbacks,
  type PhysicsWorld,
  type PinballState,
} from './physics';
import { createStarlightTextures } from './textures';

interface BallVisual {
  group: THREE.Group;
  sphere: THREE.Mesh;
  halo: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
  isGolden: boolean;
}

interface TimeOrbState {
  active: boolean;
  x: number;
  z: number;
  cooldown: number;
  life: number;
}

function formatTime(sec: number): string {
  const clamped = Math.max(0, Math.ceil(sec));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getRankTitle(score: number): string {
  if (score >= 45000) return 'Grand Celestial Maestro';
  if (score >= 28000) return 'Master Astrolabe Pilot';
  if (score >= 15000) return 'Observatory Ace';
  if (score >= 7000) return 'Clockwork Navigator';
  return 'Starlight Challenger';
}

const starlightPinballModule: GameModule = {
  meta: GAME_META,

  async mount(ctx: GameContext): Promise<GameInstance> {
    const host = createSceneHost({
      container: ctx.container,
      fov: 44,
      near: 0.2,
      far: 240,
      exposure: 1.08,
      shadows: true,
    });
    const { scene, camera, renderer } = host;

    // 1. Opulent Steampunk Observatory Atmosphere & Lighting
    const atmosphere = applyAtmosphere(scene, renderer, 'observatory_warm', {
      skyRadius: 150,
      shadowExtent: 26,
      shadowMapSize: 2048,
      fogDensityMultiplier: 0.58,
      enableShadows: true,
      sunDistance: 46,
    });

    // Overhead warm observatory gallery spotlight illuminating the central playfield & figurine
    const gallerySpot = new THREE.SpotLight(0xffe4b0, 4.2, 52, Math.PI / 3.2, 0.52, 1.15);
    gallerySpot.position.set(0, 26, 4);
    gallerySpot.target.position.set(0, 0, -1.5);
    scene.add(gallerySpot, gallerySpot.target);

    // Subtle cool celestial fill from the north backglass direction for crisp brass specular contrast
    const celestialFill = new THREE.PointLight(0x7cb4ff, 2.8, 34, 1.4);
    celestialFill.position.set(0, 8.5, -11.5);
    scene.add(celestialFill);

    // Dynamic transient impact flash light that pops over hit bumpers, targets & dash shockwaves
    const impactFlashLight = new THREE.PointLight(0xffd272, 0, 14, 1.5);
    impactFlashLight.position.set(0, 2.0, 0);
    scene.add(impactFlashLight);
    let impactFlashIntensity = 0;

    const pulseImpactLight = (x: number, z: number, colorHex: number, strength = 6.5) => {
      impactFlashLight.position.set(x, 1.65, z);
      impactFlashLight.color.setHex(colorHex);
      impactFlashIntensity = Math.max(impactFlashIntensity, strength);
    };

    // 2. Bespoke Star-Chart Textures & 3D Clockwork Arena
    const textures = createStarlightTextures();
    const arena = createPinballArena(textures);
    scene.add(arena.root);

    // 3. Player Wheelchair Figurine Rig (facing -Z, flush on playfield y = 0)
    const rig = await createFigurineRig({
      targetHeight: 1.84,
      headlights: true,
      boostGlow: true,
      envMapIntensity: 1.18,
      castShadow: true,
      receiveShadow: true,
    });
    rig.setHeadlightIntensity(0.75);
    scene.add(rig.root);

    // Crisp subtle golden indicator ring directly beneath the wheelchair for arcade clarity
    const playerRingMat = new THREE.MeshBasicMaterial({
      color: 0xffd272,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const playerRing = new THREE.Mesh(
      new THREE.RingGeometry(PLAYER_RADIUS * 0.84, PLAYER_RADIUS * 1.06, 32),
      playerRingMat,
    );
    playerRing.rotation.x = -Math.PI / 2;
    playerRing.position.y = 0.03;
    scene.add(playerRing);

    // Kinetic Dash-Ram Electric Brass Shockwave Mesh
    const shockwaveGroup = new THREE.Group();
    const shockRingMat = new THREE.MeshBasicMaterial({
      color: 0xffdc78,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shockRingMesh = new THREE.Mesh(new THREE.RingGeometry(0.68, 1.0, 36), shockRingMat);
    shockRingMesh.rotation.x = -Math.PI / 2;
    const shockTorusMat = new THREE.MeshBasicMaterial({
      color: 0xfff0be,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shockTorus = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.055, 8, 36), shockTorusMat);
    shockTorus.rotation.x = Math.PI / 2;
    shockwaveGroup.add(shockRingMesh, shockTorus);
    shockwaveGroup.position.y = 0.22;
    shockwaveGroup.visible = false;
    scene.add(shockwaveGroup);

    // 4. Floating Golden Bonus Time Orb (Gimbaled Crystal Hourglass Core)
    const timeOrbGroup = new THREE.Group();
    const orbCoreMat = new THREE.MeshStandardMaterial({
      color: 0xfff4c2,
      emissive: 0xffb838,
      emissiveIntensity: 2.2,
      roughness: 0.14,
      metalness: 0.25,
    });
    const orbBrassMat = new THREE.MeshStandardMaterial({
      color: 0xf2c96b,
      roughness: 0.22,
      metalness: 0.9,
    });
    const orbCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.46, 0), orbCoreMat);
    const orbRingA = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 8, 28), orbBrassMat);
    const orbRingB = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.04, 8, 28), orbBrassMat);
    orbRingB.rotation.x = Math.PI / 2;
    const orbFloorHaloMat = new THREE.MeshBasicMaterial({
      color: 0xffcf64,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const orbFloorHalo = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.92, 24), orbFloorHaloMat);
    orbFloorHalo.rotation.x = -Math.PI / 2;
    orbFloorHalo.position.y = -0.78;
    timeOrbGroup.add(orbCore, orbRingA, orbRingB, orbFloorHalo);
    timeOrbGroup.visible = false;
    scene.add(timeOrbGroup);

    // 5. Gleaming Pinball Shared Materials & Geometry
    const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 24, 18);
    const ballHaloGeo = new THREE.RingGeometry(BALL_RADIUS * 0.65, BALL_RADIUS * 1.48, 24);

    const chromeBallMat = new THREE.MeshPhysicalMaterial({
      color: 0xeaf2ff,
      metalness: 0.96,
      roughness: 0.09,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.65,
    });

    const goldBallMat = new THREE.MeshPhysicalMaterial({
      color: 0xffe288,
      emissive: 0xffa428,
      emissiveIntensity: 0.48,
      metalness: 0.94,
      roughness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.75,
    });

    const ballVisuals = new Map<number, BallVisual>();
    const ballsContainer = new THREE.Group();
    scene.add(ballsContainer);

    const syncBallVisuals = (balls: PinballState[], dt: number) => {
      const aliveIds = new Set<number>();
      for (const b of balls) {
        aliveIds.add(b.id);
        let vis = ballVisuals.get(b.id);
        if (!vis) {
          const group = new THREE.Group();
          const sphere = new THREE.Mesh(ballGeo, b.isGolden ? goldBallMat : chromeBallMat);
          sphere.castShadow = true;
          sphere.receiveShadow = true;
          sphere.position.y = BALL_RADIUS;

          // Subtle engraved equatorial brass band on the sphere so rolling spin is visibly crisp!
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(BALL_RADIUS * 1.005, 0.025, 6, 20),
            orbBrassMat,
          );
          sphere.add(band);

          const haloMat = new THREE.MeshBasicMaterial({
            color: b.isGolden ? 0xffc84e : 0x8ed2ff,
            transparent: true,
            opacity: b.isGolden ? 0.55 : 0.36,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const halo = new THREE.Mesh(ballHaloGeo, haloMat);
          halo.rotation.x = -Math.PI / 2;
          halo.position.y = 0.025;

          group.add(sphere, halo);
          ballsContainer.add(group);
          vis = { group, sphere, halo, haloMat, isGolden: b.isGolden };
          ballVisuals.set(b.id, vis);
        }

        if (vis.isGolden !== b.isGolden) {
          vis.isGolden = b.isGolden;
          vis.sphere.material = b.isGolden ? goldBallMat : chromeBallMat;
          vis.haloMat.color.setHex(b.isGolden ? 0xffc84e : 0x8ed2ff);
          vis.haloMat.opacity = b.isGolden ? 0.55 : 0.36;
        }

        vis.group.position.set(b.x, 0, b.z);

        // Physically roll ball around axis perpendicular to travel velocity
        const spd = Math.hypot(b.vx, b.vz);
        if (spd > 0.05) {
          const rollAngle = (spd * dt) / BALL_RADIUS;
          rollAxis.set(b.vz / spd, 0, -b.vx / spd);
          vis.sphere.rotateOnWorldAxis(rollAxis, rollAngle);
        }
      }

      // Remove visuals for drained extra multiballs
      for (const [id, vis] of ballVisuals.entries()) {
        if (!aliveIds.has(id)) {
          ballsContainer.remove(vis.group);
          vis.haloMat.dispose();
          ballVisuals.delete(id);
        }
      }
    };

    // 6. Atmospheric & Burst Particle Systems
    const dustParticles = createParticleSystem({
      type: 'dust',
      count: 140,
      bounds: { width: 32, height: 14, depth: 36 },
      center: new THREE.Vector3(0, 4.5, -1.5),
      size: 0.14,
      colors: [0xffdf94, 0xffc46b, 0xfff2cc],
    });
    scene.add(dustParticles.group);

    const starParticles = createParticleSystem({
      type: 'stars',
      count: 130,
      bounds: { width: 54, height: 22, depth: 52 },
      center: new THREE.Vector3(0, 14, -4),
      size: 0.2,
      colors: [0xfff2c6, 0xa8d4ff, 0xffcf78],
    });
    scene.add(starParticles.group);

    const sparkParticles = createParticleSystem({
      type: 'sparks',
      ambient: false,
      count: 0,
      burstCapacity: 260,
      size: 0.14,
      colors: [0xffe494, 0xffb13d, 0x80d4ff, 0xffffff],
    });
    scene.add(sparkParticles.group);

    const confettiParticles = createParticleSystem({
      type: 'confetti',
      ambient: false,
      count: 0,
      burstCapacity: 200,
      size: 0.17,
      colors: [0xffd166, 0x66d2ff, 0xf78c6b, 0xfff3c4, 0x9b89ff],
    });
    scene.add(confettiParticles.group);

    // 7. Input Controller & Browser Audio Gesture Gate (prevents AudioContext warnings on deep-link load)
    const input = new InputController({ target: host.canvas });

    const navWithActivation = navigator as Navigator & {
      userActivation?: { hasBeenActive?: boolean };
    };
    let audioUnlocked = navWithActivation.userActivation?.hasBeenActive === true;

    const unlockAudio = () => {
      if (audioUnlocked) return;
      audioUnlocked = true;
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
      ctx.audio.resume();
      ctx.audio.setAmbient('space', 0.22);
    };

    if (audioUnlocked) {
      ctx.audio.setAmbient('space', 0.22);
    } else {
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
    }

    const withAudio = (fn: () => void) => {
      if (audioUnlocked) fn();
    };

    // Reusable temp vectors
    const tempVec = new THREE.Vector3();
    const rollAxis = new THREE.Vector3();
    const camPos = new THREE.Vector3(0, 20.6, 21.4);
    const camLook = new THREE.Vector3(0, 0.45, -1.2);

    // 8. Game State
    let world: PhysicsWorld = createPhysicsWorld();
    let score = 0;
    let bestScore = ctx.getBestScore() ?? 0;
    let timeLeft = MATCH_DURATION_SEC;
    let combo = 0;
    let maxCombo = 0;
    let comboTimer = 0;
    let multiplier = 1;
    let frenzyTimer = 0;
    let multiballCount = 0;
    let bumperHits = 0;
    let vorticesShattered = 0;
    let dropTargetResetTimer = 0;
    let zodiacResetTimer = 0;
    let shockwaveProgress = -1;
    let cameraShake = 0;
    let gameOver = false;
    let paused = false;
    let hudTimer = 0;
    let prevLeftFlip = false;
    let prevRightFlip = false;

    const timeOrb: TimeOrbState = {
      active: false,
      x: 0,
      z: -3.9,
      cooldown: 11,
      life: 0,
    };

    const addPoints = (base: number, bumpCombo = true): number => {
      if (bumpCombo) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        comboTimer = COMBO_DECAY_SEC;
      }
      const comboBonus = 1 + Math.min(combo, 20) * 0.05;
      const gained = Math.round(base * multiplier * comboBonus);
      score += gained;
      if (score > bestScore) {
        bestScore = score;
      }
      return gained;
    };

    const triggerMultiballFrenzy = (sourceLabel: string) => {
      multiballCount++;
      const wasActive = frenzyTimer > 0;
      frenzyTimer = MULTIBALL_DURATION_SEC;
      multiplier = Math.min(4, multiplier + 1);

      // Promote existing balls to radiant gold & spawn up to 4 total celestial balls!
      for (const b of world.balls) {
        b.isGolden = true;
      }
      while (world.balls.length < 4) {
        const idx = world.balls.length;
        const side = idx % 2 === 0 ? -1 : 1;
        spawnPinball(
          world,
          side * 5.2,
          -8.4 + idx * 0.7,
          -side * (6 + Math.random() * 5),
          8 + Math.random() * 6,
          true,
        );
      }

      withAudio(() => {
        ctx.audio.playBell(0.9);
        ctx.audio.playCombo(Math.min(12, 5 + multiballCount * 2), 0.75);
      });
      cameraShake = Math.max(cameraShake, 0.55);

      // Celebratory sparks & confetti across the table
      confettiParticles.emitBurst(tempVec.set(0, 2.2, -3.5), 75, {
        speed: 9.5,
        upwardBias: 6.5,
        spread: 1.6,
      });
      sparkParticles.emitBurst(tempVec.set(0, 1.2, 0.35), 45, {
        speed: 11,
        upwardBias: 4.5,
        color: 0xffd768,
      });

      ctx.notify(
        wasActive
          ? `★ ${sourceLabel} · FRENZY EXTENDED (${multiplier}× SCORE)! ★`
          : `★ ${sourceLabel} · STARLIGHT MULTIBALL FRENZY (${multiplier}×)! ★`,
        'accent',
        3200,
      );
    };

    const physicsCallbacks: PhysicsCallbacks = {
      onBumperHit(bumperId, x, z, _speed, byPlayer) {
        bumperHits++;
        const bDef = BUMPERS[bumperId];
        arena.bumpers[bumperId].triggerHit(byPlayer ? 1.25 : 1.0);
        addPoints(bDef.points, true);
        cameraShake = Math.max(cameraShake, byPlayer ? 0.28 : 0.16);
        pulseImpactLight(x, z, bDef.accentHex, byPlayer ? 8.5 : 6.2);
        withAudio(() => ctx.audio.playCombo(Math.min(14, combo), 0.58));
        sparkParticles.emitBurst(tempVec.set(x, 0.55, z), byPlayer ? 24 : 16, {
          speed: 8.5,
          upwardBias: 3.4,
          color: bDef.accentHex,
        });
      },

      onDropTargetHit(targetId, x, z, byPlayer) {
        const def = DROP_TARGETS[targetId];
        arena.dropTargets[targetId].setDown(true);
        const pts = addPoints(500, true);
        cameraShake = Math.max(cameraShake, 0.32);
        pulseImpactLight(x, z, def.accentHex, 8.8);
        withAudio(() => ctx.audio.playChime(targetId * 3 + 2, 0.75));
        sparkParticles.emitBurst(tempVec.set(x, 0.75, z), 28, {
          speed: 9.2,
          upwardBias: 4.0,
          color: def.accentHex,
        });

        const litCount = world.dropTargetsDown.filter(Boolean).length;
        if (litCount === DROP_TARGETS.length) {
          addPoints(1500, false);
          dropTargetResetTimer = 1.8;
          triggerMultiballFrenzy('CONSTELLATIONS ALIGNED');
        } else {
          ctx.notify(
            `${def.name} Lit! (${litCount}/3) +${pts}${byPlayer ? ' · Ram Bonus!' : ''}`,
            'success',
            1800,
          );
        }
      },

      onZodiacLaneLit(laneId, x, z, _byPlayer) {
        const lane = ZODIAC_LANES[laneId];
        arena.zodiacLanes[laneId].setLit(true);
        const pts = addPoints(250, true);
        withAudio(() => ctx.audio.playChime(laneId * 2 + 5, 0.65));
        sparkParticles.emitBurst(tempVec.set(x, 0.4, z), 18, {
          speed: 6.5,
          upwardBias: 4.6,
          color: 0xffd770,
        });

        const litCount = world.zodiacLanesLit.filter(Boolean).length;
        if (litCount === ZODIAC_LANES.length) {
          addPoints(1500, false);
          zodiacResetTimer = 2.0;
          triggerMultiballFrenzy('ZODIAC ARCH COMPLETE');
        } else {
          ctx.notify(`Zodiac ${lane.name} (${litCount}/4) +${pts}`, 'info', 1400);
        }
      },

      onSlingshotHit(slingId, x, z) {
        arena.slingshots[slingId].triggerHit();
        addPoints(100, true);
        withAudio(() => ctx.audio.playBump(0.55));
        sparkParticles.emitBurst(tempVec.set(x, 0.45, z), 12, {
          speed: 7.5,
          upwardBias: 2.5,
          color: 0xffb347,
        });
      },

      onFlipperHit(_side, x, z, speed) {
        addPoints(60, false);
        withAudio(() => ctx.audio.playBump(Math.min(1, 0.45 + speed / 34)));
        sparkParticles.emitBurst(tempVec.set(x, 0.45, z), 10, {
          speed: 6.5,
          upwardBias: 2.6,
          color: 0xffe49c,
        });
      },

      onPlayerBallHit(x, z, wasDash, speed) {
        if (wasDash) {
          addPoints(180, true);
          cameraShake = Math.max(cameraShake, 0.34);
          withAudio(() => {
            ctx.audio.playBump(1.0);
            ctx.audio.playChime(7, 0.45);
          });
          sparkParticles.emitBurst(tempVec.set(x, 0.6, z), 28, {
            speed: 11.5,
            upwardBias: 3.8,
            color: 0xffe07d,
          });
        } else {
          addPoints(75, true);
          withAudio(() => ctx.audio.playBump(Math.min(0.85, 0.35 + speed / 26)));
          sparkParticles.emitBurst(tempVec.set(x, 0.5, z), 10, {
            speed: 6.0,
            upwardBias: 2.2,
            color: 0xffd584,
          });
        }
      },

      onBallBallHit(x, z, speed) {
        withAudio(() => ctx.audio.playChime(10, Math.min(0.45, speed / 36)));
        sparkParticles.emitBurst(tempVec.set(x, 0.45, z), 8, {
          speed: 5.5,
          upwardBias: 2.0,
          color: 0xffffff,
        });
      },

      onBallDrainReturn(ball, lostCombo) {
        withAudio(() => ctx.audio.playJump(0.5));
        sparkParticles.emitBurst(tempVec.set(ball.x, 0.5, ball.z), 14, {
          speed: 7.5,
          upwardBias: 3.0,
          color: 0xffc864,
        });
        if (lostCombo && combo >= 4) {
          combo = 0;
          comboTimer = 0;
          ctx.notify('Ball Auto-Plunged Back In! Combo Reset', 'warning', 1500);
        }
      },

      onDashTrigger(x, z) {
        shockwaveProgress = 0;
        shockwaveGroup.position.set(x, 0.22, z);
        shockwaveGroup.visible = true;
        cameraShake = Math.max(cameraShake, 0.24);
        pulseImpactLight(x, z, 0xffd768, 7.5);
        withAudio(() => ctx.audio.playBoost(0.75));
        sparkParticles.emitBurst(tempVec.set(x, 0.45, z), 24, {
          speed: 9.0,
          upwardBias: 2.4,
          color: 0xffdb72,
        });
      },

      onVortexShatter(_vortexId, x, z) {
        vorticesShattered++;
        const pts = addPoints(400, true);
        cameraShake = Math.max(cameraShake, 0.42);
        pulseImpactLight(x, z, 0xc996ff, 9.5);
        withAudio(() => {
          ctx.audio.playLaser(4, 0.72);
          ctx.audio.playCombo(Math.min(12, combo + 2), 0.6);
        });
        sparkParticles.emitBurst(tempVec.set(x, 0.65, z), 38, {
          speed: 12.0,
          upwardBias: 4.5,
          color: 0xc996ff,
        });
        confettiParticles.emitBurst(tempVec.set(x, 1.0, z), 20, {
          speed: 7.5,
          upwardBias: 5.0,
        });
        ctx.notify(`Nebula Vortex Shattered! +${pts}`, 'accent', 2000);
      },
    };

    const pushHud = (forceResult = false) => {
      const frenzyActive = frenzyTimer > 0;
      const dropLit = world.dropTargetsDown.filter(Boolean).length;
      const zodiacLit = world.zodiacLanesLit.filter(Boolean).length;
      const chargeProgress = frenzyActive
        ? frenzyTimer / MULTIBALL_DURATION_SEC
        : Math.max(dropLit / DROP_TARGETS.length, zodiacLit / ZODIAC_LANES.length);
      const dashReady = 1 - world.player.dashCooldown / DASH_COOLDOWN_SEC;

      const stats: HudStat[] = [
        { label: 'Score', value: score.toLocaleString(), accent: true },
        { label: 'Multi', value: frenzyActive ? `${multiplier}× FRENZY` : `${multiplier}×`, accent: frenzyActive },
        { label: 'Combo', value: combo > 1 ? `${combo}×` : '—' },
        { label: 'Time', value: formatTime(timeLeft), accent: timeLeft <= 15 },
        { label: 'Best', value: bestScore.toLocaleString() },
      ];

      let statusText: string;
      const activeVortex = world.vortices.some((v) => v.active);
      if (frenzyActive) {
        statusText = `★ STARLIGHT MULTIBALL FRENZY · ${multiplier}× SCORE (${Math.ceil(frenzyTimer)}s) ★`;
      } else if (timeOrb.active) {
        statusText = `✦ Golden Time Orb Active (+${BONUS_ORB_TIME_SEC}s) — Ram or Shoot It!`;
      } else if (activeVortex) {
        statusText = `Nebula Vortex Pulling — Dash-Ram (Space) to Shatter (+400)!`;
      } else {
        statusText = `Constellations ${dropLit}/3 · Zodiac Lanes ${zodiacLit}/4 → Multiball Frenzy`;
      }

      if (forceResult && gameOver) {
        const isNewBest = ctx.saveBestScore(score);
        bestScore = ctx.getBestScore() ?? bestScore;
        ctx.setHud({
          stats,
          meters: [],
          statusText: '',
          promptText: '',
          result: {
            title: getRankTitle(score),
            subtitle: isNewBest
              ? 'New Observatory High Score Recorded!'
              : 'The Celestial Clockwork Chimes Complete.',
            score,
            scoreLabel: 'Final Score',
            isNewBest,
            victory: score >= 12000,
            stats: [
              { label: 'Max Combo', value: `${maxCombo}×`, accent: true },
              { label: 'Bumper Hits', value: bumperHits },
              { label: 'Multiballs', value: multiballCount },
              { label: 'Vortices Shattered', value: vorticesShattered },
            ],
            onRestart: resetGame,
          },
        });
        return;
      }

      ctx.setHud({
        stats,
        meters: [
          {
            label: 'Dash Ram',
            value: dashReady,
            color: dashReady >= 0.99 ? '#FFD166' : '#C98A3E',
          },
          {
            label: frenzyActive ? 'Frenzy' : 'Multiball',
            value: chargeProgress,
            color: frenzyActive ? '#6AD8FF' : '#D4A24E',
          },
        ],
        statusText,
        promptText:
          'WASD / Arrows Drive · Space Kinetic Dash-Ram · Shift / Q·E / Click Brass Flippers',
        result: null,
      });
    };

    const resetGame = () => {
      world = createPhysicsWorld();
      score = 0;
      bestScore = ctx.getBestScore() ?? bestScore;
      timeLeft = MATCH_DURATION_SEC;
      combo = 0;
      maxCombo = 0;
      comboTimer = 0;
      multiplier = 1;
      frenzyTimer = 0;
      multiballCount = 0;
      bumperHits = 0;
      vorticesShattered = 0;
      dropTargetResetTimer = 0;
      zodiacResetTimer = 0;
      shockwaveProgress = -1;
      shockwaveGroup.visible = false;
      cameraShake = 0;
      gameOver = false;
      prevLeftFlip = false;
      prevRightFlip = false;

      timeOrb.active = false;
      timeOrb.cooldown = 11;
      timeOrb.life = 0;
      timeOrbGroup.visible = false;

      for (const dtVis of arena.dropTargets) dtVis.setDown(false);
      for (const zlVis of arena.zodiacLanes) zlVis.setLit(false);
      for (const vVis of arena.vortices) vVis.setActive(false, 0);

      rig.root.position.set(world.player.x, 0, world.player.z);
      rig.root.rotation.y = world.player.yaw;
      syncBallVisuals(world.balls, 0.016);

      withAudio(() => ctx.audio.playBell(0.65));
      ctx.notify('Starlight Pinball Odyssey — Ram Balls & Light the Constellations!', 'accent', 2400);
      pushHud(false);
    };

    ctx.setRestartHandler?.(resetGame);

    // Initialize visual positions cleanly for frame 0
    rig.root.position.set(world.player.x, 0, world.player.z);
    rig.root.rotation.y = world.player.yaw;
    playerRing.position.set(world.player.x, 0.03, world.player.z);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    syncBallVisuals(world.balls, 0.016);
    pushHud(false);

    // 9. Main Game Loop
    host.start((dt, elapsed) => {
      input.update(dt);
      updateFoliageWind(elapsed, 0.55);
      atmosphere.update(elapsed, camera.position);

      if (gameOver) {
        // Gentle celebratory turntable orbit of arena after match finishes
        arena.update(dt, elapsed, false, 0);
        dustParticles.update(dt);
        starParticles.update(dt);
        sparkParticles.update(dt);
        confettiParticles.update(dt);
        rig.update(dt, { speed: 0, turnRate: 0 });
        withAudio(() => ctx.audio.stopMotor());

        if (input.wasPressed('r') || input.wasPressed('enter')) {
          resetGame();
        }
        input.endFrame();
        return;
      }

      // Countdown arcade timer
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        gameOver = true;
        withAudio(() => {
          ctx.audio.stopMotor();
          ctx.audio.playVictory();
        });
        confettiParticles.emitBurst(tempVec.set(0, 3.0, 0), 90, {
          speed: 10,
          upwardBias: 7,
          spread: 1.8,
        });
        pushHud(true);
        input.endFrame();
        return;
      }

      // Combo decay & Multiball Frenzy countdown
      if (combo > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) {
          combo = 0;
        }
      }

      if (frenzyTimer > 0) {
        frenzyTimer -= dt;
        if (frenzyTimer <= 0) {
          frenzyTimer = 0;
          multiplier = Math.max(1, multiplier - 1);
          for (const b of world.balls) b.isGolden = false;
          ctx.notify('Multiball Frenzy Cooling — Keep the Combo Alive!', 'info', 1800);
        }
      }

      // Reset Drop-Targets & Zodiac Lanes after celebratory pause
      if (dropTargetResetTimer > 0) {
        dropTargetResetTimer -= dt;
        if (dropTargetResetTimer <= 0) {
          for (let i = 0; i < world.dropTargetsDown.length; i++) {
            world.dropTargetsDown[i] = false;
            arena.dropTargets[i].setDown(false);
          }
          withAudio(() => ctx.audio.playClick());
        }
      }

      if (zodiacResetTimer > 0) {
        zodiacResetTimer -= dt;
        if (zodiacResetTimer <= 0) {
          for (let i = 0; i < world.zodiacLanesLit.length; i++) {
            world.zodiacLanesLit[i] = false;
            arena.zodiacLanes[i].setLit(false);
          }
        }
      }

      // Gather Controls (WASD/Arrows drive, Space Dash-Ram, Shift/F/Q·E/J·L/Click Flippers)
      const moveX = input.strafe;
      const moveZ = -input.forward;
      const dashPressed = input.wasPressed('space');
      const bothFlippers = input.isDown('shift') || input.isDown('f');
      const leftFlipper =
        bothFlippers || input.isDown('q') || input.isDown('j') || input.pointer.down;
      const rightFlipper =
        bothFlippers || input.isDown('e') || input.isDown('l') || input.pointer.rightDown;

      if ((leftFlipper && !prevLeftFlip) || (rightFlipper && !prevRightFlip)) {
        withAudio(() => ctx.audio.playClick());
      }
      prevLeftFlip = leftFlipper;
      prevRightFlip = rightFlipper;

      const frenzyActive = frenzyTimer > 0;

      // Step Custom Sub-Stepped Pinball + Wheelchair Physics
      stepPhysics(
        world,
        { moveX, moveZ, dashPressed, leftFlipper, rightFlipper },
        dt,
        frenzyActive,
        physicsCallbacks,
      );

      // Update Bonus Golden Time Orb spawning & collection
      updateBonusTimeOrb(dt, elapsed);

      // Update Wheelchair Figurine Rig & Motor Audio
      const p = world.player;
      rig.root.position.set(p.x, 0, p.z);
      rig.root.rotation.y = p.yaw;
      rig.update(dt, {
        speed: p.speed,
        turnRate: p.turnRate,
        groundBump: p.groundBump,
        boost: p.dashTimer > 0,
      });

      playerRing.position.set(p.x, 0.03, p.z);
      const dashReady = p.dashCooldown <= 0;
      playerRingMat.color.setHex(p.dashTimer > 0 ? 0xffffff : dashReady ? 0xffd272 : 0x7088b8);
      playerRingMat.opacity = p.dashTimer > 0 ? 0.85 : dashReady ? 0.44 : 0.22;
      playerRing.scale.setScalar(1 + (dashReady ? Math.sin(elapsed * 4.5) * 0.05 : 0));

      const speedNorm = Math.min(1, Math.hypot(p.vx, p.vz) / 15);
      withAudio(() => ctx.audio.setMotor(speedNorm, { boost: p.dashTimer > 0, surface: 'smooth' }));

      // Emit rear sparks while Kinetic Dash-Ramming
      if (p.dashTimer > 0) {
        const rx = p.x + Math.sin(p.yaw) * 0.65;
        const rz = p.z + Math.cos(p.yaw) * 0.65;
        sparkParticles.emitBurst(tempVec.set(rx, 0.42, rz), 3, {
          speed: 4.5,
          upwardBias: 1.5,
          color: 0xffd166,
          lifeRange: [0.18, 0.35],
        });
      }

      // Animate Kinetic Dash-Ram Shockwave Ring
      if (shockwaveProgress >= 0) {
        shockwaveProgress += dt / 0.34;
        if (shockwaveProgress >= 1) {
          shockwaveProgress = -1;
          shockwaveGroup.visible = false;
        } else {
          const ease = 1 - (1 - shockwaveProgress) ** 3;
          const r = 0.65 + ease * (SHOCKWAVE_RADIUS - 0.65);
          shockwaveGroup.scale.set(r, 1, r);
          const alpha = (1 - shockwaveProgress) * 0.85;
          shockRingMat.opacity = alpha * 0.55;
          shockTorusMat.opacity = alpha;
        }
      }

      // Sync 3D Flippers, Vortices, Pinballs & Arena Clockwork
      arena.flipperGroups[0].rotation.y = -world.flippers[0].angle;
      arena.flipperGroups[1].rotation.y = -world.flippers[1].angle;

      for (const v of world.vortices) {
        const pulse = v.active ? Math.min(1, v.timer / 1.2) : 0;
        arena.vortices[v.id].setActive(v.active, pulse);
      }

      arena.update(dt, elapsed, frenzyActive, world.plungerPull);
      syncBallVisuals(world.balls, dt);

      // Decay dynamic impact flash light & emit golden stardust trails behind fast balls
      if (impactFlashIntensity > 0) {
        impactFlashIntensity = Math.max(0, impactFlashIntensity - dt * 24);
        impactFlashLight.intensity = impactFlashIntensity;
      }
      for (const b of world.balls) {
        const bSpeed = Math.hypot(b.vx, b.vz);
        if (bSpeed > (b.isGolden ? 9 : 19)) {
          b.trailAccum += dt * (b.isGolden ? 26 : 14);
          if (b.trailAccum >= 1) {
            b.trailAccum = 0;
            sparkParticles.emitBurst(tempVec.set(b.x, 0.34, b.z), 1, {
              speed: 1.6,
              upwardBias: 0.6,
              color: b.isGolden ? 0xffd768 : 0xa0dcff,
              lifeRange: [0.16, 0.3],
            });
          }
        }
      }

      // Update Atmospheric & Burst Particle Systems
      dustParticles.update(dt);
      starParticles.update(dt);
      sparkParticles.update(dt);
      confettiParticles.update(dt);

      // Elevated Angled Diorama Camera with Smooth Player Tracking & Micro-Shake
      const targetCamX = p.x * 0.24;
      const targetCamY = frenzyActive ? 19.3 : 20.6;
      const targetCamZ = 21.0 + p.z * 0.16;
      const targetLookX = p.x * 0.18;
      const targetLookZ = -1.55 + p.z * 0.14;

      const camAlpha = 1 - Math.exp(-5.2 * dt);
      camPos.x += (targetCamX - camPos.x) * camAlpha;
      camPos.y += (targetCamY - camPos.y) * camAlpha;
      camPos.z += (targetCamZ - camPos.z) * camAlpha;
      camLook.x += (targetLookX - camLook.x) * camAlpha;
      camLook.z += (targetLookZ - camLook.z) * camAlpha;

      if (cameraShake > 0) {
        cameraShake = Math.max(0, cameraShake - dt * 2.4);
      }
      const shakeMag = cameraShake * cameraShake * 0.48;
      camera.position.set(
        camPos.x + (Math.random() - 0.5) * shakeMag,
        camPos.y + (Math.random() - 0.5) * shakeMag * 0.6,
        camPos.z + (Math.random() - 0.5) * shakeMag,
      );
      camera.lookAt(camLook);

      // Throttled HUD updates
      hudTimer += dt;
      if (hudTimer >= 0.07) {
        hudTimer = 0;
        pushHud(false);
      }

      input.endFrame();
    });

    function updateBonusTimeOrb(dt: number, elapsed: number): void {
      if (!timeOrb.active) {
        timeOrb.cooldown -= dt;
        if (timeOrb.cooldown <= 0) {
          const spot = BONUS_ORB_SPOTS[Math.floor(Math.random() * BONUS_ORB_SPOTS.length)];
          timeOrb.x = spot.x;
          timeOrb.z = spot.z;
          timeOrb.life = 13.5;
          timeOrb.active = true;
          timeOrbGroup.position.set(spot.x, 0.85, spot.z);
          timeOrbGroup.visible = true;
          withAudio(() => ctx.audio.playChime(12, 0.42));
        }
        return;
      }

      timeOrb.life -= dt;
      if (timeOrb.life <= 0) {
        timeOrb.active = false;
        timeOrb.cooldown = 14;
        timeOrbGroup.visible = false;
        return;
      }

      // Spin & hover gently
      timeOrbGroup.position.y = 0.88 + Math.sin(elapsed * 3.8) * 0.16;
      orbCore.rotation.y = elapsed * 2.4;
      orbRingA.rotation.x = elapsed * 2.1;
      orbRingA.rotation.y = elapsed * 1.4;
      orbRingB.rotation.y = -elapsed * 2.6;
      orbRingB.rotation.z = elapsed * 1.5;
      orbFloorHaloMat.opacity = 0.35 + Math.sin(elapsed * 6) * 0.15;

      // Check pickup by wheelchair OR any pinball!
      let collected = false;
      if (Math.hypot(world.player.x - timeOrb.x, world.player.z - timeOrb.z) < PLAYER_RADIUS + 0.82) {
        collected = true;
      } else {
        for (const b of world.balls) {
          if (Math.hypot(b.x - timeOrb.x, b.z - timeOrb.z) < BALL_RADIUS + 0.78) {
            collected = true;
            break;
          }
        }
      }

      if (collected) {
        timeOrb.active = false;
        timeOrb.cooldown = 16;
        timeOrbGroup.visible = false;
        timeLeft += BONUS_ORB_TIME_SEC;
        const pts = addPoints(350, true);
        withAudio(() => ctx.audio.playBell(0.8));
        sparkParticles.emitBurst(tempVec.set(timeOrb.x, 0.9, timeOrb.z), 30, {
          speed: 9.5,
          upwardBias: 4.5,
          color: 0xffd768,
        });
        confettiParticles.emitBurst(tempVec.set(timeOrb.x, 1.1, timeOrb.z), 22, {
          speed: 7.5,
          upwardBias: 5.5,
        });
        ctx.notify(`✦ Golden Time Orb! +${BONUS_ORB_TIME_SEC}s & +${pts} pts`, 'success', 2200);
      }
    }

    return {
      setPaused(nextPaused: boolean) {
        paused = nextPaused;
        host.setPaused(paused);
        if (paused) {
          withAudio(() => ctx.audio.stopMotor());
        }
      },
      dispose() {
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('pointerdown', unlockAudio);
        ctx.setRestartHandler?.(null);
        withAudio(() => {
          ctx.audio.stopMotor();
          ctx.audio.setAmbient('none');
        });
        input.dispose();
        rig.dispose();
        arena.dispose();
        textures.dispose();
        ballGeo.dispose();
        ballHaloGeo.dispose();
        chromeBallMat.dispose();
        goldBallMat.dispose();
        orbBrassMat.dispose();
        dustParticles.dispose();
        starParticles.dispose();
        sparkParticles.dispose();
        confettiParticles.dispose();
        atmosphere.dispose();
        host.dispose();
      },
    };
  },
};

export default starlightPinballModule;

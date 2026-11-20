import * as THREE from 'three';
import {
  applyAtmosphere,
  createParticleSystem,
  updateFoliageWind,
} from '../../art';
import { createFigurineRig } from '../../engine/character';
import { InputController } from '../../engine/input';
import { createSceneHost } from '../../engine/sceneHost';
import type { GameContext, GameInstance, GameMeta, GameModule, HudStat } from '../../engine/types';
import { buildChamberVisuals, type ChamberVisuals } from './chamberBuilder';
import { CHAMBERS } from './chambers';
import { createOrbitalBackdrop } from './orbitalBackdrop';
import {
  createChamberSim,
  findActiveGravityPad,
  findNearbyCube,
  findNearbyMirror,
  getGravityBasis,
  getPlayerCenter,
  gravityLabel,
  rotateMirror,
  shortestAngleDelta,
  stepChamberSim,
  triggerGravityFlip,
  type ChamberSimState,
} from './physics';

const META: GameMeta = {
  id: 'orbital-greenhouse',
  number: 10,
  title: 'Orbital Greenhouse',
  subtitle: 'Zero-G Botanical Bio-Dome',
  genre: 'Zero-G Puzzle',
  style: 'Orbital Sci-Fi',
  accentColor: '#5AA382',
  controls: [
    { keys: 'WASD / Arrows', action: 'Drive & Push Cubes' },
    { keys: 'Space', action: 'Gravity Flip / Hop' },
    { keys: 'E', action: 'Rotate Prism Mirror' },
    { keys: 'Shift', action: 'Tractor Pull / Boost' },
    { keys: 'R', action: 'Reset Chamber' },
  ],
  objective:
    'Flip gravity across terraced biodomes, align brass solar mirrors, and power every conduit to bloom the Orbital World-Tree.',
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function mountOrbitalGreenhouse(ctx: GameContext): Promise<GameInstance> {
  const host = createSceneHost({
    container: ctx.container,
    fov: 50,
    near: 0.12,
    far: 900,
    exposure: 1.08,
    shadows: true,
  });

  const { scene, camera, renderer } = host;

  // =========================================================================
  // 1. GESTURE-GATED AUDIO HELPER (0 Chrome AudioContext warnings on deep-link)
  // =========================================================================
  const navWithActivation = navigator as Navigator & {
    userActivation?: { hasBeenActive?: boolean };
  };
  let audioUnlocked = Boolean(navWithActivation.userActivation?.hasBeenActive);
  let ambientStarted = false;

  const ensureAmbient = () => {
    if (!audioUnlocked || ambientStarted) return;
    ambientStarted = true;
    ctx.audio.setAmbient('space', 0.085);
  };

  const unlockAudioOnGesture = () => {
    if (!audioUnlocked) {
      audioUnlocked = true;
      ctx.audio.resume();
    }
    ensureAmbient();
  };

  window.addEventListener('keydown', unlockAudioOnGesture);
  window.addEventListener('pointerdown', unlockAudioOnGesture);
  if (audioUnlocked) {
    ensureAmbient();
  }

  // =========================================================================
  // 2. ORBITAL SPACE ATMOSPHERE, CURVING EARTH BACKDROP & PARTICLES
  // =========================================================================
  const atmosphere = applyAtmosphere(scene, renderer, 'orbital_space', {
    skyRadius: 580,
    shadowExtent: 20,
    shadowMapSize: 2048,
    fogDensityMultiplier: 0.0,
    enableShadows: true,
    sunDistance: 44,
  });
  atmosphere.sunLight.target.position.set(0, 2, -1);
  atmosphere.sunLight.position.set(16, 26, 18);
  atmosphere.sunLight.target.updateMatrixWorld();

  const backdrop = createOrbitalBackdrop();
  scene.add(backdrop.group);

  // Floating golden solarpunk pollen / bioluminescent fireflies inside biodome
  const fireflies = createParticleSystem({
    type: 'fireflies',
    count: 140,
    bounds: { width: 22, height: 13, depth: 18 },
    center: new THREE.Vector3(0, 4.5, 0),
    size: 0.22,
    colors: [0xffe788, 0x6efce0, 0xfff5c2, 0x8ef7ff],
    burstCapacity: 140,
  });
  scene.add(fireflies.group);

  const sparks = createParticleSystem({
    type: 'sparks',
    ambient: false,
    count: 0,
    size: 0.22,
    colors: [0x5effd2, 0xffe478, 0x62ebff, 0xffffff],
    burstCapacity: 280,
  });
  scene.add(sparks.group);

  const confetti = createParticleSystem({
    type: 'confetti',
    ambient: false,
    count: 0,
    size: 0.17,
    colors: [0x5effc4, 0xffe073, 0x66e8ff, 0xff9ec4, 0xffffff],
    burstCapacity: 320,
  });
  scene.add(confetti.group);

  // =========================================================================
  // 3. WHEELCHAIR FIGURINE WITH MAGNETIC GRAVITY UNDER-RING
  // =========================================================================
  const figurine = await createFigurineRig({
    targetHeight: 1.65,
    headlights: true,
    boostGlow: true,
    envMapIntensity: 1.15,
    castShadow: true,
    receiveShadow: true,
  });
  figurine.setHeadlightIntensity(1.1);
  scene.add(figurine.root);

  // Subtle magnetic grav-lock aura ring beneath the wheelchair chassis
  const magRingGeo = new THREE.RingGeometry(0.46, 0.62, 24);
  magRingGeo.rotateX(-Math.PI / 2);
  const magRingMat = new THREE.MeshBasicMaterial({
    color: 0x62f5ff,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const magRingMesh = new THREE.Mesh(magRingGeo, magRingMat);
  magRingMesh.position.y = 0.04;
  figurine.root.add(magRingMesh);

  // =========================================================================
  // 4. INPUT & CHAMBER STATE MANAGEMENT
  // =========================================================================
  const input = new InputController({
    target: host.canvas,
    preventScrollKeys: true,
    axisSmoothing: 16,
  });

  let chamberIdx = 0;
  let sim: ChamberSimState = createChamberSim(CHAMBERS[0]);
  let chamberVisuals: ChamberVisuals | null = null;

  let totalScore = 0;
  let totalMoves = 0;
  let totalTime = 0;
  let chamberTime = 0;
  let seedsCollectedTotal = 0;
  let totalSeedsAvailable = CHAMBERS.reduce((sum, c) => sum + c.starSeeds.length, 0);

  let warpTimer = 0;
  let warping = false;
  let victory = false;
  let victoryTimer = 0;
  let fireworkWave = 0;
  let paused = false;
  let disposed = false;
  let hudAccum = 0;

  // Smooth camera state (position, lookAt, and roll angle around +Z so up never hits gimbal lock!)
  const camPos = new THREE.Vector3(0, 7.2, 14.8);
  const camLookAt = new THREE.Vector3(0, 2.1, -1.2);
  let camRoll = 0;

  const tmpVec = new THREE.Vector3();
  const tmpTargetCamPos = new THREE.Vector3();
  const tmpTargetCamLook = new THREE.Vector3();
  const tmpPlayerCenter = new THREE.Vector3();
  const tmpQuatSurface = new THREE.Quaternion();
  const tmpQuatYaw = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);

  const computeDesiredCamera = (
    currentSim: ChamberSimState,
    outPos: THREE.Vector3,
    outLook: THREE.Vector3,
  ) => {
    const pCenter = getPlayerCenter(currentSim.player, currentSim.gravity, tmpVec);
    switch (currentSim.gravity) {
      case 'floor': {
        outPos.set(
          THREE.MathUtils.clamp(pCenter.x * 0.42, -4.6, 4.6),
          Math.max(7.1, pCenter.y + 6.4),
          Math.max(14.0, pCenter.z + 10.2),
        );
        outLook.set(
          THREE.MathUtils.clamp(pCenter.x * 0.48, -4.2, 4.2),
          Math.max(2.0, pCenter.y + 1.15),
          THREE.MathUtils.clamp(pCenter.z - 5.2, -3.2, 1.4),
        );
        break;
      }
      case 'right': {
        // Walking on East Wall (+X): camera sits cleanly in open interior (-X) & open front (+Z)
        outPos.set(
          pCenter.x - 10.8,
          THREE.MathUtils.clamp(pCenter.y * 0.68 + 1.4, 2.4, 8.2),
          Math.max(11.6, pCenter.z + 9.0),
        );
        outLook.set(
          pCenter.x - 1.2,
          THREE.MathUtils.clamp(pCenter.y * 0.82 + 0.6, 2.0, 7.8),
          THREE.MathUtils.clamp(pCenter.z - 2.6, -4.0, 2.0),
        );
        break;
      }
      case 'left': {
        // Walking on West Wall (-X): camera sits cleanly in open interior (+X) & open front (+Z)
        outPos.set(
          pCenter.x + 10.8,
          THREE.MathUtils.clamp(pCenter.y * 0.68 + 1.4, 2.4, 8.2),
          Math.max(11.6, pCenter.z + 9.0),
        );
        outLook.set(
          pCenter.x + 1.2,
          THREE.MathUtils.clamp(pCenter.y * 0.82 + 0.6, 2.0, 7.8),
          THREE.MathUtils.clamp(pCenter.z - 2.6, -4.0, 2.0),
        );
        break;
      }
      case 'ceiling': {
        outPos.set(
          THREE.MathUtils.clamp(pCenter.x * 0.45, -4.6, 4.6),
          pCenter.y - 6.8,
          Math.max(13.4, pCenter.z + 10.0),
        );
        outLook.set(
          THREE.MathUtils.clamp(pCenter.x * 0.48, -4.2, 4.2),
          pCenter.y - 1.4,
          THREE.MathUtils.clamp(pCenter.z - 3.6, -3.2, 1.4),
        );
        break;
      }
    }
  };

  const syncFigurineTransform = () => {
    figurine.root.position.copy(sim.player.pos);
    tmpQuatSurface.setFromAxisAngle(zAxis, sim.player.visualRoll);
    tmpQuatYaw.setFromAxisAngle(yAxis, sim.player.localYaw);
    figurine.root.quaternion.copy(tmpQuatSurface).multiply(tmpQuatYaw);
  };

  const loadChamber = (idx: number, snapCamera: boolean, silent = false): ChamberVisuals => {
    if (chamberVisuals) {
      scene.remove(chamberVisuals.root);
      chamberVisuals.dispose();
      chamberVisuals = null;
    }

    chamberIdx = idx;
    const def = CHAMBERS[idx];
    sim = createChamberSim(def);
    chamberTime = 0;
    warping = false;
    warpTimer = 0;

    const nextVisuals = buildChamberVisuals(def);
    chamberVisuals = nextVisuals;
    scene.add(nextVisuals.root);
    syncFigurineTransform();

    if (snapCamera) {
      computeDesiredCamera(sim, camPos, camLookAt);
      camRoll = getGravityBasis(sim.gravity).roll;
      camera.up.set(-Math.sin(camRoll), Math.cos(camRoll), 0);
      camera.position.copy(camPos);
      camera.lookAt(camLookAt);
    }

    if (!silent) {
      ctx.notify(`${def.subtitle}: ${def.name}`, 'accent', 3200);
    }
    pushHud(true);
    return nextVisuals;
  };

  const resetCurrentChamber = (notifyUser = true) => {
    if (victory) return;
    loadChamber(chamberIdx, false, true);
    if (audioUnlocked) ctx.audio.playClick();
    if (notifyUser) {
      ctx.notify(`Chamber ${chamberIdx + 1} reset.`, 'info', 1800);
    }
  };

  const restartFullRun = () => {
    totalScore = 0;
    totalMoves = 0;
    totalTime = 0;
    seedsCollectedTotal = 0;
    victory = false;
    victoryTimer = 0;
    fireworkWave = 0;
    loadChamber(0, true, false);
    if (audioUnlocked) ctx.audio.playChime(5, 0.2);
  };

  const pushHud = (force = false) => {
    void force;
    const def = sim.chamber;
    const poweredCount =
      sim.conduits.filter((c) => c.powered).length + sim.receivers.filter((r) => r.powered).length;
    const targetCount = sim.conduits.length + sim.receivers.length;

    const activePad = findActiveGravityPad(sim);
    const nearMirror = findNearbyMirror(sim);
    const nearCube = findNearbyCube(sim, 2.25);

    let promptText = '';
    if (victory) {
      promptText = '';
    } else if (warping) {
      promptText = 'Warping to next Orbital Bio-Dome...';
    } else if (sim.allPowered) {
      promptText = 'Airlock Unsealed — Roll through the Emerald Portal!';
    } else if (activePad) {
      const nextG = sim.gravity === activePad.targetGravity ? activePad.altGravity : activePad.targetGravity;
      promptText = `[SPACE] Flip Gravity -> ${gravityLabel(nextG)}`;
    } else if (nearMirror) {
      promptText = '[E] Rotate Brass Prism Mirror (90°)';
    } else if (sim.player.towingCubeId) {
      promptText = 'Magnetic Tractor Tow Active — Release [SHIFT] to detach';
    } else if (nearCube) {
      promptText = 'Push Cube or hold [SHIFT] for Magnetic Tractor Pull · [R] Reset';
    } else {
      promptText = def.hint;
    }

    const stats: HudStat[] = [
      { label: 'Chamber', value: `${chamberIdx + 1} / ${CHAMBERS.length}`, accent: true },
      { label: 'Gravity', value: gravityLabel(sim.gravity) },
      { label: 'Nodes', value: `${poweredCount} / ${targetCount}`, accent: sim.allPowered },
      { label: 'Score', value: totalScore },
      { label: 'Time', value: formatTime(totalTime) },
    ];

    const result = victory
      ? {
          title: 'Orbital World-Tree Bloomed!',
          subtitle: 'All 5 Solarpunk Gravity Chambers Restored',
          score: totalScore,
          scoreLabel: 'Biodome Harmony Score',
          isNewBest: ctx.getBestScore() !== null && totalScore >= (ctx.getBestScore() ?? 0),
          victory: true,
          stats: [
            { label: 'Chambers Solved', value: `${CHAMBERS.length} / ${CHAMBERS.length}`, accent: true },
            { label: 'Star-Seeds', value: `${seedsCollectedTotal} / ${totalSeedsAvailable}` },
            { label: 'Total Actions', value: totalMoves },
            { label: 'Total Time', value: formatTime(totalTime) },
          ],
          onRestart: restartFullRun,
        }
      : null;

    ctx.setHud({
      stats,
      meters: [
        {
          label: 'Biodome Power',
          value: targetCount > 0 ? poweredCount / targetCount : 1,
          color: sim.allPowered ? '#43f5b2' : '#f2c15a',
        },
      ],
      statusText: `${def.subtitle} — ${def.name}`,
      promptText,
      paused,
      result,
    });
  };

  ctx.setRestartHandler?.(() => {
    restartFullRun();
  });

  // Load Chamber 1 cleanly and render initial hero frame
  const initialVisuals = loadChamber(0, true, true);
  getPlayerCenter(sim.player, sim.gravity, tmpPlayerCenter);
  initialVisuals.update(0.016, 0, sim, null, null, tmpPlayerCenter);
  host.render();

  // =========================================================================
  // 5. MAIN SIMULATION & RENDER LOOP
  // =========================================================================
  host.start((dt, elapsed) => {
    if (disposed || paused) return;

    input.update(dt);
    updateFoliageWind(elapsed, 0.55);
    backdrop.update(dt, elapsed);

    if (!victory) {
      totalTime += dt;
      chamberTime += dt;

      // Instant Chamber Reset on R
      if (input.wasPressed('r') && !warping) {
        resetCurrentChamber(true);
      }

      if (warping) {
        warpTimer -= dt;
        // Gentle celebratory hover spin inside Airlock portal
        sim.player.localYaw += dt * 4.2;
        syncFigurineTransform();
        figurine.update(dt, { speed: 0, turnRate: 2.5, airborne: true, boost: true });

        if (warpTimer <= 0) {
          if (chamberIdx + 1 < CHAMBERS.length) {
            loadChamber(chamberIdx + 1, false, false);
          } else {
            // GRAND FINALE: Orbital World-Tree Bloom!
            victory = true;
            victoryTimer = 0;
            fireworkWave = 0;
            const isBest = ctx.saveBestScore(totalScore);
            if (audioUnlocked) {
              ctx.audio.stopMotor();
              ctx.audio.playVictory();
            }
            ctx.notify(
              isBest ? 'New Best Score! The Orbital World-Tree is in Full Bloom!' : 'The Orbital World-Tree is in Full Bloom!',
              'success',
              4500,
            );
            confetti.emitBurst(new THREE.Vector3(0, 8.5, -0.6), 110, {
              speed: 7.5,
              upwardBias: 0.65,
              spread: 2.2,
            });
            pushHud(true);
          }
        }
      } else {
        const activePad = findActiveGravityPad(sim);
        const nearMirror = findNearbyMirror(sim);
        const spacePressed = input.wasPressed('space');
        const ePressed = input.wasPressed('e');

        let consumedSpaceForFlip = false;

        // Gravity-Flip when standing on a Magnetic Pad and pressing Space (or E when no mirror is closer)
        if (activePad && sim.flipCooldown <= 0 && (spacePressed || (ePressed && !nearMirror))) {
          const nextG =
            sim.gravity === activePad.targetGravity ? activePad.altGravity : activePad.targetGravity;
          if (triggerGravityFlip(sim, nextG)) {
            consumedSpaceForFlip = true;
            if (audioUnlocked) {
              ctx.audio.playLaser(nextG === 'floor' ? -2 : 5, 0.24);
            }
            sparks.emitBurst(new THREE.Vector3(...activePad.pos), 36, {
              speed: 5.2,
              upwardBias: 0.35,
              spread: 1.8,
              color: 0x62f7ff,
            });
            ctx.notify(`Gravity Shifted -> ${gravityLabel(nextG)}`, 'accent', 1600);
          }
        } else if (ePressed && nearMirror) {
          // Rotate Brass Prism Mirror by 90°!
          rotateMirror(sim, nearMirror);
          if (audioUnlocked) {
            ctx.audio.playClick();
            ctx.audio.playChime(nearMirror.aimIdx * 2 + 2, 0.16);
          }
          sparks.emitBurst(new THREE.Vector3(...nearMirror.def.crystalPos), 18, {
            speed: 3.4,
            spread: 1.2,
            color: 0xffe478,
          });
        }

        const events = stepChamberSim(sim, dt, {
          moveForward: input.forward,
          moveRight: input.strafe,
          shiftHeld: input.boost,
          spacePressed: spacePressed && !consumedSpaceForFlip,
        });

        // Audio & particle feedback for physics events
        if (events.hopped) {
          if (audioUnlocked) ctx.audio.playJump(0.2);
          sparks.emitBurst(sim.player.pos, 16, { speed: 3.2, spread: 1.2, color: 0x66f5ff });
        }
        if (events.landedBump > 0.25) {
          if (audioUnlocked) ctx.audio.playBump(Math.min(0.8, events.landedBump * 0.6));
          sparks.emitBurst(sim.player.pos, 18, { speed: 3.0, spread: 1.1, color: 0x73fff0 });
        }
        for (const cPos of events.cubeLanded) {
          if (audioUnlocked) ctx.audio.playBump(0.65);
          sparks.emitBurst(cPos, 24, { speed: 4.0, spread: 1.3, color: 0xffe07d });
        }
        for (const cPos of events.conduitLocked) {
          if (audioUnlocked) ctx.audio.playCombo(3, 0.24);
          sparks.emitBurst(cPos, 42, { speed: 5.5, spread: 1.6, color: 0x3ef7b2 });
          ctx.notify('Conduit Magnetically Locked!', 'success', 2000);
        }
        for (const rPos of events.receiverActivated) {
          if (audioUnlocked) ctx.audio.playCombo(6, 0.26);
          sparks.emitBurst(rPos, 46, { speed: 5.8, spread: 1.7, color: 0x80ffbe });
          ctx.notify('Photosynthesis Lotus Bloomed!', 'success', 2200);
        }
        for (const sPos of events.starSeedsCollected) {
          seedsCollectedTotal += 1;
          totalScore += 250;
          if (audioUnlocked) ctx.audio.playChime(12, 0.24);
          sparks.emitBurst(sPos, 32, { speed: 4.8, spread: 1.5, color: 0xffe678 });
          ctx.notify('Star-Seed Harvested! +250', 'accent', 1900);
        }
        if (events.airlockOpened) {
          if (audioUnlocked) {
            ctx.audio.playBell(0.26);
            ctx.audio.playChime(7, 0.22);
          }
          sparks.emitBurst(
            new THREE.Vector3(sim.chamber.airlockPos[0], sim.chamber.airlockPos[1] + 1.8, sim.chamber.airlockPos[2]),
            56,
            { speed: 6.2, spread: 2.0, color: 0x45ffc2 },
          );
          ctx.notify('Airlock Unsealed — Roll through the Portal!', 'success', 3000);
        }
        if (events.airlockEntered) {
          warping = true;
          warpTimer = 0.68;
          totalMoves += sim.moves;
          const moveBonus = Math.max(0, (sim.chamber.parMoves + 4 - sim.moves) * 80);
          const timeBonus = Math.max(0, Math.round((sim.chamber.parTime * 1.6 - chamberTime) * 6));
          const chamberPts = 1000 + moveBonus + timeBonus;
          totalScore += chamberPts;
          if (audioUnlocked) {
            ctx.audio.stopMotor();
            ctx.audio.playCombo(9, 0.28);
          }
          sparks.emitBurst(
            new THREE.Vector3(sim.chamber.airlockPos[0], sim.chamber.airlockPos[1] + 1.8, sim.chamber.airlockPos[2]),
            70,
            { speed: 6.8, spread: 2.2, color: 0x6effd8 },
          );
          ctx.notify(`${sim.chamber.name} Restored! +${chamberPts}`, 'success', 2600);
          pushHud(true);
        }

        // Update Wheelchair Figurine Rig & Motor Audio
        syncFigurineTransform();
        const isGlideBoost = input.boost && !sim.player.towingCubeId && Math.abs(sim.player.forwardSpeed) > 0.4;
        figurine.update(dt, {
          speed: sim.player.forwardSpeed,
          turnRate: sim.player.turnRate,
          groundBump: sim.player.groundBump,
          boost: isGlideBoost,
          airborne: !sim.player.grounded,
          tiltX: sim.player.tiltX,
          tiltZ: sim.player.tiltZ,
        });

        // Under-chassis magnetic ring pulses brighter on Gravity Pads, mid-flip, or Tractor Tow
        magRingMat.opacity = activePad
          ? 0.72 + Math.sin(elapsed * 9) * 0.14
          : sim.player.towingCubeId
            ? 0.65
            : !sim.player.grounded
              ? 0.58
              : 0.24;
        magRingMat.color.setHex(sim.player.towingCubeId ? 0x4effbe : 0x62f5ff);

        if (audioUnlocked) {
          const speedNorm = Math.min(1.2, Math.abs(sim.player.forwardSpeed) / 6.2);
          ctx.audio.setMotor(sim.player.grounded ? speedNorm : speedNorm * 0.25, {
            boost: isGlideBoost,
            surface: 'smooth',
          });
        }
      }
    } else {
      // Grand World-Tree Victory Celebration Orbit!
      victoryTimer += dt;
      figurine.update(dt, { speed: 0, turnRate: 0, boost: true });
      const waveIdx = Math.floor(victoryTimer / 1.35);
      if (waveIdx > fireworkWave && waveIdx <= 6) {
        fireworkWave = waveIdx;
        confetti.emitBurst(
          new THREE.Vector3(Math.sin(waveIdx * 2.1) * 4.5, 8.2 + (waveIdx % 2) * 1.4, -1.0),
          65,
          { speed: 6.4, upwardBias: 0.55, spread: 1.8 },
        );
        if (audioUnlocked) ctx.audio.playChime(waveIdx * 2 + 4, 0.18);
      }
    }

    // Update active Chamber Visuals (cubes, mirrors, live lasers, lotus receivers, water, grass, trees!)
    getPlayerCenter(sim.player, sim.gravity, tmpPlayerCenter);
    if (chamberVisuals) {
      const activePadNow = warping || victory ? null : findActiveGravityPad(sim)?.id ?? null;
      const nearMirrorNow = warping || victory ? null : findNearbyMirror(sim)?.def.id ?? null;
      chamberVisuals.update(dt, elapsed, sim, activePadNow, nearMirrorNow, tmpPlayerCenter);
    }

    // Smooth Gravity-Aware Sightline-Safe Camera Interpolation
    if (!victory) {
      computeDesiredCamera(sim, tmpTargetCamPos, tmpTargetCamLook);
      const posAlpha = 1 - Math.exp(-5.8 * dt);
      const lookAlpha = 1 - Math.exp(-7.2 * dt);
      camPos.lerp(tmpTargetCamPos, posAlpha);
      camLookAt.lerp(tmpTargetCamLook, lookAlpha);

      const targetRoll = getGravityBasis(sim.gravity).roll;
      const rollDelta = shortestAngleDelta(camRoll, targetRoll);
      camRoll += rollDelta * (1 - Math.exp(-6.2 * dt));
    } else {
      const orbitA = Math.sin(victoryTimer * 0.32) * 0.72;
      tmpTargetCamPos.set(Math.sin(orbitA) * 14.5, 8.8 + Math.sin(victoryTimer * 0.5) * 0.9, Math.cos(orbitA) * 14.5);
      tmpTargetCamLook.set(0, 5.2, -1.2);
      camPos.lerp(tmpTargetCamPos, 1 - Math.exp(-2.4 * dt));
      camLookAt.lerp(tmpTargetCamLook, 1 - Math.exp(-2.8 * dt));
      camRoll += shortestAngleDelta(camRoll, 0) * (1 - Math.exp(-4.0 * dt));
    }

    camera.up.set(-Math.sin(camRoll), Math.cos(camRoll), 0);
    camera.position.copy(camPos);
    camera.lookAt(camLookAt);

    // Update sky dome centered on camera & atmospheric particle streams
    atmosphere.update(elapsed, camera.position);
    fireflies.update(dt);
    sparks.update(dt);
    confetti.update(dt);

    // Throttled crisp HUD refresh (~12 Hz)
    hudAccum += dt;
    if (hudAccum >= 0.08) {
      hudAccum = 0;
      pushHud(false);
    }

    input.endFrame();
  });

  return {
    setPaused(nextPaused: boolean) {
      paused = nextPaused;
      host.setPaused(paused);
      if (paused && audioUnlocked) {
        ctx.audio.stopMotor();
      }
      pushHud(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('keydown', unlockAudioOnGesture);
      window.removeEventListener('pointerdown', unlockAudioOnGesture);
      ctx.setRestartHandler?.(null);
      ctx.audio.stopMotor();
      ctx.audio.setAmbient('none');
      input.dispose();
      if (chamberVisuals) {
        scene.remove(chamberVisuals.root);
        chamberVisuals.dispose();
        chamberVisuals = null;
      }
      magRingGeo.dispose();
      magRingMat.dispose();
      fireflies.dispose();
      sparks.dispose();
      confetti.dispose();
      backdrop.dispose();
      figurine.dispose();
      atmosphere.dispose();
      host.dispose();
    },
  };
}

const orbitalGreenhouseModule: GameModule = {
  meta: META,
  mount: mountOrbitalGreenhouse,
};

export default orbitalGreenhouseModule;

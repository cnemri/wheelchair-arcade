import * as THREE from 'three';
import { applyAtmosphere, createParticleSystem } from '../../art';
import { createFigurineRig } from '../../engine/character';
import { InputController } from '../../engine/input';
import { createSceneHost } from '../../engine/sceneHost';
import type {
  GameContext,
  GameInstance,
  GameMeta,
  GameModule,
  HudMeter,
  HudStat,
} from '../../engine/types';
import { createCargoRig } from './cargo';
import {
  computeCheckpointBonus,
  computeFinalRating,
  createInitialDriveState,
  stepDrivePhysics,
  type DriveState,
} from './physics';
import { buildCanyonScenery } from './scenery';
import { buildCanyonTrail } from './trail';

const META: GameMeta = {
  id: 'coral-delivery',
  number: 6,
  title: 'Coral Delivery',
  subtitle: 'Terracotta Cove Express',
  genre: 'Cargo Balance Sim',
  style: 'Sun-Baked Canyon',
  accentColor: '#D66D4B',
  controls: [
    { keys: 'W / S', action: 'Throttle & Brake' },
    { keys: 'A / D', action: 'Steer Trail' },
    { keys: 'Shift', action: 'Low-Gear Stabilizer' },
    { keys: 'Space', action: 'Counter-Balance Tap' },
    { keys: 'R', action: 'Restart Run' },
  ],
  objective:
    'Balance your delicate 3-tier tea & patisserie crate up the sunlit coral canyon from the Harbor Pier to the Cliffside Lighthouse Villa.',
};

function formatTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const tenths = Math.floor((clamped * 10) % 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

async function mount(ctx: GameContext): Promise<GameInstance> {
  const host = createSceneHost({
    container: ctx.container,
    fov: 50,
    near: 0.15,
    far: 700,
    maxPixelRatio: 2,
    exposure: 1.04,
    shadows: true,
  });
  const { scene, camera, renderer } = host;

  // 1. Sun-Baked Mediterranean / Sedona Canyon Atmosphere
  const atmosphere = applyAtmosphere(scene, renderer, 'canyon_sun', {
    skyRadius: 480,
    shadowExtent: 34,
    shadowMapSize: 2048,
    fogDensityMultiplier: 0.42,
    enableShadows: true,
    sunDistance: 80,
  });

  // 2. Build Multi-Surface Canyon Trail, Suspension Bridge & Terraced Red-Rock Cliffs
  const trail = buildCanyonTrail();
  scene.add(trail.group);

  // 3. Build Coastal Oasis Scenery (Turquoise Sea, Forests, Grass, Wildflowers, Cacti, Villa & Lighthouse)
  const scenery = buildCanyonScenery(trail, atmosphere);
  scene.add(scenery.group);

  // 4. Load Rigged 3D Wheelchair Figurine + Attach Ornate Brass & Wood 3-Tier Cargo Stack
  const rig = await createFigurineRig({
    targetHeight: 1.65,
    headlights: false,
    boostGlow: false,
    envMapIntensity: 1.08,
    castShadow: true,
    receiveShadow: true,
  });
  scene.add(rig.root);

  const cargo = createCargoRig();
  rig.rearMount.add(cargo.rackGroup);
  scene.add(cargo.worldSpillsGroup);

  // 5. Atmospheric & Gameplay Particle Systems
  const sunMotes = createParticleSystem({
    type: 'dust',
    count: 220,
    bounds: { width: 58, height: 22, depth: 58 },
    wind: new THREE.Vector3(1.1, 0.18, 0.45),
    size: 0.15,
    colors: ['#fff6d8', '#f8dca2', '#ccf0ed'],
    ambient: true,
    burstCapacity: 80,
  });
  scene.add(sunMotes.group);

  const tireDust = createParticleSystem({
    type: 'smoke',
    count: 0,
    size: 0.34,
    colors: ['#d8915c', '#e6b98a', '#c97848'],
    ambient: false,
    burstCapacity: 150,
  });
  scene.add(tireDust.group);

  const confetti = createParticleSystem({
    type: 'confetti',
    count: 0,
    size: 0.16,
    colors: ['#e85d3f', '#f5b83d', '#30c7c4', '#d63384', '#fff5e4'],
    ambient: false,
    burstCapacity: 260,
  });
  scene.add(confetti.group);

  const saveSparks = createParticleSystem({
    type: 'sparks',
    count: 0,
    size: 0.15,
    colors: ['#ffe27a', '#ffae33', '#38d9cc'],
    ambient: false,
    burstCapacity: 96,
  });
  scene.add(saveSparks.group);

  // 6. Input & Strict Audio Gesture Gate (0 AudioContext warnings on direct deep-link!)
  const input = new InputController({ target: host.canvas, axisSmoothing: 10 });

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
    ctx.audio.setAmbient('ocean', 0.24);
  };

  if (audioUnlocked) {
    ctx.audio.setAmbient('ocean', 0.24);
  } else {
    window.addEventListener('keydown', unlockAudio, { passive: true });
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
  }

  const withAudio = (fn: () => void) => {
    if (audioUnlocked) fn();
  };

  // 7. Game State & Runtime Helpers
  let state: DriveState = createInitialDriveState(trail);
  let paused = false;
  let disposed = false;
  let hudAccum = 0;
  let dustAccum = 0;
  let warnChimeCooldown = 0;
  let scrapeSoundCooldown = 0;
  let statusFlashTimer = 0;
  let statusFlashText = '';
  let lastStability = 1.0;
  let lastWarning = false;
  let lastCooldown = 0;
  let finishOrbitPhase = 0;
  let usedLowGearOnce = false;

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const desiredCamPos = new THREE.Vector3();
  const desiredCamLook = new THREE.Vector3();
  const tmpTirePos = new THREE.Vector3();

  const flashStatus = (text: string, duration = 2.6) => {
    statusFlashText = text;
    statusFlashTimer = duration;
  };

  const snapCameraToPlayer = () => {
    const fwdX = -Math.sin(state.heading);
    const fwdZ = -Math.cos(state.heading);
    camPos.set(
      state.pos.x - fwdX * 6.2,
      state.pos.y + 3.15,
      state.pos.z - fwdZ * 6.2,
    );
    camLook.set(
      state.pos.x + fwdX * 3.0,
      state.pos.y + 1.25,
      state.pos.z + fwdZ * 3.0,
    );
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  };

  const pushHud = (force = false) => {
    if (!force && hudAccum < 0.055) return;
    hudAccum = 0;

    const pieces = cargo.piecesRemaining;
    const totalCheckpoints = trail.checkpoints.length;
    const nextCp =
      state.nextCheckpointIdx < totalCheckpoints
        ? trail.checkpoints[state.nextCheckpointIdx]
        : null;
    const finishS = trail.checkpoints[totalCheckpoints - 1]?.s ?? trail.totalLength;
    const progressNorm = THREE.MathUtils.clamp((state.s - 5) / Math.max(1, finishS - 5), 0, 1);

    const stats: HudStat[] = [
      {
        label: 'Stations',
        value: `${state.completedCheckpoints} / ${totalCheckpoints}`,
      },
      {
        label: 'Cargo',
        value: pieces === 3 ? '3 / 3 ★' : `${pieces} / 3`,
        accent: pieces === 3 && !lastWarning,
      },
      {
        label: 'Score',
        value: state.score.toLocaleString(),
        accent: statusFlashTimer > 0,
      },
      {
        label: 'Time',
        value: formatTime(state.elapsedTime),
      },
    ];

    const stabColor = lastWarning
      ? 'linear-gradient(90deg, #e0412f, #ff8b3d)'
      : state.lowGear
        ? 'linear-gradient(90deg, #219e96, #4fe0cf)'
        : lastStability > 0.55
          ? 'linear-gradient(90deg, #2ba88a, #6dd69d)'
          : 'linear-gradient(90deg, #d9822b, #f5c04a)';

    const stabLabel =
      pieces === 0
        ? 'Crate Empty · Restock at Next Station'
        : lastWarning
          ? '⚠ TIPPING! [SPACE] Counter-Balance'
          : state.lowGear
            ? 'Cargo Stability · LOW GEAR ACTIVE'
            : lastCooldown > 0.05
              ? 'Cargo Stability'
              : 'Cargo Stability · [SPACE] Ready';

    const meters: HudMeter[] = [
      {
        label: stabLabel,
        value: pieces === 0 ? 0 : lastStability,
        color: stabColor,
      },
      {
        label: nextCp
          ? `Ascent · Next: ${nextCp.name}`
          : 'Ascent · Cliffside Lighthouse Villa',
        value: progressNorm,
        color: 'linear-gradient(90deg, #d66d4b, #f2b84b)',
      },
    ];

    let statusText = '';
    if (state.wrongWay) {
      statusText = '⚠ HEADING DOWNHILL — TURN AROUND TOWARD THE LIGHTHOUSE';
    } else if (statusFlashTimer > 0 && statusFlashText) {
      statusText = statusFlashText;
    } else if (state.onBridge) {
      statusText = 'CHASM SUSPENSION BRIDGE · HOLD SHIFT FOR LOW-GEAR STABILIZER';
    } else if (state.surface === 'gravel') {
      statusText = 'ROCKY GRAVEL RUMBLE STRIP · STEADY YOUR TEA STACK';
    } else if (state.lowGear && Math.abs(state.speed) > 0.4) {
      statusText = 'LOW-GEAR HYDRAULIC STABILIZER ENGAGED';
    } else if (!state.runStarted) {
      statusText = 'CORAL CANYON DELIVERY · HARBOR PIER → LIGHTHOUSE VILLA';
    } else if (nextCp) {
      const distMeters = Math.max(0, Math.round(nextCp.s - state.s));
      statusText = `${nextCp.name.toUpperCase()} · ${distMeters}m AHEAD`;
    }

    let promptText = '';
    if (!state.runFinished) {
      if (!state.runStarted) {
        promptText =
          'W/S Smooth Throttle · A/D Steer · Hold SHIFT for Low-Gear Stabilizer · SPACE Counter-Balance';
      } else if (lastWarning) {
        promptText = 'Stack Leaning! Tap SPACE to Counter-Balance or Hold SHIFT to Stabilize';
      } else if ((state.surface === 'gravel' || state.onBridge) && !usedLowGearOnce) {
        promptText = 'Tip: Hold SHIFT on rough gravel & swaying bridges to dampen cargo wobble';
      }
    }

    ctx.setHud({
      stats,
      meters,
      statusText,
      promptText,
      paused,
    });
  };

  const restartRun = () => {
    state = createInitialDriveState(trail);
    cargo.reset();
    scenery.setCheckpointState(0, 0);
    tireDust.clear();
    confetti.clear();
    saveSparks.clear();
    statusFlashTimer = 0;
    statusFlashText = '';
    warnChimeCooldown = 0;
    scrapeSoundCooldown = 0;
    lastStability = 1;
    lastWarning = false;
    lastCooldown = 0;
    finishOrbitPhase = 0;
    paused = false;
    host.setPaused(false);

    // Sync figurine transform & camera immediately
    rig.root.position.copy(state.pos);
    rig.root.rotation.set(0, state.heading, 0);
    rig.update(0.016, { speed: 0, turnRate: 0, tiltX: 0, tiltZ: 0 });
    snapCameraToPlayer();

    ctx.setHud({ result: null, paused: false });
    pushHud(true);
  };

  ctx.setRestartHandler?.(restartRun);

  // Sync initial frame 0 pose cleanly before RAF begins
  rig.root.position.copy(state.pos);
  rig.root.rotation.set(0, state.heading, 0);
  rig.update(0.016, { speed: 0, turnRate: 0, tiltX: 0, tiltZ: 0 });
  snapCameraToPlayer();
  pushHud(true);

  // 8. Main Simulation & Rendering Loop
  host.start((dt, elapsed) => {
    if (disposed) return;

    input.update(dt);

    // Instant R restart
    if (input.wasPressed('r')) {
      withAudio(() => ctx.audio.playClick());
      restartRun();
      input.endFrame();
      return;
    }

    if (statusFlashTimer > 0) statusFlashTimer = Math.max(0, statusFlashTimer - dt);
    if (warnChimeCooldown > 0) warnChimeCooldown = Math.max(0, warnChimeCooldown - dt);
    if (scrapeSoundCooldown > 0) scrapeSoundCooldown = Math.max(0, scrapeSoundCooldown - dt);

    const lowGear = input.boost; // Shift key!
    if (lowGear && state.runStarted) usedLowGearOnce = true;
    const counterTap = input.wasPressed('space');

    // Step suspension bridge wave & sag
    trail.updateBridge(elapsed, state.s, state.speed);

    // Step off-road wheelchair driving physics
    const driveEvents = stepDrivePhysics(state, {
      dt,
      time: elapsed,
      throttle: input.forward,
      steer: input.turn,
      lowGear,
      trail,
    });

    // Step 3-tier rear cargo stack spring-pendulum physics
    const cargoResult = cargo.step({
      dt,
      time: elapsed,
      accel: driveEvents.justStarted ? state.accel * 0.4 : state.accel,
      speed: state.speed,
      turnRate: state.turnRate,
      terrainPitch: state.pitch,
      terrainRoll: state.roll,
      bumpImpulse: driveEvents.bumpImpulse,
      bridgeSwayTorque: driveEvents.bridge.swayTorque,
      lowGearActive: lowGear,
      counterBalancePressed: counterTap,
      scrapeImpulse: driveEvents.scrapeImpulse,
      scene,
      groundYAt: (x, z) => trail.getGroundInfo(x, z, state.heading, elapsed).y,
    });

    lastStability = cargoResult.stability;
    lastWarning = cargoResult.warningActive;
    lastCooldown = cargoResult.counterBalanceCooldown;

    // Handle Counter-Balance Recovery Feedback
    if (cargoResult.counterBalanceTriggered) {
      const topPos = cargo.getWorldStackTop();
      saveSparks.emitBurst(topPos, cargoResult.steadySaveAwarded ? 18 : 8, {
        speed: 2.2,
        upwardBias: 1.2,
        spread: 0.45,
        lifeRange: [0.25, 0.55],
      });
      if (cargoResult.steadySaveAwarded) {
        state.steadySaves += 1;
        state.score += 35;
        flashStatus('STEADY SAVE! +35', 1.5);
        withAudio(() => ctx.audio.playChime(7, 0.35));
      } else {
        withAudio(() => ctx.audio.playChime(2, 0.22));
      }
    }

    // Handle 70%+ Tilt Warning Chime
    if (cargoResult.warningActive && warnChimeCooldown <= 0 && !state.runFinished) {
      warnChimeCooldown = 0.72;
      withAudio(() => ctx.audio.playBell(0.24));
    }

    // Handle Parapet / Cliff Scrape Thud
    if (Math.abs(driveEvents.scrapeImpulse) > 0.25 && scrapeSoundCooldown <= 0) {
      scrapeSoundCooldown = 0.45;
      withAudio(() => ctx.audio.playBump(Math.min(0.75, Math.abs(driveEvents.scrapeImpulse))));
    }

    // Handle Cargo Piece Spilled!
    if (cargoResult.spilledPieceName) {
      state.spillsTotal += 1;
      const rem = cargoResult.piecesRemaining;
      const remNote =
        rem > 0 ? `${rem}/3 pieces left` : 'Restock at next station or press R';
      flashStatus(`SPILL! ${cargoResult.spilledPieceName.toUpperCase()} LOST`, 2.4);
      ctx.notify(`${cargoResult.spilledPieceName} spilled! (${remNote})`, 'warning', 2800);
      withAudio(() => ctx.audio.playBump(0.85));
    }

    // Handle Checkpoint & Final Lighthouse Villa Arrival!
    if (driveEvents.reachedCheckpointIdx >= 0) {
      const cp = trail.checkpoints[driveEvents.reachedCheckpointIdx];
      const bonus = computeCheckpointBonus(cargoResult.piecesRemaining);
      state.score += bonus.points;
      if (bonus.isPristine) state.pristineCount += 1;

      // Celebratory confetti shower at checkpoint!
      confetti.emitBurst(
        new THREE.Vector3(cp.pos.x, cp.pos.y + 2.8, cp.pos.z),
        cp.isFinish ? 140 : 65,
        {
          speed: cp.isFinish ? 7.5 : 5.4,
          upwardBias: 4.5,
          spread: 1.6,
          lifeRange: [1.6, 3.0],
        },
      );

      // Update checkpoint beacon colors & restock full 3-tier tea stack cleanly!
      scenery.setCheckpointState(state.nextCheckpointIdx, state.completedCheckpoints);
      cargo.restockAll();

      if (!cp.isFinish) {
        flashStatus(`${cp.name.toUpperCase()} · ${bonus.label}`, 3.0);
        ctx.notify(
          `${cp.name}: ${bonus.label} · Stack restocked!`,
          bonus.isPristine ? 'success' : 'accent',
          3200,
        );
        withAudio(() => ctx.audio.playCombo(state.completedCheckpoints + 1, 0.42));
      } else {
        // Grand Finale at the Cliffside Lighthouse Villa!
        const paceBonus = Math.max(0, Math.round((130 - state.elapsedTime) * 6));
        state.score += paceBonus;
        const rating = computeFinalRating(state.score, state.pristineCount);
        const isNewBest = ctx.saveBestScore(state.score);

        flashStatus(`DELIVERY COMPLETE! ${rating.stars}`, 5.0);
        ctx.notify(
          `Arrived at Cliffside Lighthouse Villa! ${rating.stars}`,
          'success',
          4200,
        );
        withAudio(() => {
          ctx.audio.stopMotor();
          ctx.audio.playVictory();
        });

        ctx.setHud({
          result: {
            title: `${rating.stars} ${rating.rank}`,
            subtitle: `Delivered to the Cliffside Lighthouse Villa in ${formatTime(state.elapsedTime)}`,
            score: state.score,
            scoreLabel: 'Delivery Score',
            isNewBest,
            victory: true,
            stats: [
              {
                label: 'Pristine Stops',
                value: `${state.pristineCount} / ${trail.checkpoints.length}`,
                accent: state.pristineCount >= 3,
              },
              {
                label: 'Steady Saves',
                value: state.steadySaves,
              },
              {
                label: 'Pace Bonus',
                value: `+${paceBonus}`,
              },
              {
                label: 'Spills',
                value: state.spillsTotal,
              },
            ],
            onRestart: restartRun,
          },
        });
      }
    }

    // Update Wheelchair Figurine Transform & Procedural Suspension/Wheel/Joystick/Head Rig
    rig.root.position.copy(state.pos);
    rig.root.rotation.set(0, state.heading, 0);
    rig.update(dt, {
      speed: state.speed,
      turnRate: state.turnRate,
      groundBump: driveEvents.groundBump,
      boost: false,
      airborne: false,
      tiltX: state.pitch,
      tiltZ: state.roll,
    });

    // Update Wheelchair Motor Sound (strictly gated by user gesture!)
    if (!state.runFinished) {
      const audioSurface =
        state.surface === 'dirt' || state.surface === 'gravel' || state.surface === 'bridge'
          ? 'gravel'
          : 'smooth';
      withAudio(() =>
        ctx.audio.setMotor(Math.abs(state.speed) / 11.6, {
          boost: false,
          drift: false,
          surface: audioSurface,
        }),
      );
    }

    // Emit Ochre Canyon Tire Dust Plumes on Dirt & Gravel!
    if ((state.surface === 'dirt' || state.surface === 'gravel') && Math.abs(state.speed) > 2.2) {
      dustAccum += dt * Math.abs(state.speed);
      if (dustAccum >= 0.9) {
        dustAccum = 0;
        const fwdX = -Math.sin(state.heading);
        const fwdZ = -Math.cos(state.heading);
        const rightX = Math.cos(state.heading);
        const rightZ = -Math.sin(state.heading);
        for (const side of [-0.35, 0.35]) {
          tmpTirePos.set(
            state.pos.x - fwdX * 0.42 + rightX * side,
            state.pos.y + 0.14,
            state.pos.z - fwdZ * 0.42 + rightZ * side,
          );
          tireDust.emitBurst(tmpTirePos, 2, {
            speed: 0.75 + Math.abs(state.speed) * 0.08,
            upwardBias: 0.7,
            spread: 0.35,
            lifeRange: [0.45, 0.85],
            sizeScale: state.surface === 'dirt' ? 1.1 : 0.85,
          });
        }
      }
    }

    // Keep Directional Sun Shadow Frustum Centered on Player!
    atmosphere.sunLight.target.position.copy(state.pos);
    atmosphere.sunLight.position
      .copy(state.pos)
      .addScaledVector(atmosphere.sunDirection, 80);
    atmosphere.sunLight.target.updateMatrixWorld();
    atmosphere.update(elapsed, camera.position);

    // Update Coastal Scenery (Turquoise Sea, Grass Push, Wind, Boats, Lighthouse Beam) & Particles
    scenery.update(elapsed, dt, state.pos);
    sunMotes.update(dt, state.pos);
    tireDust.update(dt);
    confetti.update(dt);
    saveSparks.update(dt);

    // Update Unobstructed Chase Camera (or Celebratory Lighthouse Villa Orbit on Finish)
    if (state.runFinished) {
      finishOrbitPhase += dt * 0.38;
      desiredCamPos.set(
        state.pos.x + Math.cos(finishOrbitPhase) * 8.2,
        state.pos.y + 4.4,
        state.pos.z + Math.sin(finishOrbitPhase) * 8.2,
      );
      desiredCamLook.set(state.pos.x, state.pos.y + 1.4, state.pos.z);
    } else {
      const fwdX = -Math.sin(state.heading);
      const fwdZ = -Math.cos(state.heading);
      const camDist = state.onBridge ? 6.8 : 6.1;
      const slopeLift = Math.max(0, state.pitch) * 4.2;
      const camHeight = (state.onBridge ? 3.45 : 3.05) + slopeLift;

      desiredCamPos.set(
        state.pos.x - fwdX * camDist,
        state.pos.y + camHeight,
        state.pos.z - fwdZ * camDist,
      );
      desiredCamLook.set(
        state.pos.x + fwdX * 3.1,
        state.pos.y + 1.22 + Math.max(0, state.pitch) * 1.1,
        state.pos.z + fwdZ * 3.1,
      );
    }

    const camAlpha = 1 - Math.exp(-7.5 * dt);
    camPos.lerp(desiredCamPos, camAlpha);
    camLook.lerp(desiredCamLook, 1 - Math.exp(-10.0 * dt));
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    hudAccum += dt;
    pushHud(false);

    input.endFrame();
  });

  // 9. Clean Lifecycle & Disposal
  return {
    setPaused(nextPaused: boolean) {
      paused = nextPaused;
      host.setPaused(paused);
      if (paused) {
        withAudio(() => ctx.audio.stopMotor());
      }
      pushHud(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
      ctx.setRestartHandler?.(null);
      if (audioUnlocked) {
        ctx.audio.stopMotor();
        ctx.audio.setAmbient('none');
      }
      input.dispose();
      rig.dispose();
      cargo.dispose();
      trail.dispose();
      scenery.dispose();
      sunMotes.dispose();
      tireDust.dispose();
      confetti.dispose();
      saveSparks.dispose();
      atmosphere.dispose();
      host.dispose();
    },
  };
}

const CoralDeliveryModule: GameModule = {
  meta: META,
  mount,
};

export default CoralDeliveryModule;

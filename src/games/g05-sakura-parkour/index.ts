import * as THREE from 'three';
import {
  applyAtmosphere,
  createParticleSystem,
  updateFoliageWind,
} from '../../art';
import { createFigurineRig } from '../../engine/character';
import { InputController } from '../../engine/input';
import { createSceneHost } from '../../engine/sceneHost';
import type { GameContext, GameInstance, GameMeta, GameModule } from '../../engine/types';
import { buildCourseData } from './courseData';
import {
  createInitialPlayerState,
  findDropShadowSurface,
  stepPlayerPhysics,
} from './physics';
import { buildParkourWorld } from './scenery';

const META: GameMeta = {
  id: 'sakura-parkour',
  number: 5,
  title: 'Sakura Parkour',
  subtitle: 'Twilight Pagoda Rooftops',
  genre: 'Precision Platformer',
  style: 'Sakura Dusk',
  accentColor: '#D4728C',
  controls: [
    { keys: 'WASD / Arrows', action: 'Drive & Air Control' },
    { keys: 'Space', action: 'Spring Hop' },
    { keys: 'Shift', action: 'Air Dash' },
  ],
  objective:
    'Vault between lantern-lit shrine terraces and floating cherry-blossom platforms to reach the summit.',
};

const ISLAND_NAMES: Record<number, string> = {
  1: 'Lantern Courtyard',
  2: 'Blossom Tea Terrace',
  3: 'Crimson Torii Overlook',
  4: 'Wind-Chime Eaves',
  5: 'Zen Bamboo Sanctuary',
  6: 'Cloud-Bridge Promenade',
  7: 'Crimson Bell Terrace',
  8: 'Whispering Sakura Ridge',
  9: 'Sky-Gate Ascent',
  10: 'Golden Sky Pagoda Summit',
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const tenths = Math.floor((sec * 10) % 10);
  return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
}

async function mountSakuraParkour(ctx: GameContext): Promise<GameInstance> {
  const host = createSceneHost({
    container: ctx.container,
    fov: 50,
    near: 0.12,
    far: 900,
    exposure: 1.06,
    shadows: true,
  });

  const { scene, camera, renderer } = host;

  // Golden-pink Japanese spring dusk sky, PMREM reflections & warm rim lighting
  const atmosphere = applyAtmosphere(scene, renderer, 'sakura_dusk', {
    skyRadius: 560,
    shadowExtent: 34,
    shadowMapSize: 2048,
    fogDensityMultiplier: 0.48,
    enableShadows: true,
    sunDistance: 64,
  });

  // Build course & lush handcrafted 3D world
  const course = buildCourseData();
  const world = buildParkourWorld(course);
  scene.add(world.worldGroup);

  // Load our rigged Wheelchair Figurine with golden boost thruster glow & warm dusk headlights
  const figurine = await createFigurineRig({
    targetHeight: 1.65,
    boostGlow: true,
    headlights: true,
    envMapIntensity: 1.12,
    castShadow: true,
    receiveShadow: true,
  });
  figurine.setHeadlightIntensity(1.05);
  scene.add(figurine.root);

  // Swirling cherry-blossom petals, golden thruster sparks & summit firework confetti
  const petals = createParticleSystem({
    type: 'petals',
    count: 340,
    bounds: { width: 46, height: 24, depth: 46 },
    center: new THREE.Vector3(0, 6, 0),
    wind: new THREE.Vector3(2.3, -0.32, 0.75),
    size: 0.145,
    burstCapacity: 240,
  });
  scene.add(petals.group);

  const sparks = createParticleSystem({
    type: 'sparks',
    ambient: false,
    count: 0,
    size: 0.17,
    colors: [0xffe596, 0xffa64d, 0x5ef7e4, 0xff94b8],
    burstCapacity: 260,
  });
  scene.add(sparks.group);

  const confetti = createParticleSystem({
    type: 'confetti',
    ambient: false,
    count: 0,
    size: 0.17,
    colors: [0xffb7c5, 0xffe07d, 0xff6e9c, 0x4af2df, 0xfff5fa],
    burstCapacity: 280,
  });
  scene.add(confetti.group);

  const input = new InputController({
    target: host.canvas,
    preventScrollKeys: true,
    axisSmoothing: 14,
  });

  // Ambient spring rooftop breeze
  ctx.audio.setAmbient('wind', 0.24);

  // ===========================================================================
  // Game State & Reset Logic
  // ===========================================================================
  let player = createInitialPlayerState(course);
  let activeCheckpointIdx = 0;
  let runTime = 0;
  let score = 0;
  let cranesCollected = 0;
  let bonusCranesCollected = 0;
  let stuntsLanded = 0;
  let flowChain = 0;
  let flowTimer = 0;
  let fallCount = 0;
  let finished = false;
  let paused = false;
  let disposed = false;
  let victoryTimer = 0;
  let fireworkWave = 0;
  let sparkEmitAccum = 0;
  let calloutText = '';
  let calloutTimer = 0;
  let hudAccum = 0;

  // Smooth spring-damped third-person camera state
  const camPos = new THREE.Vector3(
    course.startSpawn.x,
    course.startSpawn.y + 3.4,
    course.startSpawn.z + 7.2,
  );
  const camLookAt = new THREE.Vector3(
    course.startSpawn.x,
    course.startSpawn.y + 1.5,
    course.startSpawn.z - 5.5,
  );
  let camYaw = course.startSpawn.yaw;
  let camAirBias = 0;

  // Reusable scratch vectors to keep GC zero during gameplay
  const tmpVec = new THREE.Vector3();
  const tmpTargetPos = new THREE.Vector3();
  const tmpLookTarget = new THREE.Vector3();
  const rearWorldPos = new THREE.Vector3();
  const playerWorldPos = new THREE.Vector3();

  const triggerCallout = (text: string, duration = 2.0) => {
    calloutText = text;
    calloutTimer = duration;
  };

  const resetGame = (silent = false) => {
    player = createInitialPlayerState(course);
    activeCheckpointIdx = 0;
    runTime = 0;
    score = 0;
    cranesCollected = 0;
    bonusCranesCollected = 0;
    stuntsLanded = 0;
    flowChain = 0;
    flowTimer = 0;
    fallCount = 0;
    finished = false;
    victoryTimer = 0;
    fireworkWave = 0;
    calloutText = '';
    calloutTimer = 0;

    // Reset checkpoints
    for (const cp of world.checkpoints) {
      cp.activated = cp.def.index === 0;
      cp.pulseTimer = 0;
      cp.plaqueMat.emissiveIntensity = cp.activated ? 1.85 : 0.18;
      if (cp.beaconLight) {
        cp.beaconLight.intensity = cp.activated ? 2.4 : 0.6;
      }
    }

    // Reset cranes
    for (const cr of world.cranes) {
      cr.collected = false;
      cr.collectAnim = 0;
      cr.group.visible = true;
      cr.group.position.set(cr.def.x, cr.def.y, cr.def.z);
      cr.group.scale.setScalar(cr.def.bonus ? 1.24 : 1.06);
    }

    // Reset spring pads
    for (const sp of world.springPads) {
      sp.recoil = 0;
      sp.cooldown = 0;
    }

    // Snap figurine & camera cleanly to start courtyard vista
    figurine.root.position.set(player.x, player.y, player.z);
    figurine.root.rotation.set(0, player.yaw, 0);
    camYaw = player.yaw;
    camAirBias = 0;
    camPos.set(player.x, player.y + 3.4, player.z + 7.2);
    camLookAt.set(player.x, player.y + 1.5, player.z - 5.5);
    camera.position.copy(camPos);
    camera.lookAt(camLookAt);
    camera.fov = 50;
    camera.updateProjectionMatrix();

    pushHud(true);
    if (!silent) {
      ctx.notify('Course reset — soar to the Golden Sky Pagoda!', 'accent', 2200);
    }
  };

  const pushHud = (force = false) => {
    if (!force && finished) return;
    const islandName = ISLAND_NAMES[player.currentIsland] ?? 'Sky Rooftops';
    const statusText =
      calloutTimer > 0 && calloutText
        ? calloutText
        : `Island ${player.currentIsland} / 10 · ${islandName}`;

    const promptText = finished
      ? 'Press R or Restart to run the skyline again · ESC for Hub'
      : !player.grounded && player.airDashAvailable
        ? 'Mid-Air! Tap Shift for Aero-Dash · WASD to Steer Landing'
        : 'WASD Drive · Space Hydraulic Hop · Shift Aero-Boost / Air Dash · R Checkpoint';

    const boostColor =
      !player.grounded && player.airDashAvailable
        ? '#4af2df'
        : player.isGroundBoosting || player.airDashTimer > 0
          ? '#ffd166'
          : '#e87ca0';

    ctx.setHud({
      stats: [
        { label: 'Rooftop', value: `${player.currentIsland} / 10` },
        { label: 'Cranes', value: `${cranesCollected} / ${course.cranes.length}` },
        {
          label: 'Flow',
          value: flowChain > 0 ? `×${Math.min(5, flowChain)}` : '—',
          accent: flowChain >= 2,
        },
        { label: 'Score', value: score.toLocaleString(), accent: true },
        { label: 'Time', value: formatTime(runTime) },
      ],
      meters: [
        {
          label: !player.grounded && player.airDashAvailable ? 'Aero-Dash Ready' : 'Aero Boost',
          value: player.boostEnergy,
          max: 100,
          color: boostColor,
        },
      ],
      statusText,
      promptText,
      paused,
      result: null,
    });
  };

  const triggerSummitVictory = () => {
    if (finished) return;
    finished = true;
    victoryTimer = 0;
    fireworkWave = 0;
    ctx.audio.stopMotor();
    ctx.audio.playVictory();

    const summitBase = 1500;
    const speedBonus = Math.max(0, Math.round((165 - runTime) * 20));
    const allCranesBonus = cranesCollected === course.cranes.length ? 1200 : 0;
    const flawlessBonus = fallCount === 0 ? 500 : 0;
    score += summitBase + speedBonus + allCranesBonus + flawlessBonus;

    const isNewBest = ctx.saveBestScore(score);
    const totalCranes = course.cranes.length;

    // Immediate celebratory cherry-blossom firework eruption!
    const apex = new THREE.Vector3(course.summitGoal.x, course.summitGoal.y + 4.5, course.summitGoal.z - 2.5);
    confetti.emitBurst(apex, 110, { speed: 12.5, upwardBias: 7.5, spread: 1.0, lifeRange: [2.2, 4.0], sizeScale: 1.35 });
    petals.emitBurst(apex, 90, { speed: 9.5, upwardBias: 5.5, spread: 1.1, lifeRange: [2.6, 4.6], sizeScale: 1.4 });
    sparks.emitBurst(apex, 80, { speed: 13.0, upwardBias: 6.5, spread: 1.0, lifeRange: [0.9, 1.8], sizeScale: 1.4 });

    ctx.notify(
      isNewBest ? 'Summit Reached — New Best Score!' : 'Golden Sky Pagoda Summit Reached!',
      'success',
      3800,
    );

    ctx.setHud({
      stats: [
        { label: 'Rooftop', value: '10 / 10' },
        { label: 'Cranes', value: `${cranesCollected} / ${totalCranes}`, accent: cranesCollected === totalCranes },
        { label: 'Stunts', value: stuntsLanded },
        { label: 'Time', value: formatTime(runTime) },
      ],
      meters: [],
      statusText: 'Golden Sky Pagoda Summit Reached!',
      promptText: '',
      paused: false,
      result: {
        title: 'Golden Sky Pagoda Summit!',
        subtitle:
          cranesCollected === totalCranes
            ? 'Master of the Sakura Skyline — every Origami Crane gathered!'
            : `Completed in ${formatTime(runTime)} with ${cranesCollected}/${totalCranes} Golden Cranes.`,
        score,
        scoreLabel: 'Parkour Score',
        isNewBest,
        victory: true,
        stats: [
          { label: 'Summit Time', value: formatTime(runTime), accent: true },
          { label: 'Origami Cranes', value: `${cranesCollected} / ${totalCranes}` },
          { label: 'Bonus Cranes', value: `${bonusCranesCollected} / 5` },
          { label: 'Aerial Stunts', value: stuntsLanded },
          { label: 'Speed Bonus', value: `+${speedBonus.toLocaleString()}` },
          ...(flawlessBonus > 0 ? [{ label: 'Cloudless Run', value: '+500', accent: true }] : []),
        ],
        onRestart: () => resetGame(false),
      },
    });
  };

  ctx.setRestartHandler?.(() => resetGame(false));

  // Position initial start state cleanly before frame 1
  resetGame(true);

  // ===========================================================================
  // Main Frame Loop
  // ===========================================================================
  host.start((dt, elapsed) => {
    if (disposed) return;

    input.update(dt);

    // Quick restart / checkpoint key (R)
    if (input.wasPressed('r')) {
      if (finished) {
        ctx.audio.playClick();
        resetGame(false);
      } else {
        const cp = course.checkpoints[activeCheckpointIdx];
        player.x = cp.spawnX;
        player.y = cp.spawnY + 0.18;
        player.z = cp.spawnZ;
        player.yaw = cp.spawnYaw;
        player.vx = 0;
        player.vy = 0;
        player.vz = 0;
        player.grounded = true;
        player.airDashAvailable = true;
        player.boostEnergy = 100;
        player.respawnTimer = 0;
        ctx.audio.playClick();
        triggerCallout(`Returned to ${cp.name}`, 1.6);
      }
    }

    if (!finished) {
      runTime += dt;
      if (calloutTimer > 0) calloutTimer = Math.max(0, calloutTimer - dt);
      if (flowTimer > 0) {
        flowTimer -= dt;
        if (flowTimer <= 0) {
          flowChain = 0;
        }
      }

      const activeCp = course.checkpoints[activeCheckpointIdx];

      stepPlayerPhysics(
        player,
        {
          forward: input.forward,
          turn: input.turn,
          jumpDown: input.isDown('space'),
          jumpPressed: input.wasPressed('space'),
          boostDown: input.isDown('shift'),
          boostPressed: input.wasPressed('shift'),
        },
        dt,
        course.surfaces,
        world.springPads,
        world.solidCylinders,
        activeCp,
        {
          onJump(superRamp) {
            ctx.audio.playJump(superRamp ? 0.95 : 0.72);
            tmpVec.set(player.x, player.y + 0.25, player.z);
            petals.emitBurst(tmpVec, superRamp ? 18 : 10, {
              speed: 4.5,
              upwardBias: 2.2,
              lifeRange: [0.9, 1.8],
            });
            if (superRamp) {
              sparks.emitBurst(tmpVec, 20, {
                speed: 7.5,
                upwardBias: 3.5,
                lifeRange: [0.4, 0.8],
                color: 0xffd26e,
              });
              triggerCallout('Super Ramp Launch!', 1.5);
            }
          },
          onRampLaunch(launchSpeed) {
            ctx.audio.playBoost(0.75);
            tmpVec.set(player.x, player.y + 0.3, player.z);
            sparks.emitBurst(tmpVec, 22, {
              speed: 8.0,
              upwardBias: 3.2,
              lifeRange: [0.45, 0.85],
              color: 0xffbe5c,
            });
            petals.emitBurst(tmpVec, 16, { speed: 6.0, upwardBias: 2.5, lifeRange: [1.0, 2.0] });
            if (launchSpeed > 15) {
              triggerCallout('Skyline Ramp Launch!', 1.4);
            }
          },
          onAirDash() {
            ctx.audio.playBoost(0.95);
            flowTimer = Math.max(flowTimer, 4.5);
            figurine.rearMount.getWorldPosition(rearWorldPos);
            sparks.emitBurst(rearWorldPos, 28, {
              speed: 9.2,
              upwardBias: 1.5,
              lifeRange: [0.35, 0.75],
              color: 0x5ef7e4,
            });
            petals.emitBurst(rearWorldPos, 18, {
              speed: 6.5,
              upwardBias: 1.5,
              lifeRange: [1.0, 2.0],
            });
            triggerCallout('Aero-Dash!', 1.2);
          },
          onSpringLaunch(pad) {
            ctx.audio.playJump(1.0);
            ctx.audio.playChime(5, 0.55);
            tmpVec.set(pad.def.x, pad.def.y + 0.45, pad.def.z);
            sparks.emitBurst(tmpVec, 34, {
              speed: 9.8,
              upwardBias: 6.5,
              lifeRange: [0.45, 0.95],
              color: 0x4af2df,
            });
            petals.emitBurst(tmpVec, 22, {
              speed: 6.5,
              upwardBias: 5.0,
              lifeRange: [1.2, 2.2],
            });
            triggerCallout('Spring Sky-Vault!', 1.5);
          },
          onLand(airTime, launchKind, impactVy) {
            if (impactVy > 5.5) {
              ctx.audio.playBump(Math.min(0.6, impactVy * 0.03));
            }
            tmpVec.set(player.x, player.y + 0.15, player.z);
            petals.emitBurst(tmpVec, 12, { speed: 3.6, upwardBias: 1.4, lifeRange: [0.8, 1.6] });

            // Award clean stunt flow bonus for ramp jumps & spring vaults!
            if (airTime >= 0.58 && (launchKind === 'ramp' || launchKind === 'spring')) {
              stuntsLanded++;
              flowChain = Math.min(5, flowChain + 1);
              flowTimer = 6.5;
              const basePts = launchKind === 'spring' ? 180 : 220;
              const airBonus = Math.round(airTime * 90);
              const pts = (basePts + airBonus) * Math.max(1, flowChain);
              score += pts;
              ctx.audio.playCombo(flowChain, 0.7);
              sparks.emitBurst(tmpVec, 18, {
                speed: 6.2,
                upwardBias: 2.6,
                lifeRange: [0.35, 0.75],
                color: 0xffe078,
              });
              const label = launchKind === 'spring' ? 'Clean Sky-Vault' : 'Clean Ramp Stunt';
              triggerCallout(`${label}! +${pts} (×${flowChain})`, 1.9);
            }
          },
          onFallIntoClouds() {
            fallCount++;
            flowChain = 0;
            flowTimer = 0;
            ctx.audio.playSplash(0.55);
            tmpVec.set(player.x, player.y + 0.5, player.z);
            petals.emitBurst(tmpVec, 32, {
              speed: 5.5,
              upwardBias: 3.5,
              lifeRange: [1.0, 2.0],
              sizeScale: 1.4,
            });
            triggerCallout('Soft Cloud Catch — Respawning...', 1.1);
          },
          onRespawnComplete() {
            ctx.audio.playChime(0, 0.5);
            tmpVec.set(player.x, player.y + 0.6, player.z);
            petals.emitBurst(tmpVec, 24, {
              speed: 4.5,
              upwardBias: 2.8,
              lifeRange: [1.0, 1.9],
            });
          },
        },
      );

      // Update continuous electric wheelchair motor audio
      const speedNorm = Math.min(1, Math.abs(player.forwardSpeed) / 16.5);
      const isBoosting = player.isGroundBoosting || player.airDashTimer > 0;
      ctx.audio.setMotor(player.grounded ? speedNorm : speedNorm * 0.35, {
        boost: isBoosting,
        surface: 'smooth',
      });

      // Emit golden boost trail sparks when ground boosting or air dashing
      if (isBoosting) {
        sparkEmitAccum += dt * 42;
        while (sparkEmitAccum >= 1) {
          sparkEmitAccum -= 1;
          figurine.rearMount.getWorldPosition(rearWorldPos);
          sparks.emitBurst(rearWorldPos, 2, {
            speed: 3.2,
            upwardBias: 0.7,
            spread: 0.45,
            lifeRange: [0.22, 0.48],
            sizeScale: 0.9,
            color: player.airDashTimer > 0 ? 0x5ef7e4 : 0xffbe5c,
          });
        }
      } else {
        sparkEmitAccum = 0;
      }

      // Check Checkpoint Torii Arch activations
      for (const cp of world.checkpoints) {
        if (cp.activated) continue;
        const dXZ = Math.hypot(player.x - cp.def.x, player.z - cp.def.z);
        const dY = Math.abs(player.y - cp.def.y);
        if (dXZ <= cp.def.triggerRadius && dY < 4.5) {
          cp.activated = true;
          cp.pulseTimer = 1.8;
          if (cp.def.index > activeCheckpointIdx) {
            activeCheckpointIdx = cp.def.index;
          }
          score += 250;
          ctx.audio.playBell(0.85);
          tmpVec.set(cp.def.x, cp.def.y + 3.2, cp.def.z);
          petals.emitBurst(tmpVec, 42, {
            speed: 7.2,
            upwardBias: 3.0,
            lifeRange: [1.6, 3.0],
            sizeScale: 1.25,
          });
          sparks.emitBurst(tmpVec, 30, {
            speed: 8.5,
            upwardBias: 3.2,
            lifeRange: [0.5, 1.1],
            color: 0xffd778,
          });
          triggerCallout(`Checkpoint · ${cp.def.name} (+250)`, 2.2);
          ctx.notify(`Checkpoint reached: ${cp.def.name}`, 'accent', 2200);
        }
      }

      // Check Collectible Golden Origami Crane pickups
      for (const cr of world.cranes) {
        if (cr.collected) continue;
        const dx = player.x - cr.def.x;
        const dy = player.y + 0.9 - cr.def.y;
        const dz = player.z - cr.def.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq <= 2.35 * 2.35) {
          cr.collected = true;
          cr.collectAnim = 0.001;
          cranesCollected++;
          if (cr.def.bonus) bonusCranesCollected++;
          flowChain = Math.min(5, flowChain + 1);
          flowTimer = 6.5;
          player.boostEnergy = Math.min(100, player.boostEnergy + 28);
          const base = cr.def.bonus ? 300 : 150;
          const pts = base * Math.max(1, flowChain);
          score += pts;

          ctx.audio.playCombo(flowChain, 0.82);
          tmpVec.set(cr.def.x, cr.def.y, cr.def.z);
          sparks.emitBurst(tmpVec, 26, {
            speed: 7.4,
            upwardBias: 2.8,
            lifeRange: [0.45, 0.95],
            color: cr.def.bonus ? 0xff7eb6 : 0xffe078,
          });
          petals.emitBurst(tmpVec, 14, {
            speed: 5.0,
            upwardBias: 2.0,
            lifeRange: [1.0, 2.1],
          });
          if (cr.def.bonus) {
            triggerCallout(`Secret Origami Crane! +${pts}`, 2.0);
          } else if (flowChain >= 3) {
            triggerCallout(`Crane Flow ×${flowChain}! +${pts}`, 1.4);
          }
        }
      }

      // Check Summit Shrine Medallion goal on Island 10!
      const g = course.summitGoal;
      const distGoalXZ = Math.hypot(player.x - g.x, player.z - g.z);
      if (distGoalXZ <= g.radius + 0.65 && Math.abs(player.y - g.y) < 3.2) {
        triggerSummitVictory();
      }
    } else {
      // Summit celebration firework waves!
      victoryTimer += dt;
      const nextWave = Math.floor(victoryTimer / 1.35);
      if (nextWave > fireworkWave && fireworkWave < 6) {
        fireworkWave = nextWave;
        const angle = fireworkWave * 1.4;
        const burstPos = new THREE.Vector3(
          course.summitGoal.x + Math.cos(angle) * 6.5,
          course.summitGoal.y + 6.5 + (fireworkWave % 3) * 2.2,
          course.summitGoal.z - 4.5 + Math.sin(angle) * 3.5,
        );
        confetti.emitBurst(burstPos, 55, {
          speed: 10.5,
          upwardBias: 5.5,
          spread: 1.0,
          lifeRange: [2.0, 3.6],
          sizeScale: 1.25,
        });
        petals.emitBurst(burstPos, 45, {
          speed: 7.5,
          upwardBias: 4.0,
          spread: 1.0,
          lifeRange: [2.4, 4.2],
          sizeScale: 1.3,
        });
        sparks.emitBurst(burstPos, 42, {
          speed: 11.0,
          upwardBias: 5.0,
          lifeRange: [0.7, 1.4],
          sizeScale: 1.3,
        });
        ctx.audio.playChime(fireworkWave * 2, 0.45);
      }

      // Gently coast chair to a proud pose at the shrine center
      player.vx *= Math.exp(-5 * dt);
      player.vz *= Math.exp(-5 * dt);
      player.forwardSpeed *= Math.exp(-5 * dt);
      player.turnRate = 0;
    }

    // =========================================================================
    // Update Figurine Rig Pose & Procedural Wheelchair Suspension/Wheels/Face
    // =========================================================================
    figurine.root.position.set(player.x, player.y, player.z);
    figurine.root.rotation.set(0, player.yaw, 0);
    figurine.update(dt, {
      speed: player.forwardSpeed,
      turnRate: player.turnRate,
      groundBump: player.groundBump,
      boost: player.isGroundBoosting || player.airDashTimer > 0,
      airborne: !player.grounded,
      tiltX: player.surfacePitch,
      tiltZ: player.surfaceRoll,
    });

    // =========================================================================
    // Update Pinpoint Drop-Shadow & Landing Precision Ring Indicator
    // =========================================================================
    const shadowHit = findDropShadowSurface(player.x, player.y, player.z, course.surfaces);
    if (shadowHit && player.respawnTimer <= 0) {
      world.landingIndicator.group.visible = true;
      world.landingIndicator.group.position.set(player.x, shadowHit.y, player.z);
      const h = shadowHit.heightAbove;
      const scale = THREE.MathUtils.clamp(1.0 + h * 0.04, 0.9, 1.45);
      world.landingIndicator.group.scale.setScalar(scale);
      world.landingIndicator.shadowMat.opacity = THREE.MathUtils.clamp(0.75 - h * 0.055, 0.22, 0.78);

      // Show crisp pink-gold target ring when jumping so landing alignment is crystal clear!
      const ringAlpha = !player.grounded
        ? THREE.MathUtils.clamp(0.88 - h * 0.045, 0.25, 0.88)
        : 0;
      world.landingIndicator.ringMat.opacity = ringAlpha;
      world.landingIndicator.ringMesh.rotation.z = elapsed * 2.1;
    } else {
      world.landingIndicator.group.visible = false;
    }

    // =========================================================================
    // Animate Living World: Flora Wind, Cranes, Spring Pads, Lanterns, Clouds
    // =========================================================================
    updateFoliageWind(elapsed, 1.15);
    playerWorldPos.set(player.x, player.y + 0.35, player.z);

    for (const grass of world.grassFields) {
      grass.update(elapsed, playerWorldPos);
    }

    // Golden Origami Cranes gently bob, flap wings & spin
    for (const cr of world.cranes) {
      if (cr.collected) {
        if (cr.collectAnim > 0 && cr.collectAnim < 1) {
          cr.collectAnim += dt * 4.2;
          const t = Math.min(1, cr.collectAnim);
          cr.group.position.y = cr.def.y + t * 1.4;
          cr.group.rotation.y += dt * 14;
          cr.group.scale.setScalar((1 - t) * 1.25);
          if (t >= 1) cr.group.visible = false;
        }
        continue;
      }
      const bob = Math.sin(elapsed * 2.6 + cr.phase) * 0.22;
      cr.group.position.y = cr.def.y + bob;
      cr.group.rotation.y = elapsed * 1.45 + cr.phase;
      const flap = Math.sin(elapsed * 5.2 + cr.phase) * 0.32;
      cr.leftWing.rotation.z = 0.2 + flap;
      cr.rightWing.rotation.z = -0.2 - flap;
      cr.haloMesh.rotation.z = -elapsed * 1.6 + cr.phase;
    }

    // Spring Jump Pads pulse & spring-recoil smoothly
    for (const sp of world.springPads) {
      if (sp.recoil > 0) {
        sp.recoil = Math.max(0, sp.recoil - dt * 3.4);
      }
      const pulse = Math.sin(elapsed * 3.8 + sp.def.z * 0.1) * 0.12;
      sp.ringMesh.position.y = 0.52 + pulse + sp.recoil * 0.55;
      sp.ringMesh.scale.setScalar(1 + sp.recoil * 0.28 + pulse * 0.18);
      sp.coreMesh.position.y = 0.16 + sp.recoil * 0.26;
    }

    // Checkpoint Torii plaques & sacred shide streamers flutter in breeze
    for (const cp of world.checkpoints) {
      if (cp.pulseTimer > 0) {
        cp.pulseTimer = Math.max(0, cp.pulseTimer - dt);
        const flash = Math.sin(cp.pulseTimer * 10) * 0.5 + 0.5;
        cp.plaqueMat.emissiveIntensity = 1.9 + flash * 1.8;
        if (cp.beaconLight) cp.beaconLight.intensity = 2.6 + flash * 2.5;
      } else if (cp.activated) {
        cp.plaqueMat.emissiveIntensity = 1.7 + Math.sin(elapsed * 2.5) * 0.25;
        if (cp.beaconLight) cp.beaconLight.intensity = 2.4;
      }
      for (let i = 0; i < cp.streamers.length; i++) {
        cp.streamers[i].rotation.x = Math.sin(elapsed * 3.1 + i * 0.8 + cp.def.index) * 0.28;
        cp.streamers[i].rotation.z = Math.cos(elapsed * 2.3 + i * 1.1) * 0.12;
      }
    }

    // Glowing ramp launch chevrons animate sequentially upward
    for (const mat of world.chevronMaterials) {
      const phase = (mat.userData.chevronPhase as number) ?? 0;
      const wave = 0.5 + 0.5 * Math.sin(elapsed * 6.0 - phase);
      mat.emissiveIntensity = 1.1 + wave * 2.1;
    }

    // Hanging pergola & courtyard paper lanterns sway softly
    for (const lan of world.swayingLanterns) {
      lan.pivot.rotation.z = Math.sin(elapsed * lan.speed + lan.phase) * 0.11;
      lan.pivot.rotation.x = Math.cos(elapsed * lan.speed * 0.78 + lan.phase) * 0.07;
    }

    // Festival nobori banners wave gently
    for (const b of world.wavingBanners) {
      b.mesh.rotation.y = Math.sin(elapsed * 2.8 + b.phase) * 0.18;
    }

    // Temple bell sways subtly on Island 7
    if (world.templeBell) {
      world.templeBell.rotation.z = Math.sin(elapsed * 1.1) * 0.04;
    }

    // Golden Summit Shrine Medallion spins & pulses warmly
    world.summitMedallion.ringOuter.rotation.z = elapsed * 0.9;
    world.summitMedallion.ringOuter.position.y = 0.55 + Math.sin(elapsed * 2.2) * 0.12;
    world.summitMedallion.ringInner.rotation.z = -elapsed * 1.4;
    world.summitMedallion.ringInner.position.y = 1.05 + Math.cos(elapsed * 2.6) * 0.16;
    world.summitMedallion.pillarBeam.rotation.y = elapsed * 0.35;
    world.summitMedallion.light.intensity = 3.4 + Math.sin(elapsed * 3.0) * 0.5;

    // Drifting sunlit pink-gold cloud sea & 3D cumulus puffs
    world.cloudSeaUniforms.uTime.value = elapsed;
    for (const puff of world.cloudPuffs) {
      puff.mesh.position.x = puff.baseX + Math.sin(elapsed * 0.12 * puff.speed + puff.bobPhase) * 4.5;
      puff.mesh.position.y = puff.baseY + Math.cos(elapsed * 0.35 + puff.bobPhase) * 0.65;
    }

    // =========================================================================
    // Smooth Spring-Damped Third-Person Camera + Dynamic Shadow Tracking
    // =========================================================================
    if (!finished) {
      // Shortest-angle yaw follow so camera tracks gracefully behind wheelchair
      const yawDiff = Math.atan2(Math.sin(player.yaw - camYaw), Math.cos(player.yaw - camYaw));
      camYaw += yawDiff * (1 - Math.exp(-5.5 * dt));

      // Automatic downward pitch hint when airborne so landing roofs are clearly visible!
      const targetAirBias = !player.grounded ? 1 : 0;
      camAirBias += (targetAirBias - camAirBias) * (1 - Math.exp(-5.0 * dt));

      const camFwdX = -Math.sin(camYaw);
      const camFwdZ = -Math.cos(camYaw);
      let dist = 6.35 + camAirBias * 0.65 + (player.isGroundBoosting ? 0.5 : 0);
      let height = 3.55 + camAirBias * 1.1;

      tmpTargetPos.set(
        player.x - camFwdX * dist,
        player.y + height,
        player.z - camFwdZ * dist,
      );

      // Canopy occlusion avoidance: if the chase camera or camera-to-figurine sightline
      // clips into any rooftop sakura tree canopy, smoothly tighten & tuck under/forward so
      // the figurine remains 100% unobstructed!
      const anchorX = player.x;
      const anchorY = player.y + 1.35;
      const anchorZ = player.z;
      const rayX = tmpTargetPos.x - anchorX;
      const rayY = tmpTargetPos.y - anchorY;
      const rayZ = tmpTargetPos.z - anchorZ;
      const rayLenSq = rayX * rayX + rayY * rayY + rayZ * rayZ;

      if (rayLenSq > 1e-4) {
        let safeT = 1.0;
        for (const sph of world.canopySpheres) {
          const sx = sph.x - anchorX;
          const sy = sph.y - anchorY;
          const sz = sph.z - anchorZ;
          // Project sphere center onto camera sightline [0, 1]
          const proj = THREE.MathUtils.clamp((sx * rayX + sy * rayY + sz * rayZ) / rayLenSq, 0.2, 1.0);
          const closestX = anchorX + rayX * proj;
          const closestY = anchorY + rayY * proj;
          const closestZ = anchorZ + rayZ * proj;
          const distToCanopy = Math.hypot(closestX - sph.x, closestY - sph.y, closestZ - sph.z);
          const padRadius = sph.radius + 0.65;
          if (distToCanopy < padRadius) {
            // Pull camera forward in front of the canopy edge (minimum 3.1m from chair)
            const pull = Math.max(0.48, proj - (padRadius - distToCanopy) / Math.sqrt(rayLenSq));
            if (pull < safeT) safeT = pull;
          }
        }
        if (safeT < 0.999) {
          dist *= safeT;
          height = THREE.MathUtils.lerp(2.25, height, safeT);
          tmpTargetPos.set(
            player.x - camFwdX * dist,
            player.y + height,
            player.z - camFwdZ * dist,
          );
        }
      }

      tmpLookTarget.set(
        player.x + camFwdX * (5.2 - camAirBias * 1.4),
        player.y + 1.4 - camAirBias * 1.1,
        player.z + camFwdZ * (5.2 - camAirBias * 1.4),
      );

      const posAlpha = 1 - Math.exp(-8.5 * dt);
      const lookAlpha = 1 - Math.exp(-10.5 * dt);
      camPos.lerp(tmpTargetPos, posAlpha);
      camLookAt.lerp(tmpLookTarget, lookAlpha);

      // Subtle dynamic FOV rush on Aero-Boost / Air Dash
      const targetFov = player.isGroundBoosting || player.airDashTimer > 0 ? 57.5 : 50;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-7.5 * dt));
        camera.updateProjectionMatrix();
      }
    } else {
      // Heroic victory camera orbiting around the wheelchair & Golden Sky Pagoda!
      const orbitAngle = Math.sin(victoryTimer * 0.35) * 0.65;
      tmpTargetPos.set(
        course.summitGoal.x + Math.sin(orbitAngle) * 8.6,
        course.summitGoal.y + 3.4,
        course.summitGoal.z + Math.cos(orbitAngle) * 8.6,
      );
      tmpLookTarget.set(
        course.summitGoal.x,
        course.summitGoal.y + 3.2,
        course.summitGoal.z - 5.2,
      );
      camPos.lerp(tmpTargetPos, 1 - Math.exp(-2.8 * dt));
      camLookAt.lerp(tmpLookTarget, 1 - Math.exp(-3.2 * dt));
    }

    camera.position.copy(camPos);
    camera.lookAt(camLookAt);

    // Keep sky dome centered on camera & high-res PCFSoftShadowMap centered on player!
    atmosphere.update(elapsed, camera.position);
    atmosphere.sunLight.target.position.set(player.x, player.y, player.z);
    atmosphere.sunLight.position
      .set(player.x, player.y, player.z)
      .addScaledVector(atmosphere.sunDirection, 56);
    atmosphere.sunLight.target.updateMatrixWorld();

    // Advance swirling petal stream, golden sparks & firework confetti
    tmpVec.set(player.x, player.y + 5.0, player.z - 5.0);
    petals.update(dt, tmpVec);
    sparks.update(dt);
    confetti.update(dt);

    // Throttled crisp HUD refresh (~14 Hz)
    hudAccum += dt;
    if (hudAccum >= 0.07) {
      hudAccum = 0;
      pushHud(false);
    }

    input.endFrame();
  });

  return {
    setPaused(nextPaused: boolean) {
      paused = nextPaused;
      host.setPaused(paused);
      if (paused) {
        ctx.audio.stopMotor();
      }
      pushHud(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ctx.setRestartHandler?.(null);
      ctx.audio.stopMotor();
      ctx.audio.setAmbient('none');
      input.dispose();
      petals.dispose();
      sparks.dispose();
      confetti.dispose();
      world.dispose();
      figurine.dispose();
      atmosphere.dispose();
      host.dispose();
    },
  };
}

const sakuraParkourModule: GameModule = {
  meta: META,
  mount: mountSakuraParkour,
};

export default sakuraParkourModule;

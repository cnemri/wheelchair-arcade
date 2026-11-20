import * as THREE from 'three';
import { applyAtmosphere } from '../../art';
import { createFigurineRig } from '../../engine/character';
import { InputController } from '../../engine/input';
import { createSceneHost } from '../../engine/sceneHost';
import type { GameContext, GameInstance, GameModule, HudStat } from '../../engine/types';
import { createInterceptorBoss } from './boss';
import {
  BASE_SPEED,
  BEAT_INTERVAL,
  BOSS_PHASES,
  COLORS,
  EMP_DURATION,
  GATE_EMP_GAIN,
  GRAVITY,
  INITIAL_EMP_CHARGE,
  INVULN_AFTER_HIT,
  JUMP_VELOCITY,
  LANE_COUNT,
  MAX_SHIELDS,
  META,
  OVERDRIVE_SPEED_BONUS,
  PLAYER_Z,
  PRISM_EMP_GAIN,
  RAIL_EMP_PER_SEC,
  RAIL_GRIND_SPEED_BONUS,
  RAIL_HEIGHT,
  RUN_DURATION_SECONDS,
  STAGE_SPEED_BONUS,
  WAVE_VAULT_EMP_GAIN,
  getLaneX,
} from './constants';
import { createEntityManager } from './entities';
import { SynthAudioController } from './synthAudio';
import { createSynthWorld } from './world';

function computeMultiplier(streak: number): number {
  if (streak >= 42) return 8;
  if (streak >= 30) return 6;
  if (streak >= 20) return 4;
  if (streak >= 12) return 3;
  if (streak >= 5) return 2;
  return 1;
}

function computeGrade(score: number, bossDefeated: boolean, shields: number): 'S' | 'A' | 'B' | 'C' {
  if (bossDefeated && (score >= 18000 || shields === MAX_SHIELDS)) return 'S';
  if (bossDefeated || score >= 13000) return 'A';
  if (score >= 7000) return 'B';
  return 'C';
}

function formatClock(sec: number): string {
  const clamped = Math.max(0, Math.ceil(sec));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatShieldPips(shields: number): string {
  return '◆'.repeat(Math.max(0, shields)) + '◇'.repeat(Math.max(0, MAX_SHIELDS - shields));
}

async function mountSynthwaveOverdrive(ctx: GameContext): Promise<GameInstance> {
  const host = createSceneHost({
    container: ctx.container,
    fov: 54,
    near: 0.12,
    far: 700,
    exposure: 1.08,
    shadows: true,
  });

  const { scene, camera, renderer } = host;

  // 1. Crisp 1980s Outrun Sunset Atmosphere with towering sliced sun along -Z
  const atmosphere = applyAtmosphere(scene, renderer, 'synthwave', {
    skyRadius: 520,
    shadowExtent: 26,
    shadowMapSize: 2048,
    fogDensityMultiplier: 0.54,
    enableShadows: true,
    sunDistance: 68,
  });

  // 2. Build 3D Synthwave World, Interceptor Boss & Beat-Synced Entity Director
  const world = createSynthWorld(atmosphere);
  scene.add(world.group);

  const boss = createInterceptorBoss();
  scene.add(boss.group);

  const entities = createEntityManager();
  scene.add(entities.group);

  // 3. Load Rigged 3D Wheelchair Figurine (facing -Z toward the Outrun sun!)
  const figurine = await createFigurineRig({
    targetHeight: 1.65,
    headlights: true,
    boostGlow: true,
    envMapIntensity: 1.35,
    castShadow: true,
    receiveShadow: true,
  });
  figurine.setHeadlightIntensity(1.35);
  scene.add(figurine.root);

  // Sleek neon under-chassis accent light illuminating wet-obsidian road & chrome spokes
  const underGlowLight = new THREE.PointLight(COLORS.cyan, 2.2, 10, 1.6);
  underGlowLight.position.set(0, 0.45, 0.1);
  figurine.root.add(underGlowLight);

  // 4. Input & 100% User-Gesture-Gated 120 BPM Audio Controller
  const input = new InputController({
    target: host.canvas,
    preventScrollKeys: true,
    axisSmoothing: 14,
  });
  const synthAudio = new SynthAudioController(ctx.audio);

  // -------------------------------------------------------------------------
  // Run State
  // -------------------------------------------------------------------------
  let paused = false;
  let disposed = false;
  let runEnded = false;
  let victoryPendingTimer = -1;

  // Player lane & vertical kinematics
  let targetLane = 2;
  let playerX = getLaneX(2);
  let playerVx = 0;
  let playerY = 0;
  let playerVy = 0;
  let onGround = true;
  let grinding = false;
  let grindRailLane = -1;
  let coyoteTimer = 0;
  let jumpBufferTimer = 0;
  let leftHoldTimer = 0;
  let rightHoldTimer = 0;
  let groundBumpImpulse = 0;

  // Rhythm & progression state
  let runElapsed = 0;
  let timeRemaining = RUN_DURATION_SECONDS;
  let distance = 0;
  let beatClock = 0;
  let beatCount = 0;
  let beatPulse = 0;

  let score = 0;
  let streak = 0;
  let maxStreak = 0;
  let prismsTotal = 0;
  let railsGrindSeconds = 0;
  let empStrikes = 0;
  let shields = MAX_SHIELDS;
  let empCharge = INITIAL_EMP_CHARGE;
  let overdriveTimer = 0;
  let invulnTimer = 0;
  let empNotReadyToastCooldown = 0;
  let empReadyNotified = false;
  let railSparkAccum = 0;

  // Camera dynamics
  let cameraShake = 0;
  let currentFov = 54;
  const camPos = new THREE.Vector3(0, 3.4, 6.2);
  const camLook = new THREE.Vector3(0, 2.0, -26);
  const playerPosVec = new THREE.Vector3();
  const bossWorldPos = new THREE.Vector3();

  let hudUpdateAccum = 0;

  const pushHud = (force = false): void => {
    if (disposed) return;
    if (!force && hudUpdateAccum < 0.08) return;
    hudUpdateAccum = 0;

    const mult = computeMultiplier(streak);
    const bossPhase = Math.min(BOSS_PHASES, BOSS_PHASES - boss.shieldsRemaining + 1);
    const empReady = empCharge >= 1.0 && !boss.defeated;

    let statusText = `PHASE ${bossPhase}/${BOSS_PHASES} · 120 BPM OVERDRIVE`;
    if (boss.defeated) {
      statusText = 'INTERCEPTOR SHATTERED · SUNSET VICTORY';
    } else if (overdriveTimer > 0) {
      statusText = 'EMP OVERDRIVE SURGE · INVINCIBLE';
    } else if (grinding) {
      statusText = 'NEON RAIL GRIND · CHARGING EMP';
    } else if (empReady) {
      statusText = 'EMP OVERDRIVE CHARGED · PRESS SHIFT / E';
    }

    let promptText = '';
    if (!runEnded && victoryPendingTimer < 0) {
      if (empReady) {
        promptText = 'EMP READY — Press SHIFT or E to shatter barriers & strike the Interceptor Boss!';
      } else if (runElapsed < 8.5) {
        promptText = 'A / D Weave 5 Lanes · SPACE / W Hop Barriers & Grind Rails · Collect Prisms for EMP';
      }
    }

    ctx.setHud({
      statusText,
      promptText,
      stats: [
        { label: 'Score', value: Math.round(score).toLocaleString(), accent: true },
        { label: 'Mult', value: `${mult}×`, accent: mult >= 4 },
        { label: 'Shield', value: formatShieldPips(shields) },
        { label: 'Time', value: formatClock(timeRemaining) },
      ],
      meters: [
        {
          label: empReady ? 'EMP READY (SHIFT/E)' : 'EMP Overdrive',
          value: Math.min(1, empCharge),
          color: empReady ? '#ff2ea6' : '#00f5ff',
        },
        {
          label: `Interceptor Core (${boss.shieldsRemaining}/${BOSS_PHASES})`,
          value: boss.shieldsRemaining,
          max: BOSS_PHASES,
          color: boss.shieldsRemaining === 1 ? '#ff2d55' : '#ff55a3',
        },
      ],
    });
  };

  const finishRun = (victory: boolean, subtitle: string): void => {
    if (runEnded) return;
    runEnded = true;
    synthAudio.setPaused(true);

    if (victory) {
      score += shields * 1000 + Math.round(timeRemaining) * 50;
      synthAudio.playVictory();
    } else {
      synthAudio.playGameOver();
    }

    const finalScore = Math.round(score);
    const isNewBest = ctx.saveBestScore(finalScore);
    const grade = computeGrade(finalScore, boss.defeated, shields);

    const summaryStats: HudStat[] = [
      { label: 'Rank Grade', value: grade, accent: true },
      { label: 'Boss Cores Shattered', value: `${BOSS_PHASES - boss.shieldsRemaining} / ${BOSS_PHASES}` },
      { label: 'Prisms Absorbed', value: prismsTotal },
      { label: 'Peak Streak', value: `${maxStreak} (${computeMultiplier(maxStreak)}×)` },
      { label: 'Rail Grind', value: `${railsGrindSeconds.toFixed(1)}s` },
      { label: 'Shields Left', value: formatShieldPips(shields) },
    ];

    ctx.setHud({
      statusText: victory ? `OVERDRIVE CLEAR · GRADE ${grade}` : `RUN ENDED · GRADE ${grade}`,
      promptText: '',
      result: {
        title: victory ? 'Interceptor Shattered!' : timeRemaining <= 0 ? 'Horizon Run Complete' : 'Shields Depleted',
        subtitle,
        score: finalScore,
        scoreLabel: `Final Score · Grade ${grade}`,
        isNewBest,
        victory,
        stats: summaryStats,
        onRestart: () => resetGame(),
      },
    });
  };

  const resetGame = (): void => {
    runEnded = false;
    victoryPendingTimer = -1;
    paused = false;

    targetLane = 2;
    playerX = getLaneX(2);
    playerVx = 0;
    playerY = 0;
    playerVy = 0;
    onGround = true;
    grinding = false;
    grindRailLane = -1;
    coyoteTimer = 0;
    jumpBufferTimer = 0;
    leftHoldTimer = 0;
    rightHoldTimer = 0;
    groundBumpImpulse = 0;

    runElapsed = 0;
    timeRemaining = RUN_DURATION_SECONDS;
    distance = 0;
    beatClock = 0;
    beatCount = 0;
    beatPulse = 1.0;

    score = 0;
    streak = 0;
    maxStreak = 0;
    prismsTotal = 0;
    railsGrindSeconds = 0;
    empStrikes = 0;
    shields = MAX_SHIELDS;
    empCharge = INITIAL_EMP_CHARGE;
    overdriveTimer = 0;
    invulnTimer = 0;
    empNotReadyToastCooldown = 0;
    empReadyNotified = false;
    railSparkAccum = 0;

    cameraShake = 0;
    currentFov = 54;
    camera.fov = currentFov;
    camera.updateProjectionMatrix();

    figurine.root.position.set(playerX, 0, PLAYER_Z);
    figurine.model.visible = true;

    world.reset();
    boss.reset();
    entities.reset();
    entities.populateOpeningRunway();

    synthAudio.resetBeatClock();
    synthAudio.setPaused(false);
    host.setPaused(false);

    ctx.setHud({ paused: false, result: null });
    pushHud(true);
  };

  ctx.setRestartHandler?.(resetGame);

  // Initialize opening highway right away so Frame 1 is vibrant & loaded with action!
  entities.populateOpeningRunway();
  figurine.root.position.set(playerX, 0, PLAYER_Z);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  pushHud(true);

  const attemptLaneShift = (delta: -1 | 1): void => {
    const next = Math.max(0, Math.min(LANE_COUNT - 1, targetLane + delta));
    if (next === targetLane) return;
    targetLane = next;
    synthAudio.playLaneWeave(delta);

    // Burst subtle cyan drift sparks from rear tires on snappy lane weave
    if (onGround || grinding) {
      world.sparks.emitBurst(new THREE.Vector3(playerX, Math.max(0.12, playerY + 0.12), PLAYER_Z + 0.3), 8, {
        speed: 4.5,
        upwardBias: 0.45,
        spread: 0.65,
        lifeRange: [0.18, 0.34],
        color: overdriveTimer > 0 ? COLORS.gold : COLORS.cyan,
      });
    }
  };

  const triggerEmpOverdrive = (): void => {
    if (runEnded || victoryPendingTimer >= 0 || boss.defeated) return;
    if (empCharge < 1.0) {
      if (empNotReadyToastCooldown <= 0) {
        empNotReadyToastCooldown = 1.4;
        ctx.notify(`EMP at ${Math.round(empCharge * 100)}% — Absorb Prisms or Grind Rails!`, 'info', 1400);
      }
      return;
    }

    empCharge = 0;
    empReadyNotified = false;
    overdriveTimer = EMP_DURATION;
    empStrikes++;
    cameraShake = 0.46;

    synthAudio.playEmpPulse();
    entities.triggerEmpShockwave(playerX, playerY + 0.8);

    // Ring burst of cyan-magenta sparks around the wheelchair
    world.sparks.emitBurst(new THREE.Vector3(playerX, playerY + 0.9, PLAYER_Z), 36, {
      speed: 12,
      upwardBias: 0.55,
      spread: 1.0,
      lifeRange: [0.35, 0.75],
      color: COLORS.cyan,
    });

    // Strike the Interceptor Boss!
    const mult = computeMultiplier(streak);
    const bossDefeatedNow = boss.applyEmpHit();
    boss.getCoreWorldPosition(bossWorldPos);
    synthAudio.playBossShieldShatter();

    world.sparks.emitBurst(bossWorldPos, bossDefeatedNow ? 110 : 64, {
      speed: bossDefeatedNow ? 22 : 16,
      upwardBias: 0.35,
      spread: 1.0,
      lifeRange: [0.55, 1.2],
      color: bossDefeatedNow ? COLORS.gold : COLORS.magenta,
    });

    const bossBonus = (bossDefeatedNow ? 3000 : 1500) * mult;
    score += bossBonus;

    // Refill +1 shield on boss phase clear!
    let shieldNote = '';
    if (shields < MAX_SHIELDS) {
      shields++;
      shieldNote = ' · +1 SHIELD';
    }

    if (bossDefeatedNow) {
      victoryPendingTimer = 1.75;
      ctx.notify(`INTERCEPTOR CORE SHATTERED! +${bossBonus.toLocaleString()}`, 'success', 2600);
    } else {
      ctx.notify(
        `BOSS SHIELD SHATTERED! +${bossBonus.toLocaleString()}${shieldNote}`,
        'accent',
        2200
      );
    }

    pushHud(true);
  };

  // -------------------------------------------------------------------------
  // Main 60 FPS Tick Loop
  // -------------------------------------------------------------------------
  host.start((dt, elapsed) => {
    input.update(dt);

    // Quick restart shortcut (works during active play or on results overlay)
    if (input.wasPressed('r') && !paused) {
      resetGame();
      input.endFrame();
      return;
    }

    if (paused) {
      input.endFrame();
      return;
    }

    // Even after run ends, keep ambient Outrun sky/water gently alive behind result modal
    if (runEnded) {
      atmosphere.update(elapsed, camera.position);
      world.update(dt, elapsed, {
        speed: 10,
        distance: distance + dt * 10,
        beatPulse: 0,
        beatPhase: 0,
        overdrive: false,
        grinding: false,
        playerPos: figurine.root.position,
        playerAirborne: false,
        cameraPos: camera.position,
      });
      distance += dt * 10;
      input.endFrame();
      return;
    }

    // Handle Victory Finale celebration countdown before showing results screen
    if (victoryPendingTimer > 0) {
      victoryPendingTimer -= dt;
      if (victoryPendingTimer <= 0) {
        finishRun(
          true,
          'You outran the Twilight Grid and shattered all three shield rings of the Synth Interceptor!'
        );
        input.endFrame();
        return;
      }
    }

    runElapsed += dt;
    if (victoryPendingTimer < 0) {
      timeRemaining = Math.max(0, timeRemaining - dt);
      if (timeRemaining <= 0) {
        finishRun(
          boss.shieldsRemaining <= 1,
          '90-second Outrun Horizon completed! Push EMP Overdrive pulses to shatter all 3 Boss rings!'
        );
        input.endFrame();
        return;
      }
    }

    if (empNotReadyToastCooldown > 0) empNotReadyToastCooldown -= dt;
    if (overdriveTimer > 0) overdriveTimer = Math.max(0, overdriveTimer - dt);
    if (invulnTimer > 0) invulnTimer = Math.max(0, invulnTimer - dt);

    const bossStageIndex = BOSS_PHASES - boss.shieldsRemaining; // 0, 1, 2
    const phaseNumber = Math.min(BOSS_PHASES, bossStageIndex + 1);
    const inOverdrive = overdriveTimer > 0 || victoryPendingTimer > 0;

    // 1. Dynamic Highway Speed Calculation
    const targetSpeed =
      BASE_SPEED +
      bossStageIndex * STAGE_SPEED_BONUS +
      (inOverdrive ? OVERDRIVE_SPEED_BONUS : 0) +
      (grinding ? RAIL_GRIND_SPEED_BONUS : 0);
    distance += targetSpeed * dt;

    // 2. 120 BPM Beat Clock & Beat-Synced World Spawning
    beatClock += dt;
    while (beatClock >= BEAT_INTERVAL) {
      beatClock -= BEAT_INTERVAL;
      beatCount++;
      beatPulse = 1.0;

      if (victoryPendingTimer < 0) {
        const telegraphLanes = entities.onBeat(beatCount, phaseNumber, targetSpeed, boss.defeated);
        if (telegraphLanes && telegraphLanes.length > 0) {
          boss.telegraphAttack(telegraphLanes);
          if (telegraphLanes.length === 3 && telegraphLanes[0] === 0 && telegraphLanes[2] === 4) {
            synthAudio.playBossFire();
          }
        }
      }
    }
    beatPulse = Math.max(0, beatPulse - dt * 3.6);
    const beatPhase = beatClock / BEAT_INTERVAL;

    // 3. Player Controls: Snappy 5-Lane Switching (tap + smooth hold-repeat)
    if (input.wasPressed('left')) {
      attemptLaneShift(-1);
      leftHoldTimer = 0.21;
    } else if (input.isDown('left')) {
      leftHoldTimer -= dt;
      if (leftHoldTimer <= 0) {
        attemptLaneShift(-1);
        leftHoldTimer = 0.14;
      }
    } else {
      leftHoldTimer = 0;
    }

    if (input.wasPressed('right')) {
      attemptLaneShift(1);
      rightHoldTimer = 0.21;
    } else if (input.isDown('right')) {
      rightHoldTimer -= dt;
      if (rightHoldTimer <= 0) {
        attemptLaneShift(1);
        rightHoldTimer = 0.14;
      }
    } else {
      rightHoldTimer = 0;
    }

    // Jump input buffer (Space / W / Up)
    if (input.wasPressed('space') || input.wasPressed('up')) {
      jumpBufferTimer = 0.13;
    } else if (jumpBufferTimer > 0) {
      jumpBufferTimer = Math.max(0, jumpBufferTimer - dt);
    }

    // EMP Overdrive Pulse trigger (Shift / E)
    if (input.wasPressed('shift') || input.wasPressed('e')) {
      triggerEmpOverdrive();
    }

    // 4. Spring-Damped Lateral Lane Movement
    const desiredX = getLaneX(targetLane);
    const laneSpring = 215;
    const laneDamp = 24.5;
    const ax = (desiredX - playerX) * laneSpring - playerVx * laneDamp;
    playerVx += ax * dt;
    playerX += playerVx * dt;

    // 5. Vertical Physics: Hydraulic Hop + Elevated Neon Rail Grinding
    const wasGrinding = grinding;
    const railMatch = entities.findGrindRail(playerX, playerY, playerVy);

    if (jumpBufferTimer > 0 && (onGround || grinding || coyoteTimer > 0)) {
      playerVy = JUMP_VELOCITY;
      onGround = false;
      grinding = false;
      grindRailLane = -1;
      coyoteTimer = 0;
      jumpBufferTimer = 0;
      groundBumpImpulse = 0.22;
      synthAudio.playJump();

      world.sparks.emitBurst(new THREE.Vector3(playerX, playerY + 0.15, PLAYER_Z), 14, {
        speed: 6.5,
        upwardBias: 0.4,
        spread: 0.8,
        lifeRange: [0.22, 0.42],
        color: COLORS.cyan,
      });
    } else if (railMatch && playerVy <= 2.5) {
      // Lock cleanly onto the glowing Neon Grind Rail!
      grinding = true;
      grindRailLane = railMatch.lane;
      onGround = false;
      playerY = RAIL_HEIGHT;
      playerVy = 0;
      coyoteTimer = 0.1;

      if (!wasGrinding) {
        groundBumpImpulse = -0.18;
        synthAudio.playRailLock();
        world.sparks.emitBurst(new THREE.Vector3(playerX, RAIL_HEIGHT + 0.05, PLAYER_Z), 18, {
          speed: 7.5,
          upwardBias: 0.65,
          spread: 0.9,
          lifeRange: [0.24, 0.48],
          color: COLORS.gold,
        });
      }
    } else {
      if (wasGrinding) {
        grinding = false;
        grindRailLane = -1;
        coyoteTimer = 0.1; // Generous coyote jump off end of rail
      }

      if (!onGround) {
        coyoteTimer = Math.max(0, coyoteTimer - dt);
        playerVy -= GRAVITY * dt;
        playerY += playerVy * dt;
        if (playerY <= 0) {
          playerY = 0;
          playerVy = 0;
          onGround = true;
          groundBumpImpulse = -0.24;
          world.sparks.emitBurst(new THREE.Vector3(playerX, 0.08, PLAYER_Z + 0.2), 10, {
            speed: 4.5,
            upwardBias: 0.35,
            spread: 0.85,
            lifeRange: [0.16, 0.32],
            color: COLORS.magenta,
          });
        }
      } else {
        coyoteTimer = 0.1;
      }
    }

    // Continuous Rail Grinding Score, EMP Charge & Shower of Neon Tire Sparks!
    if (grinding) {
      const mult = computeMultiplier(streak);
      railsGrindSeconds += dt;
      score += 240 * mult * dt;
      empCharge = Math.min(1.0, empCharge + RAIL_EMP_PER_SEC * dt);

      railSparkAccum += dt;
      if (railSparkAccum >= 0.045) {
        railSparkAccum = 0;
        world.sparks.emitBurst(new THREE.Vector3(playerX, RAIL_HEIGHT + 0.04, PLAYER_Z + 0.28), 5, {
          speed: 5.8,
          upwardBias: 0.52,
          spread: 0.72,
          lifeRange: [0.18, 0.38],
          color: Math.random() < 0.5 ? COLORS.gold : COLORS.cyan,
        });
      }
    } else {
      // Passive forward velocity score trickle
      score += targetSpeed * 0.45 * computeMultiplier(streak) * dt;
    }

    // 6. Update Entities, Collisions, Prism Pickups, Vaults & EMP Shatters
    const entityEvents = entities.update(dt, elapsed, {
      speed: targetSpeed,
      beatPulse,
      playerX,
      playerY,
      playerInvuln: invulnTimer > 0,
      overdrive: inOverdrive,
    });

    if (entityEvents.prismsCollected > 0) {
      for (let i = 0; i < entityEvents.prismsCollected; i++) {
        streak++;
        prismsTotal++;
        if (streak > maxStreak) maxStreak = streak;
        const mult = computeMultiplier(streak);
        const isGold = i < entityEvents.goldPrismsCollected;
        score += (isGold ? 150 : 100) * mult;
        empCharge = Math.min(1.0, empCharge + (isGold ? PRISM_EMP_GAIN * 1.25 : PRISM_EMP_GAIN));
        synthAudio.playPrism(streak);

        const pos = entityEvents.prismCollectPositions[i];
        if (pos) {
          world.sparks.emitBurst(pos, 14, {
            speed: 7.2,
            upwardBias: 0.4,
            spread: 0.9,
            lifeRange: [0.22, 0.46],
            color: isGold ? COLORS.gold : COLORS.cyan,
          });
        }
      }
    }

    if (entityEvents.barriersVaulted > 0) {
      streak += entityEvents.barriersVaulted;
      if (streak > maxStreak) maxStreak = streak;
      const mult = computeMultiplier(streak);
      score += 120 * mult * entityEvents.barriersVaulted;
      empCharge = Math.min(1.0, empCharge + 0.06 * entityEvents.barriersVaulted);
    }

    if (entityEvents.wavesVaulted > 0) {
      streak += 2 * entityEvents.wavesVaulted;
      if (streak > maxStreak) maxStreak = streak;
      const mult = computeMultiplier(streak);
      const bonus = 250 * mult * entityEvents.wavesVaulted;
      score += bonus;
      empCharge = Math.min(1.0, empCharge + WAVE_VAULT_EMP_GAIN * entityEvents.wavesVaulted);
      synthAudio.playGateThread();
      ctx.notify(`ENERGY WAVE VAULT! +${bonus.toLocaleString()}`, 'success', 1500);
    }

    if (entityEvents.obstaclesShattered > 0) {
      const mult = computeMultiplier(streak);
      score += 150 * mult * entityEvents.obstaclesShattered;
      for (const pos of entityEvents.shatterPositions) {
        world.sparks.emitBurst(pos, 22, {
          speed: 11,
          upwardBias: 0.55,
          spread: 1.0,
          lifeRange: [0.28, 0.6],
          color: COLORS.magenta,
        });
      }
    }

    if (entityEvents.obstaclesHit > 0 && victoryPendingTimer < 0) {
      shields = Math.max(0, shields - 1);
      streak = 0;
      invulnTimer = INVULN_AFTER_HIT;
      cameraShake = 0.52;
      groundBumpImpulse = -0.32;
      synthAudio.playShieldDamage();

      for (const pos of entityEvents.hitPositions) {
        world.sparks.emitBurst(pos, 32, {
          speed: 10,
          upwardBias: 0.45,
          spread: 1.0,
          lifeRange: [0.3, 0.65],
          color: COLORS.crimson,
        });
      }

      if (shields <= 0) {
        finishRun(false, 'Your cyber-shield shattered on the Neon Grid. Weave, hop barriers, and unleash EMP!');
        input.endFrame();
        return;
      } else {
        ctx.notify(`SHIELD IMPACT! ${shields} shield${shields === 1 ? '' : 's'} remaining`, 'warning', 1800);
        pushHud(true);
      }
    }

    // Notify once when EMP Overdrive reaches 100%
    if (empCharge >= 1.0 && !empReadyNotified && !boss.defeated) {
      empReadyNotified = true;
      ctx.notify('EMP OVERDRIVE READY — Press SHIFT or E!', 'accent', 2200);
      pushHud(true);
    }

    // 7. Update Wheelchair Figurine Rig (smooth banking roll, pitch, boost smile & invuln blink!)
    figurine.root.position.set(playerX, playerY, PLAYER_Z);
    figurine.root.rotation.y = THREE.MathUtils.clamp(-playerVx * 0.016, -0.22, 0.22);

    // Invulnerability blink visibility pulse
    figurine.model.visible = invulnTimer <= 0 || Math.floor(invulnTimer * 18) % 2 === 0;

    // Positive turnRate & tiltZ when weaving left (playerVx < 0) so head looks & chair banks INTO turns!
    const turnRate = THREE.MathUtils.clamp(-playerVx * 0.16, -2.0, 2.0);
    const tiltZ = THREE.MathUtils.clamp(-playerVx * 0.022, -0.24, 0.24);
    const tiltX = !onGround && !grinding ? THREE.MathUtils.clamp(playerVy * 0.014, -0.14, 0.18) : 0;

    figurine.update(dt, {
      speed: targetSpeed * 0.48, // crisp visible high-speed wheel rotation without strobe aliasing
      turnRate,
      groundBump: groundBumpImpulse,
      boost: inOverdrive || grinding,
      airborne: !onGround && !grinding,
      tiltX,
      tiltZ,
    });
    groundBumpImpulse = 0;

    // Update neon under-chassis light color & pulse
    if (inOverdrive) {
      underGlowLight.color.setHex(COLORS.gold);
      underGlowLight.intensity = 3.8 + beatPulse * 1.6;
    } else if (grinding) {
      underGlowLight.color.setHex(COLORS.magenta);
      underGlowLight.intensity = 3.2 + beatPulse * 1.2;
    } else if (empCharge >= 1.0) {
      underGlowLight.color.setHex(Math.sin(elapsed * 12) > 0 ? COLORS.cyan : COLORS.magenta);
      underGlowLight.intensity = 2.8 + beatPulse * 1.1;
    } else {
      underGlowLight.color.setHex(COLORS.cyan);
      underGlowLight.intensity = 2.1 + beatPulse * 0.85;
    }

    // 8. Update Synth World, Holographic Prism Arch Threading & Interceptor Boss
    playerPosVec.set(playerX, playerY, PLAYER_Z);
    const archesThreaded = world.update(dt, elapsed, {
      speed: targetSpeed,
      distance,
      beatPulse,
      beatPhase,
      overdrive: inOverdrive,
      grinding,
      playerPos: playerPosVec,
      playerAirborne: !onGround && !grinding,
      cameraPos: camera.position,
    });

    if (archesThreaded > 0) {
      streak += archesThreaded;
      if (streak > maxStreak) maxStreak = streak;
      const mult = computeMultiplier(streak);
      score += 100 * mult * archesThreaded;
      empCharge = Math.min(1.0, empCharge + GATE_EMP_GAIN * archesThreaded);
      synthAudio.playGateThread();
    }

    boss.update(dt, elapsed, {
      playerX,
      beatPulse,
      overdrive: inOverdrive,
    });

    // 9. Dynamic Chase Camera with Speed FOV Punch & Impact Shake
    const targetFov = inOverdrive ? 65 : grinding ? 60 : 54 + bossStageIndex * 1.8 + beatPulse * 0.65;
    currentFov += (targetFov - currentFov) * (1 - Math.exp(-8 * dt));
    if (Math.abs(camera.fov - currentFov) > 0.02) {
      camera.fov = currentFov;
      camera.updateProjectionMatrix();
    }

    cameraShake = Math.max(0, cameraShake - dt * 1.8);
    const shakeX = cameraShake > 0 ? (Math.random() - 0.5) * cameraShake * 0.65 : 0;
    const shakeY = cameraShake > 0 ? (Math.random() - 0.5) * cameraShake * 0.45 : 0;

    const desiredCamX = playerX * 0.58;
    const desiredCamY = 3.35 + playerY * 0.48;
    const desiredCamZ = inOverdrive ? 5.65 : 6.25;
    const camAlpha = 1 - Math.exp(-10 * dt);
    camPos.x += (desiredCamX - camPos.x) * camAlpha;
    camPos.y += (desiredCamY - camPos.y) * camAlpha;
    camPos.z += (desiredCamZ - camPos.z) * camAlpha;

    camera.position.set(camPos.x + shakeX, camPos.y + shakeY, camPos.z);
    camLook.set(playerX * 0.34, 2.05 + playerY * 0.24, -28);
    camera.lookAt(camLook);

    // Keep Outrun sky dome centered on camera
    atmosphere.update(elapsed, camera.position);

    // 10. Advance 120 BPM Procedural Synth Beat & Motor Hum (safely gated!)
    synthAudio.update(dt, {
      speedNorm: THREE.MathUtils.clamp((targetSpeed - 12) / 48, 0.2, 1.3),
      boost: inOverdrive,
      grinding,
      phase: phaseNumber,
      playing: !runEnded && !paused,
    });

    // 11. Throttled Crisp HUD Update
    hudUpdateAccum += dt;
    pushHud(false);

    // Keep unused tracking state referenced cleanly
    void grindRailLane;
    void empStrikes;

    input.endFrame();
  });

  return {
    setPaused(nextPaused: boolean) {
      paused = nextPaused;
      host.setPaused(nextPaused);
      synthAudio.setPaused(nextPaused);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ctx.setRestartHandler?.(null);
      synthAudio.dispose();
      input.dispose();
      world.dispose();
      figurine.dispose();
      atmosphere.dispose();
      host.dispose();
    },
  };
}

const moduleDef: GameModule = {
  meta: META,
  mount: mountSynthwaveOverdrive,
};

export default moduleDef;

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
import {
  buildGlacierCourse,
  GATES_PER_ROUND,
  getPlayableHeight,
  getPlayableNormal,
  HOUSE_CENTER_X,
  HOUSE_CENTER_Z,
  ROUND_CONFIGS,
  TOTAL_ROUNDS,
} from './course';
import { buildCurlingArena } from './curling';
import {
  createInitialPlayerState,
  PLAYER_RADIUS,
  resetPlayerToSummit,
  stepGlacierPhysics,
  type GamePhase,
} from './physics';
import { buildNordicScenery } from './scenery';

const META: GameMeta = {
  id: 'glacier-slalom',
  number: 9,
  title: 'Glacier Slalom',
  subtitle: 'Nordic Fjord Descent & Curling',
  genre: 'Downhill Slalom & Curling',
  style: 'Nordic Winter',
  accentColor: '#4B89B5',
  controls: [
    { keys: 'A / D / Arrows', action: 'Carve Edges' },
    { keys: 'W / S', action: 'Tuck & Air-Brake' },
    { keys: 'Space', action: 'Studded Grip Carve / Spin' },
    { keys: 'Shift', action: 'Ice-Rocket Surge' },
    { keys: 'E', action: 'Lock Curling Score' },
    { keys: 'R', action: 'Restart Circuit' },
  ],
  objective:
    'Weave alternating crimson and cobalt slalom gates to build your multiplier, then smash golden curling stones into the bullseye!',
};

const CURLING_PHASE_SECONDS = 16.0;
const ROUND_SUMMARY_SECONDS = 3.4;

/**
 * Single-draw-call pooled twin frosted ice-carve / skate marks laid behind rear wheels
 * when carving aggressively or engaging studded-tire grip brakes.
 */
class IceCarveMarkPool {
  readonly mesh: THREE.InstancedMesh;
  private readonly capacity: number;
  private cursor = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly basisMat = new THREE.Matrix4();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpCorrectedFwd = new THREE.Vector3();
  private readonly zeroScaleMat = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(capacity = 320) {
    this.capacity = capacity;
    const geo = new THREE.PlaneGeometry(0.16, 0.78);
    geo.rotateX(-Math.PI * 0.5);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#eef7ff'),
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.name = 'GlacierIceCarveMarks';
    this.mesh.frustumCulled = false;
    this.clear();
  }

  stamp(pos: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3): void {
    this.tmpFwd.copy(forward).normalize();
    this.tmpRight.crossVectors(this.tmpFwd, up).normalize();
    this.tmpCorrectedFwd.crossVectors(up, this.tmpRight).normalize();

    this.basisMat.makeBasis(this.tmpRight, up, this.tmpCorrectedFwd.negate());
    this.dummy.position.copy(pos).addScaledVector(up, 0.036);
    this.dummy.quaternion.setFromRotationMatrix(this.basisMat);
    this.dummy.scale.set(1, 1, 1);
    this.dummy.updateMatrix();

    this.mesh.setMatrixAt(this.cursor, this.dummy.matrix);
    this.cursor = (this.cursor + 1) % this.capacity;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.mesh.setMatrixAt(i, this.zeroScaleMat);
    }
    this.cursor = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

function getMedalRank(score: number): { label: string; subtitle: string; victory: boolean } {
  if (score >= 8500) {
    return {
      label: 'Alpine Gold Medal',
      subtitle: 'Master of the Nordic Fjord & Olympic Curling House!',
      victory: true,
    };
  }
  if (score >= 5500) {
    return {
      label: 'Nordic Silver Medal',
      subtitle: 'Blistering glacier edges and crisp granite tactics!',
      victory: true,
    };
  }
  return {
    label: 'Glacier Bronze Medal',
    subtitle: 'Chain clean slalom gates & blast crimson stones out for Gold!',
    victory: false,
  };
}

async function mount(ctx: GameContext): Promise<GameInstance> {
  const host = createSceneHost({
    container: ctx.container,
    fov: 50,
    near: 0.15,
    far: 680,
    maxPixelRatio: 2,
    exposure: 1.04,
    shadows: true,
  });
  const { scene, camera, renderer } = host;

  // Crisp Nordic Alpine Winter Wonderland atmosphere (GLSL aurora sky + PMREM + 3-point lighting)
  const atmosphere = applyAtmosphere(scene, renderer, 'nordic_winter', {
    skyRadius: 480,
    shadowExtent: 34,
    shadowMapSize: 2048,
    fogDensityMultiplier: 0.42,
    enableShadows: true,
    sunDistance: 72,
  });

  // 1. Glacier Slalom Course, Snow Banks, Olympic Curling House & 10 Flexible Slalom Gates
  const course = buildGlacierCourse();
  scene.add(course.group);

  // 2. Sculpted Granite & Brass-Handled Curling Stones + Elastic Collision Arena
  const curling = buildCurlingArena();
  scene.add(curling.group);

  // 3. Snow-Laden Spruce Forest, Alpine Chalet + Smoke, Tundra Grass, Frosted Boulders & Brass Lamps
  const scenery = buildNordicScenery();
  scene.add(scenery.group);

  // 4. Twin Ice-Carve Marks & Layered Winter Particle Effects
  const carveMarks = new IceCarveMarkPool(320);
  scene.add(carveMarks.mesh);

  const ambientSnow = createParticleSystem({
    type: 'snow',
    count: 580,
    bounds: { width: 76, height: 34, depth: 76 },
    wind: new THREE.Vector3(-1.35, -0.15, 0.35),
    size: 0.24,
    colors: [0xffffff, 0xe8f5ff, 0xd4ecff],
    ambient: true,
    burstCapacity: 48,
  });
  scene.add(ambientSnow.group);

  const iceSpray = createParticleSystem({
    type: 'sparks',
    count: 0,
    burstCapacity: 240,
    size: 0.28,
    colors: [0xffffff, 0xc7ecff, 0x7fd2ff, 0xffe484],
    ambient: false,
  });
  scene.add(iceSpray.group);

  const celebrationConfetti = createParticleSystem({
    type: 'confetti',
    count: 0,
    burstCapacity: 140,
    size: 0.16,
    colors: [0xf7c948, 0xd93042, 0x2482e0, 0xffffff, 0x70e6d2],
    ambient: false,
  });
  scene.add(celebrationConfetti.group);

  // 5. Rigged 3D Wheelchair Figurine with dual crisp LED headlamps & rear Ice-Rocket Surge glow
  const rig = await createFigurineRig({
    targetHeight: 1.65,
    headlights: true,
    boostGlow: true,
    envMapIntensity: 1.12,
    castShadow: true,
    receiveShadow: true,
  });
  rig.setHeadlightIntensity(1.35);
  scene.add(rig.root);

  const input = new InputController({
    target: host.canvas,
    preventScrollKeys: true,
    axisSmoothing: 13,
  });

  // ---------------------------------------------------------------------------
  // Strict User-Gesture Audio Gate (0 Chrome AudioContext warnings on deep-link!)
  // ---------------------------------------------------------------------------
  const userAct = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;
  let audioUnlocked = Boolean(userAct?.hasBeenActive);
  let paused = false;
  let disposed = false;

  const unlockAudio = () => {
    if (audioUnlocked || disposed) return;
    audioUnlocked = true;
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('pointerdown', unlockAudio);
    ctx.audio.resume();
    if (!paused) {
      ctx.audio.setAmbient('wind', 0.08);
    }
  };

  if (audioUnlocked) {
    ctx.audio.setAmbient('wind', 0.08);
  } else {
    window.addEventListener('keydown', unlockAudio, { passive: true });
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
  }

  // ---------------------------------------------------------------------------
  // Circuit State (3 Escalating Rounds: Slalom Descent -> Curling House Strike)
  // ---------------------------------------------------------------------------
  const player = createInitialPlayerState();
  let roundIndex = 0; // 0..2
  let phase: GamePhase = 'slalom';

  let totalScore = 0;
  let roundSlalomPoints = 0;
  let roundGatesCleared = 0;
  let totalGatesCleared = 0;
  let totalCurlingPoints = 0;
  let streak = 0;
  let multiplier = 1.0;
  let bestMultiplier = 1.0;

  let curlingTimer = CURLING_PHASE_SECONDS;
  let curlingSettleGrace = 0;
  let curlingEarlyLock = false;
  let summaryTimer = 0;
  let lastRoundSummaryText = '';

  let hudAccum = 0;
  let carveMarkCooldown = 0;
  let sprayCooldown = 0;
  let hitAudioCooldown = 0;
  let orbitAngle = 0;

  // Camera state
  const camPos = new THREE.Vector3(0, player.y + 3.8, player.z + 7.8);
  const camLook = new THREE.Vector3(0, player.y + 1.1, player.z - 9.0);
  const targetCamPos = new THREE.Vector3();
  const targetCamLook = new THREE.Vector3();
  const tmpPlayerPos = new THREE.Vector3();
  const tmpNormal = new THREE.Vector3();
  const tmpFwd = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  const tmpWheelPos = new THREE.Vector3();
  let cameraBlendCurling = 0;

  const syncRigTransform = () => {
    rig.root.position.set(player.x, player.y, player.z);
    rig.root.rotation.y = player.yaw;
  };

  const snapCameraToPlayer = () => {
    camPos.set(player.x, player.y + 3.8, player.z + 7.6);
    camLook.set(player.x, player.y + 1.0, player.z - 10.0);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.fov = 50;
    camera.updateProjectionMatrix();
  };

  const startRound = (idx: number, notifyPlayer: boolean) => {
    roundIndex = idx;
    phase = 'slalom';
    roundSlalomPoints = 0;
    roundGatesCleared = 0;
    streak = 0;
    multiplier = 1.0;
    curlingTimer = CURLING_PHASE_SECONDS;
    curlingSettleGrace = 0;
    curlingEarlyLock = false;
    cameraBlendCurling = 0;

    resetPlayerToSummit(player);
    course.applyRoundGates(roundIndex);
    curling.resetForRound(roundIndex);
    carveMarks.clear();
    syncRigTransform();
    snapCameraToPlayer();

    // Ensure sun shadow frustum is centered immediately at the Summit even on frame 0
    atmosphere.sunLight.target.position.set(player.x, player.y, player.z - 6);
    atmosphere.sunLight.position
      .copy(atmosphere.sunDirection)
      .multiplyScalar(72)
      .add(atmosphere.sunLight.target.position);
    atmosphere.sunLight.target.updateMatrixWorld();
    atmosphere.update(0, camera.position);

    const cfg = ROUND_CONFIGS[roundIndex];
    if (notifyPlayer) {
      ctx.notify(`Round ${cfg.round}/${TOTAL_ROUNDS}: ${cfg.name} — Carve all 10 gates!`, 'info', 2800);
    }
    pushHud(true);
  };

  const restartCircuit = () => {
    totalScore = 0;
    totalGatesCleared = 0;
    totalCurlingPoints = 0;
    bestMultiplier = 1.0;
    lastRoundSummaryText = '';
    startRound(0, true);
  };

  const finishCurrentRound = () => {
    const tally = curling.computeTally();
    const cleanSweepBonus = tally.rivalThreatCount === 0 ? 200 : 0;
    const curlingPts = tally.totalPoints + cleanSweepBonus;
    const roundTotal = roundSlalomPoints + curlingPts;

    totalScore += roundTotal;
    totalCurlingPoints += curlingPts;

    if (audioUnlocked) {
      ctx.audio.playVictory();
    }
    celebrationConfetti.emitBurst(new THREE.Vector3(player.x, player.y + 2.1, player.z), 48, {
      speed: 7.5,
      upwardBias: 4.5,
      spread: 2.2,
    });

    if (roundIndex >= TOTAL_ROUNDS - 1) {
      // Final Medal Tally!
      phase = 'finished';
      orbitAngle = Math.atan2(camera.position.x - player.x, camera.position.z - player.z);
      const isNewBest = ctx.saveBestScore(totalScore);
      const best = ctx.getBestScore() ?? totalScore;
      const medal = getMedalRank(totalScore);

      const finalStats: HudStat[] = [
        { label: 'Rank', value: medal.label, accent: true },
        { label: 'Gates Sliced', value: `${totalGatesCleared} / ${TOTAL_ROUNDS * GATES_PER_ROUND}` },
        { label: 'Peak Multiplier', value: `${bestMultiplier.toFixed(1)}×` },
        { label: 'Curling Bonus', value: totalCurlingPoints.toLocaleString() },
        { label: 'Best Score', value: best.toLocaleString() },
      ];

      ctx.setHud({
        stats: [
          { label: 'Final Score', value: totalScore.toLocaleString(), accent: true },
          { label: 'Rank', value: medal.label },
        ],
        statusText: `${medal.label} — Circuit Complete`,
        promptText: '',
        result: {
          title: medal.label,
          subtitle: medal.subtitle,
          score: totalScore,
          scoreLabel: 'Alpine Total',
          isNewBest,
          victory: medal.victory,
          stats: finalStats,
          onRestart: restartCircuit,
        },
      });
    } else {
      phase = 'round_summary';
      summaryTimer = ROUND_SUMMARY_SECONDS;
      orbitAngle = Math.atan2(camera.position.x - player.x, camera.position.z - player.z);
      const sweepTag = cleanSweepBonus > 0 ? ' +200 Clean Sweep!' : '';
      lastRoundSummaryText = `Round ${roundIndex + 1} Scored +${roundTotal.toLocaleString()} (Slalom ${roundSlalomPoints} + House ${curlingPts}${sweepTag})`;
      ctx.notify(lastRoundSummaryText, 'success', 3300);
      pushHud(true);
    }
  };

  const pushHud = (force = false) => {
    if (phase === 'finished') return;
    if (!force && hudAccum < 0.08) return;
    hudAccum = 0;

    const cfg = ROUND_CONFIGS[roundIndex];
    const tally = curling.computeTally();
    const speedKmh = Math.round(Math.hypot(player.vx, player.vz) * 3.6);

    const stats: HudStat[] = [
      { label: 'Round', value: `${roundIndex + 1}/${TOTAL_ROUNDS}` },
      { label: 'Score', value: (totalScore + roundSlalomPoints + (phase === 'curling' ? tally.totalPoints : 0)).toLocaleString(), accent: true },
      phase === 'slalom'
        ? { label: 'Gates', value: `${roundGatesCleared}/${GATES_PER_ROUND}` }
        : { label: 'House', value: `+${tally.totalPoints}`, accent: tally.totalPoints > 0 },
      { label: 'Mult', value: `${multiplier.toFixed(1)}×`, accent: multiplier >= 2.5 },
      { label: 'Speed', value: `${speedKmh} km/h` },
    ];

    const meters: HudMeter[] = [
      {
        label: 'Ice Surge',
        value: player.boostEnergy,
        max: 100,
        color: player.isBoosting ? '#7be3ff' : '#4b9be0',
      },
    ];

    if (phase === 'curling') {
      meters.push({
        label: 'Curling Time',
        value: Math.max(0, curlingTimer),
        max: CURLING_PHASE_SECONDS,
        color: curlingTimer < 4.5 ? '#e65563' : '#f2c14e',
      });
    }

    let statusText = '';
    let promptText = '';

    if (phase === 'slalom') {
      statusText = `Round ${cfg.round}: ${cfg.name} — Carve Slalom Gates`;
      promptText = player.isGripCarving
        ? 'STUDDED GRIP CARVE ACTIVE'
        : 'A/D Carve • Space Grip-Carve • Shift Ice Surge';
    } else if (phase === 'curling') {
      statusText = `Curling House — Gold In: ${tally.goldScoringCount}/3 • Rivals In: ${tally.rivalThreatCount}`;
      promptText = 'Ram Gold Stones into Bullseye • Knock Crimson Out • [E] Lock Score';
    } else if (phase === 'round_summary') {
      statusText = lastRoundSummaryText;
      promptText = `Next Round Summit in ${Math.ceil(summaryTimer)}s (Press Space to launch now)`;
    }

    ctx.setHud({
      stats,
      meters,
      statusText,
      promptText,
      paused,
      result: null,
    });
  };

  ctx.setRestartHandler?.(restartCircuit);

  // Start Round 1 cleanly
  startRound(0, false);

  // ---------------------------------------------------------------------------
  // Main Frame Loop
  // ---------------------------------------------------------------------------
  host.start((dt, elapsed) => {
    if (disposed) return;

    input.update(dt);

    // Quick restart shortcut (`R`)
    if (input.wasPressed('r')) {
      if (audioUnlocked) ctx.audio.playClick();
      restartCircuit();
      input.endFrame();
      return;
    }

    // Advance immediately out of round summary if player taps Space or Enter
    if (phase === 'round_summary') {
      summaryTimer -= dt;
      if (summaryTimer <= 0 || input.wasPressed('space') || input.wasPressed('enter')) {
        if (audioUnlocked) ctx.audio.playChime(5, 0.25);
        startRound(roundIndex + 1, true);
        input.endFrame();
        return;
      }
    }

    // Early Curling House lock (`E`) during Phase 2
    if (phase === 'curling' && input.wasPressed('e')) {
      curlingEarlyLock = true;
      curlingTimer = 0;
      if (audioUnlocked) ctx.audio.playClick();
    }

    // Step wheelchair glacier ice-drift physics
    const physEvents = stepGlacierPhysics(
      player,
      {
        forward: input.forward,
        turn: input.turn,
        gripCarve: input.action,
        boost: input.boost,
      },
      dt,
      phase,
      course.gates,
    );

    hitAudioCooldown = Math.max(0, hitAudioCooldown - dt);

    // Handle boost ignition feedback
    if (physEvents.boostStarted) {
      if (audioUnlocked) ctx.audio.playBoost(0.32);
      iceSpray.emitBurst(new THREE.Vector3(player.x, player.y + 0.35, player.z), 16, {
        speed: 6.5,
        upwardBias: 2.0,
        spread: 0.7,
        color: 0x99e8ff,
      });
    }

    // Handle breakaway slalom pole clips
    for (const hit of physEvents.poleHits) {
      course.triggerPoleHit(hit.gate, hit.side, player.vx, player.vz);
      if (audioUnlocked && hitAudioCooldown <= 0) {
        ctx.audio.playBump(Math.min(0.85, 0.3 + hit.speed * 0.025));
        hitAudioCooldown = 0.14;
      }
      const px = hit.side === 'left' ? hit.gate.leftPoleWorldX : hit.gate.rightPoleWorldX;
      iceSpray.emitBurst(new THREE.Vector3(px, hit.gate.groundY + 0.9, hit.gate.def.z), 12, {
        speed: 5.0,
        upwardBias: 2.2,
        color: 0xffffff,
      });
    }

    // Handle cleanly sliced Slalom Gates!
    for (const { gate, perfect } of physEvents.clearedGates) {
      course.markGateCleared(gate);
      streak += 1;
      roundGatesCleared += 1;
      totalGatesCleared += 1;
      multiplier = Math.min(5.0, 1.0 + streak * 0.5);
      if (multiplier > bestMultiplier) bestMultiplier = multiplier;

      const basePts = perfect ? 225 : 150;
      const gained = Math.round(basePts * multiplier);
      roundSlalomPoints += gained;
      player.boostEnergy = Math.min(100, player.boostEnergy + 14);

      if (audioUnlocked) {
        ctx.audio.playCombo(streak, 0.3);
      }

      const gateCenter = new THREE.Vector3(gate.def.centerX, gate.groundY + 1.3, gate.def.z);
      iceSpray.emitBurst(gateCenter, perfect ? 22 : 14, {
        speed: 6.4,
        upwardBias: 3.2,
        spread: 1.5,
        color: 0xffe470,
      });

      if (perfect && streak >= 3) {
        ctx.notify(`PERFECT SLICE! +${gained} (${multiplier.toFixed(1)}×)`, 'accent', 1200);
      }
    }

    // Handle missed Slalom Gates
    for (const gate of physEvents.missedGates) {
      course.markGateMissed(gate);
      streak = 0;
      multiplier = Math.max(1.0, Math.floor(multiplier * 0.5 * 2) / 2);
      if (audioUnlocked) {
        ctx.audio.playBump(0.32);
      }
    }

    // Wall / snowbank bounce cue
    if (physEvents.wallBumpIntensity > 0.12 && audioUnlocked && hitAudioCooldown <= 0) {
      ctx.audio.playBump(physEvents.wallBumpIntensity * 0.7);
      hitAudioCooldown = 0.16;
    }

    // Phase 1 -> Phase 2 Seamless Transition into the Frozen Olympic Curling Arena!
    if (physEvents.enteredCurlingArena && phase === 'slalom') {
      phase = 'curling';
      curlingTimer = CURLING_PHASE_SECONDS;
      curlingSettleGrace = 0;
      curlingEarlyLock = false;
      player.boostEnergy = Math.min(100, player.boostEnergy + 45);

      if (audioUnlocked) {
        ctx.audio.playBell(0.34);
      }
      if (roundGatesCleared >= 8) {
        celebrationConfetti.emitBurst(new THREE.Vector3(player.x, player.y + 1.8, player.z), 30, {
          speed: 7.0,
          upwardBias: 4.0,
          spread: 1.6,
        });
      }
      ctx.notify(
        `CURLING ARENA! ${roundGatesCleared}/${GATES_PER_ROUND} Gates (${multiplier.toFixed(1)}×) — Ram Gold into Bullseye!`,
        'accent',
        3200,
      );
      pushHud(true);
    }

    // Step Curling Arena Granite Stones Physics
    const curlingStep = curling.step(
      dt,
      elapsed,
      player.x,
      player.z,
      player.vx,
      player.vz,
      PLAYER_RADIUS,
      player.isBoosting,
    );

    if (curlingStep.playerPushOutX !== 0 || curlingStep.playerPushOutZ !== 0) {
      player.x += curlingStep.playerPushOutX;
      player.z += curlingStep.playerPushOutZ;
      player.y = getPlayableHeight(player.x, player.z);
    }
    if (curlingStep.playerImpulseX !== 0 || curlingStep.playerImpulseZ !== 0) {
      player.vx += curlingStep.playerImpulseX;
      player.vz += curlingStep.playerImpulseZ;
      player.groundBump = Math.max(player.groundBump, 0.55);
    }

    // Crisp granite clack audio & icy sparks on stone collisions!
    for (const col of curlingStep.collisions) {
      if (audioUnlocked && hitAudioCooldown <= 0) {
        ctx.audio.playBump(Math.max(0.28, col.intensity));
        if (col.kind === 'stone-stone') {
          ctx.audio.playChime(7 + Math.round(col.intensity * 5), 0.16);
        }
        hitAudioCooldown = 0.075;
      }
      iceSpray.emitBurst(col.position, Math.round(8 + col.intensity * 14), {
        speed: 4.5 + col.intensity * 4.5,
        upwardBias: 2.2,
        spread: 0.65,
        color: col.team === 'gold' ? 0xffe478 : 0xd0f0ff,
      });
    }

    // Reward chimes & sparkles when Gold enters scoring rings or Crimson is blasted OUT!
    for (const promo of curlingStep.zonePromotions) {
      if (promo.team === 'gold') {
        if (audioUnlocked) {
          ctx.audio.playChime(promo.zone === 'button' ? 12 : promo.zone === 'inner' ? 7 : 4, 0.32);
        }
        iceSpray.emitBurst(promo.pos, promo.zone === 'button' ? 28 : 16, {
          speed: 6.2,
          upwardBias: 3.8,
          spread: 1.0,
          color: 0xffe066,
        });
        if (promo.zone === 'button') {
          celebrationConfetti.emitBurst(promo.pos, 26, { speed: 6.5, upwardBias: 4.2, spread: 1.2 });
          ctx.notify('BULLSEYE BUTTON! +1,000 pts!', 'success', 1800);
        }
      } else if (promo.team === 'rival' && promo.zone === 'none') {
        if (audioUnlocked) ctx.audio.playChime(9, 0.24);
        ctx.notify('RIVAL STONE CLEARED!', 'info', 1400);
      }
    }

    // Animate inlaid Curling House glow rings based on live stones inside!
    const pulseWave = 0.5 + 0.5 * Math.sin(elapsed * 4.0);
    course.setHouseGlow(
      curlingStep.tally.goldInButton > 0 ? 0.65 + pulseWave * 0.35 : 0.1,
      curlingStep.tally.goldInInner > 0 ? 0.5 + pulseWave * 0.3 : 0.08,
      curlingStep.tally.goldInOuter > 0 ? 0.4 + pulseWave * 0.25 : 0.05,
    );

    // Phase 2 Curling Timer & Settling Check
    if (phase === 'curling') {
      curlingTimer = Math.max(0, curlingTimer - dt);
      if (curlingTimer <= 0) {
        curlingSettleGrace += dt;
        const stonesSettled = curlingStep.maxStoneSpeed < 0.35;
        if (stonesSettled || curlingSettleGrace >= 2.2 || (curlingEarlyLock && curlingSettleGrace >= 0.45)) {
          finishCurrentRound();
        }
      }
    }

    // Update Wheelchair Figurine Rig (exact rolling wheels, suspension lean, ice-carve roll!)
    syncRigTransform();
    rig.update(dt, {
      speed: player.forwardSpeed,
      turnRate: player.turnRate,
      groundBump: player.groundBump,
      boost: player.isBoosting,
      airborne: false,
      tiltX: player.slopePitch,
      tiltZ: player.bankRoll,
    });

    // Twin Ice-Carve Tire Marks & Studded-Tire Ice-Crystal Spray Particles
    tmpPlayerPos.set(player.x, player.y, player.z);
    tmpFwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    tmpRight.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    getPlayableNormal(player.x, player.z, tmpNormal);

    const speedMag = Math.hypot(player.vx, player.vz);
    carveMarkCooldown -= dt;
    if ((player.driftIntensity > 0.24 || player.isGripCarving) && speedMag > 3.2 && carveMarkCooldown <= 0) {
      carveMarkCooldown = 0.045;
      for (const side of [-1, 1]) {
        tmpWheelPos
          .copy(tmpPlayerPos)
          .addScaledVector(tmpRight, side * 0.34)
          .addScaledVector(tmpFwd, -0.25);
        carveMarks.stamp(tmpWheelPos, tmpFwd, tmpNormal);
      }
    }

    sprayCooldown -= dt;
    if ((player.driftIntensity > 0.22 || player.isBoosting || player.inSnowBank) && speedMag > 2.8 && sprayCooldown <= 0) {
      sprayCooldown = player.isGripCarving ? 0.032 : 0.055;
      const sprayCount = player.isGripCarving ? 5 : 3;
      for (const side of [-1, 1]) {
        tmpWheelPos
          .copy(tmpPlayerPos)
          .addScaledVector(tmpRight, side * 0.38)
          .addScaledVector(tmpFwd, -0.32);
        tmpWheelPos.y += 0.14;
        iceSpray.emitBurst(tmpWheelPos, sprayCount, {
          speed: 2.6 + player.driftIntensity * 3.8,
          upwardBias: 1.9 + player.driftIntensity * 1.4,
          spread: 0.45,
          lifeRange: [0.22, 0.5],
          color: player.isBoosting ? 0x8be4ff : 0xeaf7ff,
        });
      }
    }

    // Continuous power-chair electric motor + ice-carve snow hiss audio
    if (audioUnlocked) {
      ctx.audio.setMotor(Math.min(1.4, speedMag / 22), {
        boost: player.isBoosting,
        drift: player.driftIntensity > 0.25 || player.isGripCarving,
        surface: player.inSnowBank || player.isGripCarving ? 'snow' : 'smooth',
      });
    }

    // Update Course Flags/Poles, Nordic Scenery (Snow Forest, Tundra Grass, Chalet Chimney Smoke) & Particles
    course.update(dt, elapsed);
    scenery.update(dt, elapsed, tmpPlayerPos);
    ambientSnow.update(dt, tmpPlayerPos);
    iceSpray.update(dt);
    celebrationConfetti.update(dt);

    // Track crisp 2048x2048 alpine sun shadows dynamically with the wheelchair!
    const snapX = Math.round(player.x * 2) * 0.5;
    const snapY = Math.round(player.y * 2) * 0.5;
    const snapZ = Math.round((player.z - 6) * 2) * 0.5;
    atmosphere.sunLight.target.position.set(snapX, snapY, snapZ);
    atmosphere.sunLight.position
      .copy(atmosphere.sunDirection)
      .multiplyScalar(72)
      .add(atmosphere.sunLight.target.position);
    atmosphere.sunLight.target.updateMatrixWorld();

    // Update Chase Camera (unobstructed downhill sightline -> elevated tactical Curling House view!)
    const wantCurlingCam = phase === 'curling' ? 1 : 0;
    cameraBlendCurling += (wantCurlingCam - cameraBlendCurling) * (1 - Math.exp(-3.4 * dt));

    if (phase === 'round_summary' || phase === 'finished') {
      orbitAngle += dt * 0.42;
      const orbitDist = 11.5;
      targetCamPos.set(
        player.x + Math.sin(orbitAngle) * orbitDist,
        player.y + 5.6,
        player.z + Math.cos(orbitAngle) * orbitDist,
      );
      targetCamLook.set(
        THREE.MathUtils.lerp(player.x, HOUSE_CENTER_X, 0.45),
        player.y + 1.0,
        THREE.MathUtils.lerp(player.z, HOUSE_CENTER_Z, 0.45),
      );
    } else {
      // Blend camera heading gently between chair heading and downhill -Z during slalom
      // so sharp carves keep upcoming gates squarely framed!
      const lookDirX = THREE.MathUtils.lerp(tmpFwd.x, 0, (1 - cameraBlendCurling) * 0.42);
      const lookDirZ = THREE.MathUtils.lerp(tmpFwd.z, -1, (1 - cameraBlendCurling) * 0.42);
      const len = Math.hypot(lookDirX, lookDirZ) || 1;
      const dirX = lookDirX / len;
      const dirZ = lookDirZ / len;

      const dist = THREE.MathUtils.lerp(7.5, 11.4, cameraBlendCurling);
      const height = THREE.MathUtils.lerp(3.65, 7.6, cameraBlendCurling);

      targetCamPos.set(
        player.x - dirX * dist,
        player.y + height,
        player.z - dirZ * dist,
      );

      // Ensure camera stays safely above any local snowbank crest
      const groundAtCam = getPlayableHeight(targetCamPos.x, targetCamPos.z);
      if (targetCamPos.y < groundAtCam + 2.4) {
        targetCamPos.y = groundAtCam + 2.4;
      }

      // During Phase 2 Curling, bias camera look slightly toward the Olympic Bullseye
      // so the player always reads all 6 granite stones & scoring rings!
      const slalomLookX = player.x + dirX * 10.5;
      const slalomLookY = player.y + 0.9;
      const slalomLookZ = player.z + dirZ * 10.5;

      const curlLookX = THREE.MathUtils.lerp(player.x + dirX * 5.0, HOUSE_CENTER_X, 0.48);
      const curlLookY = 0.55;
      const curlLookZ = THREE.MathUtils.lerp(player.z + dirZ * 5.0, HOUSE_CENTER_Z, 0.48);

      targetCamLook.set(
        THREE.MathUtils.lerp(slalomLookX, curlLookX, cameraBlendCurling),
        THREE.MathUtils.lerp(slalomLookY, curlLookY, cameraBlendCurling),
        THREE.MathUtils.lerp(slalomLookZ, curlLookZ, cameraBlendCurling),
      );
    }

    const camAlpha = 1 - Math.exp(-6.8 * dt);
    camPos.lerp(targetCamPos, camAlpha);
    camLook.lerp(targetCamLook, 1 - Math.exp(-8.5 * dt));
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    // Subtle exhilarating speed FOV expansion
    const targetFov =
      phase === 'curling'
        ? 52 + (player.isBoosting ? 4 : 0)
        : 50 + THREE.MathUtils.clamp((speedMag - 8) * 0.38, 0, 8.5) + (player.isBoosting ? 4.5 : 0);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-5.5 * dt));
      camera.updateProjectionMatrix();
    }

    atmosphere.update(elapsed, camera.position);

    hudAccum += dt;
    pushHud(false);

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
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
      ctx.setRestartHandler?.(null);
      if (audioUnlocked) {
        ctx.audio.stopMotor();
        ctx.audio.setAmbient('none');
      }
      input.dispose();
      rig.dispose();
      carveMarks.dispose();
      ambientSnow.dispose();
      iceSpray.dispose();
      celebrationConfetti.dispose();
      scenery.dispose();
      curling.dispose();
      course.dispose();
      atmosphere.dispose();
      host.dispose();
    },
  };
}

const glacierSlalomModule: GameModule = {
  meta: META,
  mount,
};

export default glacierSlalomModule;

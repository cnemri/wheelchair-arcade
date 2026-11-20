import * as THREE from 'three';
import { applyAtmosphere, createParticleSystem } from '../../art';
import { createFigurineRig } from '../../engine/character';
import { InputController } from '../../engine/input';
import { createSceneHost } from '../../engine/sceneHost';
import type { GameContext, GameInstance, GameMeta, GameModule, HudStat } from '../../engine/types';
import {
  TOTAL_LAPS,
  computeFinalScore,
  createInitialDriftState,
  resetToLastCheckpoint,
  stepDriftPhysics,
  type DriftState,
} from './physics';
import { buildKyotoScenery } from './scenery';
import { buildMountainTrack } from './track';

const META: GameMeta = {
  id: 'botanical-drift',
  number: 1,
  title: 'Botanical Drift',
  subtitle: 'Kyoto Maple Garden Circuit',
  genre: 'Drift Racer',
  style: 'Autumnal Kyoto',
  accentColor: '#C85A32',
  controls: [
    { keys: 'W / S', action: 'Accelerate & Brake' },
    { keys: 'A / D', action: 'Steer' },
    { keys: 'Space', action: 'Handbrake Drift' },
    { keys: 'Shift', action: 'Drift Boost' },
  ],
  objective: 'Carve smooth drifts beneath glowing autumn maples and set a blistering three-lap time.',
};

function formatRaceTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const tenths = Math.floor((clamped * 10) % 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

/**
 * Single-draw-call pooled twin rear-tire drift skid marks laid onto the banked road surface.
 */
class SkidMarkPool {
  readonly mesh: THREE.InstancedMesh;
  private readonly capacity: number;
  private cursor = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly basisMat = new THREE.Matrix4();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpCorrectedFwd = new THREE.Vector3();
  private readonly zeroScaleMat = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(capacity = 260) {
    this.capacity = capacity;
    const geo = new THREE.PlaneGeometry(0.18, 0.72);
    geo.rotateX(-Math.PI * 0.5);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#1c1715'),
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.name = 'DriftSkidMarks';
    this.mesh.frustumCulled = false;
    this.clear();
  }

  stamp(pos: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3): void {
    this.tmpFwd.copy(forward).normalize();
    this.tmpRight.crossVectors(this.tmpFwd, up).normalize();
    this.tmpCorrectedFwd.crossVectors(up, this.tmpRight).normalize();

    this.basisMat.makeBasis(this.tmpRight, up, this.tmpCorrectedFwd.negate());
    this.dummy.position.copy(pos).addScaledVector(up, 0.045);
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

async function mount(ctx: GameContext): Promise<GameInstance> {
  const host = createSceneHost({
    container: ctx.container,
    fov: 50,
    near: 0.15,
    far: 640,
    maxPixelRatio: 2,
    exposure: 1.05,
    shadows: true,
  });
  const { scene, camera, renderer } = host;

  // Sun-drenched Studio Ghibli Kyoto Autumn atmosphere
  const atmosphere = applyAtmosphere(scene, renderer, 'kyoto_autumn', {
    skyRadius: 460,
    shadowExtent: 30,
    shadowMapSize: 2048,
    fogDensityMultiplier: 0.48,
    enableShadows: true,
    sunDistance: 74,
  });

  // Sculpted Mountain Touge Circuit + Dense Kyoto Botanical Scenery
  const track = buildMountainTrack();
  scene.add(track.group);

  const scenery = buildKyotoScenery(track, atmosphere);
  scene.add(scenery.group);

  // Rigged 3D Wheelchair Figurine with warm dusk headlights & rear boost thruster glow
  const rig = await createFigurineRig({
    targetHeight: 1.65,
    headlights: true,
    boostGlow: true,
    envMapIntensity: 1.12,
    castShadow: true,
    receiveShadow: true,
  });
  rig.setHeadlightIntensity(0.95);
  scene.add(rig.root);

  // Ambient drifting autumn maple leaves + drift sparks + rear-wheel leaf vortex bursts
  const ambientLeaves = createParticleSystem({
    type: 'autumn_leaves',
    count: 260,
    bounds: { width: 64, height: 24, depth: 64 },
    wind: new THREE.Vector3(-1.8, 0.0, 1.0),
    size: 0.2,
    ambient: true,
    burstCapacity: 180,
  });
  scene.add(ambientLeaves.group);

  const driftSparks = createParticleSystem({
    type: 'sparks',
    count: 0,
    size: 0.15,
    colors: ['#ffe885', '#ffa533', '#ff5924', '#fff5cc'],
    ambient: false,
    burstCapacity: 260,
  });
  scene.add(driftSparks.group);

  const skidMarks = new SkidMarkPool(260);
  scene.add(skidMarks.mesh);

  const input = new InputController({
    target: host.canvas,
    preventScrollKeys: true,
    axisSmoothing: 14,
  });

  // Simulation state & runtime trackers
  let state: DriftState = createInitialDriftState(track);
  let paused = false;
  let disposed = false;
  let driftComboChain = 0;
  let hasDriftedOnce = false;
  let hasBoostedOnce = false;
  let sparkEmitAccum = 0;
  let skidEmitAccum = 0;
  let leafBurstAccum = 0;
  let hudAccum = 0;
  let statusFlashText = '';
  let statusFlashTimer = 0;
  let camShake = 0;
  let finishOrbitAngle = 0;

  // Reusable scratch vectors (zero per-frame allocations)
  const camPos = new THREE.Vector3();
  const camLookAt = new THREE.Vector3();
  const desiredCamPos = new THREE.Vector3();
  const desiredLookAt = new THREE.Vector3();
  const travelFwd = new THREE.Vector3();
  const travelRight = new THREE.Vector3();
  const wheelWorldL = new THREE.Vector3();
  const wheelWorldR = new THREE.Vector3();
  const rearWorld = new THREE.Vector3();
  const sunTargetSnap = new THREE.Vector3();
  const nextLookFrame = track.sampleAtArc(state.projection.arcDist + 14);

  const syncRigAndCameraImmediate = () => {
    rig.root.position.copy(state.position);
    rig.root.rotation.set(0, state.visualYaw, 0);

    travelFwd.set(-Math.sin(state.travelYaw), 0, -Math.cos(state.travelYaw));
    camPos
      .copy(state.position)
      .addScaledVector(travelFwd, -5.6)
      .add(new THREE.Vector3(0, 2.45, 0));
    camLookAt
      .copy(state.position)
      .addScaledVector(travelFwd, 10.0)
      .add(new THREE.Vector3(0, 1.35, 0));

    camera.position.copy(camPos);
    camera.lookAt(camLookAt);
    camera.fov = 50;
    camera.updateProjectionMatrix();

    atmosphere.sunLight.target.position.copy(state.position);
    atmosphere.sunLight.position
      .copy(state.position)
      .addScaledVector(atmosphere.sunDirection, 74);
  };

  const pushHud = (force = false) => {
    if (!force && hudAccum < 0.055) return;
    hudAccum = 0;

    const kmh = Math.max(0, Math.round(Math.abs(state.speed) * 3.6));
    const displayDriftPts = Math.round(state.totalDriftScore + state.currentDriftPoints);

    const stats: HudStat[] = [
      { label: 'Lap', value: `${Math.min(state.currentLap, TOTAL_LAPS)} / ${TOTAL_LAPS}` },
      { label: 'Time', value: formatRaceTime(state.elapsedTime) },
      { label: 'Speed', value: `${kmh} km/h`, accent: state.isBoosting },
      {
        label: state.isDrifting ? 'Drifting!' : 'Drift Pts',
        value: displayDriftPts.toLocaleString(),
        accent: state.isDrifting,
      },
    ];

    const boostColor = state.isBoosting
      ? 'linear-gradient(90deg, #ff6a24, #ffd859)'
      : state.boostGauge >= 0.14
        ? 'linear-gradient(90deg, #c85a32, #f2a93b)'
        : 'rgba(200, 90, 50, 0.45)';

    const meters = [
      {
        label: state.isBoosting
          ? 'Turbo Surge'
          : state.boostGauge >= 0.14
            ? 'Boost Ready [Shift]'
            : 'Boost Gauge',
        value: state.boostGauge,
        color: boostColor,
      },
    ];

    if (state.isDrifting) {
      const chargeNorm = Math.min(1, state.driftDuration / 2.25);
      const tierColors = ['#e89c3a', '#f26a2e', '#ff3d24', '#ffd84d'];
      meters.push({
        label:
          state.driftTier === 3
            ? 'MAX Flame Drift!'
            : state.driftTier === 2
              ? 'Super Drift'
              : state.driftTier === 1
                ? 'Mini-Turbo Ready'
                : 'Drift Charge',
        value: chargeNorm,
        color: tierColors[state.driftTier],
      });
    }

    let statusText = '';
    if (state.wrongWay) {
      statusText = '⚠ WRONG WAY — TURN AROUND (OR PRESS R)';
    } else if (statusFlashTimer > 0 && statusFlashText) {
      statusText = statusFlashText;
    } else if (state.isDrifting && state.activeApexId >= 0) {
      statusText = `APEX DRIFT ×2 · ${state.activeApexName} (+${Math.round(state.currentDriftPoints)})`;
    } else if (state.isDrifting) {
      statusText = `DRIFT SLIDE · +${Math.round(state.currentDriftPoints)}`;
    } else if (state.isBoosting) {
      statusText = 'TURBO BOOST OVERDRIVE';
    } else if (state.activeApexName) {
      statusText = `${state.activeApexName} · HOLD SPACE TO DRIFT`;
    } else if (!state.raceStarted) {
      statusText = 'KYOTO AUTUMN TOUGE · 3-LAP TIME ATTACK';
    }

    let promptText = '';
    if (!state.raceFinished) {
      if (!state.raceStarted) {
        promptText = 'Press W to Launch · Hold SPACE in corners to Drift · SHIFT for Turbo Boost';
      } else if (!hasDriftedOnce && state.speed > 9) {
        promptText = 'Tip: Hold SPACE while turning to carve a Drift & charge your Turbo Gauge';
      } else if (!hasBoostedOnce && state.boostGauge >= 0.45) {
        promptText = 'Turbo Charged! Press SHIFT or E to ignite Boost';
      }
    }

    ctx.setHud({
      stats,
      meters,
      statusText,
      promptText,
    });
  };

  const restartRace = () => {
    state = createInitialDriftState(track);
    driftComboChain = 0;
    sparkEmitAccum = 0;
    skidEmitAccum = 0;
    leafBurstAccum = 0;
    hudAccum = 1;
    statusFlashText = 'KYOTO AUTUMN TOUGE · GO!';
    statusFlashTimer = 1.6;
    camShake = 0;
    finishOrbitAngle = 0;

    skidMarks.clear();
    driftSparks.clear();
    syncRigAndCameraImmediate();
    ctx.setHud({ result: null, paused: false });
    pushHud(true);
    ctx.notify('Momiji Touge · 3 Laps · Drift the Hairpins!', 'accent', 2400);
  };

  ctx.setRestartHandler?.(restartRace);

  // Initial pose, camera framing & gentle mountain wind ambience
  syncRigAndCameraImmediate();
  ctx.audio.setAmbient('wind', 0.24);
  pushHud(true);
  ctx.notify('Momiji Touge · 3-Lap Time Attack', 'accent', 2600);

  // Main real-time loop
  host.start((dt, elapsed) => {
    if (disposed) return;

    input.update(dt);

    // Quick respawn to last checkpoint with R (or restart if finished)
    if (input.wasPressed('r')) {
      if (state.raceFinished) {
        restartRace();
        input.endFrame();
        return;
      } else {
        resetToLastCheckpoint(state, track);
        ctx.audio.playClick();
        ctx.notify('Respawned at last Torii Gate', 'info', 1400);
      }
    }

    const driftInput = {
      throttle: input.forward,
      steer: input.turn,
      driftHeld: input.isDown('space'),
      boostHeld: input.isDown('shift') || input.isDown('e'),
      boostPressed: input.wasPressed('shift') || input.wasPressed('e'),
    };

    const events = stepDriftPhysics(state, driftInput, track, dt);

    if (state.isDrifting) hasDriftedOnce = true;
    if (state.isBoosting) hasBoostedOnce = true;

    // -----------------------------------------------------------------------
    // 1. Audio & Gameplay Event Feedback
    // -----------------------------------------------------------------------
    if (events.boostPadHit) {
      ctx.audio.playBoost(0.72);
      ctx.audio.playChime(7, 0.35);
      statusFlashText = '⚡ BOOST PAD SURGE!';
      statusFlashTimer = 1.25;
      camShake = Math.max(camShake, 0.24);
      rig.rearMount.getWorldPosition(rearWorld);
      ambientLeaves.emitBurst(rearWorld, 18, {
        speed: 6.5,
        upwardBias: 2.2,
        spread: 1.1,
        lifeRange: [0.55, 1.1],
      });
    } else if (events.miniTurboTier > 0) {
      const tier = events.miniTurboTier as 1 | 2 | 3;
      ctx.audio.playBoost(0.55 + tier * 0.12);
      const labels: Record<1 | 2 | 3, string> = {
        1: 'MINI-TURBO EXIT!',
        2: 'SUPER DRIFT TURBO!',
        3: '🔥 TOUGE MASTER FLAME BOOST!',
      };
      statusFlashText = labels[tier];
      statusFlashTimer = 1.45;
      camShake = Math.max(camShake, 0.14 + tier * 0.08);
    } else if (events.boostStarted) {
      ctx.audio.playBoost(0.62);
      camShake = Math.max(camShake, 0.16);
    }

    if (events.driftBankedPoints > 0) {
      driftComboChain += 1;
      ctx.audio.playCombo(Math.min(8, driftComboChain), 0.45);
      const tag = events.driftBankedWasApex ? 'APEX DRIFT ×2' : 'CLEAN DRIFT';
      ctx.notify(`${tag} +${events.driftBankedPoints.toLocaleString()} pts`, 'accent', 1650);
    }

    if (events.wallBumpIntensity > 0) {
      ctx.audio.playBump(events.wallBumpIntensity * 0.85);
      camShake = Math.max(camShake, events.wallBumpIntensity * 0.22);
      driftComboChain = 0;
      driftSparks.emitBurst(
        state.position.clone().add(new THREE.Vector3(0, 0.55, 0)),
        14,
        {
          speed: 7.0,
          upwardBias: 2.8,
          spread: 1.2,
          lifeRange: [0.22, 0.5],
          color: '#ffd978',
        },
      );
    }

    if (events.checkpointPassed >= 0) {
      scenery.flashCheckpointGate(events.checkpointPassed);
      if (events.lapCompleted === 0) {
        ctx.audio.playChime(events.checkpointPassed === 1 ? 4 : 7, 0.45);
        const cpName = track.checkpoints[events.checkpointPassed].name;
        statusFlashText = `${cpName.toUpperCase()} · ${formatRaceTime(state.elapsedTime)}`;
        statusFlashTimer = 1.7;
        ctx.notify(`Checkpoint: ${cpName}`, 'info', 1600);
      }
    }

    if (events.lapCompleted > 0 && !events.raceFinished) {
      ctx.audio.playBell(0.72);
      const lapStr = formatRaceTime(events.lapTime);
      const isFinalLap = state.currentLap === TOTAL_LAPS;
      statusFlashText = isFinalLap
        ? `FINAL LAP! · LAP ${events.lapCompleted}: ${lapStr}`
        : `LAP ${state.currentLap} / ${TOTAL_LAPS} · SPLIT ${lapStr}`;
      statusFlashTimer = 2.4;
      ctx.notify(
        isFinalLap ? `Final Lap! Last Split: ${lapStr}` : `Lap ${events.lapCompleted} Complete — ${lapStr}`,
        'success',
        2600,
      );
    }

    if (events.raceFinished) {
      ctx.audio.playVictory();
      ctx.audio.stopMotor();

      const { finalScore, timeBonus, driftBonus, medal } = computeFinalScore(state);
      const isNewBest = ctx.saveBestScore(finalScore);
      const bestLap =
        state.lapTimes.length > 0 ? Math.min(...state.lapTimes) : state.elapsedTime;
      const topKmh = Math.round(state.maxSpeedReached * 3.6);

      // Celebratory autumn leaf confetti burst!
      ambientLeaves.emitBurst(
        state.position.clone().add(new THREE.Vector3(0, 2.2, 0)),
        55,
        {
          speed: 8.5,
          upwardBias: 5.5,
          spread: 2.0,
          lifeRange: [1.0, 2.2],
        },
      );

      ctx.setHud({
        statusText: `${medal} RANK · TOUGE COMPLETE!`,
        promptText: '',
        result: {
          title: `${medal} TOUGE FINISH`,
          subtitle: `Momiji Circuit cleared in ${formatRaceTime(state.elapsedTime)}`,
          score: finalScore,
          scoreLabel: 'Touge Score',
          isNewBest,
          victory: true,
          stats: [
            { label: 'Total Time', value: formatRaceTime(state.elapsedTime), accent: true },
            { label: 'Best Lap', value: formatRaceTime(bestLap) },
            { label: 'Time Bonus', value: timeBonus.toLocaleString() },
            { label: 'Drift Style', value: driftBonus.toLocaleString(), accent: true },
            { label: 'Top Speed', value: `${topKmh} km/h` },
            { label: 'Clean Drifts', value: state.driftCount },
          ],
          onRestart: restartRace,
        },
      });
    }

    // Continuous procedural power-chair motor & drift tire audio
    if (!state.raceFinished && !paused) {
      const speedNorm = THREE.MathUtils.clamp(Math.abs(state.speed) / 28, 0, 1);
      ctx.audio.setMotor(speedNorm, {
        boost: state.isBoosting,
        drift: state.isDrifting,
        surface: state.onCurb ? 'gravel' : 'smooth',
      });
    }

    // -----------------------------------------------------------------------
    // 2. Drive Rigged 3D Wheelchair Figurine Transform & Procedural Bones
    // -----------------------------------------------------------------------
    rig.root.position.copy(state.position);
    rig.root.rotation.set(0, state.visualYaw, 0);
    rig.setHeadlightIntensity(state.isBoosting ? 1.85 : 0.95);

    rig.update(dt, {
      speed: state.speed,
      turnRate: state.turnRate + state.driftSlipAngle * 1.4,
      groundBump: state.groundBump,
      boost: state.isBoosting,
      tiltX: state.roadPitch,
      tiltZ: state.roadRoll,
    });

    // -----------------------------------------------------------------------
    // 3. Rear Tire Drift Sparks, Autumn Leaf Vortex & Skid Marks
    // -----------------------------------------------------------------------
    const visFwdX = -Math.sin(state.visualYaw);
    const visFwdZ = -Math.cos(state.visualYaw);
    const visRightX = Math.cos(state.visualYaw);
    const visRightZ = -Math.sin(state.visualYaw);
    travelFwd.set(visFwdX, 0, visFwdZ);
    travelRight.set(visRightX, 0, visRightZ);

    wheelWorldL
      .copy(state.position)
      .addScaledVector(travelRight, -0.37)
      .addScaledVector(travelFwd, -0.22);
    wheelWorldL.y += 0.1;

    wheelWorldR
      .copy(state.position)
      .addScaledVector(travelRight, 0.37)
      .addScaledVector(travelFwd, -0.22);
    wheelWorldR.y += 0.1;

    if (state.isDrifting && state.speed > 7.0) {
      sparkEmitAccum += dt;
      skidEmitAccum += dt;
      leafBurstAccum += dt;

      if (sparkEmitAccum >= 0.032) {
        sparkEmitAccum = 0;
        const sparkColor =
          state.driftTier === 3
            ? '#fff282'
            : state.driftTier === 2
              ? '#ff5524'
              : state.driftTier === 1
                ? '#ff9d2e'
                : '#ffd27d';
        const sparkCount = 2 + state.driftTier * 2;
        driftSparks.emitBurst(wheelWorldL, sparkCount, {
          speed: 4.5 + state.driftTier * 1.4,
          upwardBias: 2.0,
          spread: 0.75,
          lifeRange: [0.18, 0.42],
          color: sparkColor,
        });
        driftSparks.emitBurst(wheelWorldR, sparkCount, {
          speed: 4.5 + state.driftTier * 1.4,
          upwardBias: 2.0,
          spread: 0.75,
          lifeRange: [0.18, 0.42],
          color: sparkColor,
        });
      }

      if (leafBurstAccum >= 0.085) {
        leafBurstAccum = 0;
        rig.rearMount.getWorldPosition(rearWorld);
        ambientLeaves.emitBurst(rearWorld, 3, {
          speed: 4.2,
          upwardBias: 2.1,
          spread: 0.95,
          lifeRange: [0.65, 1.35],
        });
      }

      if (skidEmitAccum >= 0.028) {
        skidEmitAccum = 0;
        skidMarks.stamp(wheelWorldL, travelFwd, state.projection.up);
        skidMarks.stamp(wheelWorldR, travelFwd, state.projection.up);
      }
    } else if (state.isBoosting && state.speed > 14) {
      leafBurstAccum += dt;
      if (leafBurstAccum >= 0.07) {
        leafBurstAccum = 0;
        rig.rearMount.getWorldPosition(rearWorld);
        ambientLeaves.emitBurst(rearWorld, 2, {
          speed: 5.5,
          upwardBias: 1.5,
          spread: 0.85,
          lifeRange: [0.55, 1.1],
        });
        driftSparks.emitBurst(rearWorld, 3, {
          speed: 5.2,
          upwardBias: 0.8,
          spread: 0.5,
          lifeRange: [0.15, 0.3],
          color: '#ffbe4f',
        });
      }
    }

    // -----------------------------------------------------------------------
    // 4. Dynamic Touge Chase Camera (Corner Look-Ahead + Boost FOV + Smooth Lag)
    // -----------------------------------------------------------------------
    if (state.raceFinished) {
      finishOrbitAngle += dt * 0.48;
      desiredCamPos.set(
        state.position.x + Math.cos(finishOrbitAngle) * 5.8,
        state.position.y + 2.35,
        state.position.z + Math.sin(finishOrbitAngle) * 5.8,
      );
      desiredLookAt.set(state.position.x, state.position.y + 1.15, state.position.z);
    } else {
      const moveFwdX = -Math.sin(state.travelYaw);
      const moveFwdZ = -Math.cos(state.travelYaw);
      const moveRightX = Math.cos(state.travelYaw);
      const moveRightZ = -Math.sin(state.travelYaw);

      const speedNorm = THREE.MathUtils.clamp(Math.abs(state.speed) / 32, 0, 1);
      const followDist = THREE.MathUtils.lerp(5.2, 6.45, speedNorm) + (state.isBoosting ? 0.55 : 0);
      const followHeight = THREE.MathUtils.lerp(2.28, 2.65, speedNorm);
      // Swing camera slightly toward outside of drift to showcase the dramatic sideways slide & upcoming apex!
      const driftCamSwing = -state.driftSlipAngle * 2.4;

      desiredCamPos.set(
        state.position.x - moveFwdX * followDist + moveRightX * driftCamSwing,
        state.position.y + followHeight - state.roadPitch * 1.4,
        state.position.z - moveFwdZ * followDist + moveRightZ * driftCamSwing,
      );

      // Blend immediate heading look-ahead with upcoming spline point so hairpins read effortlessly
      track.sampleAtArc(state.projection.arcDist + 16, nextLookFrame);
      const headingLookX = state.position.x + moveFwdX * 11.5;
      const headingLookY = state.position.y + 1.35 + state.roadPitch * 2.2;
      const headingLookZ = state.position.z + moveFwdZ * 11.5;

      const trackLookBlend = state.wrongWay ? 0.0 : 0.26;
      desiredLookAt.set(
        THREE.MathUtils.lerp(headingLookX, nextLookFrame.position.x, trackLookBlend),
        THREE.MathUtils.lerp(headingLookY, nextLookFrame.position.y + 1.25, trackLookBlend),
        THREE.MathUtils.lerp(headingLookZ, nextLookFrame.position.z, trackLookBlend),
      );
    }

    const posAlpha = 1 - Math.exp(-(state.raceFinished ? 3.5 : 8.5) * dt);
    const lookAlpha = 1 - Math.exp(-11.0 * dt);
    camPos.lerp(desiredCamPos, posAlpha);
    camLookAt.lerp(desiredLookAt, lookAlpha);

    // Subtle tactile camera shake on turbo surges, boost pads, and guardrail bumps
    camShake = Math.max(0, camShake - dt * 1.6);
    const speedRumble = state.isBoosting ? 0.028 : state.onCurb ? 0.022 : 0;
    const totalShake = camShake * 0.14 + speedRumble;

    camera.position.copy(camPos);
    if (totalShake > 0.001) {
      camera.position.x += Math.sin(elapsed * 52) * totalShake;
      camera.position.y += Math.cos(elapsed * 67) * totalShake * 0.7;
    }
    camera.lookAt(camLookAt);

    // Dynamic FOV expansion during high speed & Turbo Boost
    const targetFov = state.raceFinished
      ? 48
      : 50 + THREE.MathUtils.clamp(state.speed / 30, 0, 1) * 6.5 + (state.isBoosting ? 6.8 : 0);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-7.5 * dt));
      camera.updateProjectionMatrix();
    }

    // -----------------------------------------------------------------------
    // 5. Update Atmosphere, Shadow Frustum Follow, Scenery & Particles
    // -----------------------------------------------------------------------
    atmosphere.update(elapsed, camera.position);
    // Snap shadow target on 0.5m grid around player so 2048px shadows stay razor-sharp & shimmer-free!
    sunTargetSnap.set(
      Math.round(state.position.x * 2) * 0.5,
      Math.round(state.position.y * 2) * 0.5,
      Math.round(state.position.z * 2) * 0.5,
    );
    atmosphere.sunLight.target.position.copy(sunTargetSnap);
    atmosphere.sunLight.position
      .copy(sunTargetSnap)
      .addScaledVector(atmosphere.sunDirection, 74);

    scenery.update(elapsed, dt, state.position, state.activeApexId, state.nextCheckpoint);
    ambientLeaves.update(dt, state.position);
    driftSparks.update(dt, state.position);

    // -----------------------------------------------------------------------
    // 6. Update HUD
    // -----------------------------------------------------------------------
    if (statusFlashTimer > 0) {
      statusFlashTimer = Math.max(0, statusFlashTimer - dt);
    }
    hudAccum += dt;
    if (!state.raceFinished) {
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
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ctx.setRestartHandler?.(null);
      ctx.audio.stopMotor();
      ctx.audio.setAmbient('none');
      input.dispose();
      rig.dispose();
      scenery.dispose();
      ambientLeaves.dispose();
      driftSparks.dispose();
      skidMarks.dispose();
      atmosphere.dispose();
      host.dispose();
    },
  };
}

const module: GameModule = {
  meta: META,
  mount,
};

export default module;

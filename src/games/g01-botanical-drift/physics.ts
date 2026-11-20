import * as THREE from 'three';
import type { MountainTrack, TrackProjection } from './track';

export const TOTAL_LAPS = 3;

export interface DriftInput {
  throttle: number; // [-1, 1] (+1 forward, -1 brake/reverse)
  steer: number;    // [-1, 1] (+1 left / CCW, -1 right / CW)
  driftHeld: boolean;
  boostHeld: boolean;
  boostPressed: boolean;
}

export interface PhysicsEvents {
  boostStarted: boolean;
  miniTurboTier: 0 | 1 | 2 | 3;
  boostPadHit: boolean;
  wallBumpIntensity: number;
  driftBankedPoints: number;
  driftBankedWasApex: boolean;
  checkpointPassed: number; // -1 if none, else 0..2
  lapCompleted: number;     // 0 if none, else 1..3
  lapTime: number;
  raceFinished: boolean;
}

export interface DriftState {
  position: THREE.Vector3;
  travelYaw: number;       // direction of motion (-Z forward when yaw=0)
  visualYaw: number;       // heading including drift slip angle
  speed: number;           // signed m/s along travelYaw
  turnRate: number;        // rad/s visual/steer turn rate
  isDrifting: boolean;
  driftDir: -1 | 0 | 1;    // +1 drifting left, -1 drifting right
  driftDuration: number;
  driftTier: 0 | 1 | 2 | 3;
  driftSlipAngle: number;
  currentDriftPoints: number;
  driftHasApexBonus: boolean;
  totalDriftScore: number;
  driftCount: number;
  boostGauge: number;      // [0, 1]
  isBoosting: boolean;
  autoBoostTimer: number;
  groundBump: number;
  roadPitch: number;       // positive = climbing uphill
  roadRoll: number;        // track bank angle in chair frame
  onCurb: boolean;
  wrongWay: boolean;
  wrongWayTimer: number;
  activeApexId: number;    // -1 if outside apex drift zone
  activeApexName: string;
  projection: TrackProjection;

  // Race & timing state
  raceStarted: boolean;
  raceFinished: boolean;
  elapsedTime: number;
  lapStartTime: number;
  currentLap: number;      // 1..3
  lapTimes: number[];
  nextCheckpoint: number;  // 1 -> 2 -> 0 (Start/Finish)
  prevArcDist: number;
  maxSpeedReached: number;
  boostPadCooldowns: number[];
}

const MAX_CRUISE_SPEED = 24.0;
const MAX_BOOST_SPEED = 34.5;
const REVERSE_MAX_SPEED = -8.5;
const ACCEL_RATE = 21.5;
const BOOST_ACCEL_RATE = 34.0;
const BRAKE_RATE = 32.0;
const COAST_DRAG = 5.2;

export function createInitialDriftState(track: MountainTrack): DriftState {
  // Spawn 15m behind the grand Start/Finish Torii gate, facing straight down the sunlit autumn straight!
  const spawnArc = track.wrapArc(track.checkpoints[0].arcDist - 15.0);
  const frame = track.sampleAtArc(spawnArc);
  const startYaw = Math.atan2(-frame.tangent.x, -frame.tangent.z);
  const startPos = frame.position.clone();
  const proj = track.projectPoint(startPos);

  return {
    position: startPos,
    travelYaw: startYaw,
    visualYaw: startYaw,
    speed: 0,
    turnRate: 0,
    isDrifting: false,
    driftDir: 0,
    driftDuration: 0,
    driftTier: 0,
    driftSlipAngle: 0,
    currentDriftPoints: 0,
    driftHasApexBonus: false,
    totalDriftScore: 0,
    driftCount: 0,
    boostGauge: 0.40, // pre-charged so players can test Turbo right out of the gate!
    isBoosting: false,
    autoBoostTimer: 0,
    groundBump: 0,
    roadPitch: Math.asin(THREE.MathUtils.clamp(frame.tangent.y, -0.5, 0.5)),
    roadRoll: frame.bankAngle,
    onCurb: false,
    wrongWay: false,
    wrongWayTimer: 0,
    activeApexId: -1,
    activeApexName: '',
    projection: proj,

    raceStarted: false,
    raceFinished: false,
    elapsedTime: 0,
    lapStartTime: 0,
    currentLap: 1,
    lapTimes: [],
    nextCheckpoint: 1, // CP1 -> CP2 -> CP0 (finish line)
    prevArcDist: proj.arcDist,
    maxSpeedReached: 0,
    boostPadCooldowns: track.boostPads.map(() => 0),
  };
}

export function resetToLastCheckpoint(state: DriftState, track: MountainTrack): void {
  const respawnIdx = state.nextCheckpoint === 1 ? 0 : state.nextCheckpoint === 2 ? 1 : 2;
  const cp = track.checkpoints[respawnIdx];
  const f = track.sampleAtArc(cp.arcDist + 3.5);
  state.position.copy(f.position);
  state.travelYaw = Math.atan2(-f.tangent.x, -f.tangent.z);
  state.visualYaw = state.travelYaw;
  state.speed = 6.0;
  state.turnRate = 0;
  state.isDrifting = false;
  state.driftDir = 0;
  state.driftDuration = 0;
  state.driftTier = 0;
  state.driftSlipAngle = 0;
  state.currentDriftPoints = 0;
  state.driftHasApexBonus = false;
  state.wrongWay = false;
  state.wrongWayTimer = 0;
  state.projection = track.projectPoint(state.position);
  state.prevArcDist = state.projection.arcDist;
}

export function computeFinalScore(state: DriftState): {
  finalScore: number;
  timeBonus: number;
  driftBonus: number;
  medal: 'GOLD' | 'SILVER' | 'BRONZE';
} {
  const timeBonus = Math.max(1500, Math.round((118 - state.elapsedTime) * 145));
  const driftBonus = Math.round(state.totalDriftScore);
  const finalScore = timeBonus + driftBonus;

  let medal: 'GOLD' | 'SILVER' | 'BRONZE' = 'BRONZE';
  if (state.elapsedTime <= 68 || finalScore >= 11200) {
    medal = 'GOLD';
  } else if (state.elapsedTime <= 84 || finalScore >= 8200) {
    medal = 'SILVER';
  }

  return { finalScore, timeBonus, driftBonus, medal };
}

export function stepDriftPhysics(
  state: DriftState,
  input: DriftInput,
  track: MountainTrack,
  dt: number,
): PhysicsEvents {
  const events: PhysicsEvents = {
    boostStarted: false,
    miniTurboTier: 0,
    boostPadHit: false,
    wallBumpIntensity: 0,
    driftBankedPoints: 0,
    driftBankedWasApex: false,
    checkpointPassed: -1,
    lapCompleted: 0,
    lapTime: 0,
    raceFinished: false,
  };

  state.groundBump = 0;

  // Cooldown boost pads
  for (let i = 0; i < state.boostPadCooldowns.length; i++) {
    if (state.boostPadCooldowns[i] > 0) {
      state.boostPadCooldowns[i] = Math.max(0, state.boostPadCooldowns[i] - dt);
    }
  }

  // Auto-start race clock on first control input
  if (!state.raceStarted && !state.raceFinished) {
    if (Math.abs(input.throttle) > 0.05 || input.boostHeld || input.boostPressed) {
      state.raceStarted = true;
    }
  }

  // After race finish: gently coast into celebratory victory glide
  const effectiveThrottle = state.raceFinished ? 0.35 : input.throttle;
  const effectiveSteer = state.raceFinished ? 0 : input.steer;
  const effectiveDrift = state.raceFinished ? false : input.driftHeld;

  if (state.raceStarted && !state.raceFinished) {
    state.elapsedTime += dt;
  }

  // 1. Boost Gauge & Turbo Activation
  const wasBoosting = state.isBoosting;
  if (state.autoBoostTimer > 0) {
    state.autoBoostTimer = Math.max(0, state.autoBoostTimer - dt);
  }

  const wantsManualBoost =
    !state.raceFinished &&
    (input.boostHeld || input.boostPressed) &&
    (state.isBoosting ? state.boostGauge > 0.01 : state.boostGauge >= 0.14);

  if (wantsManualBoost) {
    state.boostGauge = Math.max(0, state.boostGauge - dt * 0.44);
  }

  state.isBoosting = state.autoBoostTimer > 0 || wantsManualBoost;
  if (state.isBoosting && !wasBoosting) {
    events.boostStarted = true;
  }

  // 2. Drift Engagement, Sustaining & Release Mini-Turbo
  const minDriftSpeed = 7.2;
  if (effectiveDrift && state.speed > minDriftSpeed) {
    if (!state.isDrifting) {
      if (Math.abs(effectiveSteer) > 0.14) {
        state.isDrifting = true;
        state.driftDir = effectiveSteer > 0 ? 1 : -1;
        state.driftDuration = 0;
        state.driftTier = 0;
        state.currentDriftPoints = 0;
        state.driftHasApexBonus = false;
      }
    } else {
      // Sustain active drift
      state.driftDuration += dt;
      if (state.driftDuration >= 2.25) state.driftTier = 3;
      else if (state.driftDuration >= 1.25) state.driftTier = 2;
      else if (state.driftDuration >= 0.5) state.driftTier = 1;
      else state.driftTier = 0;

      const inApex = state.activeApexId >= 0;
      if (inApex) state.driftHasApexBonus = true;

      const mult = inApex ? 2.0 : 1.0;
      const speedNorm = THREE.MathUtils.clamp(state.speed / MAX_CRUISE_SPEED, 0.3, 1.4);
      state.currentDriftPoints += dt * 340 * speedNorm * mult;
      state.boostGauge = Math.min(1, state.boostGauge + dt * 0.22 * mult);
    }
  } else if (state.isDrifting) {
    // Release drift -> bank points + unleash earned Mini-Turbo!
    const banked = Math.round(state.currentDriftPoints);
    if (banked >= 40) {
      state.totalDriftScore += banked;
      state.driftCount += 1;
      events.driftBankedPoints = banked;
      events.driftBankedWasApex = state.driftHasApexBonus;
    }

    if (state.driftTier > 0) {
      const tier = state.driftTier as 1 | 2 | 3;
      events.miniTurboTier = tier;
      const surgeDurations: Record<1 | 2 | 3, number> = { 1: 0.65, 2: 1.15, 3: 1.75 };
      const bonusGauge: Record<1 | 2 | 3, number> = { 1: 0.1, 2: 0.2, 3: 0.32 };
      state.autoBoostTimer = Math.max(state.autoBoostTimer, surgeDurations[tier]);
      state.boostGauge = Math.min(1, state.boostGauge + bonusGauge[tier]);
      if (!state.isBoosting) {
        state.isBoosting = true;
        events.boostStarted = true;
      }
    }

    state.isDrifting = false;
    state.driftDir = 0;
    state.driftDuration = 0;
    state.driftTier = 0;
    state.currentDriftPoints = 0;
    state.driftHasApexBonus = false;
  }

  // 3. Longitudinal Speed Physics (Electric Torque + Downhill Slope Gravity + Boost)
  const forwardX = -Math.sin(state.travelYaw);
  const forwardZ = -Math.cos(state.travelYaw);
  const headingDotTrack =
    forwardX * state.projection.tangent.x + forwardZ * state.projection.tangent.z;
  const slopeAlongHeading = state.projection.tangent.y * headingDotTrack;
  const gravityAccel = -slopeAlongHeading * 10.2;

  const targetMaxSpeed = state.isBoosting
    ? MAX_BOOST_SPEED
    : state.isDrifting
      ? MAX_CRUISE_SPEED * 0.96
      : MAX_CRUISE_SPEED;

  if (state.isBoosting) {
    state.speed += (BOOST_ACCEL_RATE + gravityAccel * 0.5) * dt;
  } else if (effectiveThrottle > 0.05) {
    const torqueCurve = 1.15 - 0.35 * THREE.MathUtils.clamp(state.speed / MAX_CRUISE_SPEED, 0, 1);
    state.speed += (effectiveThrottle * ACCEL_RATE * torqueCurve + gravityAccel) * dt;
  } else if (effectiveThrottle < -0.05) {
    if (state.speed > 0.5) {
      state.speed += effectiveThrottle * BRAKE_RATE * dt;
    } else {
      state.speed += effectiveThrottle * 14.0 * dt;
    }
  } else {
    // Natural coasting drag + slope roll
    const drag = Math.sign(state.speed) * Math.min(Math.abs(state.speed), COAST_DRAG * dt);
    state.speed = state.speed - drag + gravityAccel * 0.55 * dt;
  }

  // Smooth aerodynamic overspeed cap so boost decays smoothly after ending
  if (state.speed > targetMaxSpeed) {
    state.speed = THREE.MathUtils.lerp(state.speed, targetMaxSpeed, 1 - Math.exp(-3.4 * dt));
  }
  state.speed = THREE.MathUtils.clamp(state.speed, REVERSE_MAX_SPEED, MAX_BOOST_SPEED + 2.5);
  if (state.speed > state.maxSpeedReached) {
    state.maxSpeedReached = state.speed;
  }

  // 4. Steering & Drift Yaw Kinematics
  const speedRatio = THREE.MathUtils.clamp(Math.abs(state.speed) / 8.5, 0, 1);
  const reverseSign = state.speed >= -0.2 ? 1 : -1;

  let desiredTurnRate = 0;
  let targetSlipAngle = 0;

  if (state.isDrifting && state.driftDir !== 0) {
    // Arcade drift carving: steer into drift to tighten apex, counter-steer to hold wide arc!
    const steerIn = effectiveSteer * state.driftDir; // [-1, +1]: +1 tightening, -1 widening
    const baseArc = 1.32;
    const modArc = steerIn >= 0 ? steerIn * 1.18 : steerIn * 0.78;
    desiredTurnRate = state.driftDir * (baseArc + modArc) * (0.7 + 0.3 * speedRatio);
    targetSlipAngle = state.driftDir * (0.31 + Math.max(-0.1, steerIn) * 0.16);
  } else {
    const highSpeedStability = THREE.MathUtils.lerp(1.12, 0.88, THREE.MathUtils.clamp(state.speed / MAX_BOOST_SPEED, 0, 1));
    desiredTurnRate = effectiveSteer * 1.92 * speedRatio * highSpeedStability * reverseSign;
    targetSlipAngle = 0;
  }

  // Gentle autopilot centerline guidance during victory glide after finish
  if (state.raceFinished) {
    const trackYaw = Math.atan2(-state.projection.tangent.x, -state.projection.tangent.z);
    let yawErr = trackYaw - state.travelYaw;
    while (yawErr > Math.PI) yawErr -= Math.PI * 2;
    while (yawErr < -Math.PI) yawErr += Math.PI * 2;
    desiredTurnRate = THREE.MathUtils.clamp(yawErr * 2.5 - state.projection.lateralOffset * 0.15, -1.8, 1.8);
  }

  const turnAlpha = 1 - Math.exp(-11.5 * dt);
  state.turnRate += (desiredTurnRate - state.turnRate) * turnAlpha;
  state.travelYaw += state.turnRate * dt;

  const slipAlpha = 1 - Math.exp(-9.0 * dt);
  state.driftSlipAngle += (targetSlipAngle - state.driftSlipAngle) * slipAlpha;
  state.visualYaw = state.travelYaw + state.driftSlipAngle;

  // 5. Integrate World XZ Position & Snap Cleanly onto Banked 3D Track Surface
  const moveDirX = -Math.sin(state.travelYaw);
  const moveDirZ = -Math.cos(state.travelYaw);
  state.position.x += moveDirX * state.speed * dt;
  state.position.z += moveDirZ * state.speed * dt;

  const proj = track.projectPoint(state.position, state.projection.frameIndex);

  // Guardrail soft-bounce boundary & curb vibration
  const maxLat = track.roadHalfWidth + 0.14;
  state.onCurb = Math.abs(proj.lateralOffset) > track.roadHalfWidth - 0.55;
  if (state.onCurb && Math.abs(state.speed) > 4.0) {
    state.groundBump += (Math.sin(state.elapsedTime * 36) > 0 ? 1 : -1) * 0.045;
  }

  if (Math.abs(proj.lateralOffset) > maxLat) {
    const sign = Math.sign(proj.lateralOffset);
    const excess = Math.abs(proj.lateralOffset) - maxLat;
    // Push smoothly back inside guardrail
    state.position.x -= proj.right.x * sign * (excess + 0.04);
    state.position.z -= proj.right.z * sign * (excess + 0.04);

    // Measure impact angle & align travelYaw softly back parallel to guardrail
    const latSpeed = Math.abs(
      (moveDirX * proj.right.x + moveDirZ * proj.right.z) * state.speed,
    );
    const trackYaw = Math.atan2(-proj.tangent.x, -proj.tangent.z);
    let diff = trackYaw - state.travelYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    state.travelYaw += diff * Math.min(1, 0.36 + dt * 5.0);

    // Gentle speed trim so racing never stalls
    state.speed *= Math.max(0.84, 1 - Math.min(0.16, latSpeed * 0.012));

    if (latSpeed > 2.2) {
      events.wallBumpIntensity = THREE.MathUtils.clamp(latSpeed / 12.0, 0.25, 1.0);
      state.groundBump += 0.14 * events.wallBumpIntensity;
      // Heavy wall hit cancels unbanked drift points cleanly
      if (state.isDrifting && latSpeed > 6.5) {
        state.currentDriftPoints *= 0.45;
      }
    }
  }

  // Re-project after boundary clamping for rock-solid ground elevation
  const finalProj = track.projectPoint(state.position, proj.frameIndex);
  state.projection = finalProj;
  state.position.y = finalProj.roadY;

  // Compute terrain pitch & banking roll in figurine local frame (-Z forward, +X right)
  const visFwdX = -Math.sin(state.visualYaw);
  const visFwdZ = -Math.cos(state.visualYaw);
  const visRightX = Math.cos(state.visualYaw);
  const visRightZ = -Math.sin(state.visualYaw);
  const fwdAlign = visFwdX * finalProj.tangent.x + visFwdZ * finalProj.tangent.z;
  const rightAlign = visRightX * finalProj.right.x + visRightZ * finalProj.right.z;

  const targetPitch = Math.asin(THREE.MathUtils.clamp(finalProj.tangent.y * fwdAlign, -0.45, 0.45));
  // Positive tiltZ in character.ts lifts +X (right side) up — matches positive bankAngle when facing forward!
  const targetRoll = finalProj.bankAngle * rightAlign - state.driftSlipAngle * 0.26;
  const orientAlpha = 1 - Math.exp(-10 * dt);
  state.roadPitch += (targetPitch - state.roadPitch) * orientAlpha;
  state.roadRoll += (targetRoll - state.roadRoll) * orientAlpha;

  // 6. Active Apex Drift Zone Detection
  state.activeApexId = -1;
  state.activeApexName = '';
  for (let i = 0; i < track.apexZones.length; i++) {
    const z = track.apexZones[i];
    if (finalProj.arcDist >= z.startArc && finalProj.arcDist <= z.endArc) {
      state.activeApexId = z.id;
      state.activeApexName = z.name;
      break;
    }
  }

  // 7. Boost Pad Trigger Detection
  if (!state.raceFinished) {
    for (let i = 0; i < track.boostPads.length; i++) {
      if (state.boostPadCooldowns[i] > 0) continue;
      const pad = track.boostPads[i];
      const dArc = Math.abs(track.arcDelta(finalProj.arcDist, pad.arcDist));
      const dLat = Math.abs(finalProj.lateralOffset - pad.lateralOffset);
      if (dArc < pad.length * 0.58 && dLat < pad.width * 0.58 + 0.55) {
        state.boostPadCooldowns[i] = 2.0;
        state.autoBoostTimer = Math.max(state.autoBoostTimer, 1.15);
        state.boostGauge = Math.min(1, state.boostGauge + 0.36);
        state.speed = Math.max(state.speed, MAX_CRUISE_SPEED * 1.15);
        state.groundBump += 0.08;
        state.isBoosting = true;
        events.boostPadHit = true;
        events.boostStarted = true;
      }
    }
  }

  // 8. Wrong-Way Detection
  if (!state.raceFinished && state.speed > 2.5 && headingDotTrack < -0.35) {
    state.wrongWayTimer += dt;
    state.wrongWay = state.wrongWayTimer > 1.1;
  } else {
    state.wrongWayTimer = 0;
    state.wrongWay = false;
  }

  // 9. Sequential Checkpoint & 3-Lap Progression
  if (state.raceStarted && !state.raceFinished) {
    const prevS = state.prevArcDist;
    const currS = finalProj.arcDist;
    const stepDelta = track.arcDelta(prevS, currS);

    if (stepDelta > 0) {
      const targetCp = track.checkpoints[state.nextCheckpoint];
      const distBefore = track.arcDelta(prevS, targetCp.arcDist);
      const distAfter = track.arcDelta(currS, targetCp.arcDist);

      // Crossed target checkpoint gate moving forward!
      if (distBefore >= -1.0 && distBefore <= stepDelta + 3.0 && distAfter <= 1.5 && distAfter < distBefore) {
        events.checkpointPassed = state.nextCheckpoint;

        if (state.nextCheckpoint === 1) {
          state.nextCheckpoint = 2;
        } else if (state.nextCheckpoint === 2) {
          state.nextCheckpoint = 0;
        } else {
          // Crossed Start/Finish after CP1 + CP2 -> Lap Complete!
          const lapDuration = state.elapsedTime - state.lapStartTime;
          state.lapTimes.push(lapDuration);
          state.lapStartTime = state.elapsedTime;
          events.lapCompleted = state.currentLap;
          events.lapTime = lapDuration;

          if (state.currentLap >= TOTAL_LAPS) {
            state.raceFinished = true;
            events.raceFinished = true;
          } else {
            state.currentLap += 1;
            state.nextCheckpoint = 1;
          }
        }
      }
    }
  }

  state.prevArcDist = finalProj.arcDist;
  return events;
}

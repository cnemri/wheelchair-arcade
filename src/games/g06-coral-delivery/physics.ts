import * as THREE from 'three';
import type { BridgeEffect, CanyonTrail, SurfaceType } from './trail';

export interface DriveState {
  pos: THREE.Vector3;
  heading: number; // yaw around Y where 0 = -Z
  speed: number; // signed forward speed (u/s)
  accel: number; // longitudinal acceleration (u/s^2)
  turnRate: number; // rad/s (+ = left / CCW)
  pitch: number; // road slope pitch (rad, + = uphill)
  roll: number; // road camber + bridge roll (rad)
  surface: SurfaceType;
  s: number;
  lateralOffset: number;
  lowGear: boolean;
  onBridge: boolean;
  wrongWay: boolean;
  runStarted: boolean;
  runFinished: boolean;
  elapsedTime: number;
  nextCheckpointIdx: number;
  completedCheckpoints: number;
  pristineCount: number;
  steadySaves: number;
  spillsTotal: number;
  score: number;
}

export interface DriveStepInput {
  dt: number;
  time: number;
  throttle: number; // [-1, 1]
  steer: number; // [-1, 1], +1 left
  lowGear: boolean;
  trail: CanyonTrail;
}

export interface DriveStepEvents {
  groundBump: number;
  bumpImpulse: number;
  scrapeImpulse: number;
  bridge: BridgeEffect;
  reachedCheckpointIdx: number; // -1 if none this tick
  justStarted: boolean;
  surfaceChanged: SurfaceType | null;
}

export function createInitialDriveState(trail: CanyonTrail): DriveState {
  const start = trail.sampleAtS(5.2);
  const heading = Math.atan2(-start.tangent.x, -start.tangent.z);

  return {
    pos: new THREE.Vector3(start.pos.x, start.pos.y, start.pos.z),
    heading,
    speed: 0,
    accel: 0,
    turnRate: 0,
    pitch: 0,
    roll: 0,
    surface: start.surface,
    s: start.s,
    lateralOffset: 0,
    lowGear: false,
    onBridge: false,
    wrongWay: false,
    runStarted: false,
    runFinished: false,
    elapsedTime: 0,
    nextCheckpointIdx: 0,
    completedCheckpoints: 0,
    pristineCount: 0,
    steadySaves: 0,
    spillsTotal: 0,
    score: 0,
  };
}

export function stepDrivePhysics(state: DriveState, input: DriveStepInput): DriveStepEvents {
  const { dt, time, throttle, steer, lowGear, trail } = input;
  const prevSurface = state.surface;
  const prevSpeed = state.speed;

  state.lowGear = lowGear;

  let justStarted = false;
  if (!state.runStarted && !state.runFinished && (Math.abs(throttle) > 0.08 || Math.abs(steer) > 0.15)) {
    state.runStarted = true;
    justStarted = true;
  }

  if (state.runStarted && !state.runFinished) {
    state.elapsedTime += dt;
  }

  // 1. Throttle, Low-Gear Crawler & Braking Dynamics
  const effectiveThrottle = state.runFinished ? 0 : throttle;
  const effectiveSteer = state.runFinished ? 0 : steer;

  const maxForwardSpeed = lowGear
    ? 6.1
    : state.surface === 'gravel'
      ? 9.6
      : state.surface === 'dirt'
        ? 10.6
        : 11.6;
  const maxReverseSpeed = -4.2;

  let targetAccel = 0;
  if (effectiveThrottle > 0.02) {
    // Low gear has stronger steady climbing torque with softer surge!
    const power = lowGear ? 9.5 : 10.8;
    targetAccel = effectiveThrottle * power;
  } else if (effectiveThrottle < -0.02) {
    // Responsive braking when moving forward, gentle reverse when stopped
    if (state.speed > 0.6) {
      targetAccel = effectiveThrottle * 14.5;
    } else {
      targetAccel = effectiveThrottle * 7.2;
    }
  } else {
    // Natural rolling deceleration
    const coastDrag = state.surface === 'gravel' ? 5.6 : state.surface === 'dirt' ? 4.4 : 3.4;
    if (Math.abs(state.speed) < 0.08) {
      state.speed = 0;
    } else {
      targetAccel = -Math.sign(state.speed) * coastDrag;
    }
  }

  // Gentle slope gravity pull (noticeable in high gear, virtually negated by Low-Gear crawler!)
  const slopeGravity = -Math.sin(state.pitch) * (lowGear ? 1.4 : 4.2);

  // Smooth aerodynamic/rolling speed cap
  let nextSpeed = state.speed + (targetAccel + slopeGravity) * dt;
  if (nextSpeed > maxForwardSpeed) {
    nextSpeed = THREE.MathUtils.lerp(nextSpeed, maxForwardSpeed, Math.min(1, dt * 6.5));
  } else if (nextSpeed < maxReverseSpeed) {
    nextSpeed = maxReverseSpeed;
  }
  if (Math.abs(effectiveThrottle) < 0.02 && Math.abs(nextSpeed) < 0.06) {
    nextSpeed = 0;
  }

  state.speed = nextSpeed;
  state.accel = (state.speed - prevSpeed) / Math.max(0.001, dt);

  // 2. Smooth Responsive Steering (allows crisp switchback maneuvers!)
  const speedNorm = Math.min(1, Math.abs(state.speed) / 8.5);
  const maxTurn = lowGear ? 1.72 : THREE.MathUtils.lerp(1.55, 1.98, speedNorm);
  const dirSign = state.speed < -0.35 ? -1 : 1;
  const targetTurnRate = effectiveSteer * maxTurn * dirSign;
  const turnAlpha = 1 - Math.exp(-10.5 * dt);
  state.turnRate += (targetTurnRate - state.turnRate) * turnAlpha;
  state.heading += state.turnRate * dt;

  // 3. Advance Position in XZ (Three.js -Z forward convention)
  const fwdX = -Math.sin(state.heading);
  const fwdZ = -Math.cos(state.heading);
  state.pos.x += fwdX * state.speed * dt;
  state.pos.z += fwdZ * state.speed * dt;

  // 4. Query Trail & Bridge Surface + Soft Guardrail Containment
  const info = trail.getGroundInfo(state.pos.x, state.pos.z, state.heading, time);
  const near = info.nearest;
  let scrapeImpulse = 0;

  // Keep player cleanly within road / bridge / pier parapets (smooth forgiving deflection!)
  const margin = near.surface === 'bridge' ? 0.56 : 0.68;
  const maxLat = Math.max(1.8, near.width * 0.5 - margin);

  if (Math.abs(near.lateralOffset) > maxLat) {
    const excess = Math.abs(near.lateralOffset) - maxLat;
    const sign = Math.sign(near.lateralOffset);
    // Push smoothly back onto the road inside parapet
    state.pos.x -= near.sample.right.x * sign * excess;
    state.pos.z -= near.sample.right.z * sign * excess;

    // Gentle speed trim & cargo scrape nudge if bumping fast against parapet/cliff!
    if (Math.abs(state.speed) > 1.8) {
      scrapeImpulse = -sign * Math.min(1.0, Math.abs(state.speed) * 0.08 + excess * 0.45);
      state.speed *= Math.max(0.76, 1 - dt * 2.8);
    }
  }

  // Clamp start pier rear bumper & end courtyard boundary
  if (near.s < 1.8) {
    const clampSample = trail.sampleAtS(1.8);
    state.pos.x = clampSample.pos.x + clampSample.right.x * THREE.MathUtils.clamp(near.lateralOffset, -maxLat, maxLat);
    state.pos.z = clampSample.pos.z + clampSample.right.z * THREE.MathUtils.clamp(near.lateralOffset, -maxLat, maxLat);
    if (state.speed < 0) state.speed = 0;
  } else if (near.s > trail.totalLength - 2.2) {
    const clampSample = trail.sampleAtS(trail.totalLength - 2.2);
    state.pos.x = clampSample.pos.x + clampSample.right.x * THREE.MathUtils.clamp(near.lateralOffset, -maxLat, maxLat);
    state.pos.z = clampSample.pos.z + clampSample.right.z * THREE.MathUtils.clamp(near.lateralOffset, -maxLat, maxLat);
    if (state.speed > 0) state.speed *= 0.8;
  }

  // Re-sample ground height after containment so tires sit 100% flush!
  const finalInfo = trail.getGroundInfo(state.pos.x, state.pos.z, state.heading, time);
  state.pos.y = finalInfo.y;
  state.pitch += (finalInfo.pitch - state.pitch) * Math.min(1, dt * 14);
  state.roll += (finalInfo.roll - state.roll) * Math.min(1, dt * 14);
  state.surface = finalInfo.surface;
  state.s = finalInfo.nearest.s;
  state.lateralOffset = finalInfo.nearest.lateralOffset;
  state.onBridge = finalInfo.nearest.onBridge;

  // Wrong-way check (driving meaningfully downhill along the trail tangent)
  const headingDot =
    fwdX * finalInfo.nearest.sample.tangent.x + fwdZ * finalInfo.nearest.sample.tangent.z;
  state.wrongWay = state.speed > 2.2 && headingDot < -0.45;

  // 5. Tactile Surface Bumps & Rumble Impulses
  const absSpeed = Math.abs(state.speed);
  let groundBump = 0;
  let bumpImpulse = 0;

  if (absSpeed > 0.8) {
    if (state.surface === 'gravel') {
      const rumble = Math.sin(time * 28 + state.s * 3.2) * Math.cos(time * 17.5);
      groundBump = rumble * Math.min(0.45, absSpeed * 0.045);
      bumpImpulse = Math.pow(absSpeed / 9.5, 1.35) * 0.82;
    } else if (state.surface === 'dirt') {
      const undul = Math.sin(state.s * 1.45 + time * 5.2);
      groundBump = undul * Math.min(0.24, absSpeed * 0.022);
      bumpImpulse = Math.pow(absSpeed / 10.5, 1.2) * 0.38;
    } else if (state.surface === 'bridge') {
      const plankClack = Math.sin(state.s * 10.2);
      groundBump = plankClack * Math.min(0.28, absSpeed * 0.028);
      bumpImpulse = Math.pow(absSpeed / 9.5, 1.15) * 0.42;
    } else if (state.surface === 'cobblestone') {
      bumpImpulse = Math.min(0.14, absSpeed * 0.012);
    }
  }

  // 6. Checkpoint Arrival Detection
  let reachedCheckpointIdx = -1;
  if (!state.runFinished && state.nextCheckpointIdx < trail.checkpoints.length) {
    const cp = trail.checkpoints[state.nextCheckpointIdx];
    const distToCp = Math.hypot(state.pos.x - cp.pos.x, state.pos.z - cp.pos.z);
    if (distToCp <= cp.radius + 1.1 || state.s >= cp.s + 0.8) {
      reachedCheckpointIdx = state.nextCheckpointIdx;
      state.nextCheckpointIdx += 1;
      state.completedCheckpoints += 1;
      if (cp.isFinish) {
        state.runFinished = true;
      }
    }
  }

  return {
    groundBump,
    bumpImpulse,
    scrapeImpulse,
    bridge: finalInfo.bridge,
    reachedCheckpointIdx,
    justStarted,
    surfaceChanged: state.surface !== prevSurface ? state.surface : null,
  };
}

export function computeCheckpointBonus(piecesRemaining: number): {
  points: number;
  isPristine: boolean;
  label: string;
} {
  if (piecesRemaining >= 3) {
    return { points: 500, isPristine: true, label: 'PRISTINE DELIVERY! ★ +500' };
  }
  if (piecesRemaining === 2) {
    return { points: 275, isPristine: false, label: 'SAFE DELIVERY (2/3) +275' };
  }
  if (piecesRemaining === 1) {
    return { points: 125, isPristine: false, label: 'DELIVERED (1/3) +125' };
  }
  return { points: 60, isPristine: false, label: 'CRATE DELIVERED +60 (RESTOCKED!)' };
}

export function computeFinalRating(score: number, pristineCount: number): {
  stars: string;
  rank: string;
} {
  if (pristineCount >= 3 || score >= 2150) {
    return { stars: '★★★', rank: 'Master Coastal Courier' };
  }
  if (pristineCount >= 2 || score >= 1450) {
    return { stars: '★★☆', rank: 'Amalfi Express Runner' };
  }
  return { stars: '★☆☆', rank: 'Canyon Tea Carrier' };
}
